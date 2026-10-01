// filepath: src/features/properties/inventoryConfig/materialCatalogBanosYcocina.ts
// Materiales específicos de baño (sanitario, grifería, tina) y cocina.

export const MATERIAL_CATALOG_BANOS_Y_COCINA: Record<string, string[]> = {
  // ── Sanitario / Baño ──
  sanitario: ["Porcelana", "Loza", "Acero inoxidable", "Inodoro inteligente"],
  lavamanos: [
    "Porcelana",
    "Loza",
    "Vidrio templado",
    "Acero inoxidable",
    "Mármol",
    "Piedra",
  ],
  griferia: [
    "Cromada",
    "Acero inoxidable",
    "Bronce",
    "Negra mate",
    "Oro",
    "Sensor",
  ],
  griferia_sanitario: ["Cromada", "Acero inoxidable", "Bronce", "Negra mate"],
  griferia_ducha: [
    "Cromada",
    "Acero inoxidable",
    "Bronce",
    "Negra mate",
    "Mezcladora",
  ],
  ducha: [
    "Regadera fija",
    "Regadera manual",
    "Doble regadera",
    "Teléfono",
    "Sistema de lluvia",
  ],
  tina: [
    "Acero esmaltado",
    "Acrílico",
    "Hierro fundido",
    "Mármol",
    "Hidromasaje",
  ],
  espejos: [
    "Vidrio con marco de madera",
    "Vidrio con marco metálico",
    "Vidrio sin marco",
    "Espejo inteligente",
  ],
  gabinetes: ["Madera", "MDF", "PVC", "Metalicos", "Acrílicos"],
  rejillas: ["Aluminio", "Hierro", "PVC", "Cromadas", "Plástico"],

  // ── Cocina ──
  lavaplatos: [
    "Acero inoxidable",
    "Granito",
    "Cuarzo",
    "Mármol",
    "Polietileno",
  ],
  estufa_asador: [
    "Gas natural",
    "Gas propano",
    "Eléctrica",
    "Inducción",
    "Mixta",
  ],
  horno: ["Gas", "Eléctrico", "Convector", "A vapor"],
  campana_extractora: ["Acero inoxidable", "Acero negro", "Empotrable", "Isla"],
  mueble_inf_entrepanos: ["Madera", "MDF", "Aglomerado", "Metalicos", "PVC"],
  mueble_inf_cajones: [
    "Madera",
    "MDF",
    "Metalicos",
    "PVC",
    "Con rieles telescópicos",
  ],
  mueble_inf_puertas: ["Madera", "MDF", "Metalicas", "PVC", "Con vidrio"],
  mueble_sup_entrepanos: [
    "Madera",
    "MDF",
    "Aglomerado",
    "Metalicos",
    "PVC",
    "Vidrio",
  ],
  mueble_sup_cajones: ["Madera", "MDF", "Metalicos", "PVC"],
  mueble_sup_puertas: ["Madera", "MDF", "Metalicas", "PVC", "Con vidrio"],
  calentador: ["Gas natural", "Gas propano", "Eléctrico", "Solar", "Térmico"],
};
