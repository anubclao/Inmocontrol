// filepath: src/features/properties/inventoryConfig/itemCatalogComercial.ts
// Comercial / Industrial (no están en el PDF Afiansa, base útil) + Genérico "Otros".
import type { ItemDef } from "./types";

export const ITEM_CATALOG_COMERCIAL: Record<string, ItemDef[]> = {
  // ── Comercial / Industrial (no están en el PDF Afiansa, base útil) ─

  recepcion: [
    { id: "pintura", label: "Pintura" },
    { id: "pisos", label: "Pisos" },
    { id: "mostrador", label: "Mostrador" },
    { id: "sillas", label: "Sillas de espera" },
    { id: "ventanas", label: "Ventanas" },
    { id: "tomas", label: "Tomas" },
    { id: "iluminacion", label: "Iluminación" },
  ],
  cubiculo: [
    { id: "escritorio", label: "Escritorio" },
    { id: "silla", label: "Silla" },
    { id: "tomas", label: "Tomas eléctricas / Datos" },
    { id: "iluminacion", label: "Iluminación" },
    { id: "pintura", label: "Pintura" },
    { id: "pisos", label: "Pisos" },
  ],
  oficina: [
    { id: "escritorio", label: "Escritorio" },
    { id: "silla", label: "Silla" },
    { id: "archivador", label: "Archivador" },
    { id: "tomas", label: "Tomas eléctricas" },
    { id: "internet", label: "Internet / Datos" },
    { id: "iluminacion", label: "Iluminación" },
    { id: "pisos", label: "Pisos" },
  ],
  cocineta: [
    { id: "pintura", label: "Pintura / Enchapes" },
    { id: "meson", label: "Mesón" },
    { id: "griferia", label: "Grifería" },
    { id: "muebles", label: "Muebles" },
    { id: "electrodomesticos", label: "Electrodomésticos" },
    { id: "tomas", label: "Tomas" },
  ],
  archivo: [
    { id: "pintura", label: "Pintura" },
    { id: "pisos", label: "Pisos" },
    { id: "estanteria", label: "Estantería" },
    { id: "ventilacion", label: "Ventilación" },
  ],
  area_principal: [
    { id: "piso", label: "Piso (epóxico / concreto)" },
    { id: "techo", label: "Techo / Altura" },
    { id: "iluminacion", label: "Iluminación industrial" },
    { id: "muros", label: "Muros perimetrales" },
    { id: "puertas", label: "Puertas / Cortinas metálicas" },
  ],
  area_carga: [
    { id: "piso", label: "Piso / Rampa" },
    { id: "senalizacion", label: "Señalización" },
    { id: "capacidad", label: "Capacidad de carga (T)" },
    { id: "puertas", label: "Puertas / Cortinas" },
    { id: "iluminacion", label: "Iluminación" },
  ],
  vitrina: [
    { id: "vidrio", label: "Vidrio" },
    { id: "marco", label: "Marco / Aluminio" },
    { id: "iluminacion", label: "Iluminación" },
  ],
  altillo: [
    { id: "piso", label: "Piso" },
    { id: "escalera", label: "Escalera de acceso" },
    { id: "baranda", label: "Baranda de seguridad" },
    { id: "iluminacion", label: "Iluminación" },
  ],
  area_ventas: [
    { id: "pintura", label: "Pintura" },
    { id: "pisos", label: "Pisos" },
    { id: "mostrador", label: "Mostrador / Caja" },
    { id: "estanteria", label: "Estantería" },
    { id: "iluminacion", label: "Iluminación" },
  ],
  bodega_interna: [
    { id: "piso", label: "Piso" },
    { id: "estanteria", label: "Estantería" },
    { id: "puerta", label: "Puerta" },
    { id: "ventilacion", label: "Ventilación" },
  ],

  // ── Genérico para "Otros" (custom areas con nombre libre) ───
  otros: [
    { id: "pintura", label: "Pintura" },
    { id: "piso", label: "Piso" },
    { id: "puerta", label: "Puerta / Cerradura" },
    { id: "iluminacion", label: "Iluminación" },
    { id: "tomas", label: "Tomas eléctricas" },
    { id: "ventilacion", label: "Ventilación" },
  ],
};
