/**
 * Configuración declarativa de tipos de inmueble para el Inventario Dinámico.
 *
 * Cada PropertyType define:
 *  - label: nombre visible
 *  - areas: áreas "fijas" (siempre 1) que existen para ese tipo
 *  - multiAreas: áreas que se repiten según un counter (counterKey → multiCounters.key)
 *  - multiCounters: contadores 0-N con min/max/default
 *  - itemCatalog: items de checklist por categoría
 *
 * Para añadir un tipo nuevo, solo agregás la entrada en PROPERTY_TYPES.
 * Para añadir un counter a un tipo existente, agregá el multiArea con su
 * counterKey y el counter en multiCounters.
 *
 * Convención nombres: counters van en plural (alcobas, banos), areas en
 * singular (sala, cocina). Las custom areas (Otros) se agregan vía customAreas
 * en el Inventory y se resuelven al final del listado.
 */

export type PropertyType =
  | 'apartaestudio'
  | 'apartamento'
  | 'casa'
  | 'oficina'
  | 'local'
  | 'bodega';

export type ItemStatus = 'bueno' | 'regular' | 'malo' | 'na';
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
  na: 'N/A',
};
export const ITEM_STATUS_COLOR: Record<ItemStatus, string> = {
  bueno: 'bg-emerald-500 text-white',
  regular: 'bg-amber-500 text-white',
  malo: 'bg-red-500 text-white',
  na: 'bg-slate-300 text-slate-600',
};

export interface ItemDef {
  id: string;
  label: string;
}

