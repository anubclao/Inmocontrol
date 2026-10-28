/**
 * Tests de los límites de subida (server/lib/uploadLimits.ts).
 *
 * El bug que previenen: el único tope era el envelope global de 15 MB, así
 * que cualquier endpoint aceptaba 15 MB de JSON base64 (~40 MB de pico en RAM).
 * Ahora cada endpoint valida ANTES de decodificar y responde 413.
 *
 * Corrida:
 *   node --test --import tsx tests/uploadLimits.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertBase64Size,
  base64DecodedBytes,
  formatMb,
  stripDataUrlPrefix,
} from '../server/lib/uploadLimits.ts';
import { AppError } from '../server/lib/errors.ts';

describe('base64DecodedBytes', () => {
  it('calcula 3 bytes por cada 4 caracteres', () => {
    assert.equal(base64DecodedBytes('AAAA'), 3); // 4 chars → 3 bytes
    assert.equal(base64DecodedBytes('AAAAAAAA'), 6);
  });

  it('descuenta el padding', () => {
    assert.equal(base64DecodedBytes('AA=='), 1);
    assert.equal(base64DecodedBytes('AAA='), 2);
  });

  it('ignora el prefijo data URL', () => {
    assert.equal(base64DecodedBytes('data:application/pdf;base64,AAAA'), 3);
  });

  it('devuelve 0 para vacío', () => {
    assert.equal(base64DecodedBytes(''), 0);
  });
});

describe('stripDataUrlPrefix', () => {
  it('quita el prefijo si existe', () => {
    assert.equal(stripDataUrlPrefix('data:image/png;base64,QUJD'), 'QUJD');
  });

  it('deja el base64 intacto si no hay prefijo', () => {
    assert.equal(stripDataUrlPrefix('QUJD'), 'QUJD');
  });
});

describe('assertBase64Size', () => {
  it('no lanza cuando está dentro del límite', () => {
    assert.doesNotThrow(() => assertBase64Size('AAAA', 3, 'El PDF'));
  });

  it('lanza 413 con code PAYLOAD_TOO_LARGE cuando se pasa', () => {
    assert.throws(
      () => assertBase64Size('AAAAAA', 3, 'El PDF'),
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 413);
        assert.equal(err.code, 'PAYLOAD_TOO_LARGE');
        assert.equal(err.expose, true, 'el cliente debe ver el motivo');
        return true;
      },
    );
  });

  it('el mensaje incluye el tamaño y el máximo', () => {
    try {
      assertBase64Size('A'.repeat(40), 10, 'El lote de fotos');
    } catch (err: any) {
      assert.match(err.message, /El lote de fotos/);
      assert.match(err.message, /máximo/);
      return;
    }
    assert.fail('debió lanzar');
  });
});

describe('formatMb', () => {
  it('formatea con un decimal', () => {
    assert.equal(formatMb(1024 * 1024), '1.0 MB');
    assert.equal(formatMb(3 * 1024 * 1024), '3.0 MB');
  });
});
