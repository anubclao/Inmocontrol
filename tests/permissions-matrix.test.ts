/**
 * Test de drift de la matriz de permisos server vs cliente.
 *
 * Si el drift ocurre, un rol puede tener permiso en el frontend (mostrar
 * el botón) pero NO tenerlo en el backend (rechazar la mutación con 403),
 * o viceversa. Cualquier divergencia es un bug silencioso de seguridad.
 *
 * Este test compara `server/lib/permissions.ts` con
 * `src/features/auth/permissions.ts` y falla si difieren.
 *
 * Spec: docs/specs/fix-issue-permissions-by-endpoint.md
 *
 * Corrida:
 *   npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ROLE_PERMISSIONS as serverPerms, type Role as ServerRole } from '../server/lib/permissions.ts';
import { ROLE_PERMISSIONS as clientPerms, type RolePermissions, type Role as ClientRole } from '../src/features/auth/permissions.ts';

const ROLES: Array<ServerRole & ClientRole> = ['admin', 'propietario', 'inquilino'];

describe('permissions matrix — server vs client drift detection', () => {
  it('server y cliente definen los mismos roles', () => {
    const serverRoles = Object.keys(serverPerms).sort();
    const clientRoles = Object.keys(clientPerms).sort();
    assert.deepEqual(
      clientRoles,
      serverRoles,
      `Roles divergen:\n  server: ${JSON.stringify(serverRoles)}\n  client: ${JSON.stringify(clientRoles)}`,
    );
  });

  for (const role of ROLES) {
    it(`rol '${role}': server y cliente definen las mismas acciones con los mismos valores`, () => {
      const serverRow = serverPerms[role];
      const clientRow = clientPerms[role] as unknown as Record<string, boolean>;

      const serverActions = Object.keys(serverRow).sort();
      const clientActions = Object.keys(clientRow).sort();

      // 1. MISMAS ACCIONES
      assert.deepEqual(
        clientActions,
        serverActions,
        `Acciones divergen para rol '${role}':\n` +
        `  solo en server: ${JSON.stringify(serverActions.filter((a) => !clientActions.includes(a)))}\n` +
        `  solo en client: ${JSON.stringify(clientActions.filter((a) => !serverActions.includes(a)))}`,
      );

      // 2. MISMOS VALORES
      for (const action of serverActions) {
        assert.equal(
          clientRow[action],
          serverRow[action],
          `Drift para rol '${role}' acción '${action}':\n` +
          `  server: ${serverRow[action]}\n` +
          `  client: ${clientRow[action]}`,
        );
      }
    });
  }

  it('admin tiene TODAS las acciones en true (reference role)', () => {
    for (const [action, allowed] of Object.entries(serverPerms.admin)) {
      assert.equal(
        allowed,
        true,
        `admin debe tener '${action}' = true, pero server dice ${allowed}`,
      );
    }
  });

  it('inquilino tiene TODAS las acciones en false (least privilege)', () => {
    for (const [action, allowed] of Object.entries(serverPerms.inquilino)) {
      assert.equal(
        allowed,
        false,
        `inquilino debe tener '${action}' = false, pero server dice ${allowed}`,
      );
    }
  });

  it('TypeScript types coinciden (via test de tipado implícito)', () => {
    // Verifica que ambas exportaciones de tipo RolePermissions tengan
    // las mismas keys. El compilador TS ya lo enforza en build-time,
    // pero este test runtime protege contra regresiones silenciosas.
    type ServerKeys = keyof typeof serverPerms.admin;
    type ClientKeys = keyof RolePermissions;

    const serverKeys: ServerKeys[] = Object.keys(serverPerms.admin) as ServerKeys[];
    const clientKeys: ClientKeys[] = Object.keys(clientPerms.admin) as ClientKeys[];

    assert.deepEqual(
      clientKeys.sort(),
      serverKeys.sort(),
      'Las keys de RolePermissions del cliente deben coincidir con las de server/lib/permissions.ts',
    );
  });
});