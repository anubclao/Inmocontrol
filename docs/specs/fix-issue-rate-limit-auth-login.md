# Fix: Rate limit en `/api/auth/login` (anti fuerza bruta)

> **Karpathy Spec** — FASE 4 del proyecto. Authentication es la
> superficie más atacada. Hoy `/api/auth/login` no tiene rate limit:
> un atacante puede probar 1000 passwords en 1 segundo (bcrypt ~100ms
> por compare NO es suficiente). Esto bloquea el rollout a SaaS
> multi-tenant (Fase 3 + AUTH §11).
>
> Strategy: ventana móvil por **IP+email** (no solo IP porque muchos
> atacantes usan proxy pools), persistencia en MySQL (no in-memory
> porque las sesiones se pierden al reiniciar el server — queremos
> que el bloqueo sobreviva el deploy).

## 1. User Story

**As a** backend de InmoControl,
**I want to** que el endpoint `/api/auth/login` rechace requests
excediendo N intentos fallidos en una ventana de tiempo, con bloqueo
progresivo,
**So that** un atacante no pueda hacer fuerza bruta ni enumerar emails
existentes, y el rolling a SaaS multi-tenant no quede bloqueado por
este agujero.

## 2. Acceptance Criteria (numerados, binarios)

### AC-1: Tabla `login_attempts` con constraint UNIQUE por (`ip`, `email`, `window_start`)

- **Trigger**: cualquier intento de login.
- **Comportamiento**: server inserta una fila en `login_attempts` con
  `ip=req.ip, email=normalized, success=bool, attempted_at=now()`.
- UNIQUE en (`ip`, `email`, `window_start`) garantiza idempotencia.
- `window_start` se calcula como `attempted_at - (attempted_at % WINDOW_SECONDS)`.

### AC-2: Rate limit por IP+email en ventana móvil

- **Trigger**: más de **5 intentos fallidos** en **15 minutos** para
  el mismo `(ip, email)`.
- **Comportamiento**: el siguiente intento devuelve `429 Too Many Requests`
  con `{ error, code: 'RATE_LIMITED', retryAfter: <segundos> }`.
- Header HTTP `Retry-After: <segundos>` también.

### AC-3: Rate limit por IP solo (mitigación de password spraying)

- **Trigger**: más de **20 intentos fallidos** en **15 minutos** desde
  la misma IP (sin importar email).
- **Comportamiento**: 429 + `Retry-After`. Esto cubre password spraying
  (atacante prueba 1 password contra muchos emails).

### AC-4: Login exitoso resetea los contadores

- **Trigger**: `bcrypt.compare` retorna true.
- **Comportamiento**: las filas previas (`success=false`) para ese
  `(ip, email)` se marcan `cleared_at=NOW()` (soft-reset).
- No se borran (audit trail).

### AC-5: Mensaje 429 NO leakea si el email existe

- **Trigger**: rate-limited.
- **Comportamiento**: mismo mensaje genérico "Demasiados intentos.
  Reintentá en N segundos." (sin distinguir si email existe o no).

### AC-6: Headers `Retry-After` y `X-RateLimit-*` estándar

- `Retry-After`: segundos hasta poder reintentar.
- `X-RateLimit-Limit: 5`
- `X-RateLimit-Remaining: 0` (cuando se bloquea)
- `X-RateLimit-Reset: <unix-timestamp>`

### AC-7: Migración `db/mysql/migrations/014_login_attempts.sql` idempotente

- `CREATE TABLE IF NOT EXISTS login_attempts (...)`.
- Aplicar con `node scripts/apply-014-migration.mjs` (la 013 ya está tomada por BUG-033, unique tenant document).

### AC-8: Cleanup periódico (auto-purge de filas > 24h)

- **Trigger**: cada request checa y purga filas con `attempted_at < NOW() - 24h`.
- **Comportamiento**: la tabla no crece sin bound.
- **NO usar cron externo** — el cleanup es lazy (al primer INSERT de cada N requests) o se hace por el endpoint `GET /api/health/cleanup` (admin).

### AC-9: Login bypass libre de rate limit cuando `NODE_ENV='test'`

- El middleware chequea `process.env.NODE_ENV` y se saltea si es `test`
  (para no romper tests automatizados).
- En `production` y `development`, el rate limit se aplica.

### AC-10: Tests automatizados

