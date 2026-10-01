// filepath: src/features/properties/inventoryConfig/propertyTypes.ts
// PROPERTY_TYPES: configuración de los 6 tipos de inmueble soportados.
// Combina RESIDENTIAL_PROPERTY_TYPES (sin casa) + CASA_PROPERTY_TYPE + COMMERCIAL_PROPERTY_TYPES.
import type { PropertyType } from "./types";
import { RESIDENTIAL_PROPERTY_TYPES } from "./propertyTypesResidencial";
import { CASA_PROPERTY_TYPE } from "./propertyTypesCasa";
import { COMMERCIAL_PROPERTY_TYPES } from "./propertyTypesComercial";

export interface AreaDef {
  category: keyof typeof import("./itemCatalog").ITEM_CATALOG;
  label: (i?: number) => string;
  counterKey?: string;
}

export interface MultiCounterDef {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

export interface PropertyTypeConfig {
  id: PropertyType;
  label: string;
  areas: AreaDef[];
  multiAreas: AreaDef[];
  multiCounters: MultiCounterDef[];
  recommendedPhotos: number;
}

export const PROPERTY_TYPES: PropertyTypeConfig[] = [
  ...RESIDENTIAL_PROPERTY_TYPES,
  CASA_PROPERTY_TYPE,
  ...COMMERCIAL_PROPERTY_TYPES,
];

/** Lookup del config por id, con fallback al primer tipo (apartaestudio). */
export const getPropertyTypeConfig = (id: PropertyType): PropertyTypeConfig =>
  PROPERTY_TYPES.find((p) => p.id === id) ?? PROPERTY_TYPES[0];

/** Custom area definida por el usuario (botón "Otros"). */
export interface CustomArea {
  id: string;
  label: string;
}
