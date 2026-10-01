// filepath: src/features/properties/inventoryConfig/itemCatalogSocial.ts
// Áreas sociales / circulación / exteriores del ITEM_CATALOG.
// Basado en PDF Afiansa INVENTARIO EN BLANCO (residencial).
import type { ItemDef } from "./types";

export const ITEM_CATALOG_SOCIAL: Record<string, ItemDef[]> = {
  /** ENTRADA: puerta principal + otras puertas, vidrios, rejas, acabados */
  entrada: [
    { id: "puerta_ppal", label: "Puerta Principal" },
    { id: "marco_puerta", label: "Marco de Puerta" },
    { id: "cerradura_puerta_ppal", label: "Cerradura Puerta Principal" },
    { id: "otras_puertas", label: "Otras Puertas" },
    { id: "cerradura_otras_puertas", label: "Cerradura Otras Puertas" },
    { id: "ventanas", label: "Ventanas" },
    { id: "vidrios_especiales", label: "Vidrios Especiales" },
    { id: "otros_vidrios", label: "Otros Vidrios" },
    { id: "rejas", label: "Rejas" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "alfombras", label: "Alfombras" },
    { id: "techos", label: "Techos" },
    { id: "divisiones", label: "Divisiones" },
    { id: "escaleras", label: "Escaleras" },
  ],

  /** HALL: recibidor / pasillo de entrada, sin puertas */
  hall: [
    { id: "interruptores", label: "Interruptores" },
    { id: "plafones", label: "Plafones" },
    { id: "tomas", label: "Tomas" },
    { id: "lamparas", label: "Lámparas" },
    { id: "guarda_escobas", label: "Guarda Escobas" },
    { id: "cortineros", label: "Cortineros" },
    { id: "chimenea", label: "Chimenea" },
    { id: "rejas", label: "Rejas" },
    { id: "pisos", label: "Pisos" },
    { id: "techos", label: "Techos" },
    { id: "paredes", label: "Paredes" },
  ],

  /** SALA COMEDOR (juntas): chimenea + cortineros + alfombras */
  sala_comedor: [
    { id: "puertas", label: "Puertas" },
    { id: "marco_puerta", label: "Marco de Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "ventana", label: "Ventana" },
    { id: "vidrios", label: "Vidrios" },
    { id: "rejas", label: "Rejas" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "alfombras", label: "Alfombras" },
    { id: "techos", label: "Techos" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "rosetas", label: "Rosetas" },
    { id: "apliques", label: "Apliques" },
    { id: "lamparas", label: "Lámparas" },
    { id: "guarda_escobas", label: "Guarda Escobas" },
    { id: "cortineros", label: "Cortineros" },
    { id: "chimenea", label: "Chimenea" },
  ],

  /** COMEDOR AUXILIAR (separado): sin chimenea/cortineros/alfombras */
  comedor: [
    { id: "puertas", label: "Puertas" },
    { id: "marco_puerta", label: "Marco de Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "ventana", label: "Ventana" },
    { id: "vidrios", label: "Vidrios" },
    { id: "rejas", label: "Rejas" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "techos", label: "Techos" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "rosetas", label: "Rosetas" },
    { id: "apliques", label: "Apliques" },
    { id: "lamparas", label: "Lámparas" },
    { id: "guarda_escobas", label: "Guarda Escobas" },
  ],

  /** SALA (separada): similar a comedor_auxiliar */
  sala: [
    { id: "puertas", label: "Puertas" },
    { id: "marco_puerta", label: "Marco de Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "ventana", label: "Ventana" },
    { id: "vidrios", label: "Vidrios" },
    { id: "rejas", label: "Rejas" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "techos", label: "Techos" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "rosetas", label: "Rosetas" },
    { id: "apliques", label: "Apliques" },
    { id: "lamparas", label: "Lámparas" },
    { id: "guarda_escobas", label: "Guarda Escobas" },
  ],

  /** SALA DE ESTAR (Casa): chimenea opcional */
  sala_estar: [
    { id: "puertas", label: "Puertas" },
    { id: "marco_puerta", label: "Marco de Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "ventana", label: "Ventana" },
    { id: "vidrios", label: "Vidrios" },
    { id: "rejas", label: "Rejas" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "alfombras", label: "Alfombras" },
    { id: "techos", label: "Techos" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "apliques", label: "Apliques" },
    { id: "lamparas", label: "Lámparas" },
    { id: "guarda_escobas", label: "Guarda Escobas" },
    { id: "cortineros", label: "Cortineros" },
  ],

  /** SALA DE TELEVISIÓN (Casa): agrega cable/datos */
  sala_tv: [
    { id: "puertas", label: "Puertas" },
    { id: "marco_puerta", label: "Marco de Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "ventana", label: "Ventana" },
    { id: "vidrios", label: "Vidrios" },
    { id: "rejas", label: "Rejas" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "techos", label: "Techos" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "apliques", label: "Apliques" },
    { id: "lamparas", label: "Lámparas" },
    { id: "guarda_escobas", label: "Guarda Escobas" },
    { id: "cortineros", label: "Cortineros" },
    { id: "cable_datos", label: "Salida cable / Datos" },
  ],

  /** PASILLO */
  pasillo: [
    { id: "piso", label: "Piso" },
    { id: "pintura", label: "Pintura" },
    { id: "iluminacion", label: "Iluminación" },
    { id: "interruptores", label: "Interruptores" },
    { id: "plafones", label: "Plafones" },
    { id: "tomas", label: "Tomas" },
  ],

  /** BALCÓN */
  balcon: [
    { id: "piso", label: "Piso" },
    { id: "baranda", label: "Baranda / Pasamanos" },
    { id: "iluminacion", label: "Iluminación" },
    { id: "rejas", label: "Rejas" },
  ],

  /** TERRAZA */
  terraza: [
    { id: "piso", label: "Piso / Impermeabilización" },
    { id: "baranda", label: "Baranda" },
    { id: "iluminacion", label: "Iluminación" },
    { id: "rejas", label: "Rejas" },
  ],

  /** PATIO: incluye zona lavandería completa del PDF */
  patio: [
    { id: "puerta", label: "Puerta" },
    { id: "marco_puerta", label: "Marco Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "ventana", label: "Ventana" },
    { id: "vidrios", label: "Vidrios" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "instalacion_lavadora", label: "Instalación Lavadora" },
    { id: "lavadero", label: "Lavadero" },
    { id: "llave_lavadero", label: "Llave Lavadero" },
    { id: "rejilla_piso", label: "Rejilla Piso" },
    { id: "plafones_lamparas", label: "Plafones / Lámparas" },
    { id: "calentador", label: "Calentador" },
    { id: "tenderos_ropa", label: "Tenderos de Ropa" },
  ],

  /** ANTEJARDÍN (Casa) */
  antejardin: [
    { id: "piso", label: "Piso / Césped" },
    { id: "muro", label: "Muro perimetral" },
    { id: "vegetacion", label: "Vegetación / Jardineras" },
    { id: "riego", label: "Sistema de riego" },
    { id: "rejas", label: "Rejas" },
  ],

  /** ESCALERAS (Casa de 2+ pisos) */
  escaleras: [
    { id: "piso", label: "Piso / Huella" },
    { id: "baranda", label: "Baranda / Pasamanos" },
    { id: "iluminacion", label: "Iluminación" },
    { id: "paredes", label: "Paredes" },
  ],
};
