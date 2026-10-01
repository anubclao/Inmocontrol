// filepath: src/features/properties/inventoryConfig/propertyTypesResidencial.ts
// Tipos residenciales chicos: apartaestudio + apartamento.
// Casa vive en su propio archivo (propertyTypesCasa.ts) por tamaño.
import type { PropertyTypeConfig } from "./propertyTypes";

export const RESIDENTIAL_PROPERTY_TYPES: PropertyTypeConfig[] = [
  {
    id: "apartaestudio",
    label: "Apartaestudio",
    areas: [],
    multiAreas: [
      {
        category: "alcoba",
        label: (i) => `Alcoba ${i}`,
        counterKey: "alcobas",
      },
      {
        category: "balcon",
        label: (i) => `Balcón ${i}`,
        counterKey: "balcones",
      },
      {
        category: "bano_social",
        label: (i) => `Baño Social ${i}`,
        counterKey: "banos_social",
      },
      {
        category: "cocina",
        label: (i) => `Cocina ${i}`,
        counterKey: "cocinas",
      },
      {
        category: "entrada",
        label: (i) => `Entrada ${i}`,
        counterKey: "entradas",
      },
      {
        category: "pasillo",
        label: (i) => `Pasillo ${i}`,
        counterKey: "pasillos",
      },
      {
        category: "sala_comedor",
        label: (i) => `Sala Comedor ${i}`,
        counterKey: "salas_comedor",
      },
      {
        category: "zona_oficios",
        label: (i) => `Zona de Oficios ${i}`,
        counterKey: "zonas_oficios",
      },
      {
        category: "deposito",
        label: (i) => `Depósito ${i}`,
        counterKey: "depositos",
      },
      {
        category: "parqueadero",
        label: (i) => `Parqueadero ${i}`,
        counterKey: "parqueaderos",
      },
    ],
    multiCounters: [
      { key: "alcobas", label: "Alcobas", min: 1, max: 2, default: 1 },
      { key: "balcones", label: "Balcones", min: 0, max: 2, default: 0 },
      {
        key: "banos_social",
        label: "Baños Sociales",
        min: 0,
        max: 2,
        default: 1,
      },
      { key: "cocinas", label: "Cocinas", min: 1, max: 2, default: 1 },
      { key: "entradas", label: "Entradas", min: 1, max: 2, default: 1 },
      { key: "pasillos", label: "Pasillos", min: 0, max: 3, default: 1 },
      {
        key: "salas_comedor",
        label: "Salas Comedor",
        min: 1,
        max: 2,
        default: 1,
      },
      {
        key: "zonas_oficios",
        label: "Zonas de Oficios",
        min: 0,
        max: 1,
        default: 1,
      },
      { key: "depositos", label: "Depósitos", min: 0, max: 2, default: 0 },
      {
        key: "parqueaderos",
        label: "Parqueaderos",
        min: 0,
        max: 2,
        default: 1,
      },
    ],
    recommendedPhotos: 3,
  },
  {
    id: "apartamento",
    label: "Apartamento",
    areas: [],
    multiAreas: [
      {
        category: "alcoba",
        label: (i) => `Alcoba ${i}`,
        counterKey: "alcobas",
      },
      {
        category: "balcon",
        label: (i) => `Balcón ${i}`,
        counterKey: "balcones",
      },
      { category: "bano", label: (i) => `Baño ${i}`, counterKey: "banos" },
      {
        category: "bano_social",
        label: (i) => `Baño Social ${i}`,
        counterKey: "banos_social",
      },
      {
        category: "cocina",
        label: (i) => `Cocina ${i}`,
        counterKey: "cocinas",
      },
      {
        category: "comedor",
        label: (i) => `Comedor ${i}`,
        counterKey: "comedores",
      },
      {
        category: "entrada",
        label: (i) => `Entrada ${i}`,
        counterKey: "entradas",
      },
      {
        category: "lavanderia",
        label: (i) => `Zona de Lavandería ${i}`,
        counterKey: "lavanderias",
      },
      {
        category: "pasillo",
        label: (i) => `Pasillo ${i}`,
        counterKey: "pasillos",
      },
      { category: "sala", label: (i) => `Sala ${i}`, counterKey: "salas" },
      {
        category: "terraza",
        label: (i) => `Terraza ${i}`,
        counterKey: "terrazas",
      },
      {
        category: "deposito",
        label: (i) => `Depósito ${i}`,
        counterKey: "depositos",
      },
      {
        category: "parqueadero",
        label: (i) => `Parqueadero ${i}`,
        counterKey: "parqueaderos",
      },
    ],
    multiCounters: [
      { key: "alcobas", label: "Alcobas", min: 1, max: 6, default: 2 },
      { key: "balcones", label: "Balcones", min: 0, max: 3, default: 1 },
      { key: "banos", label: "Baños", min: 1, max: 5, default: 2 },
      {
        key: "banos_social",
        label: "Baños Sociales",
        min: 0,
        max: 2,
        default: 1,
      },
      { key: "cocinas", label: "Cocinas", min: 1, max: 2, default: 1 },
      { key: "comedores", label: "Comedores", min: 0, max: 2, default: 1 },
      { key: "entradas", label: "Entradas", min: 1, max: 2, default: 1 },
      {
        key: "lavanderias",
        label: "Zonas de Lavandería",
        min: 0,
        max: 1,
        default: 1,
      },
      { key: "pasillos", label: "Pasillos", min: 0, max: 3, default: 1 },
      { key: "salas", label: "Salas", min: 1, max: 2, default: 1 },
      { key: "terrazas", label: "Terrazas", min: 0, max: 2, default: 0 },
      { key: "depositos", label: "Depósitos", min: 0, max: 2, default: 0 },
      {
        key: "parqueaderos",
        label: "Parqueaderos",
        min: 0,
        max: 3,
        default: 1,
      },
    ],
    recommendedPhotos: 3,
  },
];
