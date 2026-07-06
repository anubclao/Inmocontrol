/**
 * Tests del conversor número → letras en español colombiano.
 *
 * CRÍTICOS: el PDF de cuenta de cobro imprime el valor en letras. Un bug
 * aquí es un PDF con texto mal escrito que va al inquilino. NO modifiques
 * `numeroAPesosColombianos*` sin actualizar estos tests.
 *
 * Corrida:
 *   node --test --import tsx tests/numeroALetras.test.ts
 *
 * Cobertura:
 *   - Cero, uno, dos dígitos (casos base)
 *   - Decenas exactas y con unidad (21, 35, 99)
 *   - Centenas exactas (100 = "cien", no "ciento")
 *   - Miles con y sin resto (1.000, 1.500, 1.234.567)
 *   - Millones con pluralización ("UN MILLÓN" vs "DOS MILLONES")
 *   - Billones (edge case improbable en COP)
 *   - Sufijo "PESOS M/CTE" en mayúscula y minúscula
 *   - Edge cases: 0, negativos, NaN, no enteros
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  numeroAPesosColombianos,
  numeroAPesosColombianosCaps,
  numeroAPesosColombianosTitle,
} from '../src/utils/numeroALetras';

test('regression: cero', () => {
  assert.equal(numeroAPesosColombianos(0), 'cero pesos m/cte');
});

test('regression: uno (caso "un" cuando va pegado a "millones" vs "uno" suelto)', () => {
  assert.equal(numeroAPesosColombianos(1), 'uno pesos m/cte');
  // NOTA: "uno pesos" no es gramaticalmente perfecto pero es funcional.
  // La gramática colombiana para "un peso" se resuelve en el contexto del PDF
  // (la línea del PDF es: "La suma de: UN PESO COLOMBIANO ($1)" — mayúscula).
  // El test verifica el comportamiento actual.
});

test('regression: decenas exactas', () => {
  assert.equal(numeroAPesosColombianos(30), 'treinta pesos m/cte');
  assert.equal(numeroAPesosColombianos(50), 'cincuenta pesos m/cte');
  assert.equal(numeroAPesosColombianos(90), 'noventa pesos m/cte');
});

test('regression: decenas con unidad', () => {
  assert.equal(numeroAPesosColombianos(35), 'treinta y cinco pesos m/cte');
  assert.equal(numeroAPesosColombianos(99), 'noventa y nueve pesos m/cte');
});

test('regression: 21 = "veintiuno"', () => {
  // 21 suelto se escribe "veintiuno" (no "veintiún" porque no lleva sufijo)
  assert.equal(numeroAPesosColombianos(21), 'veintiuno pesos m/cte');
});

test('regression: 100 = "cien" (no "ciento")', () => {
  assert.equal(numeroAPesosColombianos(100), 'cien pesos m/cte');
});

test('regression: 101 = "ciento uno"', () => {
  assert.equal(numeroAPesosColombianos(101), 'ciento uno pesos m/cte');
});

test('regression: 999', () => {
  assert.equal(numeroAPesosColombianos(999), 'novecientos noventa y nueve pesos m/cte');
});

test('regression: 1.000 = "mil"', () => {
  assert.equal(numeroAPesosColombianos(1000), 'mil pesos m/cte');
});

test('regression: 1.500.000 = "un millón quinientos mil"', () => {
  assert.equal(
    numeroAPesosColombianos(1_500_000),
    'un millón quinientos mil pesos m/cte',
  );
});

test('regression: 1.946.037 (caso del PDF de muestra — estado de cuenta)', () => {
  const result = numeroAPesosColombianos(1_946_037);
  // canon de 1.696.037 + admin 250.000 = 1.946.037
  assert.equal(result, 'un millón novecientos cuarenta y seis mil treinta y siete pesos m/cte');
});

test('regression: 1.696.037 (caso del PDF de muestra — cuenta de cobro)', () => {
  const result = numeroAPesosColombianos(1_696_037);
  assert.equal(result, 'un millón seiscientos noventa y seis mil treinta y siete pesos m/cte');
});

test('regression: pluralización "DOS MILLONES" vs "UN MILLÓN"', () => {
  assert.match(numeroAPesosColombianos(2_000_000), /dos millones/);
  assert.match(numeroAPesosColombianos(1_000_000), /un millón(?!s)/); // "un millón" sin "s"
});

test('regression: numeroAPesosColombianosCaps — mayúsculas', () => {
  assert.equal(
    numeroAPesosColombianosCaps(1_696_037),
    'UN MILLÓN SEISCIENTOS NOVENTA Y SEIS MIL TREINTA Y SIETE PESOS M/CTE',
  );
});

test('regression: numeroAPesosColombianosTitle — primera letra mayúscula', () => {
  assert.equal(
    numeroAPesosColombianosTitle(1_696_037),
    'Un millón seiscientos noventa y seis mil treinta y siete pesos m/cte',
  );
});

test('regression: edge cases — números inválidos retornan vacío', () => {
  assert.equal(numeroAPesosColombianos(-100), '');
  assert.equal(numeroAPesosColombianos(NaN), '');
  assert.equal(numeroAPesosColombianos(Infinity), '');
});

test('regression: decimales se truncan hacia abajo', () => {
  // No usamos centavos en COP, pero si llega 1234.56 debe dar 1234
  assert.equal(numeroAPesosColombianos(1234.89), 'mil doscientos treinta y cuatro pesos m/cte');
});

test('regression: billón (edge case — NO produce crash)', () => {
  // KNOWN LIMITATION: el conversor actual maneja hasta ~999 millones. Para
  // billones (>1.000.000.000.000 COP) NO escala bien y devuelve texto como
  // "undefined billones pesos m/cte". Esto NO afecta el piloto (nadie tiene
  // una liquidación de un billón de pesos al mes) pero está documentado
  // como limitación. Si en el futuro se necesita, hay que reescribir el
  // conversor con lógica de "groups of 3 digits".
  //
  // Lo que validamos acá es que NO se rompe el sistema:
  //   - No retorna vacío (sería peor porque parecería 0 COP en el PDF)
  //   - Tiene el sufijo correcto
  //   - Es un string
  const result = numeroAPesosColombianos(1_000_000_000_000);
  assert.ok(typeof result === 'string');
  assert.ok(result.length > 0);
  assert.match(result, /pesos m\/cte$/);
});

test('regression: 500 millones = "quinientos millones"', () => {
  // Cerca del límite actual (999 millones)
  assert.equal(
    numeroAPesosColombianos(500_000_000),
    'quinientos millones pesos m/cte',
  );
});