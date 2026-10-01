// filepath: src/features/properties/inventoryConfig/itemCatalog.ts
// ITEM_CATALOG consolidado (combina social + habitaciones + baños + comercial + otros).
// Mantiene el mismo shape que el monolito original para no romper importadores.
import type { ItemDef } from "./types";
import { ITEM_CATALOG_SOCIAL } from "./itemCatalogSocial";
import { ITEM_CATALOG_BANOS_Y_COCINA } from "./itemCatalogBanosYcocina";
import { ITEM_CATALOG_HABITACIONES } from "./itemCatalogHabitaciones";
import { ITEM_CATALOG_COMERCIAL } from "./itemCatalogComercial";

/** Catálogo de items por categoría de área. Combina 5 sub-catálogos. */
export const ITEM_CATALOG: Record<string, ItemDef[]> = {
  ...ITEM_CATALOG_SOCIAL,
  ...ITEM_CATALOG_BANOS_Y_COCINA,
  ...ITEM_CATALOG_HABITACIONES,
  ...ITEM_CATALOG_COMERCIAL,
};
