// filepath: src/features/properties/inventoryConfig/types.ts
// Tipos y enums centrales de la config del Inventario Dinámico.

export type PropertyType =
  | "apartaestudio"
  | "apartamento"
  | "casa"
  | "oficina"
  | "local"
  | "bodega";

export type ItemStatus = "bueno" | "regular" | "malo" | "na";

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  bueno: "Bueno",
  regular: "Regular",
  malo: "Malo",
  na: "N/A",
};

export const ITEM_STATUS_COLOR: Record<ItemStatus, string> = {
  bueno: "bg-emerald-500 text-white",
  regular: "bg-amber-500 text-white",
  malo: "bg-red-500 text-white",
  na: "bg-slate-300 text-slate-600",
};

export interface ItemDef {
  id: string;
  label: string;
}