/** Catálogo de items por categoría de área. */
export const ITEM_CATALOG: Record<string, ItemDef[]> = {
  // ── Residencial (basado en PDF Afiansa INVENTARIO EN BLANCO) ─

  /** ENTRADA: puerta principal + otras puertas, vidrios, rejas, acabados */
  entrada: [
    { id: 'puerta_ppal', label: 'Puerta Principal' },
    { id: 'marco_puerta', label: 'Marco de Puerta' },
    { id: 'cerradura_puerta_ppal', label: 'Cerradura Puerta Principal' },
    { id: 'otras_puertas', label: 'Otras Puertas' },
    { id: 'cerradura_otras_puertas', label: 'Cerradura Otras Puertas' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'vidrios_especiales', label: 'Vidrios Especiales' },
    { id: 'otros_vidrios', label: 'Otros Vidrios' },
    { id: 'rejas', label: 'Rejas' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'alfombras', label: 'Alfombras' },
    { id: 'techos', label: 'Techos' },
    { id: 'divisiones', label: 'Divisiones' },
    { id: 'escaleras', label: 'Escaleras' },
  ],

  /** HALL: recibidor / pasillo de entrada, sin puertas */
  hall: [
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'plafones', label: 'Plafones' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'lamparas', label: 'Lámparas' },
    { id: 'guarda_escobas', label: 'Guarda Escobas' },
    { id: 'cortineros', label: 'Cortineros' },
    { id: 'chimenea', label: 'Chimenea' },
    { id: 'rejas', label: 'Rejas' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'techos', label: 'Techos' },
    { id: 'paredes', label: 'Paredes' },
  ],

  /** SALA COMEDOR (juntas): chimenea + cortineros + alfombras */
  sala_comedor: [
    { id: 'puertas', label: 'Puertas' },
    { id: 'marco_puerta', label: 'Marco de Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventana', label: 'Ventana' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'rejas', label: 'Rejas' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'alfombras', label: 'Alfombras' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'rosetas', label: 'Rosetas' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'lamparas', label: 'Lámparas' },
    { id: 'guarda_escobas', label: 'Guarda Escobas' },
    { id: 'cortineros', label: 'Cortineros' },
    { id: 'chimenea', label: 'Chimenea' },
  ],

  /** COMEDOR AUXILIAR (separado): sin chimenea/cortineros/alfombras */
  comedor: [
    { id: 'puertas', label: 'Puertas' },
    { id: 'marco_puerta', label: 'Marco de Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventana', label: 'Ventana' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'rejas', label: 'Rejas' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'rosetas', label: 'Rosetas' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'lamparas', label: 'Lámparas' },
    { id: 'guarda_escobas', label: 'Guarda Escobas' },
  ],

  /** SALA (separada): similar a comedor_auxiliar */
  sala: [
    { id: 'puertas', label: 'Puertas' },
    { id: 'marco_puerta', label: 'Marco de Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventana', label: 'Ventana' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'rejas', label: 'Rejas' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'rosetas', label: 'Rosetas' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'lamparas', label: 'Lámparas' },
    { id: 'guarda_escobas', label: 'Guarda Escobas' },
  ],

  /** SALA DE ESTAR (Casa): chimenea opcional */
  sala_estar: [
    { id: 'puertas', label: 'Puertas' },
    { id: 'marco_puerta', label: 'Marco de Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventana', label: 'Ventana' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'rejas', label: 'Rejas' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'alfombras', label: 'Alfombras' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'lamparas', label: 'Lámparas' },
    { id: 'guarda_escobas', label: 'Guarda Escobas' },
    { id: 'cortineros', label: 'Cortineros' },
  ],

  /** SALA DE TELEVISIÓN (Casa): agrega cable/datos */
  sala_tv: [
    { id: 'puertas', label: 'Puertas' },
    { id: 'marco_puerta', label: 'Marco de Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventana', label: 'Ventana' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'rejas', label: 'Rejas' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'lamparas', label: 'Lámparas' },
    { id: 'guarda_escobas', label: 'Guarda Escobas' },
    { id: 'cortineros', label: 'Cortineros' },
    { id: 'cable_datos', label: 'Salida cable / Datos' },
  ],

  /** BAÑO (Principal, Auxiliar, Alcoba, Emergencia): completo */
  bano: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'marco_puerta', label: 'Marco Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'lavamanos', label: 'Lavamanos' },
    { id: 'sanitario', label: 'Sanitario' },
    { id: 'griferia_sanitario', label: 'Grifería Sanitario' },
    { id: 'toallero', label: 'Toallero' },
    { id: 'jabonera', label: 'Jabonera' },
    { id: 'cepillero', label: 'Cepillero' },
    { id: 'ducha', label: 'Ducha' },
    { id: 'griferia_ducha', label: 'Grifería Ducha' },
    { id: 'espejos', label: 'Espejos' },
    { id: 'gabinetes', label: 'Gabinetes' },
    { id: 'divisiones', label: 'Divisiones' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'plafones', label: 'Plafones' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'tina', label: 'Tina' },
    { id: 'rejillas', label: 'Rejillas' },
  ],

  /** BAÑO AUXILIAR / Baño pequeño: mismo set (PDF lo lista igual) */
  bano_auxiliar: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'marco_puerta', label: 'Marco Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'lavamanos', label: 'Lavamanos' },
    { id: 'sanitario', label: 'Sanitario' },
    { id: 'griferia_sanitario', label: 'Grifería Sanitario' },
    { id: 'toallero', label: 'Toallero' },
    { id: 'jabonera', label: 'Jabonera' },
    { id: 'cepillero', label: 'Cepillero' },
    { id: 'ducha', label: 'Ducha' },
    { id: 'griferia_ducha', label: 'Grifería Ducha' },
    { id: 'espejos', label: 'Espejos' },
    { id: 'gabinetes', label: 'Gabinetes' },
    { id: 'divisiones', label: 'Divisiones' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'plafones', label: 'Plafones' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'tina', label: 'Tina' },
    { id: 'rejillas', label: 'Rejillas' },
  ],

  /** BAÑO SOCIAL: reducido (sin tina, sin gabinetes grandes) */
  bano_social: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'marco_puerta', label: 'Marco Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'lavamanos', label: 'Lavamanos' },
    { id: 'sanitario', label: 'Sanitario' },
    { id: 'griferia_sanitario', label: 'Grifería Sanitario' },
    { id: 'toallero', label: 'Toallero' },
    { id: 'jabonera', label: 'Jabonera' },
    { id: 'espejos', label: 'Espejos' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'plafones', label: 'Plafones' },
    { id: 'apliques', label: 'Apliques' },
  ],

  /** COCINA: items planos + sub-items de muebles aplanados */
  cocina: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'marco_puerta', label: 'Marco Puerta' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'plafones', label: 'Plafones' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'lavaplatos', label: 'Lavaplatos' },
    { id: 'griferia', label: 'Grifería' },
    { id: 'estufa_asador', label: 'Estufa y Asador' },
    { id: 'horno', label: 'Horno' },
    { id: 'campana_extractora', label: 'Campana Extractora' },
    { id: 'mueble_inf_entrepanos', label: 'Mueble Inferior — Entrepaños' },
    { id: 'mueble_inf_cajones', label: 'Mueble Inferior — Cajones' },
    { id: 'mueble_inf_puertas', label: 'Mueble Inferior — Puertas' },
    { id: 'mueble_sup_entrepanos', label: 'Mueble Superior — Entrepaños' },
    { id: 'mueble_sup_cajones', label: 'Mueble Superior — Cajones' },
    { id: 'mueble_sup_puertas', label: 'Mueble Superior — Puertas' },
    { id: 'calentador', label: 'Calentador' },
    { id: 'plafones_lamparas', label: 'Plafones / Lámparas' },
  ],

  /** ALCOBA / ALCOBA PRINCIPAL: incluye Closets con sub-items aplanados */
  alcoba: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'marco_puerta', label: 'Marco Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'rejas', label: 'Rejas' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'alfombras', label: 'Alfombras' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'cortineros', label: 'Cortineros' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'plafones', label: 'Plafones' },
    { id: 'apliques', label: 'Apliques' },
    { id: 'lamparas', label: 'Lámparas' },
    { id: 'guarda_escobas', label: 'Guarda Escobas' },
    { id: 'closet_puertas', label: 'Closets — Puertas' },
    { id: 'closet_entrepanos', label: 'Closets — Entrepaños' },
    { id: 'closet_cajones', label: 'Closets — Cajones' },
  ],

  /** PATIO: incluye zona lavandería completa del PDF */
  patio: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'marco_puerta', label: 'Marco Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventana', label: 'Ventana' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'instalacion_lavadora', label: 'Instalación Lavadora' },
    { id: 'lavadero', label: 'Lavadero' },
    { id: 'llave_lavadero', label: 'Llave Lavadero' },
    { id: 'rejilla_piso', label: 'Rejilla Piso' },
    { id: 'plafones_lamparas', label: 'Plafones / Lámparas' },
    { id: 'calentador', label: 'Calentador' },
    { id: 'tenderos_ropa', label: 'Tenderos de Ropa' },
  ],

  /** GARAJE Y/O DEPÓSITO: items del PDF */
  deposito: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'marco_puerta', label: 'Marco Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'plafones_lamparas', label: 'Plafones / Lámparas' },
  ],

  /** PARQUEADERO (independiente) */
  parqueadero: [
    { id: 'piso', label: 'Piso / Pintura demarcación' },
    { id: 'senalizacion', label: 'Señalización (número)' },
    { id: 'techo', label: 'Techo / Cubierta' },
  ],

  /** BALCÓN */
  balcon: [
    { id: 'piso', label: 'Piso' },
    { id: 'baranda', label: 'Baranda / Pasamanos' },
    { id: 'iluminacion', label: 'Iluminación' },
    { id: 'rejas', label: 'Rejas' },
  ],

  /** TERRAZA */
  terraza: [
    { id: 'piso', label: 'Piso / Impermeabilización' },
    { id: 'baranda', label: 'Baranda' },
    { id: 'iluminacion', label: 'Iluminación' },
    { id: 'rejas', label: 'Rejas' },
  ],

  /** PASILLO */
  pasillo: [
    { id: 'piso', label: 'Piso' },
    { id: 'pintura', label: 'Pintura' },
    { id: 'iluminacion', label: 'Iluminación' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'plafones', label: 'Plafones' },
    { id: 'tomas', label: 'Tomas' },
  ],

  /** LAVANDERÍA / ZONA DE OFICIOS: versión reducida sin tendedero */
  lavanderia: [
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'instalacion_lavadora', label: 'Instalación Lavadora' },
    { id: 'lavadero', label: 'Lavadero' },
    { id: 'llave_lavadero', label: 'Llave Lavadero' },
    { id: 'rejilla_piso', label: 'Rejilla Piso' },
    { id: 'plafones_lamparas', label: 'Plafones / Lámparas' },
    { id: 'calentador', label: 'Calentador' },
    { id: 'tenderos_ropa', label: 'Tenderos de Ropa' },
  ],

  /** ZONA DE OFICIOS (Apartaestudio): subset más pequeño */
  zona_oficios: [
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'instalacion_lavadora', label: 'Instalación Lavadora' },
    { id: 'lavadero', label: 'Lavadero' },
    { id: 'llave_lavadero', label: 'Llave Lavadero' },
    { id: 'plafones_lamparas', label: 'Plafones / Lámparas' },
  ],

  /** ANTEJARDÍN (Casa) */
  antejardin: [
    { id: 'piso', label: 'Piso / Césped' },
    { id: 'muro', label: 'Muro perimetral' },
    { id: 'vegetacion', label: 'Vegetación / Jardineras' },
    { id: 'riego', label: 'Sistema de riego' },
    { id: 'rejas', label: 'Rejas' },
  ],

  /** ESCALERAS (Casa de 2+ pisos) */
  escaleras: [
    { id: 'piso', label: 'Piso / Huella' },
    { id: 'baranda', label: 'Baranda / Pasamanos' },
    { id: 'iluminacion', label: 'Iluminación' },
    { id: 'paredes', label: 'Paredes' },
  ],

  /** ESTUDIO */
  estudio: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'marco_puerta', label: 'Marco Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'vidrios', label: 'Vidrios' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'techos', label: 'Techos' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'interruptores', label: 'Interruptores' },
    { id: 'lamparas', label: 'Lámparas' },
  ],

  /** CUARTO ÚTIL */
  cuarto_util: [
    { id: 'puerta', label: 'Puerta' },
    { id: 'cerradura', label: 'Cerradura' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'paredes', label: 'Paredes' },
    { id: 'iluminacion', label: 'Iluminación' },
    { id: 'ventilacion', label: 'Ventilación' },
  ],

  // ── Comercial / Industrial (no están en el PDF Afiansa, base útil) ─

  recepcion: [
    { id: 'pintura', label: 'Pintura' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'mostrador', label: 'Mostrador' },
    { id: 'sillas', label: 'Sillas de espera' },
    { id: 'ventanas', label: 'Ventanas' },
    { id: 'tomas', label: 'Tomas' },
    { id: 'iluminacion', label: 'Iluminación' },
  ],
  cubiculo: [
    { id: 'escritorio', label: 'Escritorio' },
    { id: 'silla', label: 'Silla' },
    { id: 'tomas', label: 'Tomas eléctricas / Datos' },
    { id: 'iluminacion', label: 'Iluminación' },
    { id: 'pintura', label: 'Pintura' },
    { id: 'pisos', label: 'Pisos' },
  ],
  oficina: [
    { id: 'escritorio', label: 'Escritorio' },
    { id: 'silla', label: 'Silla' },
    { id: 'archivador', label: 'Archivador' },
    { id: 'tomas', label: 'Tomas eléctricas' },
    { id: 'internet', label: 'Internet / Datos' },
    { id: 'iluminacion', label: 'Iluminación' },
    { id: 'pisos', label: 'Pisos' },
  ],
  cocineta: [
    { id: 'pintura', label: 'Pintura / Enchapes' },
    { id: 'meson', label: 'Mesón' },
    { id: 'griferia', label: 'Grifería' },
    { id: 'muebles', label: 'Muebles' },
    { id: 'electrodomesticos', label: 'Electrodomésticos' },
    { id: 'tomas', label: 'Tomas' },
  ],
  archivo: [
    { id: 'pintura', label: 'Pintura' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'estanteria', label: 'Estantería' },
    { id: 'ventilacion', label: 'Ventilación' },
  ],
  area_principal: [
    { id: 'piso', label: 'Piso (epóxico / concreto)' },
    { id: 'techo', label: 'Techo / Altura' },
    { id: 'iluminacion', label: 'Iluminación industrial' },
    { id: 'muros', label: 'Muros perimetrales' },
    { id: 'puertas', label: 'Puertas / Cortinas metálicas' },
  ],
  area_carga: [
    { id: 'piso', label: 'Piso / Rampa' },
    { id: 'senalizacion', label: 'Señalización' },
    { id: 'capacidad', label: 'Capacidad de carga (T)' },
    { id: 'puertas', label: 'Puertas / Cortinas' },
    { id: 'iluminacion', label: 'Iluminación' },
  ],
  vitrina: [
    { id: 'vidrio', label: 'Vidrio' },
    { id: 'marco', label: 'Marco / Aluminio' },
    { id: 'iluminacion', label: 'Iluminación' },
  ],
  altillo: [
    { id: 'piso', label: 'Piso' },
    { id: 'escalera', label: 'Escalera de acceso' },
    { id: 'baranda', label: 'Baranda de seguridad' },
    { id: 'iluminacion', label: 'Iluminación' },
  ],
  area_ventas: [
    { id: 'pintura', label: 'Pintura' },
    { id: 'pisos', label: 'Pisos' },
    { id: 'mostrador', label: 'Mostrador / Caja' },
    { id: 'estanteria', label: 'Estantería' },
    { id: 'iluminacion', label: 'Iluminación' },
  ],
  bodega_interna: [
    { id: 'piso', label: 'Piso' },
    { id: 'estanteria', label: 'Estantería' },
    { id: 'puerta', label: 'Puerta' },
    { id: 'ventilacion', label: 'Ventilación' },
  ],

  // ── Genérico para "Otros" (custom areas con nombre libre) ───
  otros: [
    { id: 'pintura', label: 'Pintura' },
    { id: 'piso', label: 'Piso' },
    { id: 'puerta', label: 'Puerta / Cerradura' },
    { id: 'iluminacion', label: 'Iluminación' },
    { id: 'tomas', label: 'Tomas eléctricas' },
    { id: 'ventilacion', label: 'Ventilación' },
  ],
};