- `tests/rateLimit.test.ts` con casos:
  - 5 intentos fallidos OK, el 6º devuelve 429.
  - 1 intento OK + 1 fail + 1 OK → no se bloquea.
  - 20 attempts desde misma IP (mix de emails) → 429.
  - Reset tras login OK.
- Type-checke a `tsc --noEmit`.

## 3. Edge Cases

### EC-1 — IP detrás de proxy

- **Trigger**: `req.ip` viene del header `X-Forwarded-For`.
- **Comportamiento**: usar `req.ip` que Express ya popula correctamente
  con `app.set('trust proxy', true)` si está detrás de nginx/Cloudflare.
- En dev (sin proxy): `req.ip === '127.0.0.1'`.

### EC-2 — IPv6

- **Trigger**: cliente con IPv6.
- **Comportamiento**: la columna `ip` es VARCHAR(45) (cabe IPv6).

### EC-3 — Email con mayúsculas / espacios

- **Trigger**: `email='  Admin@InmoControl.co  '`.
- **Comportamiento**: `email.toLowerCase().trim()` antes del rate limit (mismo normalizado que ya hace el SELECT).

### EC-4 — Login concurrent desde misma IP

- **Trigger**: 2 browsers login al mismo tiempo.
- **Comportamiento**: ambos se cuentan. Si entre los 2 suman 5 fallos,
  el próximo bloquea.

### EC-5 — Account lockout combinado

- **Trigger**: el mismo email recibe rate limit desde N IPs distintas.
- **Comportamiento**: el rate limit es **POR IP+email**, no por email.
  Si el atacante rota IP, cada IP tiene su propia ventana. Esto es
  by-design (evita lockout colateral donde un user legítimo queda
  afuera porque otro atacó).

### EC-6 — `req.ip` undefined

- **Trigger**: error de configuración de Express.
- **Comportamiento**: fallback a `'0.0.0.0'` y loggear warning.

### EC-7 — Race condition entre INSERT y SELECT

- **Trigger**: 2 requests simultáneos del mismo IP+email.
- **Comportamiento**: el UNIQUE en `(ip, email, window_start)` evita
  duplicados. Si hay race, el segundo INSERT tira 1062 duplicate key →
  se cuenta como 1 solo intento (idempotente).

### EC-8 — Bloqueo durante deploy

- **Trigger**: deploy reinicia el server.
- **Comportamiento**: la tabla `login_attempts` está en MySQL, NO se
  pierde. El bloqueo sobrevive el redeploy.

### EC-9 — Bypass cambiando origin

- **Trigger**: atacante salta entre 2 IPs.
- **Comportamiento**: cada combinación IP+email tiene su contador
  independiente. Esto NO es perfecto contra DDoS pero bloquea
  fuerza bruta sostenida desde 1 IP.

### EC-10 — Tests del piloto existentes

- **Trigger**: `npm test` después del fix.
- **Comportamiento**: los tests viejos (settlement, numeroALetras,
  permissions-matrix, slotKeyHelpers, finalizeSummary) siguen verdes.
- `tests/rateLimit.test.ts` corre con `NODE_ENV=test` (bypass).

## 4. Technical Contract

### Schema MySQL

```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  email VARCHAR(255) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  window_start BIGINT UNSIGNED NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cleared_at DATETIME NULL,
  INDEX idx_ip_email (ip, email, attempted_at),
  INDEX idx_window (window_start),
  UNIQUE KEY uniq_window (ip, email, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Middleware

```typescript
// server/middleware/rateLimit.ts (nuevo)
export interface RateLimitOptions {
  windowSeconds: number;
  maxAttempts: number;
  scope: 'ip+email' | 'ip';
}

