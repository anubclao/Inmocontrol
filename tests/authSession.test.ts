/**
 * Tests del ciclo de vida de la sesión en memoria (server/routes/auth.ts).
 *
 * Contexto (auditoría Hostinger): el Map de sesiones no tenía purga ni
 * chequeo de TTL. La cookie vencía a las 12 h pero la entrada quedaba viva
 * hasta el reinicio del proceso. Ahora `requireAuth` valida el TTL y borra la
 * entrada al detectarla vencida, sin necesidad de un setInterval.
 *
 * No toca MySQL: `createPool` es lazy y estas rutas no consultan la DB.
 *
 * Corrida:
 *   node --test --import tsx tests/authSession.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSIONS,
  SESSION_COOKIE_MAX_AGE_MS,
  requireAuth,
} from '../server/routes/auth.ts';

const COOKIE = 'inmocontrol_pilot_session';

function fakeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    cookieCalls: 0,
    cleared: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    clearCookie() {
      this.cleared = true;
      return this;
    },
    cookie() {
      this.cookieCalls++;
      return this;
    },
  };
  return res;
}

function fakeReq(sessionId: string) {
  return { cookies: { [COOKIE]: sessionId } } as any;
}

describe('requireAuth — TTL de sesión', () => {
  beforeEach(() => {
    SESSIONS.clear();
  });

  it('acepta una sesión recién creada', () => {
    const id = 'sess-fresh';
    SESSIONS.set(id, {
      profileId: 'p1',
      organizationId: 'o1',
      email: 'a@b.co',
      displayName: 'A',
      role: 'admin',
      createdAt: Date.now(),
    });

    const req = fakeReq(id);
    const res = fakeRes();
    let nextCalled = false;

    requireAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal((req as any).user.id, 'p1');
    assert.equal(SESSIONS.has(id), true);
  });

  it('rechaza y borra una sesión vencida', () => {
    const id = 'sess-old';
    SESSIONS.set(id, {
      profileId: 'p1',
      organizationId: 'o1',
      email: 'a@b.co',
      displayName: 'A',
      role: 'admin',
      createdAt: Date.now() - SESSION_COOKIE_MAX_AGE_MS - 1000,
    });

    const res = fakeRes();
    let nextCalled = false;

    requireAuth(fakeReq(id), res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'no debe dejar pasar');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'SESSION_EXPIRED');
    assert.equal(res.cleared, true, 'debe limpiar la cookie');
    assert.equal(SESSIONS.has(id), false, 'debe borrar la entrada del Map');
  });

  it('rechaza una sesión inexistente', () => {
    const res = fakeRes();
    let nextCalled = false;

    requireAuth(fakeReq('no-existe'), res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'SESSION_EXPIRED');
  });
});