export interface AreaDef {
  /** id lógico de la categoría, usado para resolver el itemCatalog */
  category: keyof typeof ITEM_CATALOG;
  /** función que produce el label final (puede usar el index 1-based) */
  label: (i?: number) => string;
  /**
   * Si el área es counter, el key del counter que la controla.
   * Si no se especifica, el área es fija (single).
   */
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
  areas: AreaDef[];                       // áreas fijas (single, siempre 1)
  multiAreas: AreaDef[];                  // áreas que se multiplican (counterKey)
  multiCounters: MultiCounterDef[];
  recommendedPhotos: number;
}

export const PROPERTY_TYPES: PropertyTypeConfig[] = [
  // ── 1. Apartaestudio ───────────────────────────────────────
  {
    id: 'apartaestudio',
    label: 'Apartaestudio',
    areas: [],
    multiAreas: [
      { category: 'alcoba', label: (i) => `Alcoba ${i}`, counterKey: 'alcobas' },
      { category: 'balcon', label: (i) => `Balcón ${i}`, counterKey: 'balcones' },
      { category: 'bano_social', label: (i) => `Baño Social ${i}`, counterKey: 'banos_social' },
      { category: 'cocina', label: (i) => `Cocina ${i}`, counterKey: 'cocinas' },
      { category: 'entrada', label: (i) => `Entrada ${i}`, counterKey: 'entradas' },
      { category: 'pasillo', label: (i) => `Pasillo ${i}`, counterKey: 'pasillos' },
      { category: 'sala_comedor', label: (i) => `Sala Comedor ${i}`, counterKey: 'salas_comedor' },
      { category: 'zona_oficios', label: (i) => `Zona de Oficios ${i}`, counterKey: 'zonas_oficios' },
      { category: 'deposito', label: (i) => `Depósito ${i}`, counterKey: 'depositos' },
      { category: 'parqueadero', label: (i) => `Parqueadero ${i}`, counterKey: 'parqueaderos' },
    ],
    multiCounters: [
      { key: 'alcobas', label: 'Alcobas', min: 1, max: 2, default: 1 },
      { key: 'balcones', label: 'Balcones', min: 0, max: 2, default: 0 },
      { key: 'banos_social', label: 'Baños Sociales', min: 0, max: 2, default: 1 },
      { key: 'cocinas', label: 'Cocinas', min: 1, max: 2, default: 1 },
      { key: 'entradas', label: 'Entradas', min: 1, max: 2, default: 1 },
      { key: 'pasillos', label: 'Pasillos', min: 0, max: 3, default: 1 },
      { key: 'salas_comedor', label: 'Salas Comedor', min: 1, max: 2, default: 1 },
      { key: 'zonas_oficios', label: 'Zonas de Oficios', min: 0, max: 1, default: 1 },
      { key: 'depositos', label: 'Depósitos', min: 0, max: 2, default: 0 },
      { key: 'parqueaderos', label: 'Parqueaderos', min: 0, max: 2, default: 1 },
    ],
    recommendedPhotos: 3,
  },

  // ── 2. Apartamento ─────────────────────────────────────────
  {
    id: 'apartamento',
    label: 'Apartamento',
    areas: [],
    multiAreas: [
      { category: 'alcoba', label: (i) => `Alcoba ${i}`, counterKey: 'alcobas' },
      { category: 'balcon', label: (i) => `Balcón ${i}`, counterKey: 'balcones' },
      { category: 'bano', label: (i) => `Baño ${i}`, counterKey: 'banos' },
      { category: 'bano_social', label: (i) => `Baño Social ${i}`, counterKey: 'banos_social' },
      { category: 'cocina', label: (i) => `Cocina ${i}`, counterKey: 'cocinas' },
      { category: 'comedor', label: (i) => `Comedor ${i}`, counterKey: 'comedores' },
      { category: 'entrada', label: (i) => `Entrada ${i}`, counterKey: 'entradas' },
      { category: 'lavanderia', label: (i) => `Zona de Lavandería ${i}`, counterKey: 'lavanderias' },
      { category: 'pasillo', label: (i) => `Pasillo ${i}`, counterKey: 'pasillos' },
      { category: 'sala', label: (i) => `Sala ${i}`, counterKey: 'salas' },
      { category: 'terraza', label: (i) => `Terraza ${i}`, counterKey: 'terrazas' },
      { category: 'deposito', label: (i) => `Depósito ${i}`, counterKey: 'depositos' },
      { category: 'parqueadero', label: (i) => `Parqueadero ${i}`, counterKey: 'parqueaderos' },
    ],
    multiCounters: [
      { key: 'alcobas', label: 'Alcobas', min: 1, max: 6, default: 2 },
      { key: 'balcones', label: 'Balcones', min: 0, max: 3, default: 1 },
      { key: 'banos', label: 'Baños', min: 1, max: 5, default: 2 },
      { key: 'banos_social', label: 'Baños Sociales', min: 0, max: 2, default: 1 },
      { key: 'cocinas', label: 'Cocinas', min: 1, max: 2, default: 1 },
      { key: 'comedores', label: 'Comedores', min: 0, max: 2, default: 1 },
      { key: 'entradas', label: 'Entradas', min: 1, max: 2, default: 1 },
      { key: 'lavanderias', label: 'Zonas de Lavandería', min: 0, max: 1, default: 1 },
      { key: 'pasillos', label: 'Pasillos', min: 0, max: 3, default: 1 },
      { key: 'salas', label: 'Salas', min: 1, max: 2, default: 1 },
      { key: 'terrazas', label: 'Terrazas', min: 0, max: 2, default: 0 },
      { key: 'depositos', label: 'Depósitos', min: 0, max: 2, default: 0 },
      { key: 'parqueaderos', label: 'Parqueaderos', min: 0, max: 3, default: 1 },
    ],
    recommendedPhotos: 3,
  },

  // ── 3. Casa ────────────────────────────────────────────────
  {
    id: 'casa',
    label: 'Casa',
    areas: [],
    multiAreas: [
      { category: 'alcoba', label: (i) => `Alcoba ${i}`, counterKey: 'alcobas' },
      { category: 'balcon', label: (i) => `Balcón ${i}`, counterKey: 'balcones' },
      { category: 'bano', label: (i) => `Baño ${i}`, counterKey: 'banos' },
      { category: 'bano_social', label: (i) => `Baño Social ${i}`, counterKey: 'banos_social' },
      { category: 'bano_auxiliar', label: (i) => `Baño Auxiliar ${i}`, counterKey: 'banos_auxiliares' },
      { category: 'cocina', label: (i) => `Cocina ${i}`, counterKey: 'cocinas' },
      { category: 'comedor', label: (i) => `Comedor ${i}`, counterKey: 'comedores' },
      { category: 'entrada', label: (i) => `Entrada ${i}`, counterKey: 'entradas' },
      { category: 'escaleras', label: (i) => `Escaleras ${i}`, counterKey: 'escaleras' },
      { category: 'lavanderia', label: (i) => `Zona de Lavandería ${i}`, counterKey: 'lavanderias' },
      { category: 'pasillo', label: (i) => `Pasillo ${i}`, counterKey: 'pasillos' },
      { category: 'sala', label: (i) => `Sala ${i}`, counterKey: 'salas' },
      { category: 'sala_estar', label: (i) => `Sala de Estar ${i}`, counterKey: 'salas_estar' },
      { category: 'sala_tv', label: (i) => `Sala de Televisión ${i}`, counterKey: 'salas_tv' },
      { category: 'terraza', label: (i) => `Terraza ${i}`, counterKey: 'terrazas' },
      { category: 'antejardin', label: (i) => `Antejardín ${i}`, counterKey: 'antejardines' },
      { category: 'patio', label: (i) => `Patio ${i}`, counterKey: 'patios' },
      { category: 'deposito', label: (i) => `Depósito ${i}`, counterKey: 'depositos' },
      { category: 'parqueadero', label: (i) => `Parqueadero ${i}`, counterKey: 'parqueaderos' },
    ],
    multiCounters: [
      { key: 'alcobas', label: 'Alcobas', min: 1, max: 6, default: 3 },
      { key: 'balcones', label: 'Balcones', min: 0, max: 4, default: 1 },
      { key: 'banos', label: 'Baños', min: 1, max: 5, default: 2 },
      { key: 'banos_social', label: 'Baños Sociales', min: 0, max: 2, default: 1 },
      { key: 'banos_auxiliares', label: 'Baños Auxiliares', min: 0, max: 3, default: 0 },
      { key: 'cocinas', label: 'Cocinas', min: 1, max: 3, default: 1 },
      { key: 'comedores', label: 'Comedores', min: 0, max: 2, default: 1 },
      { key: 'entradas', label: 'Entradas', min: 1, max: 3, default: 1 },
      { key: 'escaleras', label: 'Escaleras', min: 0, max: 3, default: 1 },
      { key: 'lavanderias', label: 'Zonas de Lavandería', min: 0, max: 1, default: 1 },
      { key: 'pasillos', label: 'Pasillos', min: 0, max: 4, default: 1 },
      { key: 'salas', label: 'Salas', min: 1, max: 3, default: 1 },
      { key: 'salas_estar', label: 'Salas de Estar', min: 0, max: 2, default: 0 },
      { key: 'salas_tv', label: 'Salas de Televisión', min: 0, max: 2, default: 0 },
      { key: 'terrazas', label: 'Terrazas', min: 0, max: 3, default: 0 },
      { key: 'antejardines', label: 'Antejardines', min: 0, max: 2, default: 1 },
      { key: 'patios', label: 'Patios', min: 0, max: 3, default: 1 },
      { key: 'depositos', label: 'Depósitos', min: 0, max: 3, default: 1 },
      { key: 'parqueaderos', label: 'Parqueaderos', min: 0, max: 4, default: 1 },
    ],
    recommendedPhotos: 3,
  },

  // ── 4. Oficina ─────────────────────────────────────────────
  {
    id: 'oficina',
    label: 'Oficina',
    areas: [],
    multiAreas: [
      { category: 'bano', label: (i) => `Baño ${i}`, counterKey: 'banos' },
      { category: 'cocineta', label: (i) => `Cocineta ${i}`, counterKey: 'cocinetas' },
      { category: 'cubiculos', label: (i) => `Cubículo ${i}`, counterKey: 'cubiculos' },
      { category: 'deposito', label: (i) => `Depósito ${i}`, counterKey: 'depositos' },
      { category: 'entrada', label: (i) => `Entrada ${i}`, counterKey: 'entradas' },
      { category: 'parqueadero', label: (i) => `Parqueadero ${i}`, counterKey: 'parqueaderos' },
      { category: 'recepcion', label: (i) => `Recepción ${i}`, counterKey: 'recepciones' },
    ],
    multiCounters: [
      { key: 'banos', label: 'Baños', min: 1, max: 4, default: 1 },
      { key: 'cocinetas', label: 'Cocinetas', min: 0, max: 2, default: 1 },
      { key: 'cubiculos', label: 'Cubículos', min: 0, max: 30, default: 2 },
      { key: 'depositos', label: 'Depósitos', min: 0, max: 3, default: 1 },
      { key: 'entradas', label: 'Entradas', min: 1, max: 2, default: 1 },
      { key: 'parqueaderos', label: 'Parqueaderos', min: 0, max: 5, default: 1 },
      { key: 'recepciones', label: 'Recepciones', min: 1, max: 3, default: 1 },
    ],
    recommendedPhotos: 2,
  },

  // ── 5. Local ───────────────────────────────────────────────
  {
    id: 'local',
    label: 'Local',
    areas: [],
    multiAreas: [
      { category: 'bano', label: (i) => `Baño ${i}`, counterKey: 'banos' },
      { category: 'cocineta', label: (i) => `Cocineta ${i}`, counterKey: 'cocinetas' },
      { category: 'cubiculos', label: (i) => `Cubículo ${i}`, counterKey: 'cubiculos' },
      { category: 'deposito', label: (i) => `Depósito ${i}`, counterKey: 'depositos' },
      { category: 'entrada', label: (i) => `Entrada ${i}`, counterKey: 'entradas' },
      { category: 'oficina', label: (i) => `Oficina ${i}`, counterKey: 'oficinas' },
      { category: 'parqueadero', label: (i) => `Parqueadero ${i}`, counterKey: 'parqueaderos' },
      { category: 'recepcion', label: (i) => `Recepción ${i}`, counterKey: 'recepciones' },
    ],
    multiCounters: [
      { key: 'banos', label: 'Baños', min: 1, max: 4, default: 1 },
      { key: 'cocinetas', label: 'Cocinetas', min: 0, max: 2, default: 1 },
      { key: 'cubiculos', label: 'Cubículos', min: 0, max: 30, default: 1 },
      { key: 'depositos', label: 'Depósitos', min: 0, max: 3, default: 1 },
      { key: 'entradas', label: 'Entradas', min: 1, max: 3, default: 1 },
      { key: 'oficinas', label: 'Oficinas', min: 0, max: 5, default: 1 },
      { key: 'parqueaderos', label: 'Parqueaderos', min: 0, max: 5, default: 0 },
      { key: 'recepciones', label: 'Recepciones', min: 1, max: 3, default: 1 },
    ],
    recommendedPhotos: 3,
  },

  // ── 6. Bodega ──────────────────────────────────────────────
  {
    id: 'bodega',
    label: 'Bodega',
    areas: [],
    multiAreas: [
      { category: 'bano', label: (i) => `Baño ${i}`, counterKey: 'banos' },
      { category: 'cocineta', label: (i) => `Cocineta ${i}`, counterKey: 'cocinetas' },
      { category: 'deposito', label: (i) => `Depósito ${i}`, counterKey: 'depositos' },
      { category: 'entrada', label: (i) => `Entrada ${i}`, counterKey: 'entradas' },
      { category: 'oficina', label: (i) => `Oficina ${i}`, counterKey: 'oficinas' },
      { category: 'area_carga', label: (i) => `Área de Carga ${i}`, counterKey: 'areas_carga' },
      { category: 'parqueadero', label: (i) => `Parqueadero ${i}`, counterKey: 'parqueaderos' },
      { category: 'recepcion', label: (i) => `Recepción ${i}`, counterKey: 'recepciones' },
    ],
    multiCounters: [
      { key: 'banos', label: 'Baños', min: 1, max: 4, default: 1 },
      { key: 'cocinetas', label: 'Cocinetas', min: 0, max: 2, default: 1 },
      { key: 'depositos', label: 'Depósitos', min: 0, max: 5, default: 1 },
      { key: 'entradas', label: 'Entradas', min: 1, max: 3, default: 1 },
      { key: 'oficinas', label: 'Oficinas', min: 0, max: 3, default: 1 },
      { key: 'areas_carga', label: 'Áreas de Carga', min: 1, max: 3, default: 1 },
      { key: 'parqueaderos', label: 'Parqueaderos', min: 0, max: 10, default: 2 },
      { key: 'recepciones', label: 'Recepciones', min: 1, max: 2, default: 1 },
    ],
    recommendedPhotos: 4,
  },
];

