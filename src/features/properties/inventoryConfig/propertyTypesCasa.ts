// filepath: src/features/properties/inventoryConfig/propertyTypesCasa.ts
// Tipo residencial: casa.
import type { PropertyTypeConfig } from "./propertyTypes";

export const CASA_PROPERTY_TYPE: PropertyTypeConfig = {
  id: "casa",
  label: "Casa",
  areas: [],
  multiAreas: [
    { category: "alcoba", label: (i) => `Alcoba ${i}`, counterKey: "alcobas" },
    { category: "balcon", label: (i) => `Balcón ${i}`, counterKey: "balcones" },
    { category: "bano", label: (i) => `Baño ${i}`, counterKey: "banos" },
    {
      category: "bano_social",
      label: (i) => `Baño Social ${i}`,
      counterKey: "banos_social",
    },
    {
      category: "bano_auxiliar",
      label: (i) => `Baño Auxiliar ${i}`,
      counterKey: "banos_auxiliares",
    },
    { category: "cocina", label: (i) => `Cocina ${i}`, counterKey: "cocinas" },
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
      category: "escaleras",
      label: (i) => `Escaleras ${i}`,
      counterKey: "escaleras",
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
      category: "sala_estar",
      label: (i) => `Sala de Estar ${i}`,
      counterKey: "salas_estar",
    },
    {
      category: "sala_tv",
      label: (i) => `Sala de Televisión ${i}`,
      counterKey: "salas_tv",
    },
    {
      category: "terraza",
      label: (i) => `Terraza ${i}`,
      counterKey: "terrazas",
    },
    {
      category: "antejardin",
      label: (i) => `Antejardín ${i}`,
      counterKey: "antejardines",
    },
    { category: "patio", label: (i) => `Patio ${i}`, counterKey: "patios" },
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
    { key: "alcobas", label: "Alcobas", min: 1, max: 6, default: 3 },
    { key: "balcones", label: "Balcones", min: 0, max: 4, default: 1 },
    { key: "banos", label: "Baños", min: 1, max: 5, default: 2 },
    {
      key: "banos_social",
      label: "Baños Sociales",
      min: 0,
      max: 2,
      default: 1,
    },
    {
      key: "banos_auxiliares",
      label: "Baños Auxiliares",
      min: 0,
      max: 3,
      default: 0,
    },
    { key: "cocinas", label: "Cocinas", min: 1, max: 3, default: 1 },
    { key: "comedores", label: "Comedores", min: 0, max: 2, default: 1 },
    { key: "entradas", label: "Entradas", min: 1, max: 3, default: 1 },
    { key: "escaleras", label: "Escaleras", min: 0, max: 3, default: 1 },
    {
      key: "lavanderias",
      label: "Zonas de Lavandería",
      min: 0,
      max: 1,
      default: 1,
    },
    { key: "pasillos", label: "Pasillos", min: 0, max: 4, default: 1 },
    { key: "salas", label: "Salas", min: 1, max: 3, default: 1 },
    { key: "salas_estar", label: "Salas de Estar", min: 0, max: 2, default: 0 },
    {
      key: "salas_tv",
      label: "Salas de Televisión",
      min: 0,
      max: 2,
      default: 0,
    },
    { key: "terrazas", label: "Terrazas", min: 0, max: 3, default: 0 },
    { key: "antejardines", label: "Antejardines", min: 0, max: 2, default: 1 },
    { key: "patios", label: "Patios", min: 0, max: 3, default: 1 },
    { key: "depositos", label: "Depósitos", min: 0, max: 3, default: 1 },
    { key: "parqueaderos", label: "Parqueaderos", min: 0, max: 4, default: 1 },
  ],
  recommendedPhotos: 3,
};
