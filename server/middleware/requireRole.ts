/**
 * server/middleware/requireRole.ts — Middleware de autorización por acción.
 *
 * Valida que el rol del usuario autenticado tenga el permiso específico
 * para la acción que intenta ejecutar. Se aplica DESPUÉS de `requireAuth`
 * (orden importante: si el user no tiene sesión, debe ser 401, no 403).
 *
 * Spec: docs/specs/fix-issue-permissions-by-endpoint.md
 * Verifier: tests/verifiers/fix-issue-permissions-by-endpoint.md
 *
 * Uso:
 *   router.post("/", requireAuth, requireRole('canAddProperty'), asyncHandler(...));
 *
 * Si el rol no tiene el permiso → 403 con código FORBIDDEN y nombre de la acción.
 */

import { Request, Response, NextFunction } from 'express';
import { can, type Action } from '../lib/permissions.js';

export function requireRole(action: Action) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      // requireAuth debe correr antes. Si llegamos acá sin user, es un bug
      // del setup de middlewares. Devolvemos 401 (no 403) por seguridad
      // (no leakeamos info sobre la existencia del endpoint).
      res.status(401).json({ error: 'No autenticado', code: 'NO_SESSION' });
      return;
    }

    const role = user.role;
    if (!can(role, action)) {
      // Log para auditoría. El 403 NO leakea si el endpoint existe
      // (ya pasó requireAuth, así que我们知道 que la sesión es válida).
      console.warn(
        `[authz] Forbidden: user=${user.email} role=${role} action=${action} ` +
        `path=${req.method} ${req.originalUrl}`,
      );
      res.status(403).json({
        error: 'No tenés permiso para esta acción',
        code: 'FORBIDDEN',
        action,
        userRole: role,
      });
      return;
    }

    next();
  };
}