export const getPropertyTypeConfig = (id: PropertyType): PropertyTypeConfig =>
  PROPERTY_TYPES.find((p) => p.id === id) ?? PROPERTY_TYPES[0];

/** Custom area definida por el usuario (botón "Otros"). */
export interface CustomArea {
  id: string;
  label: string;
}

/**
 * Catálogo CERRADO de materiales por item.id. Si un item tiene una lista con
 * al menos 1 material, el campo Material del inventario se renderiza como
 * `<select>` con esas opciones. Si la lista está vacía o el item no está
 * en el catálogo, el campo de Material se oculta (no es obligatorio para
 * todos los items — ej: "Lámparas" no tiene material definido).
 *
 * Los items que comparten material (ej: "Puerta" y "Puerta Principal")
 * se referencian a la misma lista. Para mantener el catálogo manejable,
 * las keys están normalizadas a los IDs de los items más comunes.
 */
export const MATERIAL_CATALOG: Record<string, string[]> = {
  // ── Pisos (comparten) ──
  'pisos': ['Cerámica', 'Porcelanato', 'Madera laminada', 'Madera maciza', 'Alfombra', 'Vinilo', 'Concreto pulido', 'Mármol', 'Granito', 'Baldosa'],

  // ── Paredes ──
  'paredes': ['Pintura vinílica', 'Pintura acrílica', 'Pintura esmalte', 'Papel tapiz', 'Drywall', 'Cerámica', 'Madera', 'Yeso', 'Estuco', 'Concreto visto'],

  // ── Techos ──
  'techos': ['Pintura', 'Drywall', 'Madera', 'Concreto visto', 'Yeso', 'PVC', 'Teja de barro', 'Teja de zinc', 'Cielo raso'],

  // ── Ventanas ──
  'ventanas': ['Aluminio + vidrio', 'PVC + vidrio', 'Madera + vidrio', 'Hierro + vidrio', 'Vidrio crudo'],

  // ── Puertas (comparten) ──
  'puerta': ['Madera sólida', 'MDF', 'Metálica', 'Aluminio + vidrio', 'PVC + vidrio', 'Vidrio templado'],
  'puerta_ppal': ['Madera sólida', 'MDF', 'Metálica', 'Aluminio + vidrio', 'PVC + vidrio', 'Blindada'],
  'puertas': ['Madera sólida', 'MDF', 'Metálica', 'Aluminio + vidrio', 'PVC + vidrio'],

  // ── Marcos de puerta ──
  'marco_puerta': ['Madera', 'Metálico', 'Aluminio', 'PVC', 'MDF'],

  // ── Cerraduras (comparten) ──
  'cerradura': ['Cilíndrica', 'Digital', 'Manija', 'Embutida', 'De pomo', 'De seguridad', 'Multipunto'],
  'cerradura_puerta_ppal': ['Cilíndrica', 'Digital', 'De seguridad', 'Multipunto'],
  'cerradura_otras_puertas': ['Cilíndrica', 'De pomo', 'Embutida', 'Multipunto'],

  // ── Vidrios ──
  'vidrios': ['Crudo', 'Templado', 'Laminado', 'Bronce', 'Esmerilado'],
  'vidrios_especiales': ['Templado', 'Laminado', 'Esmerilado', 'SmartGlass'],
  'otros_vidrios': ['Crudo', 'Templado', 'Laminado', 'Esmerilado'],

  // ── Rejas ──
  'rejas': ['Hierro forjado', 'Hierro cuadrado', 'Aluminio', 'Acero inoxidable'],

  // ── Alfombras ──
  'alfombras': ['Lana', 'Sintética', 'Algodón', 'Fibra natural', 'Yute', 'Sisal'],

  // ── Sanitario / Baño ──
  'sanitario': ['Porcelana', 'Loza', 'Acero inoxidable', 'Inodoro inteligente'],
  'lavamanos': ['Porcelana', 'Loza', 'Vidrio templado', 'Acero inoxidable', 'Mármol', 'Piedra'],
  'griferia': ['Cromada', 'Acero inoxidable', 'Bronce', 'Negra mate', 'Oro', 'Sensor'],
  'griferia_sanitario': ['Cromada', 'Acero inoxidable', 'Bronce', 'Negra mate'],
  'griferia_ducha': ['Cromada', 'Acero inoxidable', 'Bronce', 'Negra mate', 'Mezcladora'],
  'ducha': ['Regadera fija', 'Regadera manual', 'Doble regadera', 'Teléfono', 'Sistema de lluvia'],
  'tina': ['Acero esmaltado', 'Acrílico', 'Hierro fundido', 'Mármol', 'Hidromasaje'],
  'espejos': ['Vidrio con marco de madera', 'Vidrio con marco metálico', 'Vidrio sin marco', 'Espejo inteligente'],
  'gabinetes': ['Madera', 'MDF', 'PVC', 'Metalicos', 'Acrílicos'],
  'rejillas': ['Aluminio', 'Hierro', 'PVC', 'Cromadas', 'Plástico'],

  // ── Cocina ──
  'lavaplatos': ['Acero inoxidable', 'Granito', 'Cuarzo', 'Mármol', 'Polietileno'],
  'estufa_asador': ['Gas natural', 'Gas propano', 'Eléctrica', 'Inducción', 'Mixta'],
  'horno': ['Gas', 'Eléctrico', 'Convector', 'A vapor'],
  'campana_extractora': ['Acero inoxidable', 'Acero negro', 'Empotrable', 'Isla'],
  'mueble_inf_entrepanos': ['Madera', 'MDF', 'Aglomerado', 'Metalicos', 'PVC'],
  'mueble_inf_cajones': ['Madera', 'MDF', 'Metalicos', 'PVC', 'Con rieles telescópicos'],
  'mueble_inf_puertas': ['Madera', 'MDF', 'Metalicas', 'PVC', 'Con vidrio'],
  'mueble_sup_entrepanos': ['Madera', 'MDF', 'Aglomerado', 'Metalicos', 'PVC', 'Vidrio'],
  'mueble_sup_cajones': ['Madera', 'MDF', 'Metalicos', 'PVC'],
  'mueble_sup_puertas': ['Madera', 'MDF', 'Metalicas', 'PVC', 'Con vidrio'],
  'calentador': ['Gas natural', 'Gas propano', 'Eléctrico', 'Solar', 'Térmico'],

  // ── Closets ──
  'closet_puertas': ['Madera', 'MDF', 'Corredizas', 'Abatibles', 'PVC'],
  'closet_entrepanos': ['Madera', 'MDF', 'Metalicos', 'Vidrio'],
  'closet_cajones': ['Madera', 'MDF', 'Metalicos', 'Con rieles telescópicos'],

  // ── Muebles / decoración ──
  'cortineros': ['Madera', 'Metalicos', 'PVC', 'Aluminio', 'Sin cortinero'],
  'plafones': ['Drywall', 'Madera', 'PVC', 'Yeso', 'Fibra mineral'],
  'plafones_lamparas': ['Drywall', 'Madwall', 'Madera', 'PVC'],
  'lamparas': ['LED', 'Incandescente', 'Fluorescente', 'Halógena', 'Solar', 'Smart'],
  'apliques': ['Metalicos', 'Cristal', 'Cerámica', 'LED', 'Smart'],
  'rosetas': ['Metalicas', 'Plásticas', 'Madera', 'Decorativas'],
  'interruptores': ['Simple', 'Doble', 'Triple', 'Conmutado', 'Smart', 'Dimmer'],
  'tomas': ['110V simple', '110V doble', '220V', 'GFCI', 'USB', 'Smart'],
  'cable_datos': ['Cat 5e', 'Cat 6', 'Cat 6A', 'Fibra óptica', 'Coaxial'],
  'divisiones': ['Drywall', 'Vidrio templado', 'Madera', 'Metalicas', 'PVC'],
  'chimenea': ['A leña', 'A gas', 'Eléctrica', 'Decorativa (sin uso)', 'No aplica'],
  'guarda_escobas': ['Madera', 'Metalico', 'PVC', 'Empotrado en pared'],

  // ── Otros / genérico ──
  'pintura': ['Vinílica', 'Acrílica', 'Esmalte', 'Látex', 'Antihumedad'],
  'puertas_cortinas_metalicas': ['Metálicas', 'Acero', 'Aluminio', 'Enrollables'],
  'puerta_cortina': ['Metálica enrollable', 'Acero', 'Aluminio', 'PVC'],
  'senalizacion': ['Pintura', 'Letrero luminoso', 'Plástico', 'Reflectiva'],
  'muro': ['Concreto', 'Ladrillo', 'Bloque', 'Mampostería', 'Yeso', 'Drywall'],
  'vegetacion': ['Césped', 'Plantas ornamentales', 'Árboles', 'Arbustos', 'Sin vegetación'],
  'riego': ['Aspersión', 'Goteo', 'Manguera', 'Automático', 'No tiene'],
  'mueble': ['Madera', 'MDF', 'Metalico', 'Tela', 'Cuero', 'Mixto'],
  'mostrador': ['Madera', 'Mármol', 'Granito', 'Cuarzo', 'Acero inoxidable', 'Melamina'],
  'sillas': ['Madera', 'Metalicas', 'Plástico', 'Tapizadas', 'Cuero'],
  'escritorio': ['Madera', 'MDF', 'Metalico', 'Vidrio templado'],
  'silla': ['Madera', 'Metalica', 'Tapizada', 'Cuero', 'Malla ergonómica'],
  'archivador': ['Metalico', 'Madera', 'MDF'],
  'internet': ['Fibra óptica', 'Cable coaxial', 'DSL', 'Inalámbrico', 'No tiene'],
  'meson': ['Granito', 'Cuarzo', 'Mármol', 'Acero inoxidable', 'Concreto pulido', 'Melamina'],
  'electrodomesticos': ['Nevera', 'Microondas', 'Horno', 'Lavavajillas', 'Licuadora', 'Cafetera'],
  'estanteria': ['Metalica', 'Madera', 'MDF', 'PVC', 'Mixta'],
  'piso_epoxido': ['Epóxico', 'Concreto pulido', 'Hormigón'],
  'puertas_cortinas': ['Metálicas', 'Enrollables', 'Seccionales', 'Rápidas'],
  'cortinas': ['Metálicas', 'PVC', 'Lona', 'Cristal'],
  'capacidad_carga': ['5 T', '10 T', '20 T', '30 T', '50 T'],
  'senalizacion_carga': ['Pintura de piso', 'Letrero', 'Cinta', 'Marcación visible'],
  'vitrina': ['Vidrio templado', 'Cristal', 'Acrílico'],
  'marco': ['Aluminio', 'Madera', 'Metalico', 'PVC'],
  'escalera_acceso': ['Metalica', 'Madera', 'Concreto', 'Caracol'],
  'baranda_seguridad': ['Metalica', 'Acero inoxidable', 'Aluminio', 'PVC'],
  'archivador_documentos': ['Metalico', 'Madera', 'Ignífugo'],
};

/**
 * Resuelve las áreas finales de un inventario a partir del tipo, los counters
 * y las custom areas (botón "Otros").
 */
export function resolveAreas(
  config: PropertyTypeConfig,
  counters: Record<string, number>,
  customAreas: CustomArea[] = []
): { id: string; category: string; label: string }[] {
  const areas: { id: string; category: string; label: string }[] = [];

  // Áreas fijas
  config.areas.forEach((area, i) => {
    areas.push({ id: `single-${i}`, category: area.category, label: area.label() });
  });

  // Áreas múltiples (counterKey resuelve el counter asociado)
  config.multiAreas.forEach((multi) => {
    if (!multi.counterKey) return;
    const counter = config.multiCounters.find((c) => c.key === multi.counterKey);
    if (!counter) return;
    const count = counters[counter.key] ?? counter.default;
    for (let i = 1; i <= count; i++) {
      areas.push({
        id: `multi-${multi.category}-${i}`,
        category: multi.category,
        label: multi.label(i),
      });
    }
  });

  // Custom areas ("Otros" con nombre personalizado) — siempre al final
  customAreas.forEach((c) => {
    areas.push({ id: c.id, category: 'otros', label: c.label });
  });

  return areas;
}
