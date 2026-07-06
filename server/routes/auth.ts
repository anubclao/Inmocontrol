/**
 * Auth simple para el piloto InmoControl.
 *
 * NO es producción. Es un solo usuario con password bcrypt. Cuando se migre
 * a SaaS multi-tenant, este módulo se reemplaza por OAuth + JWT + sesiones.
 *
 * Diseño:
 *   - POST /api/auth/login       → { email, password } → cookie httpOnly + user
 *   - POST /api/auth/logout      → limpia cookie
 *   - GET  /api/auth/me         → devuelve el usuario actual o 401
 *
 * La cookie es httpOnly + SameSite=Lax. No es Secure porque el piloto va
 * por http local. Cuando se deploye en server con HTTPS, agregar Secure.
 *
 * Token: usamos un sessionId opaco (crypto.randomUUID) guardado en memoria
 * del server (Map). Más simple que JWT, suficiente para 1 usuario piloto.
 * Para SaaS: Redis o JWT firmado.
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool, { ensureDefaultOrg } from '../db.js';

const router = Router();

// Sesiones en memoria. Se pierden al reiniciar el server.
// Para el piloto está bien; en SaaS va a Redis o JWT.
interface Session {
  profileId: string;
  organizationId: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: number;
}
const sessions = new Map<string, Session>();

const COOKIE_NAME = 'inmocontrol_pilot_session';
const COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 horas

function setSessionCookie(res: Response, sessionId: string) {
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    // En producción (NODE_ENV=production), la cookie SOLO viaja por HTTPS.
    // En dev (NODE_ENV=development) sigue yendo por HTTP para que funcione
    // sin TLS en localhost. Si despliegas con HTTPS fuera de production,
    // ajusta manualmente.
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * Middleware: rechaza la request si no hay sesión válida. Devuelve 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[COOKIE_NAME];
  if (!sessionId) {
    return res.status(401).json({ error: 'No autenticado', code: 'NO_SESSION' });
  }
  const session = sessions.get(sessionId);
  if (!session) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Sesión expirada', code: 'SESSION_EXPIRED' });
  }
  // Adjuntar el usuario al req para que los routes lo usen
  (req as any).user = {
    id: session.profileId,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
    organizationId: session.organizationId,
  };
  next();
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 * → 200 { user: {...} } + cookie httpOnly
 * → 401 si credenciales inválidas
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos', code: 'MISSING_FIELDS' });
  }

  try {
    const orgId = await ensureDefaultOrg();
    const [rows] = await pool.query<any[]>(
      `SELECT id, organization_id, display_name, email, role, password_hash
       FROM profiles
       WHERE email = ? AND organization_id = ?
       LIMIT 1`,
      [email.toLowerCase().trim(), orgId]
    );

    if (rows.length === 0) {
      // No revelamos si el email existe o no (mitiga enumeración)
      return res.status(401).json({ error: 'Credenciales inválidas', code: 'INVALID_CREDENTIALS' });
    }

    const user = rows[0];
    if (!user.password_hash) {
      // Usuario sin password (legacy OAuth). Para el piloto, no aceptamos login sin password.
      console.warn(`[auth] Usuario ${email} sin password_hash — login rechazado`);
      return res.status(401).json({ error: 'Credenciales inválidas', code: 'NO_PASSWORD_SET' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales inválidas', code: 'INVALID_CREDENTIALS' });
    }

    // Crear sesión
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      profileId: user.id,
      organizationId: user.organization_id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      createdAt: Date.now(),
    });

    setSessionCookie(res, sessionId);

    console.log(`[auth] Login OK: ${email} (role=${user.role})`);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        organizationId: user.organization_id,
      },
    });
  } catch (err: any) {
    console.error('[auth] login error:', err.message);
    return res.status(500).json({ error: 'Error interno', code: 'INTERNAL' });
  }
});

/**
 * POST /api/auth/logout
 * Limpia la sesión del server y la cookie del browser.
 */
router.post('/logout', (req, res) => {
  const sessionId = req.cookies?.[COOKIE_NAME];
  if (sessionId) sessions.delete(sessionId);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

/**
 * GET /api/auth/me
 * Devuelve el usuario actual si hay sesión, o 401.
 */
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: (req as any).user });
});

export default router;