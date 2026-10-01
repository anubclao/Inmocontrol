// filepath: src/features/properties/components/inventory/hooks/useInventoryState.ts
/**
 * useInventoryState — hook que orquesta el state de un Inventory:
 *  - Hidratación (delegada a `useInventoryHydration`)
 *  - Draft persistence en localStorage (counters + customAreas + stage)
 *  - `persist()` con sincronización de fotos al store aparte + cleanup
 *
 * Sale de StepInventory.tsx como parte del refactor #10 (commit 1/2).
 * La hidratación se extrajo a su propio hook (`useInventoryHydration`) en el
 * hotfix para mantener este archivo < 250 líneas (restricción dura de AGENTS.md).
 */
import { useEffect, useState } from "react";
import { inventoryDB } from "../../../inventoryDB";
import type { PropertyType } from "../../../inventoryConfig";
import type { Inventory } from "../../../inventoryTypes";
import { useDraftPersistence } from "../../../../../shared/hooks/useDraftPersistence";
import {
  useInventoryHydration,
  type InventoryStage,
} from "./useInventoryHydration";

export type {
  InventoryStage,
  ResumenFinalizacion,
} from "./useInventoryState.types";

interface UseInventoryStateParams {
  propertyId: string;
  phase: "inicial" | "final";
  propertyType: PropertyType;
  baseInventory?: Inventory | null;
  hideSignatures?: boolean;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export interface UseInventoryStateReturn {
  inventory: Inventory | null;
  loading: boolean;
  customAreas: { id: string; label: string }[];
  setCustomAreas: (next: { id: string; label: string }[]) => void;
  currentAreaIndex: number;
  setCurrentAreaIndex: (i: number) => void;
  stage: InventoryStage;
  setStage: (s: InventoryStage) => void;
  /** Persistir el inventory (sincroniza fotos al store aparte + cleanup). */
  persist: (next: Inventory) => Promise<void>;
  /** Limpiar el draft de localStorage (se llama al finalizar). */
  clearDraft: () => void;
  /** Discard el draft (se llama al descartar borrador). */
  discardDraft: () => void;
}

export function useInventoryState({
  propertyId,
  phase,
  propertyType,
  baseInventory,
  hideSignatures = false,
  showToast,
}: UseInventoryStateParams): UseInventoryStateReturn {
  // 1) Hidratación: carga inicial desde IndexedDB con fallback a MySQL.
  const {
    inventory: hydratedInventory,
    loading,
    initialStage,
    initialCustomAreas,
  } = useInventoryHydration({
    propertyId,
    phase,
    propertyType,
    baseInventory,
    hideSignatures,
  });

  // 2) State local que se inicializa desde la hidratación.
  const [inventory, setInventory] = useState<Inventory | null>(
    hydratedInventory,
  );
  const [stage, setStage] = useState<InventoryStage>(initialStage);
  const [currentAreaIndex, setCurrentAreaIndex] = useState(0);
  const [customAreas, setCustomAreas] =
    useState<{ id: string; label: string }[]>(initialCustomAreas);

  // Sincronizar cuando la hidratación termina.
  useEffect(() => {
    if (hydratedInventory && !inventory) {
      setInventory(hydratedInventory);
      setStage(initialStage);
      setCustomAreas(initialCustomAreas);
    }
  }, [hydratedInventory, inventory, initialStage, initialCustomAreas]);

  // 3) Draft persistence (counters + customAreas + stage) en localStorage.
  // NO incluye `photos` (dataURL base64) ni `signatures` (PNG base64) porque
  // pueden pesar MB. La fuente de verdad de esos sigue siendo IndexedDB.
  type InventoryDraft = {
    counters: Record<string, number>;
    customAreas: { id: string; label: string }[];
    currentAreaIndex: number;
    stage: InventoryStage;
    updatedAt: string;
    version: 1;
  };
  const draftKey = `inmocontrol:draft:inventory:${propertyId}:${phase}`;
  const {
    setValue: setDraft,
    clear: clearDraft,
    discard: discardDraft,
  } = useDraftPersistence<InventoryDraft>({
    key: draftKey,
    initialValue: {
      counters: {},
      customAreas: [],
      currentAreaIndex: 0,
      stage: "config",
      updatedAt: new Date().toISOString(),
      version: 1,
    },
    debounceMs: 1000,
    onRestore: (restored) => {
      showToast(
        `🔄 Avance del inventario restaurado — última edición: ${new Date(restored.updatedAt).toLocaleString("es-CO")}`,
        "success",
      );
    },
  });

  // SPEC AC-2.1: persistir el draft en localStorage cada vez que cambia.
  useEffect(() => {
    if (!inventory) return;
    setDraft({
      counters: inventory.counters ?? {},
      customAreas,
      currentAreaIndex,
      stage,
      updatedAt: new Date().toISOString(),
      version: 1,
    });
  }, [inventory?.counters, customAreas, currentAreaIndex, stage, setDraft]);

  // 4) persist: guardar inventory + cada foto en su store + cleanup de huérfanas.
  const persist = async (next: Inventory) => {
    next.updatedAt = new Date().toISOString();
    setInventory(next);
    await inventoryDB.saveInventory(next);
    // FIX CRÍTICO: sincronizar también cada foto al store `photos` aparte.
    // Sin esto, `inventoryDB.getPhoto(id)` siempre devuelve null → el PDF
    // sale sin fotos y la subida a Drive en finalize se saltea silenciosamente.
    for (const p of next.photos ?? []) {
      if (!p?.dataUrl) continue;
      const existing = await inventoryDB.getPhoto(p.id);
      if (!existing || existing.dataUrl !== p.dataUrl) {
        await inventoryDB.savePhoto({
          id: p.id,
          inventoryId: next.id,
          dataUrl: p.dataUrl,
          areaId: p.areaId,
          fileName: p.fileName,
          takenAt: p.takenAt,
        });
      }
    }
    const liveIds = new Set((next.photos ?? []).map((p) => p.id));
    const allPhotos = await inventoryDB.listPhotosByInventory(next.id);
    for (const old of allPhotos) {
      if (!liveIds.has(old.id)) {
        await inventoryDB.deletePhoto(old.id);
      }
    }
  };

  return {
    inventory,
    loading,
    customAreas,
    setCustomAreas,
    currentAreaIndex,
    setCurrentAreaIndex,
    stage,
    setStage,
    persist,
    clearDraft,
    discardDraft,
  };
}
