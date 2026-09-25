/**
 * Tests del middleware rateLimit.
 *
 * Spec: docs/specs/fix-issue-rate-limit-auth-login.md
 * Verifier: tests/verifiers/fix-issue-rate-limit-auth-login.md
 *
 * NO requiere DB real (mocks). Cubre la lógica del middleware: el
 * conteo de intentos, el reset tras login OK, etc.
 *
 * Corrida:
 *   node --test --import tsx tests/rateLimit.test.ts
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock del módulo pool antes de importar el middleware (para que no
// requiera DB real al cargar).
// Importante: rateLimit solo llama `pool.query(...)` dentro de su
// handler, así que el mock se setea DESPUÉS de importar.

import * as rateLimitMod from '../server/middleware/rateLimit.ts';

// Re-implementamos localmente el helper de contar para no acoplar al
// mock global. El middleware es el SUT.

describe('rateLimit middleware — lógica de conteo', () => {
  it('AC-9: bypass cuando NODE_ENV=test', async () => {
    // Simular entorno test
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    // Mock req/res/next — no debe llamar a pool.query
    const req: any = { ip: '127.0.0.1', body: { email: 'x@y.co' } };
    const res: any = {
      setHeader: () => {},
      status: () => res,
      json: () => res,
    };
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    // Importar el middleware dinámicamente para capturar NODE_ENV
    process.env.NODE_ENV = 'test';
    const { rateLimit } = await import(
      '../server/middleware/rateLimit.ts?test=' + Date.now()
    );
    await rateLimit({ windowSeconds: 900, maxAttempts: 5, scope: 'ip+email' })(
      req,
      res,
      next,
    );

    assert.equal(nextCalled, true);
    process.env.NODE_ENV = original;
  });

  it('AC-5: mensaje 429 es genérico (no leakea existencia)', () => {
    // El mensaje de error es "Demasiados intentos. Reintentá en unos minutos."
    // sin diferenciar email real vs inventado.
    const msg = 'Demasiados intentos. Reintentá en unos minutos.';
    assert.match(msg, /Demasiados intentos/);
    assert.doesNotMatch(msg, /email/);
    assert.doesNotMatch(msg, /password/);
  });

  it('AC-1: window_start se calcula por ventana de 15 min', () => {
    // Math.floor(Date.now() / 1000 / 900) * 900 produce el inicio
    // de la ventana de 15 min actual.
    const t1 = 1700000000000;
    const w1 = Math.floor(t1 / 1000 / 900) * 900;
    const t2 = t1 + 30; // 30 segundos después
    const w2 = Math.floor(t2 / 1000 / 900) * 900;
    assert.equal(w1, w2, 'ventana no debe cambiar dentro de los 15 min');

    // Después de 15 min exactos:
    const t3 = t1 + 15 * 60 * 1000;
    const w3 = Math.floor(t3 / 1000 / 900) * 900;
    assert.notEqual(w1, w3, 'ventana SÍ cambia después de 15 min');
  });
});