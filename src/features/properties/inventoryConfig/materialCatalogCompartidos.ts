// filepath: src/features/properties/inventoryConfig/materialCatalogCompartidos.ts
// Materiales compartidos: pisos, paredes, ventanas, puertas, cerraduras, vidrios, rejas.

export const MATERIAL_CATALOG_COMPARTIDOS: Record<string, string[]> = {
  // ── Pisos (comparten) ──
  pisos: [
    "Cerámica",
    "Porcelanato",
    "Madera laminada",
    "Madera maciza",
    "Alfombra",
    "Vinilo",
    "Concreto pulido",
    "Mármol",
    "Granito",
    "Baldosa",
  ],

  // ── Paredes ──
  paredes: [
    "Pintura vinílica",
    "Pintura acrílica",
    "Pintura esmalte",
    "Papel tapiz",
    "Drywall",
    "Cerámica",
    "Madera",
    "Yeso",
    "Estuco",
    "Concreto visto",
  ],

  // ── Techos ──
  techos: [
    "Pintura",
    "Drywall",
    "Madera",
    "Concreto visto",
    "Yeso",
    "PVC",
    "Teja de barro",
    "Teja de zinc",
    "Cielo raso",
  ],

  // ── Ventanas ──
  ventanas: [
    "Aluminio + vidrio",
    "PVC + vidrio",
    "Madera + vidrio",
    "Hierro + vidrio",
    "Vidrio crudo",
  ],

  // ── Puertas (comparten) ──
  puerta: [
    "Madera sólida",
    "MDF",
    "Metálica",
    "Aluminio + vidrio",
    "PVC + vidrio",
    "Vidrio templado",
  ],
  puerta_ppal: [
    "Madera sólida",
    "MDF",
    "Metálica",
    "Aluminio + vidrio",
    "PVC + vidrio",
    "Blindada",
  ],
  puertas: [
    "Madera sólida",
    "MDF",
    "Metálica",
    "Aluminio + vidrio",
    "PVC + vidrio",
  ],

  // ── Marcos de puerta ──
  marco_puerta: ["Madera", "Metálico", "Aluminio", "PVC", "MDF"],

  // ── Cerraduras (comparten) ──
  cerradura: [
    "Cilíndrica",
    "Digital",
    "Manija",
    "Embutida",
    "De pomo",
    "De seguridad",
    "Multipunto",
  ],
  cerradura_puerta_ppal: [
    "Cilíndrica",
    "Digital",
    "De seguridad",
    "Multipunto",
  ],
  cerradura_otras_puertas: ["Cilíndrica", "De pomo", "Embutida", "Multipunto"],

  // ── Vidrios ──
  vidrios: ["Crudo", "Templado", "Laminado", "Bronce", "Esmerilado"],
  vidrios_especiales: ["Templado", "Laminado", "Esmerilado", "SmartGlass"],
  otros_vidrios: ["Crudo", "Templado", "Laminado", "Esmerilado"],

  // ── Rejas ──
  rejas: ["Hierro forjado", "Hierro cuadrado", "Aluminio", "Acero inoxidable"],

  // ── Alfombras ──
  alfombras: ["Lana", "Sintética", "Algodón", "Fibra natural", "Yute", "Sisal"],
};
