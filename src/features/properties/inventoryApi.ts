/**
 * inventoryApi — persistencia del Inventory en el backend (MySQL).
 *
 * Por qué existe este módulo (auditoría oct-2026):
 *
 *  1. El inventario de COLOCACIÓN (`phase='final'`) nunca se guardaba en MySQL:
 *     solo se generaba el PDF y se subía a Drive. Si el agente cambiaba de
 *     equipo o limpiaba el caché del navegador, el JSON (áreas, ítems,
 *     observaciones, firmas) se perdía y la comparativa Inicial vs Final quedaba
 *     vacía porque `InventoryDiffView` lee MySQL primero.
 *
 *  2. El POST incluía TODAS las fotos en base64. `express.json` corta en 15 MB,
 *     así que un inventario real (20–60 fotos) devolvía 413 y el guardado
 *     fallaba en silencio (solo un `console.warn`). Ahora, si el server rechaza
 *     por tamaño, reintentamos SIN las fotos y avisamos: las imágenes ya están
 *     en Drive (`Inventario captacion/` / `Inventario colocacion/`) y el PDF
 *     firmado también, así que no se pierde evidencia — solo la copia embebida.
 */
import type { Inventory } from "./inventoryTypes";

export interface SaveInventoryResult {
  ok: boolean;
  /** true si se guardó sin fotos embebidas por límite de tamaño del request. */
  withoutPhotos?: boolean;
  error?: string;
}

/** Quita `videoDataUrl` de los medios de ítem (puede pesar 10–50 MB). */
function stripHeavyMedia(inv: Inventory, includePhotos: boolean): Inventory {
  return {
    ...inv,
    photos: includePhotos ? inv.photos : [],
    areas: inv.areas.map((area) => ({
      ...area,
      items: Object.fromEntries(
        Object.entries(area.items).map(([itemId, item]) => [
          itemId,
          {
            ...item,
            media: (item.media ?? []).map((m) => {
              if (m.type !== "video") return m;
              const { videoDataUrl, ...rest } = m as typeof m & {
                videoDataUrl?: string;
              };
              void videoDataUrl;
              return rest;
            }),
          },
        ]),
      ),
    })),
  };
}

function buildBody(inv: Inventory, includePhotos: boolean) {
  const payload = stripHeavyMedia(inv, includePhotos);
  return JSON.stringify({
    id: payload.id,
    propertyId: payload.propertyId,
    phase: payload.phase,
    propertyType: payload.propertyType,
    counters: payload.counters,
    areas: payload.areas,
    photos: payload.photos,
    signatures: payload.signatures,
    customAreas: payload.customAreas,
    signedAt: payload.signedAt ?? null,
  });
}

/**
 * Guarda el inventario en MySQL.
 *
 * Nunca lanza: devuelve `{ ok, withoutPhotos, error }` para que el caller
 * decida qué tostar. Llamar SIEMPRE después de persistir en IndexedDB (esa es
 * la copia local y no depende de la red).
 */
export async function saveInventoryToServer(
  inventory: Inventory,
): Promise<SaveInventoryResult> {
  try {
    let res = await fetch("/api/inventories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildBody(inventory, true),
    });

    if (res.status === 413) {
      console.warn(
        "[inventory] payload demasiado grande (413) — reintentando sin fotos embebidas",
      );
      res = await fetch("/api/inventories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildBody(inventory, false),
      });
      if (res.ok) return { ok: true, withoutPhotos: true };
    }

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: detail?.error ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
