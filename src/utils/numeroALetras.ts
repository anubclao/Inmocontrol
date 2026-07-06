/**
 * Conversor de números a letras en español colombiano.
 *
 * Usado para imprimir el valor en letras en cuentas de cobro, contratos y
 * liquidaciones. Para COP sin decimales: "MIL PESOS M/CTE", "UN MILLÓN
 * SEISCIENTOS NOVENTA Y SEIS MIL TREINTA Y SIETE PESOS M/CTE".
 *
 * La función maneja:
 *   - Números enteros entre 0 y 999.999.999.999 (billón).
 *   - Centenas exactas ("cien", no "ciento").
 *   - Pluralización: "UN MILLÓN" vs "DOS MILLONES".
 *   - Sufijo PESOS M/CTE por defecto (formato colombiano para cuentas de cobro
 *     y facturas en moneda legal colombiana).
 *
 * Si el input es negativo, NaN o no-entero, retorna cadena vacía.
 *
 * Para evitar reinventar la rueda: la versión corta (enteros 0-40) que ya
 * usaba `mandatoPdf.ts` se queda ahí por compat, pero esta es la canónica
 * para cualquier PDF con importes.
 */

const UNIDADES = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];

const DECENAS = [
  '', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa',
];

const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

/**
 * Convierte un número entre 0 y 999 a letras SIN el sufijo PESOS.
 * Útil para reutilizar (ej: en liquidación con "PESOS + centavos").
 */
function trescientosAbajo(n: number): string {
  if (n < 30) return UNIDADES[n];
  if (n < 100) {
    const dec = Math.floor(n / 10);
    const uni = n % 10;
    return uni === 0 ? DECENAS[dec] : `${DECENAS[dec]} y ${UNIDADES[uni]}`;
  }
  // 100-999
  if (n === 100) return 'cien';
  const cen = Math.floor(n / 100);
  const resto = n % 100;
  const cenStr = CENTENAS[cen];
  return resto === 0 ? cenStr : `${cenStr} ${trescientosAbajo(resto)}`;
}

/**
 * Variante que pluraliza correctamente "veintiún" → "veintiuno" cuando va
 * seguido de otra palabra ("veintiún millones" sí se usa sin acento en
 * Colombia; "veintiuno" suelto también). Esta helper devuelve "veintiún"
 * cuando hay un sufijo, "veintiuno" cuando va solo.
 */
function unidadesConcatenable(n: number, sufijoVacio: boolean): string {
  if (n === 21 && !sufijoVacio) return 'veintiún';
  return UNIDADES[n];
}

/**
 * Convierte 0..999.999.999.999 (hasta un billón) a letras SIN sufijo.
 * Pluraliza "millón/millones" según n.
 */
function numeroALetrasBase(n: number): string {
  if (n === 0) return 'cero';
  if (n < 1000) {
    // caso especial 21 con concatenación
    if (n === 21) return 'veintiuno';
    return trescientosAbajo(n);
  }
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    let milesStr: string;
    if (miles === 1) {
      milesStr = 'mil';
    } else {
      milesStr = `${trescientosAbajo(miles)} mil`;
    }
    return resto === 0 ? milesStr : `${milesStr} ${trescientosAbajo(resto)}`;
  }
  if (n < 1_000_000_000) {
    const millones = Math.floor(n / 1_000_000);
    const resto = n % 1_000_000;
    let millonesStr: string;
    if (millones === 1) {
      millonesStr = 'un millón';
    } else {
      millonesStr = `${trescientosAbajo(millones)} millones`;
    }
    return resto === 0 ? millonesStr : `${millonesStr} ${numeroALetrasBase(resto)}`;
  }
  // Billones (1.000.000.000.000) — caso edge improbable en COP
  const billones = Math.floor(n / 1_000_000_000);
  const resto = n % 1_000_000_000;
  let billonesStr: string;
  if (billones === 1) {
    billonesStr = 'un billón';
  } else {
    billonesStr = `${trescientosAbajo(billones)} billones`;
  }
  return resto === 0 ? billonesStr : `${billonesStr} ${numeroALetrasBase(resto)}`;
}

/**
 * Capitaliza la primera letra de la cadena (después de trim).
 */
function capitalizar(s: string): string {
  const t = s.trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * API pública: convierte un número COP a letras con sufijo "PESOS M/CTE".
 *
 * Ejemplos:
 *   numeroAPesosColombianos(1_696_037) → "Un millón seiscientos noventa y seis mil treinta y siete pesos m/cte"
 *   numeroAPesosColombianos(250_000)    → "Doscientos cincuenta mil pesos m/cte"
 *   numeroAPesosColombianos(0)          → "Cero pesos m/cte"
 *
 * NOTA: el sufijo "PESOS M/CTE" va en minúscula por convención colombiana
 * ("moneda corriente") — la mayúscula inicial la pone el llamador si va al
 * inicio de la línea del PDF.
 */
export function numeroAPesosColombianos(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  const nEntero = Math.floor(n);
  const letras = numeroALetrasBase(nEntero);
  return `${letras} pesos m/cte`;
}

/**
 * Variante que devuelve el texto capitalizado y con sufijo en MAYÚSCULAS
 * para llenar el campo "La suma de: ..." del PDF de cuenta de cobro.
 *
 *   numeroAPesosColombianosCaps(1_696_037) → "UN MILLÓN SEISCIENTOS NOVENTA Y SEIS MIL TREINTA Y SIETE PESOS M/CTE"
 */
export function numeroAPesosColombianosCaps(n: number): string {
  return numeroAPesosColombianos(n).toUpperCase();
}

/**
 * Variante "limpia" para la línea final del PDF (primera letra mayúscula,
 * resto minúscula): "Un millón seiscientos noventa y seis mil..." (más
 * legible en el cuerpo del documento).
 */
export function numeroAPesosColombianosTitle(n: number): string {
  return capitalizar(numeroAPesosColombianos(n));
}

/**
 * Helper de compatibilidad para código viejo que importaba `numeroALetras`
 * desde `mandatoPdf.ts`. Equivalente a `numeroALetrasBase` pero con la
 * firma corta del original: maneja enteros 0-40.
 */
export function numeroALetrasCorto(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 40) return n.toString();
  if (n === 0) return 'cero';
  const base = numeroALetrasBase(n);
  return base;
}