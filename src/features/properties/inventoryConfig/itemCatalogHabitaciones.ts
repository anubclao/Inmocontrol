// filepath: src/features/properties/inventoryConfig/itemCatalogHabitaciones.ts
// Habitaciones (alcoba, estudio, cuarto útil) + Servicios (depósito, parqueadero, lavandería).
import type { ItemDef } from "./types";

export const ITEM_CATALOG_HABITACIONES: Record<string, ItemDef[]> = {
  /** ALCOBA / ALCOBA PRINCIPAL: incluye Closets con sub-items aplanados */
  alcoba: [
    { id: "puerta", label: "Puerta" },
    { id: "marco_puerta", label: "Marco Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "rejas", label: "Rejas" },
    { id: "ventanas", label: "Ventanas" },
    { id: "vidrios", label: "Vidrios" },
    { id: "pisos", label: "Pisos" },
    { id: "alfombras", label: "Alfombras" },
    { id: "paredes", label: "Paredes" },
    { id: "cortineros", label: "Cortineros" },
    { id: "techos", label: "Techos" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "plafones", label: "Plafones" },
    { id: "apliques", label: "Apliques" },
    { id: "lamparas", label: "Lámparas" },
    { id: "guarda_escobas", label: "Guarda Escobas" },
    { id: "closet_puertas", label: "Closets — Puertas" },
    { id: "closet_entrepanos", label: "Closets — Entrepaños" },
    { id: "closet_cajones", label: "Closets — Cajones" },
  ],

  /** ESTUDIO */
  estudio: [
    { id: "puerta", label: "Puerta" },
    { id: "marco_puerta", label: "Marco Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "ventanas", label: "Ventanas" },
    { id: "vidrios", label: "Vidrios" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "techos", label: "Techos" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "lamparas", label: "Lámparas" },
  ],

  /** CUARTO ÚTIL */
  cuarto_util: [
    { id: "puerta", label: "Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "iluminacion", label: "Iluminación" },
    { id: "ventilacion", label: "Ventilación" },
  ],

  /** GARAJE Y/O DEPÓSITO: items del PDF */
  deposito: [
    { id: "puerta", label: "Puerta" },
    { id: "marco_puerta", label: "Marco Puerta" },
    { id: "cerradura", label: "Cerradura" },
    { id: "ventanas", label: "Ventanas" },
    { id: "vidrios", label: "Vidrios" },
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "techos", label: "Techos" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "plafones_lamparas", label: "Plafones / Lámparas" },
  ],

  /** PARQUEADERO (independiente) */
  parqueadero: [
    { id: "piso", label: "Piso / Pintura demarcación" },
    { id: "senalizacion", label: "Señalización (número)" },
    { id: "techo", label: "Techo / Cubierta" },
  ],

  /** LAVANDERÍA / ZONA DE OFICIOS: versión reducida sin tendedero */
  lavanderia: [
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "techos", label: "Techos" },
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

  /** ZONA DE OFICIOS (Apartaestudio): subset más pequeño */
  zona_oficios: [
    { id: "pisos", label: "Pisos" },
    { id: "paredes", label: "Paredes" },
    { id: "tomas", label: "Tomas" },
    { id: "interruptores", label: "Interruptores" },
    { id: "instalacion_lavadora", label: "Instalación Lavadora" },
    { id: "lavadero", label: "Lavadero" },
    { id: "llave_lavadero", label: "Llave Lavadero" },
    { id: "plafones_lamparas", label: "Plafones / Lámparas" },
  ],
};
