// filepath: src/features/properties/inventoryConfig.ts
/**
 * Inventory Config (barrel). Re-exporta `inventoryConfig/*` para mantener
 * compat con `import { ... } from './inventoryConfig'`. Detalle por archivo:
 *   - types                PropertyType, ItemStatus, ITEM_STATUS_*, ItemDef
 *   - itemCatalog          ITEM_CATALOG consolidado
 *   - itemCatalogSocial    Áreas sociales / circulación / exteriores
 *   - itemCatalogBanosYcocina 3 baños + cocina
 *   - itemCatalogHabitaciones alcoba, estudio, depósito, lavandería
 *   - itemCatalogComercial comercial + otros
 *   - propertyTypes        interfaces + PROPERTY_TYPES + getPropertyTypeConfig
 *   - propertyTypesResidencial 3 tipos residenciales (apartaestudio, apto, casa)
 *   - propertyTypesComercial    3 tipos comerciales (oficina, local, bodega)
 *   - materialCatalog      MATERIAL_CATALOG
 *   - resolveAreas         helper que arma la lista final de áreas
 */
export type {
  PropertyType,
  ItemStatus,
  ItemDef,
} from "./inventoryConfig/types";
export { ITEM_STATUS_LABEL, ITEM_STATUS_COLOR } from "./inventoryConfig/types";

export { ITEM_CATALOG } from "./inventoryConfig/itemCatalog";
export type {
  AreaDef,
  MultiCounterDef,
  PropertyTypeConfig,
  CustomArea,
} from "./inventoryConfig/propertyTypes";
export {
  PROPERTY_TYPES,
  getPropertyTypeConfig,
} from "./inventoryConfig/propertyTypes";
export { MATERIAL_CATALOG } from "./inventoryConfig/materialCatalog";
export { resolveAreas } from "./inventoryConfig/resolveAreas";
