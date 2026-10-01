// filepath: src/features/properties/inventoryConfig/materialCatalog.ts
// MATERIAL_CATALOG consolidado. Combina compartidos + baño/cocina + muebles + otros.
import { MATERIAL_CATALOG_COMPARTIDOS } from "./materialCatalogCompartidos";
import { MATERIAL_CATALOG_BANOS_Y_COCINA } from "./materialCatalogBanosYcocina";
import { MATERIAL_CATALOG_MUEBLES_Y_OTROS } from "./materialCatalogMueblesYOtros";

export const MATERIAL_CATALOG: Record<string, string[]> = {
  ...MATERIAL_CATALOG_COMPARTIDOS,
  ...MATERIAL_CATALOG_BANOS_Y_COCINA,
  ...MATERIAL_CATALOG_MUEBLES_Y_OTROS,
};
