// filepath: src/features/properties/components/inventory/hooks/useInventoryHydration.ts
/**
 * useInventoryHydration — hook que carga el Inventory desde IndexedDB con
 * fallback a MySQL (cuando IndexedDB está stale o vacío) y self-heal de
 * `photos` legacy.
 *
 * Sale de `useInventoryState.ts` como parte del refactor #10 (commit 1/2 hotfix).
 * Encapsula el useEffect grande de carga inicial (~150 líneas) en su propio hook
 * para mantener `useInventoryState` por debajo de la restricción de 250 líneas.
 *
 * Retorna solo `{ inventory, loading }` — la hidratación setea el resto del
 * state (customAreas, stage) en el componente padre o en `useInventoryState`.
 */
import { useEffect, useState } from "react";
import { inventoryDB, normalizePhotosArray } from "../../../inventoryDB";
import {
  getPropertyTypeConfig,
  resolveAreas,
  type PropertyType,
} from "../../../inventoryConfig";
import type { Inventory, InventoryArea } from "../../../inventoryTypes";

export type InventoryStage = "config" | "editing" | "signing";

interface UseInventoryHydrationParams {
  propertyId: string;
  phase: "inicial" | "final";
  propertyType: PropertyType;
  baseInventory?: Inventory | null;
  hideSignatures?: boolean;
}

export interface UseInventoryHydrationReturn {
  inventory: Inventory | null;
  loading: boolean;
  /** Stage inicial decidido durante la hidratación (signedAt ? "signing" : "editing" | "config") */
  initialStage: InventoryStage;
  /** Custom areas del inventory cargado (o del baseInventory si es nuevo) */
  initialCustomAreas: { id: string; label: string }[];
}

const initialCounters = (
  propertyType: PropertyType,
  base?: Inventory | null,
): Record<string, number> => {
  if (base) return { ...base.counters };
  const def = getPropertyTypeConfig(propertyType);
  const c: Record<string, number> = {};
  def.multiCounters.forEach((mc) => {
    c[mc.key] = mc.default;
  });
  return c;
};

export function useInventoryHydration({
  propertyId,
  phase,
  propertyType,
  baseInventory,
  hideSignatures = false,
}: UseInventoryHydrationParams): UseInventoryHydrationReturn {
  const inventoryId = `${propertyId}:${phase}`;
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialStage, setInitialStage] = useState<InventoryStage>("config");
  const [initialCustomAreas, setInitialCustomAreas] = useState<
    { id: string; label: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let existing = await inventoryDB.getInventory(inventoryId);

      // FIX (jul-2026): fallback a MySQL no solo cuando NO hay row en IndexedDB,
      // sino también cuando la row existe pero `photos` está vacío. Cubre el
      // caso de IndexedDB stale (self-heal previo convirtió Record → [], o
      // limpieza de caché dejó huérfano el `photos` store mientras MySQL sí
      // tiene las fotos con dataUrl).
      const localPhotos = existing ? normalizePhotosArray(existing.photos) : [];
      const shouldFetchFromMysql = !existing || localPhotos.length === 0;

      if (shouldFetchFromMysql) {
        try {
          const res = await fetch(
            `/api/inventories?propertyId=${encodeURIComponent(propertyId)}`,
          );
          if (res.ok) {
            const data = await res.json();
            const remote = (data.inventories ?? []).find(
              (i: any) => i.phase === phase,
            );
            if (remote) {
              const remotePhotos = normalizePhotosArray(remote.photos);
              if (remotePhotos.length > 0) {
                console.log(
                  `[inventory] Re-hidratando ${remotePhotos.length} fotos desde MySQL → IndexedDB`,
                );
              }
              existing = {
                id: remote.id,
                propertyId: remote.property_id,
                phase: remote.phase,
                propertyType: remote.property_type,
                counters: remote.counters ?? {},
                areas: remote.areas ?? [],
                photos: remotePhotos,
                signatures: remote.signatures ?? [],
                customAreas: remote.custom_areas ?? [],
                signedAt: remote.signed_at,
                createdAt: remote.created_at,
                updatedAt: remote.updated_at,
              } as Inventory;
              await inventoryDB.saveInventory(existing);
              for (const p of existing.photos ?? []) {
                if (p?.dataUrl) {
                  await inventoryDB.savePhoto({
                    id: p.id,
                    inventoryId: existing.id,
                    dataUrl: p.dataUrl,
                    areaId: p.areaId,
                    fileName: p.fileName,
                    takenAt: p.takenAt,
                  });
                }
              }
              console.log(
                `[inventory] Recuperado de MySQL: ${remote.id} (${(existing.photos ?? []).length} fotos)`,
              );
            }
          }
        } catch (err) {
          console.warn("[inventory] fallback MySQL fetch failed:", err);
        }
      }
      if (cancelled) return;

      if (existing) {
        // FIX (jul-2026): normalizar `photos` por si IndexedDB tiene data
        // legacy con forma Record/Object en vez de Array. Self-heal save.
        const normalizedPhotos = normalizePhotosArray(existing.photos);
        if (
          existing.photos &&
          typeof existing.photos === "object" &&
          !Array.isArray(existing.photos)
        ) {
          const shape =
            normalizedPhotos.length === 0
              ? "array vacío (id set sin metadata)"
              : "array con metadata";
          console.warn(
            `[inventory] ${inventoryId}: photos era Record/Object — normalizado a ${shape}. Self-heal save.`,
          );
          existing = { ...existing, photos: normalizedPhotos };
          void inventoryDB.saveInventory(existing);
        } else if (normalizedPhotos !== existing.photos) {
          existing = { ...existing, photos: normalizedPhotos };
        }
        setInventory(existing);
        setInitialCustomAreas(existing.customAreas ?? []);
        if (hideSignatures) {
          setInitialStage("editing");
        } else {
          setInitialStage(existing.signedAt ? "signing" : "editing");
        }
      } else {
        const type: PropertyType =
          baseInventory?.propertyType ?? propertyType ?? "apartamento";
        const counters = initialCounters(type, baseInventory);
        const config = getPropertyTypeConfig(type);
        const resolved = resolveAreas(config, counters);

        const areas: InventoryArea[] = resolved.map((a) => ({
          id: a.id,
          category: a.category,
          label: a.label,
          items: {},
          photos: [],
        }));

        // Si es Final, copiamos items de cada área del Inicial
        if (phase === "final" && baseInventory) {
          baseInventory.areas.forEach((baseArea) => {
            const target = areas.find((a) => a.id === baseArea.id);
            if (target) {
              target.items = { ...baseArea.items };
              target.observations = baseArea.observations;
            }
          });
        }

        const inv: Inventory = {
          id: inventoryId,
          propertyId,
          phase,
          propertyType: type,
          counters,
          areas,
          photos:
            phase === "final" && baseInventory ? baseInventory.photos : [],
          signatures: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          agentName: baseInventory?.agentName,
          customAreas: baseInventory?.customAreas ?? [],
        };
        await inventoryDB.saveInventory(inv);
        setInventory(inv);
        setInitialCustomAreas(baseInventory?.customAreas ?? []);
        setInitialStage("config");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    inventoryId,
    propertyId,
    phase,
    baseInventory?.id,
    hideSignatures,
    propertyType,
  ]);

  return { inventory, loading, initialStage, initialCustomAreas };
}