export function rateLimit(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') return next();

    const ip = req.ip ?? '0.0.0.0';
    const email = ((req.body?.email ?? '') as string).toLowerCase().trim();
    if (!email && opts.scope === 'ip+email') return next(); // sin email no rate-limiteamos

    try {
      const windowStart = Math.floor(Date.now() / 1000 / opts.windowSeconds)
        * opts.windowSeconds;
      // Contar fallos en la ventana activa
      const [{ count }] = await pool.query<any[]>(
        `SELECT COUNT(*) AS count FROM login_attempts
         WHERE ip = ? AND email ${opts.scope === 'ip+email' ? '= ?' : 'LIKE ?'}
           AND success = 0 AND cleared_at IS NULL
           AND attempted_at >= NOW() - INTERVAL ? SECOND`,
        opts.scope === 'ip+email'
          ? [ip, email, opts.windowSeconds]
          : [ip, '%', opts.windowSeconds],
      );
      const attempts = Number(count);
      if (attempts >= opts.maxAttempts) {
        const retryAfter = opts.windowSeconds;
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-RateLimit-Limit', String(opts.maxAttempts));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + retryAfter));
        return res.status(429).json({
          error: 'Demasiados intentos. Reintentá en unos minutos.',
          code: 'RATE_LIMITED',
          retryAfter,
        });
      }
      next();
    } catch (err) {
      console.error('[rateLimit] error:', err);
      next(); // nunca bloquear por error del rate limit (degrade graceful)
    }
  };
}
```

### Aplicación al endpoint

```typescript
// server/routes/auth.ts
router.post('/login',
  rateLimit({ windowSeconds: 15 * 60, maxAttempts: 5, scope: 'ip+email' }),
  rateLimit({ windowSeconds: 15 * 60, maxAttempts: 20, scope: 'ip' }),
  async (req, res) => { /* ... login existente */ },
);

// Después del login exitoso, INSERT el attempt con success=1 y soft-clear los previos:
router.post('/login', /* ... middlewares ... */ async (req, res) => {
  // ... después de verificar credenciales OK ...
  await pool.query(
    `UPDATE login_attempts SET cleared_at = NOW()
     WHERE ip = ? AND email = ? AND success = 0 AND cleared_at IS NULL`,
    [req.ip, email],
  );
  await pool.query(
    `INSERT INTO login_attempts (ip, email, success, window_start)
     VALUES (?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE success = 1`,
    [req.ip, email, windowStart],
  );
  // ... setear cookie etc ...
});
```

### Archivos a crear (nuevos)
- `db/mysql/migrations/014_login_attempts.sql`
- `server/middleware/rateLimit.ts`
- `scripts/apply-014-migration.mjs`
- `tests/rateLimit.test.ts`

### Archivos a modificar
- `server/routes/auth.ts` — agregar 2 middlewares + INSERT/UPDATE en login exitoso.
- `package.json` — script `test` incluye `rateLimit.test.ts`.

### Archivos a NO tocar
- `src/**` (es cambio backend puro).
- `tests/**` excepto el nuevo `rateLimit.test.ts`.

## 5. Timeouts

- bcrypt compare: ~100ms (sin cambios).
- Rate limit query: ~10ms (índice `idx_ip_email`).
- Total: ~120ms por login fallido, sin impacto perceptible.

## 6. Tostadas (cliente)

El cliente NO necesita toasts nuevos — el 429 ya tiene un mensaje
"Demasiados intentos" en el JSON. El `authStore` o el componente
de Login debe mostrar:

| Trigger (cliente) | Tipo | Copy exacto |
|---|---|---|
| Fetch devuelve 429 | warning | "Demasiados intentos. Esperá unos minutos." |

(Esto se puede hacer después; este spec no lo obliga.)

## 7. Dependencias

- Ninguna nueva.

## 8. Out of Scope

- ❌ **CAPTCHA** después de N fallos (futuro).
- ❌ **Lockout por email** (este spec solo hace IP+email e IP).
- ❌ **2FA / TOTP** — futuro.
- ❌ **Bypass por VPN/proxy** corporativo — fuera de scope.
- ❌ **API de "desbloquear cuenta"** — manual con `UPDATE login_attempts SET cleared_at=NOW()`.
- ❌ **Tests E2E del cliente** (LoginScreen UI) — solo backend.

## 9. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Bloquear usuarios legítimos | Media | Alta | Reset tras login OK (AC-4) + ventana 15min |
| Tabla crece mucho | Media | Baja | Cleanup lazy cada N inserts (AC-8) |
| Race condition en INSERT | Baja | Baja | UNIQUE constraint (AC-1) |
| Admin bloqueado accidentalmente | Baja | Alta | `npm run sql` puede `UPDATE login_attempts SET cleared_at=NOW()` |

## 10. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** —
**Fecha de aprobación:** —

> Spec relacionado: `AUTH.md` §11 (out of scope: rate limit) +
> `AUTH.md` §EC-8 (fuerza bruta).

---

> **Recordatorio Karpathy**: una vez aprobado, sigue
> `tests/verifiers/fix-issue-rate-limit-auth-login.md`. NO escribir
> código de implementación hasta que el spec esté aprobado Y el
> verifier también.