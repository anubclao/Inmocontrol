/**
 * Tests del guard de Drive (server/lib/driveGuard.ts).
 *
 * Cubre lo que la auditoría de Hostinger marcó como riesgo real:
 *   - el timeout corta de verdad (no depende de que el callee respete la señal),
 *   - se reintentan 429/5xx pero NO 4xx,
 *   - un timeout no deja la promesa colgada.
 *
 * Sin red ni credenciales: las "llamadas a Google" son thunks locales.
 *
 * Corrida:
 *   node --test --import tsx tests/driveGuard.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isRetryableGoogleError, runDrive } from '../server/lib/driveGuard.ts';
import { AppError } from '../server/lib/errors.ts';

/** Error con la forma que devuelve googleapis (gaxios). */
function googleError(status: number, reason?: string): any {
  const err: any = new Error(`Google API error ${status}`);
  err.response = {
    status,
    data: reason ? { error: { errors: [{ reason }] } } : {},
  };
  return err;
}

describe('isRetryableGoogleError', () => {
  it('reintenta 429 y 5xx', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      assert.equal(isRetryableGoogleError(googleError(status)), true, `status ${status}`);
    }
  });

  it('no reintenta 4xx de cliente', () => {
    for (const status of [400, 401, 403, 404, 409]) {
      assert.equal(isRetryableGoogleError(googleError(status)), false, `status ${status}`);
    }
  });

  it('reintenta el 403 de cuota de Google (rateLimitExceeded)', () => {
    assert.equal(isRetryableGoogleError(googleError(403, 'rateLimitExceeded')), true);
    assert.equal(isRetryableGoogleError(googleError(403, 'userRateLimitExceeded')), true);
  });

  it('reintenta errores de red transitorios', () => {
    const e: any = new Error('socket hang up');
    e.code = 'ECONNRESET';
    assert.equal(isRetryableGoogleError(e), true);
  });

  it('no reintenta un abort propio', () => {
    const e: any = new Error('aborted');
    e.name = 'AbortError';
    assert.equal(isRetryableGoogleError(e), false);
  });
});

describe('runDrive', () => {
  it('devuelve el resultado cuando la llamada funciona', async () => {
    const value = await runDrive('ok', async () => ({ data: { id: 'file-1' } }));
    assert.equal(value.data.id, 'file-1');
  });

  it('corta a los timeoutMs aunque el callee ignore la señal', async () => {
    let aborted = false;
    const started = Date.now();

    await assert.rejects(
      () =>
        runDrive(
          'colgado',
          (signal) => {
            signal.addEventListener('abort', () => {
              aborted = true;
            });
            // Simula a Google que nunca responde y no respeta el abort.
            return new Promise(() => {});
          },
          { timeoutMs: 40 },
        ),
      (err: any) => {
        assert.ok(err instanceof AppError, 'debe ser AppError');
        assert.equal(err.statusCode, 504);
        assert.equal(err.code, 'DRIVE_TIMEOUT');
        return true;
      },
    );

    const elapsed = Date.now() - started;
    assert.ok(elapsed < 2000, `debió cortar rápido, tardó ${elapsed}ms`);
    assert.equal(aborted, true, 'la señal debe quedar abortada para cancelar la request real');
  });

  it('reintenta 503 y termina bien', async () => {
    let calls = 0;
    const result = await runDrive(
      'reintento',
      async () => {
        calls++;
        if (calls < 3) throw googleError(503);
        return { data: { ok: true } };
      },
      { attempts: 3, backoffMs: 1 },
    );

    assert.equal(result.data.ok, true);
    assert.equal(calls, 3);
  });

  it('no reintenta un 404 (falla en el primer intento)', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        runDrive(
          'no encontrado',
          async () => {
            calls++;
            throw googleError(404);
          },
          { attempts: 3, backoffMs: 1 },
        ),
      (err: any) => {
        assert.equal(err.response.status, 404);
        return true;
      },
    );
    assert.equal(calls, 1);
  });

  it('respeta el máximo de intentos', async () => {
    let calls = 0;
    await assert.rejects(() =>
      runDrive(
        'siempre falla',
        async () => {
          calls++;
          throw googleError(500);
        },
        { attempts: 2, backoffMs: 1 },
      ),
    );
    assert.equal(calls, 2);
  });
});
