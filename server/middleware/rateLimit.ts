/**
 * server/middleware/rateLimit.ts — middleware genérico de rate limit
 * por IP + (opcional) email.
 *
 * Spec: docs/specs/fix-issue-rate-limit-auth-login.md
 * Verifier: tests/verifiers/fix-issue-rate-limit-auth-login.md
 *
 * Persistencia en MySQL (`login_attempts`) para sobrevivir el redeploy.
 * Soft-clear de contadores tras login exitoso.
 * Bypass automático si NODE_ENV === 'test'.
 *
 * Uso:
 *   router.post('/login',
 *     rateLimit({ windowSeconds: 900, maxAttempts: 5, scope: 'ip+email' }),
 *     rateLimit({ windowSeconds: 900, maxAttempts: 20, scope: 'ip' }),
 *     asyncHandler(...),
 *   );
 */

import { NextFunction, Request, Response } from 'express';
import pool from '../db.js';

export interface RateLimitOptions {
  windowSeconds: number;
  maxAttempts: number;
  scope: 'ip+email' | 'ip';
}

export function rateLimit(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Bypass en tests
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    const ip = req.ip ?? '0.0.0.0';
    const email = ((req.body?.email ?? '') as string).toLowerCase().trim();

    if (opts.scope === 'ip+email' && !email) {
      // Sin email no aplicamos rate limit per-user (ej: login del device flow).
      next();
      return;
    }

    try {
      // Cuenta fallos en la ventana móvil
      const [rows] = (await pool.query(
        `SELECT COUNT(*) AS count FROM login_attempts
         WHERE ip = ?
           ${opts.scope === 'ip+email' ? 'AND email = ?' : ''}
           AND success = 0
           AND cleared_at IS NULL
           AND attempted_at >= NOW() - INTERVAL ? SECOND`,
        opts.scope === 'ip+email' ? [ip, email, opts.windowSeconds] : [ip, opts.windowSeconds],
      )) as any[];
      const attempts = Number(rows?.[0]?.count ?? 0);

      if (attempts >= opts.maxAttempts) {
        const retryAfter = opts.windowSeconds;
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-RateLimit-Limit', String(opts.maxAttempts));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader(
          'X-RateLimit-Reset',
          String(Math.floor(Date.now() / 1000) + retryAfter),
        );
        console.warn(
          `[rateLimit] Blocked ${opts.scope} ip=${ip} email=${email} attempts=${attempts}`,
        );
        res.status(429).json({
          error: 'Demasiados intentos. Reintentá en unos minutos.',
          code: 'RATE_LIMITED',
          retryAfter,
        });
        return;
      }
      next();
    } catch (err: any) {
      console.error('[rateLimit] error degradando a allow:', err?.message);
      // Degrade gracefully: nunca bloquear por error del rate limit
      next();
    }
  };
}

/**
 * Marca los intentos fallidos previos como cleared (soft) cuando un
 * login tiene éxito. Llamado desde el handler de login después de
 * verificar credenciales válidas.
 */
export async function clearFailedAttempts(ip: string, email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return;
  try {
    await pool.query(
      `UPDATE login_attempts SET cleared_at = NOW()
       WHERE ip = ? AND email = ? AND success = 0 AND cleared_at IS NULL`,
      [ip, normalizedEmail],
    );
  } catch (err: any) {
    console.warn('[rateLimit] clearFailedAttempts no crítico:', err?.message);
  }
}

/**
 * Inserta un attempt (success=1 o 0 según el flujo). Llamado desde el
 * handler de login al final.
 */
export async function recordAttempt(
  ip: string,
  email: string,
  success: boolean,
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return;
  const windowStart = Math.floor(Date.now() / 1000 / 900) * 900; // ventana 15min
  try {
    await pool.query(
      `INSERT INTO login_attempts (ip, email, success, window_start)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE success = VALUES(success)`,
      [ip, normalizedEmail, success ? 1 : 0, windowStart],
    );
  } catch (err: any) {
    console.warn('[rateLimit] recordAttempt no crítico:', err?.message);
  }
}