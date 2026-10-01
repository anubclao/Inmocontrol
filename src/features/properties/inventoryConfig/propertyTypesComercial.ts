// filepath: src/features/properties/inventoryConfig/propertyTypesComercial.ts
// Tipos comerciales: oficina, local, bodega.
import type { PropertyTypeConfig } from "./propertyTypes";

export const COMMERCIAL_PROPERTY_TYPES: PropertyTypeConfig[] = [
  {
    id: "oficina",
    label: "Oficina",
    areas: [],
    multiAreas: [
      { category: "bano", label: (i) => `Baño ${i}`, counterKey: "banos" },
      {
        category: "cocineta",
        label: (i) => `Cocineta ${i}`,
        counterKey: "cocinetas",
      },
      {
        category: "cubiculos",
        label: (i) => `Cubículo ${i}`,
        counterKey: "cubiculos",
      },
      {
        category: "deposito",
        label: (i) => `Depósito ${i}`,
        counterKey: "depositos",
      },
      {
        category: "entrada",
        label: (i) => `Entrada ${i}`,
        counterKey: "entradas",
      },
      {
        category: "parqueadero",
        label: (i) => `Parqueadero ${i}`,
        counterKey: "parqueaderos",
      },
      {
        category: "recepcion",
        label: (i) => `Recepción ${i}`,
        counterKey: "recepciones",
      },
    ],
    multiCounters: [
      { key: "banos", label: "Baños", min: 1, max: 4, default: 1 },
      { key: "cocinetas", label: "Cocinetas", min: 0, max: 2, default: 1 },
      { key: "cubiculos", label: "Cubículos", min: 0, max: 30, default: 2 },
      { key: "depositos", label: "Depósitos", min: 0, max: 3, default: 1 },
      { key: "entradas", label: "Entradas", min: 1, max: 2, default: 1 },
      {
        key: "parqueaderos",
        label: "Parqueaderos",
        min: 0,
        max: 5,
        default: 1,
      },
      { key: "recepciones", label: "Recepciones", min: 1, max: 3, default: 1 },
    ],
    recommendedPhotos: 2,
  },
  {
    id: "local",
    label: "Local",
    areas: [],
    multiAreas: [
      { category: "bano", label: (i) => `Baño ${i}`, counterKey: "banos" },
      {
        category: "cocineta",
        label: (i) => `Cocineta ${i}`,
        counterKey: "cocinetas",
      },
      {
        category: "cubiculos",
        label: (i) => `Cubículo ${i}`,
        counterKey: "cubiculos",
      },
      {
        category: "deposito",
        label: (i) => `Depósito ${i}`,
        counterKey: "depositos",
      },
      {
        category: "entrada",
        label: (i) => `Entrada ${i}`,
        counterKey: "entradas",
      },
      {
        category: "oficina",
        label: (i) => `Oficina ${i}`,
        counterKey: "oficinas",
      },
      {
        category: "parqueadero",
        label: (i) => `Parqueadero ${i}`,
        counterKey: "parqueaderos",
      },
      {
        category: "recepcion",
        label: (i) => `Recepción ${i}`,
        counterKey: "recepciones",
      },
    ],
    multiCounters: [
      { key: "banos", label: "Baños", min: 1, max: 4, default: 1 },
      { key: "cocinetas", label: "Cocinetas", min: 0, max: 2, default: 1 },
      { key: "cubiculos", label: "Cubículos", min: 0, max: 30, default: 1 },
      { key: "depositos", label: "Depósitos", min: 0, max: 3, default: 1 },
      { key: "entradas", label: "Entradas", min: 1, max: 3, default: 1 },
      { key: "oficinas", label: "Oficinas", min: 0, max: 5, default: 1 },
      {
        key: "parqueaderos",
        label: "Parqueaderos",
        min: 0,
        max: 5,
        default: 0,
      },
      { key: "recepciones", label: "Recepciones", min: 1, max: 3, default: 1 },
    ],
    recommendedPhotos: 3,
  },
  {
    id: "bodega",
    label: "Bodega",
    areas: [],
    multiAreas: [
      { category: "bano", label: (i) => `Baño ${i}`, counterKey: "banos" },
      {
        category: "cocineta",
        label: (i) => `Cocineta ${i}`,
        counterKey: "cocinetas",
      },
      {
        category: "deposito",
        label: (i) => `Depósito ${i}`,
        counterKey: "depositos",
      },
      {
        category: "entrada",
        label: (i) => `Entrada ${i}`,
        counterKey: "entradas",
      },
      {
        category: "oficina",
        label: (i) => `Oficina ${i}`,
        counterKey: "oficinas",
      },
      {
        category: "area_carga",
        label: (i) => `Área de Carga ${i}`,
        counterKey: "areas_carga",
      },
      {
        category: "parqueadero",
        label: (i) => `Parqueadero ${i}`,
        counterKey: "parqueaderos",
      },
      {
        category: "recepcion",
        label: (i) => `Recepción ${i}`,
        counterKey: "recepciones",
      },
    ],
    multiCounters: [
      { key: "banos", label: "Baños", min: 1, max: 4, default: 1 },
      { key: "cocinetas", label: "Cocinetas", min: 0, max: 2, default: 1 },
      { key: "depositos", label: "Depósitos", min: 0, max: 5, default: 1 },
      { key: "entradas", label: "Entradas", min: 1, max: 3, default: 1 },
      { key: "oficinas", label: "Oficinas", min: 0, max: 3, default: 1 },
      {
        key: "areas_carga",
        label: "Áreas de Carga",
        min: 1,
        max: 3,
        default: 1,
      },
      {
        key: "parqueaderos",
        label: "Parqueaderos",
        min: 0,
        max: 10,
        default: 2,
      },
      { key: "recepciones", label: "Recepciones", min: 1, max: 2, default: 1 },
    ],
    recommendedPhotos: 4,
  },
];
