// filepath: src/features/properties/components/inventory/hooks/useInventoryState.types.ts
/**
 * Tipos compartidos entre los hooks del directorio `inventory/hooks/`.
 * Se separan de `useInventoryState.ts` para evitar el ciclo de imports entre
 * `useInventoryState` (orquestador) y `useInventoryFinalize` (consumidor).
 */
import type { InventoryArea } from "../../../inventoryTypes";

export type { InventoryStage } from "./useInventoryHydration";

export interface ResumenFinalizacion {
  areasConFotos: number;
  totalAreas: number;
  totalMedia: number;
  totalPhotos: number;
  totalItemMedia: number;
  totalItemsEvaluados: number;
  areasSinFotos: InventoryArea[];
}
