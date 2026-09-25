/**
 * Tests unitarios de los helpers puros del wizard de captación.
 *
 * Funciones testeadas (Commit 3 del refactor #5, spec #5):
 *   - normalizeFilename(input)
 *   - slotKeyToLabel(slotKey, owners?, units?)
 *   - slotKeyToFilename(slotKey, owners?, units?)
 *
 * Sin dependencias de React, jsdom ni Zustand. Solo se importan las
 * funciones puras. Cubre los edge cases 1-5 del spec #5.
 *
 * Corrida:
 *   node --test --import tsx tests/slotKeyHelpers.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeFilename,
  slotKeyToLabel,
  slotKeyToFilename,
} from '../src/features/properties/utils/slotKeyHelpers.ts';

describe('normalizeFilename', () => {
  it('mantiene alfanuméricos y guiones bajos', () => {
    assert.equal(normalizeFilename('Hola_Mundo'), 'Hola_Mundo');
  });

  it('reemplaza espacios por _', () => {
    assert.equal(normalizeFilename('Hola Mundo'), 'Hola_Mundo');
  });

  it('quita tildes', () => {
    assert.equal(normalizeFilename('Cédula'), 'Cedula');
    assert.equal(normalizeFilename('Número'), 'Numero');
  });

  it('convierte ñ/Ñ a n', () => {
    assert.equal(normalizeFilename('Señor Muñoz'), 'Senor_Munoz');
    assert.equal(normalizeFilename('Ñoño'), 'Nono');
  });

  it('colapsa múltiples _ en uno solo', () => {
    assert.equal(normalizeFilename('a   b'), 'a_b');
    assert.equal(normalizeFilename('a___b'), 'a_b');
  });

  it('trimea _ al inicio y final', () => {
    assert.equal(normalizeFilename('_Hola_'), 'Hola');
    assert.equal(normalizeFilename('___Hola___'), 'Hola');
  });

  it('EC-1: caso del spec — "Cédula de Tatiana Prieto"', () => {
    assert.equal(
      normalizeFilename('Cédula de Tatiana Prieto'),
      'Cedula_de_Tatiana_Prieto',
    );
  });

  it('EC-2: maneja slashes y puntos', () => {
    assert.equal(normalizeFilename('Carta 1/2.pdf'), 'Carta_1_2_pdf');
    assert.equal(normalizeFilename('Recibo.2025.pdf'), 'Recibo_2025_pdf');
  });

  it('input vacío devuelve string vacío', () => {
    assert.equal(normalizeFilename(''), '');
  });
});

describe('slotKeyToLabel', () => {
  it('casos directos a nivel de propiedad', () => {
    assert.equal(slotKeyToLabel('predial'), 'Impuesto Predial');
    assert.equal(slotKeyToLabel('mandato'), 'Contrato de Mandato');
    assert.equal(
      slotKeyToLabel('certificado_tradicion:main'),
      'Certificado de Tradición',
    );
  });

  it('slot con owner desconocido → label genérico', () => {
    assert.equal(slotKeyToLabel('cedula:unknown-id'), 'Cédula');
    assert.equal(slotKeyToLabel('rut:unknown-id'), 'RUT');
  });

  it('slot con owner conocido → "Cédula de <nombre>"', () => {
    const owners = [{ id: 'o1', name: 'Tatiana Prieto' }];
    assert.equal(slotKeyToLabel('cedula:o1', owners), 'Cédula de Tatiana Prieto');
    assert.equal(slotKeyToLabel('rut:o1', owners), 'RUT de Tatiana Prieto');
  });

  it('slot con unit conocido → "Certificado de <label>"', () => {
    const units = [{ id: 'u1', label: 'Garaje 12' }];
    assert.equal(
      slotKeyToLabel('certificado_tradicion:u1', [], units),
      'Certificado de Garaje 12',
    );
  });

  it('slot con unit desconocido → label genérico', () => {
    assert.equal(
      slotKeyToLabel('certificado_tradicion:unknown', [], []),
      'Certificado de Tradición',
    );
  });

  it('slot desconocido → devuelve el slotKey crudo', () => {
    assert.equal(slotKeyToLabel('foo:bar'), 'foo:bar');
  });

  it('sin owners/units → no falla', () => {
    assert.equal(slotKeyToLabel('cedula:x'), 'Cédula');
    assert.equal(slotKeyToLabel('cedula:x', []), 'Cédula');
  });
});

describe('slotKeyToFilename', () => {
  it('casos directos a nivel de propiedad', () => {
    assert.equal(slotKeyToFilename('predial'), 'Predial.pdf');
    assert.equal(slotKeyToFilename('mandato'), 'Contrato_Mandato.pdf');
    assert.equal(
      slotKeyToFilename('certificado_tradicion:main'),
      'Certificado_Unidad_Principal.pdf',
    );
  });

  it('EC-3: cedula con owner conocido normaliza tildes', () => {
    const owners = [{ id: 'o1', name: 'Tatiana Prieto' }];
    assert.equal(
      slotKeyToFilename('cedula:o1', owners),
      'Cedula_Tatiana_Prieto.pdf',
    );
  });

  it('cedula con owner desconocido → "Cedula.pdf"', () => {
    assert.equal(slotKeyToFilename('cedula:unknown'), 'Cedula.pdf');
  });

  it('rut con owner conocido', () => {
    const owners = [{ id: 'o1', name: 'Muñoz' }];
    assert.equal(slotKeyToFilename('rut:o1', owners), 'RUT_Munoz.pdf');
  });

  it('certificado_tradicion con unit conocido', () => {
    const units = [{ id: 'u1', label: 'Depósito 5' }];
    assert.equal(
      slotKeyToFilename('certificado_tradicion:u1', [], units),
      'Certificado_Deposito_5.pdf',
    );
  });

  it('certificado_tradicion con unit desconocido → fallback', () => {
    assert.equal(
      slotKeyToFilename('certificado_tradicion:unknown', [], []),
      'Certificado_Tradicion.pdf',
    );
  });

  it('slot desconocido → nombre normalizado del slotKey + .pdf', () => {
    assert.equal(slotKeyToFilename('foo:bar'), 'foo_bar.pdf');
    assert.equal(slotKeyToFilename('Otro Tipo'), 'Otro_Tipo.pdf');
  });

  it('siempre termina en .pdf', () => {
    assert.match(slotKeyToFilename('predial'), /\.pdf$/);
    assert.match(slotKeyToFilename('cedula:o1'), /\.pdf$/);
  });

  it('sin owners/units → no falla', () => {
    assert.equal(slotKeyToFilename('cedula:x'), 'Cedula.pdf');
  });
});