import { createRequire as __cR } from 'module';
const require = __cR(import.meta.url);

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/db.ts
var db_exports = {};
__export(db_exports, {
  checkDb: () => checkDb,
  default: () => db_default,
  ensureDefaultOrg: () => ensureDefaultOrg
});
import dotenv from "dotenv";
import mysql from "mysql2/promise";
async function checkDb() {
  try {
    const [rows] = await pool.query("SELECT VERSION() AS v");
    const v = rows[0]?.v;
    return { ok: true, version: v };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}
async function ensureDefaultOrg() {
  const [rows] = await pool.query(
    "SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1"
  );
  const list = rows;
  if (list.length > 0) return list[0].id;
  const id = cryptoRandomUUID();
  await pool.query(
    `INSERT INTO organizations (id, name, nit, created_by)
     VALUES (?, ?, ?, ?)`,
    [id, "InmoControl Default", null, "system"]
  );
  return id;
}
function cryptoRandomUUID() {
  return globalThis.crypto.randomUUID();
}
var pool, db_default;
var init_db = __esm({
  "server/db.ts"() {
    dotenv.config();
    dotenv.config({ path: ".env.local", override: true });
    if (process.env.NODE_ENV === "production" && (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === "")) {
      console.error(
        "[server] FATAL: DB_PASSWORD no configurado. Definilo en el panel de Hostinger antes de continuar."
      );
      process.exit(1);
    }
    pool = mysql.createPool({
      host: process.env.DB_HOST ?? "127.0.0.1",
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER ?? "root",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "inmocontrol",
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_LIMIT ?? 10),
      // Auditoría Hostinger (oct-2026): `queueLimit: 0` = cola infinita. Si MySQL
      // se pone lento, las requests se apilan en RAM hasta tumbar el proceso. Con
      // tope, el excedente falla rápido en vez de arrastrar todo.
      queueLimit: Number(process.env.DB_QUEUE_LIMIT ?? 100),
      connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 1e4),
      // Keep-alive: evita que un firewall/NAT corte conexiones ociosas y el pool
      // reparta sockets muertos (ECONNRESET intermitente en prod).
      enableKeepAlive: true,
      keepAliveInitialDelay: 1e4,
      dateStrings: true,
      // devuelve DATE/DATETIME como string ISO en lugar de Date
      decimalNumbers: true
      // DECIMAL → number (no string)
    });
    db_default = pool;
  }
});

// server.ts
import express6 from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";

// server/lib/asyncHandler.ts
var asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// server/lib/errors.ts
var AppError = class extends Error {
  constructor(statusCode, message, code, expose = false) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
    this.name = "AppError";
  }
};
var badRequest = (m, c = "BAD_REQUEST") => new AppError(400, m, c, true);
var conflict = (m, c = "CONFLICT") => new AppError(409, m, c, true);
var payloadTooLarge = (m, c = "PAYLOAD_TOO_LARGE") => new AppError(413, m, c, true);
var internal = (code = "INTERNAL") => new AppError(500, "Internal server error", code, false);
var internalExpose = (m, c = "INTERNAL") => new AppError(500, m, c, true);

// server/lib/errorHandler.ts
function errorHandler(err, req, res, next) {
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({
      error: err.message ?? "Invalid JSON body",
      code: "INVALID_JSON"
    });
    return;
  }
  if (res.headersSent) {
    return;
  }
  let statusCode;
  let code;
  let message;
  let isAppError = false;
  if (err instanceof AppError) {
    isAppError = true;
    statusCode = err.statusCode;
    code = err.code;
    message = err.expose ? err.message : "Internal server error";
  } else {
    statusCode = err?.statusCode ?? err?.status ?? 500;
    code = statusCode >= 500 ? "INTERNAL" : err?.code ?? (statusCode >= 500 ? "INTERNAL" : "CLIENT_ERROR");
    const expose = statusCode < 500 || err?.expose === true;
    message = expose ? err?.message ?? "Internal server error" : "Internal server error";
  }
  if (statusCode >= 500) {
    console.error(
      `[errorHandler] ${req.method} ${req.path} \u2192 ${statusCode} (code=${code}, msg=${err?.message ?? "(no msg)"}, stack=${err?.stack ? "presente" : "ausente"}, appError=${isAppError})`
    );
  } else {
    console.warn(
      `[errorHandler] ${req.method} ${req.path} \u2192 ${statusCode} (code=${code}, msg=${message})`
    );
  }
  res.status(statusCode).json({
    error: message,
    code
  });
}

// server.ts
import { fileURLToPath } from "url";

// server/routes/entities.ts
init_db();
import { Router as Router2 } from "express";
import crypto2 from "crypto";

// server/lib/orgContext.ts
init_db();
var SEED_ADMIN_PROFILE_ID = "00000000-0000-0000-0000-000000000005";
async function getOrgIdForRequest(req) {
  const user = req.user;
  if (user?.organizationId) {
    const isAdmin = user.role === "admin" && user.id === SEED_ADMIN_PROFILE_ID;
    return {
      orgId: user.organizationId,
      isAdmin,
      isLegacySession: false
    };
  }
  if (user) {
    return {
      orgId: "",
      // vacío a propósito — el caller debe rechazar.
      isAdmin: false,
      isLegacySession: true
    };
  }
  const orgId = await ensureDefaultOrg();
  return {
    orgId,
    isAdmin: true,
    // treat as admin in fallback
    isLegacySession: false
  };
}

// server/routes/auth.ts
init_db();
import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// server/middleware/rateLimit.ts
init_db();
var warnedAboutAttemptsColumn = false;
function rateLimit(opts) {
  return async (req, res, next) => {
    if (process.env.NODE_ENV === "test") {
      next();
      return;
    }
    const ip = req.ip ?? "0.0.0.0";
    const email = (req.body?.email ?? "").toLowerCase().trim();
    if (opts.scope === "ip+email" && !email) {
      next();
      return;
    }
    try {
      const [rows] = await db_default.query(
        `SELECT COALESCE(SUM(attempts), 0) AS count FROM login_attempts
         WHERE ip = ?
           ${opts.scope === "ip+email" ? "AND email = ?" : ""}
           AND success = 0
           AND cleared_at IS NULL
           AND attempted_at >= NOW() - INTERVAL ? SECOND`,
        opts.scope === "ip+email" ? [ip, email, opts.windowSeconds] : [ip, opts.windowSeconds]
      );
      const attempts = Number(rows?.[0]?.count ?? 0);
      if (attempts >= opts.maxAttempts) {
        const retryAfter = opts.windowSeconds;
        res.setHeader("Retry-After", String(retryAfter));
        res.setHeader("X-RateLimit-Limit", String(opts.maxAttempts));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader(
          "X-RateLimit-Reset",
          String(Math.floor(Date.now() / 1e3) + retryAfter)
        );
        console.warn(
          `[rateLimit] Blocked ${opts.scope} ip=${ip} email=${email} attempts=${attempts}`
        );
        res.status(429).json({
          error: "Demasiados intentos. Reintent\xE1 en unos minutos.",
          code: "RATE_LIMITED",
          retryAfter
        });
        return;
      }
      next();
    } catch (err) {
      console.error("[rateLimit] error degradando a allow:", err?.message);
      next();
    }
  };
}
async function clearFailedAttempts(ip, email) {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return;
  try {
    await db_default.query(
      `UPDATE login_attempts SET cleared_at = NOW()
       WHERE ip = ? AND email = ? AND success = 0 AND cleared_at IS NULL`,
      [ip, normalizedEmail]
    );
  } catch (err) {
    console.warn("[rateLimit] clearFailedAttempts no cr\xEDtico:", err?.message);
  }
}
async function recordAttempt(ip, email, success) {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return;
  const windowStart = Math.floor(Date.now() / 1e3 / 900) * 900;
  try {
    await db_default.query(
      `INSERT INTO login_attempts (ip, email, success, attempts, window_start, attempted_at)
       VALUES (?, ?, ?, 1, ?, NOW())
       ON DUPLICATE KEY UPDATE
         -- Orden de asignaci\xF3n importa en MySQL (se eval\xFAa de izquierda a
         -- derecha): success y cleared_at ac\xE1 todav\xEDa tienen el valor VIEJO.
         attempts     = IF(VALUES(success) = 1, 1,
                           IF(success = 1 OR cleared_at IS NOT NULL, 1, attempts + 1)),
         success      = VALUES(success),
         attempted_at = NOW(),
         -- Un fallo nuevo reabre la fila; si el intento fue exitoso dejamos
         -- cleared_at como est\xE9 (lo setea clearFailedAttempts).
         cleared_at   = IF(VALUES(success) = 1, cleared_at, NULL)`,
      [ip, normalizedEmail, success ? 1 : 0, windowStart]
    );
  } catch (err) {
    if (err?.code === "ER_BAD_FIELD_ERROR") {
      if (!warnedAboutAttemptsColumn) {
        warnedAboutAttemptsColumn = true;
        console.error(
          "[rateLimit] FALTA migraci\xF3n 017 (login_attempts.attempts). El l\xEDmite de intentos queda desactivado hasta aplicarla: node scripts/apply-017-migration.mjs"
        );
      }
      try {
        await db_default.query(
          `INSERT INTO login_attempts (ip, email, success, window_start)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE success = VALUES(success)`,
          [ip, normalizedEmail, success ? 1 : 0, windowStart]
        );
      } catch (legacyErr) {
        console.warn("[rateLimit] recordAttempt (legacy) no cr\xEDtico:", legacyErr?.message);
      }
      return;
    }
    console.warn("[rateLimit] recordAttempt no cr\xEDtico:", err?.message);
  }
}

// server/routes/auth.ts
var router = Router();
var sessions = /* @__PURE__ */ new Map();
function purgeExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > COOKIE_MAX_AGE_MS) sessions.delete(id);
  }
}
var COOKIE_NAME = "inmocontrol_pilot_session";
var COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1e3;
function setSessionCookie(res, sessionId) {
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    // En producción (NODE_ENV=production), la cookie SOLO viaja por HTTPS.
    // En dev (NODE_ENV=development) sigue yendo por HTTP para que funcione
    // sin TLS en localhost. Si despliegas con HTTPS fuera de production,
    // ajusta manualmente.
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/"
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}
var SESSIONS = sessions;
function requireAuth(req, res, next) {
  const sessionId = req.cookies?.[COOKIE_NAME];
  if (!sessionId) {
    return res.status(401).json({ error: "No autenticado", code: "NO_SESSION" });
  }
  const session = sessions.get(sessionId);
  if (session && Date.now() - session.createdAt > COOKIE_MAX_AGE_MS) {
    sessions.delete(sessionId);
    clearSessionCookie(res);
    return res.status(401).json({ error: "Sesi\xF3n expirada", code: "SESSION_EXPIRED" });
  }
  if (!session) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Sesi\xF3n expirada", code: "SESSION_EXPIRED" });
  }
  req.user = {
    id: session.profileId,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
    organizationId: session.organizationId
  };
  if (!session.organizationId) {
    return res.status(401).json({
      error: "Sesi\xF3n inv\xE1lida",
      code: "SESSION_MISSING_ORG"
    });
  }
  next();
}
router.post(
  "/login",
  // fix-issue-rate-limit-auth-login: dos middlewares (per-IP+email y per-IP).
  rateLimit({ windowSeconds: 15 * 60, maxAttempts: 5, scope: "ip+email" }),
  rateLimit({ windowSeconds: 15 * 60, maxAttempts: 20, scope: "ip" }),
  // BUG (auditoría Hostinger, oct-2026): este handler era `async` SIN
  // asyncHandler. Un `throw` (ej: MySQL caído) se escapaba como
  // unhandledRejection y la request quedaba colgada sin respuesta: el usuario
  // veía "cargando" para siempre y el socket quedaba retenido. Con
  // asyncHandler el error va al errorHandler central y devuelve JSON.
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip ?? "0.0.0.0";
    if (!email || !password) {
      return res.status(400).json({
        error: "email y password son requeridos",
        code: "MISSING_FIELDS"
      });
    }
    const normalizedEmail = email.toLowerCase().trim();
    try {
      const [rows] = await db_default.query(
        `SELECT id, organization_id, display_name, email, role, password_hash
         FROM profiles
         WHERE email = ?
         LIMIT 1`,
        [normalizedEmail]
      );
      if (rows.length === 0) {
        await recordAttempt(ip, normalizedEmail, false);
        return res.status(401).json({
          error: "Credenciales inv\xE1lidas",
          code: "INVALID_CREDENTIALS"
        });
      }
      const user = rows[0];
      if (!user.password_hash) {
        console.warn(
          `[auth] Usuario ${email} sin password_hash \u2014 login rechazado`
        );
        await recordAttempt(ip, normalizedEmail, false);
        return res.status(401).json({ error: "Credenciales inv\xE1lidas", code: "NO_PASSWORD_SET" });
      }
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        await recordAttempt(ip, normalizedEmail, false);
        return res.status(401).json({
          error: "Credenciales inv\xE1lidas",
          code: "INVALID_CREDENTIALS"
        });
      }
      await clearFailedAttempts(ip, normalizedEmail);
      await recordAttempt(ip, normalizedEmail, true);
      purgeExpiredSessions();
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        profileId: user.id,
        organizationId: user.organization_id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        createdAt: Date.now()
      });
      setSessionCookie(res, sessionId);
      console.log(`[auth] Login OK: ${email} (role=${user.role})`);
      return res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          role: user.role,
          organizationId: user.organization_id
        }
      });
    } catch (err) {
      console.error("[auth] login error:", err);
      throw err;
    }
  })
);
router.post("/logout", (req, res) => {
  const sessionId = req.cookies?.[COOKIE_NAME];
  if (sessionId) sessions.delete(sessionId);
  clearSessionCookie(res);
  return res.json({ ok: true });
});
router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});
var auth_default = router;

// server/lib/permissions.ts
var ROLE_PERMISSIONS = {
  admin: {
    canAddProperty: true,
    canEditProperty: true,
    canDeleteProperty: true,
    canAddTenant: true,
    canEditTenant: true,
    canDeleteTenant: true,
    canAddFinancial: true,
    canDeleteFinancial: true,
    canAddContract: true,
    canEditContract: true,
    canDeleteContract: true,
    canAddInventory: true,
    canEditInventory: true,
    canDeleteInventory: true,
    canSendInvoice: true,
    canRegisterPayment: true,
    canViewOwnerStatement: true,
    canRegisterOwnerPayout: true,
    canManageDrive: true,
    canManageNotifications: true,
    canManageSaasBilling: true,
    canViewReports: true,
    canViewSettings: true,
    canManageOrgUsers: true,
    canInviteUsers: true,
    canChangeMemberRole: true
  },
  gestor: {
    canAddProperty: true,
    canEditProperty: true,
    canDeleteProperty: false,
    canAddTenant: true,
    canEditTenant: true,
    canDeleteTenant: false,
    canAddFinancial: true,
    canDeleteFinancial: false,
    canAddContract: true,
    canEditContract: true,
    canDeleteContract: false,
    canAddInventory: false,
    canEditInventory: false,
    canDeleteInventory: false,
    canSendInvoice: false,
    canRegisterPayment: false,
    canViewOwnerStatement: true,
    canRegisterOwnerPayout: false,
    canManageDrive: true,
    canManageNotifications: true,
    canManageSaasBilling: false,
    canViewReports: true,
    canViewSettings: false,
    canManageOrgUsers: false,
    canInviteUsers: false,
    canChangeMemberRole: false
  },
  propietario: {
    canAddProperty: true,
    canEditProperty: true,
    canDeleteProperty: false,
    canAddTenant: false,
    canEditTenant: false,
    canDeleteTenant: false,
    canAddFinancial: true,
    canDeleteFinancial: false,
    canAddContract: true,
    canEditContract: true,
    canDeleteContract: false,
    canAddInventory: false,
    canEditInventory: false,
    canDeleteInventory: false,
    canSendInvoice: false,
    canRegisterPayment: false,
    canViewOwnerStatement: true,
    canRegisterOwnerPayout: false,
    canManageDrive: true,
    canManageNotifications: true,
    canManageSaasBilling: false,
    canViewReports: true,
    canViewSettings: false,
    canManageOrgUsers: false,
    canInviteUsers: false,
    canChangeMemberRole: false
  },
  inquilino: {
    canAddProperty: false,
    canEditProperty: false,
    canDeleteProperty: false,
    canAddTenant: false,
    canEditTenant: false,
    canDeleteTenant: false,
    canAddFinancial: false,
    canDeleteFinancial: false,
    canAddContract: false,
    canEditContract: false,
    canDeleteContract: false,
    canAddInventory: false,
    canEditInventory: false,
    canDeleteInventory: false,
    canSendInvoice: false,
    canRegisterPayment: false,
    canViewOwnerStatement: false,
    canRegisterOwnerPayout: false,
    canManageDrive: false,
    canManageNotifications: false,
    canManageSaasBilling: false,
    canViewReports: false,
    canViewSettings: false,
    canManageOrgUsers: false,
    canInviteUsers: false,
    canChangeMemberRole: false
  }
};
function can(role, action) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[action] ?? false;
}

// server/middleware/requireRole.ts
function requireRole(action) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "No autenticado", code: "NO_SESSION" });
      return;
    }
    const role = user.role;
    if (!can(role, action)) {
      console.warn(
        `[authz] Forbidden: user=${user.email} role=${role} action=${action} path=${req.method} ${req.originalUrl}`
      );
      res.status(403).json({
        error: "No ten\xE9s permiso para esta acci\xF3n",
        code: "FORBIDDEN",
        action,
        userRole: role
      });
      return;
    }
    next();
  };
}

// server/routes/entities.ts
var router2 = Router2();
router2.use(requireAuth);
router2.post(
  "/sync",
  asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const result = {
      organizations: 0,
      properties: 0,
      tenants: 0,
      contracts: 0
    };
    for (const org of payload.organizations ?? []) {
      await db_default.query(
        `INSERT INTO organizations (id, name, nit, address, phone, website, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         nit = VALUES(nit),
         address = VALUES(address),
         phone = VALUES(phone),
         website = VALUES(website)`,
        [
          org.id,
          org.name,
          org.nit ?? null,
          org.address ?? null,
          org.phone ?? null,
          org.website ?? null,
          org.createdBy ?? null
        ]
      );
      result.organizations++;
    }
    for (const p of payload.properties ?? []) {
      await db_default.query(
        `INSERT INTO properties
         (id, organization_id, address, chip, folio,
          owner_name, owner_id_number, owner_phone, owner_email,
          status, archived, archived_at, archived_reason,
          mandato_pdf_url, mandato_signed_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         address         = VALUES(address),
         chip            = VALUES(chip),
         folio           = VALUES(folio),
         owner_name      = VALUES(owner_name),
         owner_id_number = VALUES(owner_id_number),
         owner_phone     = VALUES(owner_phone),
         owner_email     = VALUES(owner_email),
         status          = VALUES(status),
         archived        = VALUES(archived),
         archived_at     = VALUES(archived_at),
         archived_reason = VALUES(archived_reason),
         mandato_pdf_url = VALUES(mandato_pdf_url),
         mandato_signed_at = VALUES(mandato_signed_at)`,
        [
          p.id,
          orgId,
          p.address,
          p.chip ?? null,
          p.folio ?? null,
          p.ownerName ?? p.owner_name ?? "(sin nombre)",
          p.ownerIdNumber ?? p.owner_id_number ?? null,
          p.ownerPhone ?? p.owner_phone ?? null,
          p.ownerEmail ?? p.owner_email ?? null,
          p.status ?? "available",
          p.archived ? 1 : 0,
          p.archivedAt ?? p.archived_at ?? null,
          p.archivedReason ?? p.archived_reason ?? null,
          p.mandatoPdfUrl ?? p.mandato_pdf_url ?? null,
          p.mandatoSignedAt ?? p.mandato_signed_at ?? null,
          p.createdBy ?? p.created_by ?? null
        ]
      );
      result.properties++;
    }
    for (const t of payload.tenants ?? []) {
      await db_default.query(
        `INSERT INTO tenants (id, organization_id, property_id, name, document_id, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         property_id = VALUES(property_id),
         name        = VALUES(name),
         email       = VALUES(email),
         phone       = VALUES(phone)`,
        [
          t.id,
          orgId,
          t.propertyId ?? t.property_id ?? null,
          t.name,
          t.documentId ?? t.document_id ?? "",
          t.email ?? null,
          t.phone ?? null
        ]
      );
      result.tenants++;
    }
    for (const c of payload.contracts ?? []) {
      await upsertContract(orgId, c);
      result.contracts++;
    }
    res.json({ ok: true, orgId, synced: result });
  })
);
router2.get(
  "/properties",
  asyncHandler(async (_req, res) => {
    const [rows] = await db_default.query(
      `SELECT * FROM properties WHERE archived = 0 ORDER BY created_at DESC`
    );
    res.json(rows);
  })
);
router2.get(
  "/properties/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await db_default.query(`SELECT * FROM properties WHERE id = ?`, [
      req.params.id
    ]);
    const list = rows;
    if (list.length === 0) return res.status(404).json({ error: "not found" });
    res.json(list[0]);
  })
);
router2.get(
  "/tenants",
  asyncHandler(async (_req, res) => {
    const [rows] = await db_default.query(`SELECT * FROM tenants ORDER BY name`);
    res.json(rows);
  })
);
router2.get(
  "/contracts",
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const tenantId = req.query.tenantId;
    const propertyId = req.query.propertyId;
    const where = ["organization_id = ?"];
    const values = [orgId];
    if (tenantId) {
      where.push("tenant_id = ?");
      values.push(tenantId);
    }
    if (propertyId) {
      where.push("property_id = ?");
      values.push(propertyId);
    }
    const sql = `SELECT * FROM contracts WHERE ${where.join(" AND ")} ORDER BY start_date DESC`;
    const [rows] = await db_default.query(sql, values);
    res.json(rows);
  })
);
router2.get(
  "/contracts/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await db_default.query(`SELECT * FROM contracts WHERE id = ?`, [
      req.params.id
    ]);
    const list = rows;
    if (list.length === 0) return res.status(404).json({ error: "not found" });
    res.json(list[0]);
  })
);
router2.delete(
  "/contracts/:id",
  requireRole("canDeleteContract"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const delCtx = await getOrgIdForRequest(req);
    if (delCtx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = delCtx.orgId;
    try {
      const [deps] = await db_default.query(
        `SELECT
         (SELECT COUNT(*) FROM amortization_rows WHERE contract_id = ?) AS amort_count,
         (SELECT COUNT(*) FROM rent_invoices WHERE contract_id = ?) AS invoice_count`,
        [id, id]
      );
      const d = deps[0] ?? { amort_count: 0, invoice_count: 0 };
      if (d.amort_count > 0 || d.invoice_count > 0) {
        return res.status(409).json({
          error: "No se puede eliminar el contrato porque tiene datos asociados.",
          details: {
            amortizationRows: d.amort_count,
            invoices: d.invoice_count
          },
          hint: "Primero anul\xE1 los recibos en el m\xF3dulo Billing."
        });
      }
      const [result] = await db_default.query(
        `DELETE FROM contracts WHERE id = ? AND organization_id = ?`,
        [id, orgId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Contrato no encontrado" });
      }
      res.json({ success: true });
    } catch (err) {
      if (err.code === "ER_ROW_IS_REFERENCED_2") {
        console.warn(
          "[entities/contracts DELETE] FK violation (race condition):",
          err.message
        );
        return res.status(409).json({
          error: "No se puede eliminar el contrato porque tiene datos asociados.",
          hint: "Primero anul\xE1 los recibos en el m\xF3dulo Billing."
        });
      }
      throw err;
    }
  })
);
router2.post(
  "/contracts",
  requireRole("canAddContract"),
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const body = req.body ?? {};
    const bodyOrgId = body.organizationId;
    if (bodyOrgId && bodyOrgId !== orgId) {
      return res.status(403).json({
        error: "No pod\xE9s crear recursos en otra organizaci\xF3n",
        code: "CROSS_TENANT_FORBIDDEN"
      });
    }
    if (!body.propertyId && !body.property_id) {
      return res.status(400).json({ error: "propertyId es requerido" });
    }
    if (!body.startDate && !body.start_date) {
      return res.status(400).json({ error: "startDate es requerido" });
    }
    if (!body.endDate && !body.end_date) {
      return res.status(400).json({ error: "endDate es requerido" });
    }
    const contractId = body.id ?? crypto2.randomUUID();
    const propertyId = body.propertyId ?? body.property_id;
    const [propRows] = await db_default.query(
      "SELECT id FROM properties WHERE id = ?",
      [propertyId]
    );
    if (propRows.length === 0) {
      return res.status(400).json({ error: `La propiedad ${propertyId} no existe` });
    }
    const tenantId = body.tenantId ?? body.tenant_id ?? null;
    if (tenantId) {
      const [tenantRows] = await db_default.query(
        "SELECT id FROM tenants WHERE id = ?",
        [tenantId]
      );
      if (tenantRows.length === 0) {
        return res.status(400).json({ error: `El inquilino ${tenantId} no existe` });
      }
    }
    const c = { ...body, id: contractId };
    await upsertContract(orgId, c);
    const [rows] = await db_default.query(
      "SELECT * FROM contracts WHERE id = ?",
      [contractId]
    );
    res.status(201).json({ contract: rows[0] });
  })
);
router2.patch(
  "/contracts/:id",
  requireRole("canEditContract"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body ?? {};
    const errors = [];
    const validStatuses = [
      "active",
      "ended",
      "pending",
      "cancelled",
      "renewed"
    ];
    if (body.status !== void 0 && !validStatuses.includes(body.status)) {
      errors.push({
        field: "status",
        code: "INVALID_ENUM",
        message: `status debe ser uno de: ${validStatuses.join(", ")}`
      });
    }
    if (body.rentAmount !== void 0) {
      const n = Number(body.rentAmount);
      if (isNaN(n) || n < 0) {
        errors.push({
          field: "rentAmount",
          code: "NEGATIVE",
          message: "rentAmount debe ser un n\xFAmero >= 0"
        });
      }
    }
    if (body.adminFee !== void 0) {
      const n = Number(body.adminFee);
      if (isNaN(n) || n < 0) {
        errors.push({
          field: "adminFee",
          code: "NEGATIVE",
          message: "adminFee debe ser un n\xFAmero >= 0"
        });
      }
    }
    if (body.commissionPct !== void 0) {
      const n = Number(body.commissionPct);
      if (isNaN(n) || n < 0 || n > 100) {
        errors.push({
          field: "commissionPct",
          code: "INVALID_TYPE",
          message: "commissionPct debe estar entre 0 y 100"
        });
      }
    }
    if (body.insurancePct !== void 0) {
      const n = Number(body.insurancePct);
      if (isNaN(n) || n < 0 || n > 100) {
        errors.push({
          field: "insurancePct",
          code: "INVALID_TYPE",
          message: "insurancePct debe estar entre 0 y 100"
        });
      }
    }
    if (body.startDate !== void 0 && body.endDate !== void 0) {
      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push({
          field: "startDate",
          code: "INVALID_DATE",
          message: "startDate / endDate deben ser fechas v\xE1lidas ISO"
        });
      } else if (start > end) {
        errors.push({
          field: "endDate",
          code: "INVALID_DATE",
          message: "endDate debe ser >= startDate"
        });
      }
    } else if (body.startDate !== void 0) {
      if (isNaN(new Date(body.startDate).getTime())) {
        errors.push({
          field: "startDate",
          code: "INVALID_DATE",
          message: "startDate debe ser fecha v\xE1lida ISO"
        });
      }
    } else if (body.endDate !== void 0) {
      if (isNaN(new Date(body.endDate).getTime())) {
        errors.push({
          field: "endDate",
          code: "INVALID_DATE",
          message: "endDate debe ser fecha v\xE1lida ISO"
        });
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }
    const fieldMap = {
      rentAmount: "rent_amount",
      adminFee: "admin_fee",
      commissionPct: "commission_pct",
      insurancePct: "insurance_pct",
      startDate: "start_date",
      endDate: "end_date",
      noticeDate: "notice_date",
      status: "status",
      renewalStrategy: "renewal_strategy",
      inventoryEndRequired: "inventory_end_required",
      notes: "notes",
      contractPdfUrl: "contract_pdf_url",
      signedAt: "signed_at",
      propertyId: "property_id",
      tenantId: "tenant_id"
    };
    const updates = [];
    const values = [];
    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (body[camel] !== void 0) {
        updates.push(`${snake} = ?`);
        values.push(body[camel]);
      }
    }
    if (updates.length === 0) {
      return res.json({ success: true, message: "Nothing to update" });
    }
    const patchCtx = await getOrgIdForRequest(req);
    if (patchCtx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = patchCtx.orgId;
    try {
      values.push(id, orgId);
      const [result] = await db_default.query(
        `UPDATE contracts SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
        values
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Contrato no encontrado" });
      }
      const [rows] = await db_default.query(
        "SELECT * FROM contracts WHERE id = ?",
        [id]
      );
      res.json({ contract: rows[0] });
    } catch (err) {
      if (err.code === "ER_NO_REFERENCED_ROW_2") {
        return res.status(400).json({
          error: "FK violation",
          field: "propertyId o tenantId no existe"
        });
      }
      throw err;
    }
  })
);
async function upsertContract(orgId, c) {
  await db_default.query(
    `INSERT INTO contracts
       (id, organization_id, property_id, tenant_id,
        rent_amount, admin_fee, commission_pct, insurance_pct,
        start_date, end_date, notice_date,
        status, renewal_strategy, inventory_end_required, notes,
        contract_pdf_url, signed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rent_amount     = VALUES(rent_amount),
       admin_fee       = VALUES(admin_fee),
       commission_pct  = VALUES(commission_pct),
       insurance_pct   = VALUES(insurance_pct),
       start_date      = VALUES(start_date),
       end_date        = VALUES(end_date),
       notice_date     = VALUES(notice_date),
       status          = VALUES(status),
       renewal_strategy = VALUES(renewal_strategy),
       inventory_end_required = VALUES(inventory_end_required),
       notes           = VALUES(notes),
       contract_pdf_url = VALUES(contract_pdf_url),
       signed_at       = VALUES(signed_at)`,
    [
      c.id,
      orgId,
      c.propertyId ?? c.property_id,
      c.tenantId ?? c.tenant_id ?? null,
      Number(c.rentAmount ?? c.rent_amount ?? 0),
      Number(c.adminFee ?? c.admin_fee ?? 0),
      Number(c.commissionPct ?? c.commission_pct ?? 8),
      Number(c.insurancePct ?? c.insurance_pct ?? 0),
      c.startDate ?? c.start_date,
      c.endDate ?? c.end_date,
      c.noticeDate ?? c.notice_date ?? null,
      c.status ?? "draft",
      c.renewalStrategy ?? c.renewal_strategy ?? "manual",
      c.inventoryEndRequired ?? c.inventory_end_required ?? 1,
      c.notes ?? null,
      c.contractPdfUrl ?? c.contract_pdf_url ?? null,
      c.signedAt ?? c.signed_at ?? null
    ]
  );
}
var entities_default = router2;

// server/routes/billing.ts
init_db();
import { Router as Router3 } from "express";
import crypto3 from "crypto";

// server/lib/withTransaction.ts
init_db();
async function withTransaction(fn) {
  const conn = await db_default.getConnection();
  try {
    await conn.beginTransaction();
    let result;
    try {
      result = await fn(conn);
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.error(
          "[withTransaction] rollback failed (best-effort):",
          rbErr?.message
        );
      }
      throw err;
    }
    await conn.commit();
    return result;
  } finally {
    conn.release();
  }
}

// src/features/billing/types.ts
function chargeToDiscount(c) {
  return {
    id: c.id,
    propertyId: c.propertyId,
    type: c.type,
    description: c.description,
    amount: c.amount,
    monthPeriod: c.period,
    attachmentUrl: c.attachmentUrl,
    recordedAt: c.recordedAt,
    recordedBy: c.recordedBy
  };
}
function monthsBetween(startISO, endISO) {
  const a = new Date(startISO);
  const b = new Date(endISO);
  const diff = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(1, diff);
}
function toPeriod(dateISO) {
  return dateISO.slice(0, 7);
}
function addMonth(period, n = 1) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function genId(prefix = "") {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// src/features/billing/calculations.ts
function calculateLateFee(p) {
  const { subtotal, paidOnDayOfMonth, graceDay, lateFeeMidPct, lateFeeLatePct } = p;
  if (subtotal <= 0 || paidOnDayOfMonth <= 0) {
    return { pct: 0, amount: 0, bucket: "early" };
  }
  if (paidOnDayOfMonth <= graceDay) {
    return { pct: 0, amount: 0, bucket: "early" };
  }
  if (paidOnDayOfMonth <= 20) {
    const pct2 = lateFeeMidPct;
    return { pct: pct2, amount: Math.round(subtotal * pct2 / 100), bucket: "mid" };
  }
  if (paidOnDayOfMonth <= 31) {
    const pct2 = lateFeeLatePct;
    return { pct: pct2, amount: Math.round(subtotal * pct2 / 100), bucket: "late" };
  }
  const pct = lateFeeLatePct;
  return { pct, amount: Math.round(subtotal * pct / 100), bucket: "expired" };
}
function generateAmortization(contract, policy, options = {}) {
  const months = monthsBetween(contract.startDate, contract.endDate);
  const rows = [];
  const increases = options.increases ?? [];
  const ipcEveryMonths = 12;
  for (let m = 1; m <= months; m++) {
    const periodStart = addMonth(toPeriod(contract.startDate), m - 1) + "-01";
    const periodEnd = endOfMonth(periodStart);
    const ipcApplied = policy.applyAnnualIpc && m > 1 && (m - 1) % ipcEveryMonths === 0;
    const ipcFactor = ipcApplied ? 1 + (policy.expectedIpcPct || 0) / 100 : 1;
    const baseRent = Math.round((policy.rentAmount || contract.rentAmount) * (ipcApplied && policy.applyIpcToAdmin === false ? 1 : ipcFactor));
    const baseAdmin = Math.round((policy.adminFee || contract.adminFee) * ipcFactor);
    const monthIncreases = increases.filter((inc) => inc.effectiveFrom <= toPeriod(periodStart));
    const adminAdjustment = monthIncreases.filter((inc) => inc.type === "admin_change").reduce((sum, inc) => sum + inc.amount, 0);
    const subtotal = baseRent + baseAdmin + adminAdjustment;
    const totalEarly = subtotal;
    const totalMid = subtotal + Math.round(subtotal * (policy.lateFeeMidPct || 0) / 100);
    const totalLate = subtotal + Math.round(subtotal * (policy.lateFeeLatePct || 0) / 100);
    rows.push({
      id: genId("amort-"),
      propertyId: contract.propertyId,
      contractId: contract.id,
      monthNumber: m,
      periodStart,
      periodEnd,
      dueDate: `${toPeriod(periodStart)}-${String(Math.min(policy.graceDay, 28)).padStart(2, "0")}`,
      baseRent,
      baseAdmin,
      adminAdjustment: adminAdjustment || (ipcApplied && policy.applyIpcToAdmin ? baseAdmin - (policy.adminFee || 0) : 0),
      ipcAdjustment: ipcApplied ? subtotal - (policy.rentAmount + policy.adminFee) : 0,
      subtotal,
      appliedLateFeePct: 0,
      lateFeeAmount: 0,
      paidOnDayOfMonth: null,
      total: subtotal,
      totalEarly,
      totalMid,
      totalLate,
      status: "pending"
    });
  }
  return rows;
}
function applyPaymentToRow(row, paidOnDayOfMonth, policy) {
  const fee = calculateLateFee({
    subtotal: row.subtotal,
    paidOnDayOfMonth,
    graceDay: policy.graceDay,
    lateFeeMidPct: policy.lateFeeMidPct,
    lateFeeLatePct: policy.lateFeeLatePct
  });
  return {
    ...row,
    paidOnDayOfMonth,
    appliedLateFeePct: fee.pct,
    lateFeeAmount: fee.amount,
    total: row.subtotal + fee.amount,
    status: "paid",
    paidAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function calculateAccountStatement(propertyId, period, grossIncome, discountsOrCharges) {
  const periodsMatch = (d) => "monthPeriod" in d ? d.monthPeriod === period : d.period === period;
  const discountCandidates = discountsOrCharges.filter(periodsMatch).map((d) => {
    if ("chargedTo" in d) {
      const applies = d.chargedTo === "owner" || d.chargedTo === "both";
      return { amount: applies ? d.amount : 0, kind: "charge", chargedTo: d.chargedTo, raw: d };
    }
    return { amount: d.amount, kind: "discount", raw: d };
  });
  const applicable = discountCandidates.filter((c) => c.amount > 0);
  const totalDiscounts = applicable.reduce((sum, c) => sum + c.amount, 0);
  const discounts = applicable.map(
    (c) => "monthPeriod" in c.raw ? c.raw : chargeToDiscount(c.raw)
  );
  return {
    propertyId,
    period,
    grossIncome,
    totalDiscounts,
    netIncome: Math.max(0, grossIncome - totalDiscounts),
    discounts
  };
}
function generateInvoiceFromRow(row, options) {
  return {
    id: genId("inv-"),
    propertyId: row.propertyId,
    contractId: row.contractId,
    period: toPeriod(row.periodStart),
    dueDate: row.dueDate,
    subtotal: row.subtotal,
    totalEarly: row.totalEarly,
    totalMid: row.totalMid,
    totalLate: row.totalLate,
    status: "pending",
    paymentLink: options?.paymentLink,
    notes: options?.notes
  };
}
function endOfMonth(dateISO) {
  const [y, m] = dateISO.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// src/utils/calculations.ts
var UVT_2026 = 52373;
var IVA_RATE = 0.19;
var GMF_RATE = 4e-3;
var RETEFUENTE_RATURAL = 0.035;
var RETEFUENTE_RJURIDICA = 0.11;
var RETEFUENTE_THRESHOLD_UVT = 27;
var RETEFUENTE_THRESHOLD_COP = RETEFUENTE_THRESHOLD_UVT * UVT_2026;
function calculateMonthlySettlement(inputs) {
  const canon = Math.round(Math.max(0, inputs.canon));
  const admin = Math.round(Math.max(0, inputs.administracionPH));
  const otros = Math.round(Math.max(0, inputs.otrosIngresos));
  const gastos = Math.round(Math.max(0, inputs.gastosOperativos));
  const ingresosBrutos = canon + otros;
  const comision = Math.round(canon * (inputs.comisionPct / 100));
  const ivaSobreComision = Math.round(comision * IVA_RATE);
  const seguro = Math.round(canon * (inputs.seguroPct / 100));
  let retefuente = 0;
  let retefuenteApplied = false;
  if (inputs.ownerTaxType === "juridica") {
    retefuente = Math.round(canon * RETEFUENTE_RJURIDICA);
    retefuenteApplied = true;
  } else if (canon > RETEFUENTE_THRESHOLD_COP) {
    retefuente = Math.round(canon * RETEFUENTE_RATURAL);
    retefuenteApplied = true;
  }
  const descuentosFijos = comision + ivaSobreComision + seguro + retefuente;
  const baseGmf = Math.max(0, ingresosBrutos - descuentosFijos);
  const gmf = Math.round(baseGmf * GMF_RATE);
  const impuestos = ivaSobreComision + retefuente;
  const comisiones = comision;
  const saldoTransferir = Math.round(Math.max(
    0,
    ingresosBrutos - descuentosFijos - gmf - gastos + admin
    // PH se devuelve íntegra
  ));
  const lines = [
    { key: "canon", label: "Canon de arrendamiento", amount: canon, category: "income" },
    ...otros > 0 ? [{ key: "otros", label: "Otros ingresos", amount: otros, category: "income" }] : [],
    ...admin > 0 ? [{ key: "admin", label: "Administraci\xF3n PH (reembolso)", amount: admin, category: "income", legalRef: "Ley 675/2001 art. 30" }] : [],
    { key: "comision", label: `Comisi\xF3n administraci\xF3n (${inputs.comisionPct}%)`, amount: comision, category: "discount" },
    { key: "iva", label: "IVA sobre comisi\xF3n (19%)", amount: ivaSobreComision, category: "tax", legalRef: "ET art. 468" },
    ...seguro > 0 ? [{ key: "seguro", label: `Seguro (${inputs.seguroPct}%)`, amount: seguro, category: "discount" }] : [],
    ...retefuenteApplied ? [{ key: "retefuente", label: `Retenci\xF3n en la fuente (${inputs.ownerTaxType === "juridica" ? "11%" : "3.5%"})`, amount: retefuente, category: "tax", legalRef: "ET art. 383" }] : [],
    { key: "gmf", label: "GMF (4x1000)", amount: gmf, category: "fee", legalRef: "ET art. 871" },
    ...gastos > 0 ? [{ key: "gastos", label: "Gastos operativos", amount: gastos, category: "expense" }] : []
  ];
  return {
    period: inputs.period,
    lines,
    totales: {
      ingresosBrutos,
      descuentosFijos,
      gastosOperativos: gastos,
      impuestos,
      comisiones,
      saldoTransferir
    },
    trace: {
      canon,
      comision,
      ivaSobreComision,
      seguro,
      retefuente,
      gmf,
      baseGmf,
      retefuenteApplied
    },
    closed: inputs.closed
  };
}

// server/routes/billing.ts
var router3 = Router3();
router3.use(requireAuth);
async function loadPolicy(orgId, propertyId) {
  const [rows] = await db_default.query(
    `SELECT * FROM billing_policies WHERE property_id = ? AND organization_id = ?`,
    [propertyId, orgId]
  );
  const list = rows;
  if (list.length === 0) return null;
  const r = list[0];
  const bankAccounts = await loadBankAccounts(orgId, propertyId);
  const policy = r.policy_id ? await loadInsurancePolicy(orgId, propertyId) : null;
  return {
    propertyId: r.property_id,
    rentAmount: Number(r.rent_amount),
    adminFee: Number(r.admin_fee),
    lateFeeMidPct: Number(r.late_fee_mid_pct),
    lateFeeLatePct: Number(r.late_fee_late_pct),
    graceDay: Number(r.grace_day),
    applyAnnualIpc: !!r.apply_annual_ipc,
    expectedIpcPct: Number(r.expected_ipc_pct),
    applyIpcToAdmin: !!r.apply_ipc_to_admin,
    allowAdminChanges: !!r.allow_admin_changes,
    primaryBankAccountId: r.primary_bank_account_id ?? void 0,
    bankAccounts,
    policy: policy ?? void 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by
  };
}
async function loadBankAccounts(orgId, propertyId) {
  const [rows] = await db_default.query(
    `SELECT * FROM bank_accounts WHERE organization_id = ? AND (property_id = ? OR property_id IS NULL) ORDER BY is_primary DESC, created_at ASC`,
    [orgId, propertyId]
  );
  return rows.map((r) => ({
    id: r.id,
    bank: r.bank,
    accountType: r.account_type,
    accountNumber: r.account_number,
    holderName: r.holder_name,
    holderIdNumber: r.holder_id_number,
    isPrimary: !!r.is_primary,
    notes: r.notes ?? void 0
  }));
}
async function loadInsurancePolicy(orgId, propertyId) {
  const [rows] = await db_default.query(
    `SELECT * FROM policies WHERE organization_id = ? AND property_id = ? ORDER BY approved_at DESC LIMIT 1`,
    [orgId, propertyId]
  );
  const list = rows;
  if (list.length === 0) return null;
  const r = list[0];
  return {
    insurer: r.insurer,
    policyNumber: r.policy_number,
    startDate: r.start_date,
    endDate: r.end_date,
    premiumAmount: Number(r.premium_amount),
    approvalPdfDataUrl: r.approval_pdf_url ?? void 0,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
    notes: r.notes ?? void 0
  };
}
function rowToAmortization(r) {
  return {
    id: r.id,
    propertyId: r.property_id,
    contractId: r.contract_id,
    monthNumber: Number(r.month_number),
    periodStart: r.period_start,
    periodEnd: r.period_end,
    dueDate: r.due_date,
    baseRent: Number(r.base_rent),
    baseAdmin: Number(r.base_admin),
    adminAdjustment: Number(r.admin_adjustment),
    ipcAdjustment: Number(r.ipc_adjustment),
    subtotal: Number(r.subtotal),
    appliedLateFeePct: Number(r.applied_late_fee_pct),
    lateFeeAmount: Number(r.late_fee_amount),
    paidOnDayOfMonth: r.paid_on_day_of_month ?? null,
    total: Number(r.total),
    totalEarly: Number(r.total_early),
    totalMid: Number(r.total_mid),
    totalLate: Number(r.total_late),
    status: r.status,
    paidAt: r.paid_at ?? void 0,
    paidAmount: r.paid_amount != null ? Number(r.paid_amount) : void 0
  };
}
router3.get(
  "/policies/:propertyId",
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const policy = await loadPolicy(orgId, req.params.propertyId);
    if (!policy) return res.status(404).json({ error: "not found" });
    res.json(policy);
  })
);
router3.put(
  "/policies/:propertyId",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const propertyId = req.params.propertyId;
    const p = req.body;
    await db_default.query(
      `INSERT INTO billing_policies
         (property_id, organization_id, rent_amount, admin_fee,
          late_fee_mid_pct, late_fee_late_pct, grace_day,
          apply_annual_ipc, expected_ipc_pct, apply_ipc_to_admin,
          allow_admin_changes, primary_bank_account_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         rent_amount           = VALUES(rent_amount),
         admin_fee             = VALUES(admin_fee),
         late_fee_mid_pct      = VALUES(late_fee_mid_pct),
         late_fee_late_pct     = VALUES(late_fee_late_pct),
         grace_day             = VALUES(grace_day),
         apply_annual_ipc      = VALUES(apply_annual_ipc),
         expected_ipc_pct      = VALUES(expected_ipc_pct),
         apply_ipc_to_admin    = VALUES(apply_ipc_to_admin),
         allow_admin_changes   = VALUES(allow_admin_changes),
         primary_bank_account_id = VALUES(primary_bank_account_id)`,
      [
        propertyId,
        orgId,
        Number(p.rentAmount),
        Number(p.adminFee),
        Number(p.lateFeeMidPct),
        Number(p.lateFeeLatePct),
        Number(p.graceDay),
        p.applyAnnualIpc ? 1 : 0,
        Number(p.expectedIpcPct),
        p.applyIpcToAdmin ? 1 : 0,
        p.allowAdminChanges ? 1 : 0,
        p.primaryBankAccountId ?? null,
        p.createdBy ?? "agent"
      ]
    );
    res.json({ ok: true });
  })
);
router3.post(
  "/amortization/generate",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const { contract, policy } = req.body;
    if (!contract?.id || !policy?.propertyId) {
      return res.status(400).json({ error: "contract y policy son requeridos" });
    }
    const [contractRows] = await db_default.query(
      `SELECT id, organization_id, property_id, status
       FROM contracts
       WHERE id = ?
       LIMIT 1`,
      [contract.id]
    );
    if (contractRows.length === 0) {
      return res.status(400).json({
        error: "El contrato con id=" + contract.id + " no existe en el servidor. Recarg\xE1 la p\xE1gina para sincronizar.",
        code: "CONTRACT_NOT_FOUND",
        contractId: contract.id
      });
    }
    if (contractRows[0].organization_id && contractRows[0].organization_id !== orgId) {
      return res.status(403).json({
        error: "El contrato pertenece a otra organizaci\xF3n.",
        code: "CONTRACT_WRONG_ORG"
      });
    }
    const [propertyRows] = await db_default.query(
      `SELECT id FROM properties WHERE id = ? AND organization_id = ? LIMIT 1`,
      [contract.propertyId, orgId]
    );
    if (propertyRows.length === 0) {
      return res.status(400).json({
        error: "La propiedad asociada al contrato no existe. Recarg\xE1 la p\xE1gina.",
        code: "PROPERTY_NOT_FOUND"
      });
    }
    const [incRows] = await db_default.query(
      `SELECT * FROM rent_increases WHERE contract_id = ? ORDER BY effective_from ASC`,
      [contract.id]
    );
    const increases = incRows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      contractId: r.contract_id,
      type: r.type,
      description: r.description,
      amount: Number(r.amount),
      effectiveFrom: r.effective_from,
      recordedAt: r.recorded_at,
      recordedBy: r.recorded_by
    }));
    const rows = generateAmortization(contract, policy, { increases });
    const [paidRowsBefore] = await db_default.query(
      `SELECT COUNT(*) as paid_count FROM amortization_rows WHERE contract_id = ? AND status IN ('paid', 'partial')`,
      [contract.id]
    );
    const paidCount = paidRowsBefore[0]?.paid_count ?? 0;
    if (paidCount > 0) {
      console.warn(
        `[amortization/generate] Regenerando con ${paidCount} pagos existentes preservados.`
      );
    }
    for (const row of rows) {
      await db_default.query(
        `INSERT INTO amortization_rows
           (id, organization_id, property_id, contract_id,
            month_number, period_start, period_end, due_date,
            base_rent, base_admin, admin_adjustment, ipc_adjustment,
            subtotal, applied_late_fee_pct, late_fee_amount,
            total, total_early, total_mid, total_late, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           period_start = VALUES(period_start),
           period_end   = VALUES(period_end),
           due_date     = VALUES(due_date),
           base_rent    = VALUES(base_rent),
           base_admin   = VALUES(base_admin),
           admin_adjustment = VALUES(admin_adjustment),
           ipc_adjustment   = VALUES(ipc_adjustment),
           subtotal     = VALUES(subtotal),
           total        = VALUES(total),
           total_early  = VALUES(total_early),
           total_mid    = VALUES(total_mid),
           total_late   = VALUES(total_late)`,
        [
          row.id,
          orgId,
          row.propertyId,
          row.contractId,
          row.monthNumber,
          row.periodStart,
          row.periodEnd,
          row.dueDate,
          row.baseRent,
          row.baseAdmin,
          row.adminAdjustment,
          row.ipcAdjustment,
          row.subtotal,
          row.appliedLateFeePct,
          row.lateFeeAmount,
          row.total,
          row.totalEarly,
          row.totalMid,
          row.totalLate,
          row.status
        ]
      );
    }
    res.json(rows);
  })
);
router3.get(
  "/amortization/:contractId",
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM amortization_rows
     WHERE contract_id = ? AND organization_id = ?
     ORDER BY month_number ASC`,
      [req.params.contractId, orgId]
    );
    res.json(rows.map(rowToAmortization));
  })
);
router3.get(
  "/amortization",
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM amortization_rows
     WHERE organization_id = ?
     ORDER BY contract_id, month_number ASC`,
      [orgId]
    );
    res.json({ rows: rows.map(rowToAmortization) });
  })
);
router3.post(
  "/payments",
  requireRole("canRegisterPayment"),
  asyncHandler(async (req, res) => {
    const { contractId, rowId, paidOnDayOfMonth } = req.body;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM amortization_rows WHERE id = ? AND contract_id = ?`,
      [rowId, contractId]
    );
    const list = rows;
    if (list.length === 0)
      return res.status(404).json({ error: "row not found" });
    const row = rowToAmortization(list[0]);
    const policy = await loadPolicy(orgId, row.propertyId);
    if (!policy) return res.status(404).json({ error: "policy not found" });
    const updated = applyPaymentToRow(row, paidOnDayOfMonth, policy);
    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE amortization_rows
         SET paid_on_day_of_month = ?,
             applied_late_fee_pct = ?,
             late_fee_amount      = ?,
             total                = ?,
             status               = ?,
             paid_at              = ?,
             paid_amount          = ?
         WHERE id = ?`,
        [
          updated.paidOnDayOfMonth,
          updated.appliedLateFeePct,
          updated.lateFeeAmount,
          updated.total,
          updated.status,
          updated.paidAt ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " "),
          updated.paidAmount ?? updated.total,
          rowId
        ]
      );
      await markInvoicePaid(
        orgId,
        row.propertyId,
        contractId,
        row.periodStart.slice(0, 7),
        updated.total,
        conn
      );
    });
    res.json(updated);
  })
);
async function markInvoicePaid(orgId, propertyId, contractId, period, paidAmount, conn) {
  const q = (sql, params) => conn ? conn.query(sql, params) : db_default.query(sql, params);
  const [existing] = await q(
    `SELECT id FROM rent_invoices WHERE contract_id = ? AND period = ?`,
    [contractId, period]
  );
  if (existing.length > 0) {
    await q(
      `UPDATE rent_invoices
       SET status = 'paid', paid_at = NOW(), paid_amount = ?
       WHERE contract_id = ? AND period = ?`,
      [paidAmount, contractId, period]
    );
    return;
  }
  const [rows] = await q(
    `SELECT * FROM amortization_rows
     WHERE contract_id = ? AND period_start LIKE ? LIMIT 1`,
    [contractId, `${period}%`]
  );
  const list = rows;
  if (list.length === 0) return;
  const row = rowToAmortization(list[0]);
  const [bankRows] = await q(
    `SELECT id FROM bank_accounts WHERE property_id = ? AND is_primary = 1 LIMIT 1`,
    [propertyId]
  );
  const primaryBankId = bankRows[0]?.id ?? null;
  const invoice = generateInvoiceFromRow(row, { paymentLink: primaryBankId });
  await q(
    `INSERT INTO rent_invoices
       (id, organization_id, property_id, contract_id, period,
        due_date, subtotal, total_early, total_mid, total_late, status, paid_at, paid_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', NOW(), ?)`,
    [
      invoice.id,
      orgId,
      propertyId,
      contractId,
      period,
      invoice.dueDate,
      invoice.subtotal,
      invoice.totalEarly,
      invoice.totalMid,
      invoice.totalLate,
      paidAmount
    ]
  );
}
function rowToCharge(r) {
  return {
    id: r.id,
    propertyId: r.property_id,
    period: r.period,
    type: r.type,
    description: r.description,
    amount: Number(r.amount),
    chargedTo: r.charged_to,
    appliesToInvoice: !!r.applies_to_invoice,
    attachmentUrl: r.attachment_url ?? void 0,
    recordedAt: r.recorded_at,
    recordedBy: r.recorded_by
  };
}
var CHARGE_COLS = `(id, organization_id, property_id, period, type,
                       description, amount, charged_to, applies_to_invoice,
                       attachment_url, recorded_by)`;
router3.post(
  "/charges",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const c = req.body;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    await db_default.query(
      `INSERT INTO property_charges
       ${CHARGE_COLS}
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       type = VALUES(type),
       description = VALUES(description),
       amount = VALUES(amount),
       charged_to = VALUES(charged_to),
       applies_to_invoice = VALUES(applies_to_invoice),
       attachment_url = VALUES(attachment_url)`,
      [
        c.id,
        orgId,
        c.propertyId,
        c.period,
        c.type,
        c.description,
        Number(c.amount),
        c.chargedTo ?? "owner",
        c.appliesToInvoice === false ? 0 : 1,
        c.attachmentUrl ?? null,
        c.recordedBy
      ]
    );
    res.json({ ok: true, id: c.id });
  })
);
router3.get(
  "/charges",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const period = req.query.period;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const where = ["organization_id = ?"];
    const args = [orgId];
    if (propertyId) {
      where.push("property_id = ?");
      args.push(propertyId);
    }
    if (period) {
      where.push("period = ?");
      args.push(period);
    }
    const [rows] = await db_default.query(
      `SELECT * FROM property_charges
     WHERE ${where.join(" AND ")}
     ORDER BY period DESC, recorded_at DESC`,
      args
    );
    res.json(rows.map(rowToCharge));
  })
);
router3.delete(
  "/charges/:id",
  requireRole("canDeleteFinancial"),
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [result] = await db_default.query(
      `DELETE FROM property_charges WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    res.json({ ok: true, deleted: result.affectedRows });
  })
);
router3.get(
  "/charges/invoice-summary",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const period = req.query.period;
    if (!propertyId || !period) {
      return res.status(400).json({ error: "propertyId y period son requeridos" });
    }
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM property_charges
     WHERE organization_id = ?
       AND property_id = ?
       AND period = ?
       AND applies_to_invoice = 1
       AND charged_to IN ('tenant','both')
     ORDER BY recorded_at ASC`,
      [orgId, propertyId, period]
    );
    const charges = rows.map(rowToCharge);
    const total = charges.reduce((s, c) => s + c.amount, 0);
    res.json({ propertyId, period, total, charges });
  })
);
router3.post(
  "/discounts",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const d = req.body;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    await db_default.query(
      `INSERT INTO property_discounts
       (id, organization_id, property_id, type, description, amount, month_period, attachment_url, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       type = VALUES(type),
       description = VALUES(description),
       amount = VALUES(amount),
       attachment_url = VALUES(attachment_url)`,
      [
        d.id,
        orgId,
        d.propertyId,
        d.type,
        d.description,
        Number(d.amount),
        d.monthPeriod,
        d.attachmentUrl ?? null,
        d.recordedBy
      ]
    );
    const chargeId = d.id && String(d.id).length <= 36 ? d.id : `disc-${d.id}-${Date.now()}`;
    await db_default.query(
      `INSERT INTO property_charges
       (id, organization_id, property_id, period, type, description,
        amount, charged_to, applies_to_invoice, attachment_url, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', 0, ?, ?)
     ON DUPLICATE KEY UPDATE
       type = VALUES(type),
       description = VALUES(description),
       amount = VALUES(amount),
       attachment_url = VALUES(attachment_url)`,
      [
        chargeId,
        orgId,
        d.propertyId,
        d.monthPeriod,
        d.type,
        d.description,
        Number(d.amount),
        d.attachmentUrl ?? null,
        d.recordedBy
      ]
    );
    res.json({ ok: true, id: d.id });
  })
);
router3.get(
  "/discounts",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = propertyId ? await db_default.query(
      `SELECT * FROM property_discounts WHERE property_id = ? AND organization_id = ? ORDER BY recorded_at DESC`,
      [propertyId, orgId]
    ) : await db_default.query(
      `SELECT * FROM property_discounts WHERE organization_id = ? ORDER BY recorded_at DESC`,
      [orgId]
    );
    res.json(rows);
  })
);
router3.post(
  "/increases",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const i = req.body;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    await db_default.query(
      `INSERT INTO rent_increases
       (id, organization_id, property_id, contract_id, type, description, amount, effective_from, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       type = VALUES(type),
       description = VALUES(description),
       amount = VALUES(amount),
       effective_from = VALUES(effective_from)`,
      [
        i.id,
        orgId,
        i.propertyId,
        i.contractId,
        i.type,
        i.description,
        Number(i.amount),
        i.effectiveFrom,
        i.recordedBy
      ]
    );
    res.json({ ok: true, id: i.id });
  })
);
router3.get(
  "/increases",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = propertyId ? await db_default.query(
      `SELECT * FROM rent_increases WHERE property_id = ? AND organization_id = ? ORDER BY effective_from ASC`,
      [propertyId, orgId]
    ) : await db_default.query(
      `SELECT * FROM rent_increases WHERE organization_id = ? ORDER BY effective_from ASC`,
      [orgId]
    );
    res.json(rows);
  })
);
router3.get(
  "/account-statement",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const period = req.query.period;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [paidRows] = await db_default.query(
      `SELECT COALESCE(SUM(total), 0) AS gross
     FROM amortization_rows
     WHERE property_id = ? AND status = 'paid'
       AND period_start LIKE ?`,
      [propertyId, `${period}%`]
    );
    const grossIncome = Number(paidRows[0]?.gross ?? 0);
    const [chargeRows] = await db_default.query(
      `SELECT * FROM property_charges
     WHERE property_id = ? AND period = ?
       AND charged_to IN ('owner','both')`,
      [propertyId, period]
    );
    let discountsOrCharges = chargeRows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      type: r.type,
      description: r.description,
      amount: Number(r.amount),
      monthPeriod: r.period,
      attachmentUrl: r.attachment_url ?? void 0,
      recordedAt: r.recorded_at,
      recordedBy: r.recorded_by
    }));
    if (discountsOrCharges.length === 0) {
      const [legacyRows] = await db_default.query(
        `SELECT * FROM property_discounts
       WHERE property_id = ? AND month_period = ?`,
        [propertyId, period]
      );
      discountsOrCharges = legacyRows.map((r) => ({
        id: r.id,
        propertyId: r.property_id,
        type: r.type,
        description: r.description,
        amount: Number(r.amount),
        monthPeriod: r.month_period,
        attachmentUrl: r.attachment_url ?? void 0,
        recordedAt: r.recorded_at,
        recordedBy: r.recorded_by
      }));
    }
    const statement = calculateAccountStatement(
      propertyId,
      period,
      grossIncome,
      discountsOrCharges
    );
    res.json(statement);
  })
);
async function generateInvoiceNumber(orgId, propertyId, period) {
  const periodCompact = period.replace("-", "");
  for (let attempt = 1; attempt <= 5; attempt++) {
    const [rows] = await db_default.query(
      `SELECT COUNT(*) AS n FROM rent_invoices
       WHERE organization_id = ? AND property_id = ? AND period = ?
         AND invoice_number IS NOT NULL`,
      [orgId, propertyId, period]
    );
    const n = Number(rows[0]?.n ?? 0) + attempt;
    const candidate = `CC-${periodCompact}-${String(n).padStart(3, "0")}`;
    const [existing] = await db_default.query(
      `SELECT 1 FROM rent_invoices
       WHERE organization_id = ? AND property_id = ? AND period = ?
         AND invoice_number = ?
       LIMIT 1`,
      [orgId, propertyId, period, candidate]
    );
    if (existing.length === 0) {
      return candidate;
    }
  }
  throw new Error(
    `generateInvoiceNumber: 5 intentos agotados para ${orgId}/${propertyId}/${period}. Posible drift en la serie \u2014 revis\xE1 manualmente.`
  );
}
function rowToInvoice(r) {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number ?? void 0,
    propertyId: r.property_id,
    contractId: r.contract_id,
    period: r.period,
    dueDate: r.due_date,
    subtotal: Number(r.subtotal),
    totalEarly: Number(r.total_early),
    totalMid: Number(r.total_mid),
    totalLate: Number(r.total_late),
    status: r.status,
    sentAt: r.sent_at ?? void 0,
    paidAt: r.paid_at ?? void 0,
    paidAmount: r.paid_amount != null ? Number(r.paid_amount) : void 0,
    paymentLink: r.payment_link ?? void 0,
    notes: r.notes ?? void 0
  };
}
router3.post(
  "/invoices/generate",
  requireRole("canSendInvoice"),
  asyncHandler(async (req, res) => {
    const { propertyId, contractId, period } = req.body;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM amortization_rows WHERE contract_id = ? AND period_start LIKE ?`,
      [contractId, `${period}%`]
    );
    const list = rows;
    if (list.length === 0)
      return res.status(404).json({ error: "no row for period" });
    const row = rowToAmortization(list[0]);
    const [bankRows] = await db_default.query(
      `SELECT id FROM bank_accounts WHERE property_id = ? AND is_primary = 1 LIMIT 1`,
      [propertyId]
    );
    const primaryBankId = bankRows[0]?.id ?? null;
    const invoice = generateInvoiceFromRow(row, { paymentLink: primaryBankId });
    await db_default.query(
      `INSERT INTO rent_invoices
       (id, organization_id, property_id, contract_id, period,
        due_date, subtotal, total_early, total_mid, total_late, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       due_date = VALUES(due_date),
       subtotal = VALUES(subtotal),
       total_early = VALUES(total_early),
       total_mid = VALUES(total_mid),
       total_late = VALUES(total_late)`,
      [
        invoice.id,
        orgId,
        propertyId,
        contractId,
        period,
        invoice.dueDate,
        invoice.subtotal,
        invoice.totalEarly,
        invoice.totalMid,
        invoice.totalLate,
        invoice.status
      ]
    );
    res.json(invoice);
  })
);
router3.post(
  "/invoices/send",
  requireRole("canSendInvoice"),
  asyncHandler(async (req, res) => {
    const { propertyId, contractId, period } = req.body;
    if (!propertyId || !contractId || !period) {
      return res.status(400).json({
        error: "Faltan campos requeridos: propertyId, contractId, period",
        code: "MISSING_REQUIRED_FIELDS"
      });
    }
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [chargeRows] = await db_default.query(
      `SELECT COALESCE(SUM(amount), 0) AS charges_total
     FROM property_charges
     WHERE organization_id = ?
       AND property_id = ?
       AND period = ?
       AND applies_to_invoice = 1
       AND charged_to IN ('tenant','both')`,
      [orgId, propertyId, period]
    );
    const chargesTotal = Number(chargeRows[0]?.charges_total ?? 0);
    const [existing] = await db_default.query(
      `SELECT * FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [contractId, period]
    );
    if (existing.length === 0) {
      const [rows] = await db_default.query(
        `SELECT * FROM amortization_rows WHERE contract_id = ? AND period_start LIKE ?`,
        [contractId, `${period}%`]
      );
      const list = rows;
      if (list.length === 0)
        return res.status(404).json({ error: "no row for period" });
      const row = rowToAmortization(list[0]);
      const [bankRows] = await db_default.query(
        `SELECT id FROM bank_accounts WHERE property_id = ? AND is_primary = 1 LIMIT 1`,
        [propertyId]
      );
      const primaryBankId = bankRows[0]?.id ?? null;
      const invoice = generateInvoiceFromRow(row, {
        paymentLink: primaryBankId
      });
      const subtotalWithCharges = invoice.subtotal + chargesTotal;
      const totalEarlyWith = invoice.totalEarly + chargesTotal;
      const totalMidWith = invoice.totalMid + chargesTotal;
      const totalLateWith = invoice.totalLate + chargesTotal;
      await db_default.query(
        `INSERT INTO rent_invoices
         (id, organization_id, property_id, contract_id, period,
          due_date, subtotal, total_early, total_mid, total_late, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.id,
          orgId,
          propertyId,
          contractId,
          period,
          invoice.dueDate,
          subtotalWithCharges,
          totalEarlyWith,
          totalMidWith,
          totalLateWith,
          invoice.status
        ]
      );
    } else if (chargesTotal > 0) {
      await db_default.query(
        `UPDATE rent_invoices
       SET subtotal = subtotal + ?,
           total_early = total_early + ?,
           total_mid = total_mid + ?,
           total_late = total_late + ?
       WHERE contract_id = ? AND period = ? AND status <> 'paid'`,
        [
          chargesTotal,
          chargesTotal,
          chargesTotal,
          chargesTotal,
          contractId,
          period
        ]
      );
    }
    const [rowsAfter] = await db_default.query(
      `SELECT * FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [contractId, period]
    );
    const r = rowsAfter[0];
    let invoiceNumber = r.invoice_number;
    if (!invoiceNumber) {
      invoiceNumber = await generateInvoiceNumber(orgId, propertyId, period);
      try {
        await db_default.query(
          `UPDATE rent_invoices
         SET invoice_number = ?, sent_at = COALESCE(sent_at, NOW()), status = CASE
           WHEN status = 'paid' THEN 'paid'  -- si ya estaba pagado (caso edge), no bajamos a pending
           ELSE 'pending'
         END
         WHERE contract_id = ? AND period = ?`,
          [invoiceNumber, contractId, period]
        );
      } catch (err) {
        if (err?.code === "ER_DUP_ENTRY" && err?.message?.includes("uniq_invoice_org_prop_period_number")) {
          invoiceNumber = await generateInvoiceNumber(
            orgId,
            propertyId,
            period
          );
          await db_default.query(
            `UPDATE rent_invoices
           SET invoice_number = ?, sent_at = COALESCE(sent_at, NOW()), status = CASE
             WHEN status = 'paid' THEN 'paid'
             ELSE 'pending'
           END
           WHERE contract_id = ? AND period = ?`,
            [invoiceNumber, contractId, period]
          );
        } else {
          throw err;
        }
      }
    } else {
      await db_default.query(
        `UPDATE rent_invoices
       SET sent_at = COALESCE(sent_at, NOW())
       WHERE contract_id = ? AND period = ? AND sent_at IS NULL`,
        [contractId, period]
      );
    }
    const [final] = await db_default.query(
      `SELECT * FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [contractId, period]
    );
    res.json(rowToInvoice(final[0]));
  })
);
router3.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const contractId = req.query.contractId;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const where = ["organization_id = ?"];
    const args = [orgId];
    if (propertyId) {
      where.push("property_id = ?");
      args.push(propertyId);
    }
    if (contractId) {
      where.push("contract_id = ?");
      args.push(contractId);
    }
    const [rows] = await db_default.query(
      `SELECT * FROM rent_invoices WHERE ${where.join(" AND ")} ORDER BY period DESC`,
      args
    );
    res.json(rows.map(rowToInvoice));
  })
);
router3.get(
  "/invoices/lookup",
  asyncHandler(async (req, res) => {
    const contractId = req.query.contractId;
    const period = req.query.period;
    if (!contractId || !period)
      return res.status(400).json({ error: "contractId y period son requeridos" });
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM rent_invoices WHERE contract_id = ? AND period = ? AND organization_id = ?`,
      [contractId, period, orgId]
    );
    const list = rows;
    if (list.length === 0) return res.json(null);
    res.json(rowToInvoice(list[0]));
  })
);
router3.post(
  "/actions",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const a = req.body;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    await db_default.query(
      `INSERT INTO property_actions
       (id, organization_id, property_id, type, description, payload, actor_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        orgId,
        a.propertyId,
        a.type,
        a.description,
        a.payload ? JSON.stringify(a.payload) : null,
        a.actorName
      ]
    );
    res.json({ ok: true, id: a.id });
  })
);
router3.get(
  "/actions",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = propertyId ? await db_default.query(
      `SELECT * FROM property_actions WHERE property_id = ? AND organization_id = ? ORDER BY occurred_at DESC`,
      [propertyId, orgId]
    ) : await db_default.query(
      `SELECT * FROM property_actions WHERE organization_id = ? ORDER BY occurred_at DESC LIMIT 200`,
      [orgId]
    );
    res.json(rows);
  })
);
router3.post("/late-fee", requireRole("canAddFinancial"), (req, res) => {
  const {
    subtotal,
    paidOnDayOfMonth,
    graceDay,
    lateFeeMidPct,
    lateFeeLatePct
  } = req.body;
  const result = calculateLateFee({
    subtotal,
    paidOnDayOfMonth,
    graceDay,
    lateFeeMidPct,
    lateFeeLatePct
  });
  res.json(result);
});
function rowToOwnerPayout(r) {
  return {
    id: r.id,
    propertyId: r.property_id,
    contractId: r.contract_id ?? void 0,
    period: r.period,
    amount: Number(r.amount),
    paidAt: r.paid_at,
    bankAccountId: r.bank_account_id ?? void 0,
    reference: r.reference ?? void 0,
    notes: r.notes ?? void 0,
    recordedBy: r.recorded_by,
    recordedAt: r.recorded_at
  };
}
router3.post(
  "/owner-payouts",
  requireRole("canRegisterOwnerPayout"),
  asyncHandler(async (req, res) => {
    const p = req.body;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const id = p.id ?? crypto3.randomUUID();
    const recordedAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
    await db_default.query(
      `INSERT INTO owner_payouts
       (id, organization_id, property_id, contract_id, period,
        amount, paid_at, bank_account_id, reference, notes, recorded_by, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       contract_id = VALUES(contract_id),
       period = VALUES(period),
       amount = VALUES(amount),
       paid_at = VALUES(paid_at),
       bank_account_id = VALUES(bank_account_id),
       reference = VALUES(reference),
       notes = VALUES(notes),
       recorded_by = VALUES(recorded_by)`,
      [
        id,
        orgId,
        p.propertyId,
        p.contractId ?? null,
        p.period,
        Number(p.amount),
        p.paidAt,
        p.bankAccountId ?? null,
        p.reference ?? null,
        p.notes ?? null,
        p.recordedBy,
        recordedAt
      ]
    );
    const [rows] = await db_default.query(
      `SELECT * FROM owner_payouts WHERE id = ?`,
      [id]
    );
    res.json(rowToOwnerPayout(rows[0]));
  })
);
router3.get(
  "/owner-payouts",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const period = req.query.period;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const where = ["organization_id = ?"];
    const args = [orgId];
    if (propertyId) {
      where.push("property_id = ?");
      args.push(propertyId);
    }
    if (period) {
      where.push("period = ?");
      args.push(period);
    }
    const [rows] = await db_default.query(
      `SELECT * FROM owner_payouts WHERE ${where.join(" AND ")} ORDER BY paid_at DESC`,
      args
    );
    res.json(rows.map(rowToOwnerPayout));
  })
);
router3.delete(
  "/owner-payouts/:id",
  requireRole("canRegisterOwnerPayout"),
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    await db_default.query(
      `DELETE FROM owner_payouts WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    res.json({ ok: true });
  })
);
router3.get(
  "/owner-statement",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const period = req.query.period;
    if (!propertyId || !period) {
      return res.status(400).json({ error: "propertyId y period son requeridos" });
    }
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [paidRows] = await db_default.query(
      `SELECT
       COALESCE(SUM(base_rent), 0)        AS rent,
       COALESCE(SUM(base_admin), 0)       AS admin,
       COALESCE(SUM(late_fee_amount), 0)  AS late_fee,
       COALESCE(SUM(total), 0)            AS total
     FROM amortization_rows
     WHERE property_id = ? AND status = 'paid' AND period_start LIKE ?`,
      [propertyId, `${period}%`]
    );
    const paid = paidRows[0] ?? {};
    const grossRent = Number(paid.rent ?? 0);
    const grossAdmin = Number(paid.admin ?? 0);
    const grossLateFee = Number(paid.late_fee ?? 0);
    const totalGrossIncome = grossRent + grossAdmin + grossLateFee;
    const [chargeRowsOwner] = await db_default.query(
      `SELECT * FROM property_charges
     WHERE property_id = ? AND period = ?
       AND charged_to IN ('owner','both')
     ORDER BY recorded_at ASC`,
      [propertyId, period]
    );
    let chargesForOwner = chargeRowsOwner.map(rowToCharge);
    if (chargesForOwner.length === 0) {
      const [legacyRows] = await db_default.query(
        `SELECT * FROM property_discounts
       WHERE property_id = ? AND month_period = ?
       ORDER BY recorded_at ASC`,
        [propertyId, period]
      );
      chargesForOwner = legacyRows.map((r) => ({
        id: r.id,
        propertyId: r.property_id,
        period: r.month_period,
        type: r.type,
        description: r.description,
        amount: Number(r.amount),
        chargedTo: "owner",
        appliesToInvoice: false,
        attachmentUrl: r.attachment_url ?? void 0,
        recordedAt: r.recorded_at,
        recordedBy: r.recorded_by
      }));
    }
    const totalDiscounts = chargesForOwner.reduce((s, c) => s + c.amount, 0);
    const discounts = chargesForOwner.map((c) => ({
      id: c.id,
      propertyId: c.propertyId,
      type: c.type,
      description: c.description,
      amount: c.amount,
      monthPeriod: c.period,
      attachmentUrl: c.attachmentUrl,
      recordedAt: c.recordedAt,
      recordedBy: c.recordedBy
    }));
    const [chargeRowsTenant] = await db_default.query(
      `SELECT * FROM property_charges
     WHERE property_id = ? AND period = ?
       AND charged_to IN ('tenant','both')
     ORDER BY recorded_at ASC`,
      [propertyId, period]
    );
    const chargesToTenant = chargeRowsTenant.map(rowToCharge);
    const totalChargesToTenant = chargesToTenant.reduce(
      (s, c) => s + c.amount,
      0
    );
    const policy = await loadPolicy(orgId, propertyId);
    const [contracts] = await db_default.query(
      `SELECT * FROM contracts WHERE property_id = ? AND status = 'active' ORDER BY start_date DESC LIMIT 1`,
      [propertyId]
    );
    const contract = contracts[0];
    const rentAmount = contract ? Number(contract.rent_amount) : policy?.rentAmount ?? 0;
    const adminFee = contract ? Number(contract.admin_fee) : policy?.adminFee ?? 0;
    const commissionPct = contract?.commission_pct ?? 8;
    const settlementInputs = {
      canon: rentAmount,
      administracionPH: adminFee,
      otrosIngresos: 0,
      gastosOperativos: totalDiscounts,
      comisionPct: Number(commissionPct),
      seguroPct: 0,
      ownerTaxType: "natural",
      tenantTaxType: "natural",
      period,
      closed: false
    };
    const settlementResult = calculateMonthlySettlement(settlementInputs);
    const [payoutRows] = await db_default.query(
      `SELECT * FROM owner_payouts
     WHERE property_id = ? AND period = ? AND organization_id = ?
     ORDER BY paid_at ASC`,
      [propertyId, period, orgId]
    );
    const payouts = payoutRows.map(rowToOwnerPayout);
    const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);
    const netCalculated = settlementResult.totales.saldoTransferir;
    const finalBalance = netCalculated - totalPayouts;
    const stmt = {
      propertyId,
      period,
      grossRent,
      grossAdmin,
      grossLateFee,
      totalGrossIncome,
      totalDiscounts,
      discounts,
      charges: chargesForOwner,
      settlement: {
        commission: settlementResult.trace.comision,
        ivaOnCommission: settlementResult.trace.ivaSobreComision,
        retefuente: settlementResult.trace.retefuente,
        gmf: settlementResult.trace.gmf,
        totalRetentions: settlementResult.totales.impuestos + settlementResult.trace.comision + settlementResult.trace.gmf,
        commissionPct: Number(commissionPct)
      },
      netCalculated,
      totalPayouts,
      payouts,
      totalChargesToTenant,
      finalBalance
    };
    res.json(stmt);
  })
);
router3.get(
  "/bank-accounts",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = propertyId ? await db_default.query(
      `SELECT * FROM bank_accounts WHERE organization_id = ? AND (property_id = ? OR property_id IS NULL) ORDER BY is_primary DESC, created_at ASC`,
      [orgId, propertyId]
    ) : await db_default.query(
      `SELECT * FROM bank_accounts WHERE organization_id = ? ORDER BY is_primary DESC, created_at ASC`,
      [orgId]
    );
    res.json(rows);
  })
);
router3.post(
  "/bank-accounts",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const b = req.body;
    if (b.isPrimary) {
      await db_default.query(
        `UPDATE bank_accounts SET is_primary = 0
         WHERE organization_id = ? AND (property_id = ? OR (property_id IS NULL AND ? IS NULL))`,
        [orgId, b.propertyId ?? null, b.propertyId ?? null]
      );
    }
    await db_default.query(
      `INSERT INTO bank_accounts
         (id, organization_id, property_id, bank, account_type, account_number,
          holder_name, holder_id_number, is_primary, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         bank = VALUES(bank),
         account_type = VALUES(account_type),
         account_number = VALUES(account_number),
         holder_name = VALUES(holder_name),
         holder_id_number = VALUES(holder_id_number),
         is_primary = VALUES(is_primary),
         notes = VALUES(notes)`,
      [
        b.id,
        orgId,
        b.propertyId ?? null,
        b.bank,
        b.accountType,
        b.accountNumber,
        b.holderName,
        b.holderIdNumber,
        b.isPrimary ? 1 : 0,
        b.notes ?? null
      ]
    );
    if (b.isPrimary && b.propertyId) {
      await db_default.query(
        `UPDATE billing_policies SET primary_bank_account_id = ? WHERE property_id = ?`,
        [b.id, b.propertyId]
      );
    }
    res.json({ ok: true, id: b.id });
  })
);
router3.delete(
  "/bank-accounts/:id",
  requireRole("canDeleteFinancial"),
  asyncHandler(async (req, res) => {
    await db_default.query(`DELETE FROM bank_accounts WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  })
);
router3.get(
  "/insurance-policies/:propertyId",
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM policies WHERE organization_id = ? AND property_id = ? ORDER BY approved_at DESC`,
      [orgId, req.params.propertyId]
    );
    res.json(rows);
  })
);
router3.post(
  "/insurance-policies",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const p = req.body;
    const id = p.id ?? crypto3.randomUUID();
    await db_default.query(
      `INSERT INTO policies
         (id, organization_id, property_id, insurer, policy_number, start_date, end_date,
          premium_amount, approval_pdf_url, approved_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        orgId,
        p.propertyId,
        p.insurer,
        p.policyNumber,
        p.startDate,
        p.endDate,
        Number(p.premiumAmount),
        p.approvalPdfUrl ?? null,
        p.approvedBy,
        p.notes ?? null
      ]
    );
    await db_default.query(
      `UPDATE billing_policies SET policy_id = ? WHERE property_id = ?`,
      [id, p.propertyId]
    );
    res.json({ ok: true, id });
  })
);
var billing_default = router3;

// server/routes/googleAuth.ts
import * as dotenv2 from "dotenv";
import express from "express";
import { google as google2 } from "googleapis";
import crypto5 from "crypto";
import { pipeline } from "stream/promises";

// server/lib/driveClient.ts
init_db();
import { google } from "googleapis";
import crypto4 from "crypto";

// server/lib/googleAuth.ts
function isTokenExpiringSoon(expiryDate) {
  if (!expiryDate) return true;
  const FIVE_MIN_MS = 5 * 60 * 1e3;
  return expiryDate - Date.now() < FIVE_MIN_MS;
}

// server/lib/driveGuard.ts
var DRIVE_TIMEOUT_MS = 15e3;
var RETRYABLE_HTTP = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var RETRYABLE_NET_CODES = /* @__PURE__ */ new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EPIPE"
]);
var RETRYABLE_REASONS = /* @__PURE__ */ new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "backendError"
]);
function httpStatusOf(err) {
  const raw = err?.response?.status ?? err?.status ?? err?.code;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function googleReasonOf(err) {
  return err?.response?.data?.error?.errors?.[0]?.reason ?? err?.errors?.[0]?.reason ?? void 0;
}
function isRetryableGoogleError(err) {
  if (!err) return false;
  if (isAbortError(err)) return false;
  if (RETRYABLE_HTTP.has(httpStatusOf(err))) return true;
  if (typeof err.code === "string" && RETRYABLE_NET_CODES.has(err.code)) return true;
  const reason = googleReasonOf(err);
  if (reason && RETRYABLE_REASONS.has(reason)) return true;
  return false;
}
function isAbortError(err) {
  return err?.name === "AbortError" || err?.name === "CanceledError" || err?.code === "ERR_CANCELED";
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(
        new AppError(
          504,
          `Google no respondi\xF3 en ${Math.round(ms / 1e3)} s (${label}). Reintent\xE1 en unos segundos.`,
          "DRIVE_TIMEOUT",
          true
        )
      ),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function describe(err) {
  return googleReasonOf(err) ?? err?.response?.status ?? err?.code ?? err?.message ?? "error desconocido";
}
async function runDrive(label, call, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DRIVE_TIMEOUT_MS;
  const attempts = Math.min(4, Math.max(1, opts.attempts ?? 1));
  const backoffMs = opts.backoffMs ?? 300;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    let timer;
    const timeoutPromise = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new AppError(
            504,
            `Google Drive no respondi\xF3 en ${Math.round(timeoutMs / 1e3)} s (${label}). Reintent\xE1 en unos segundos.`,
            "DRIVE_TIMEOUT",
            true
          )
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([call(controller.signal), timeoutPromise]);
    } catch (err) {
      const timedOut = err instanceof AppError && err.code === "DRIVE_TIMEOUT";
      if (timedOut) {
        console.error(
          `[drive] timeout ${timeoutMs}ms en "${label}" (intento ${attempt}/${attempts}) \u2014 request abortada`
        );
        throw err;
      }
      const isLast = attempt === attempts;
      if (isLast || !isRetryableGoogleError(err)) throw err;
      const delay = backoffMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      console.warn(
        `[drive] "${label}" fall\xF3 (${describe(err)}). Reintento ${attempt}/${attempts - 1} en ${delay}ms`
      );
      await sleep(delay);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw new AppError(500, "Internal server error", "DRIVE_UNREACHABLE", false);
}
function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
async function findFileByName(drive, name, parentId, kind = "any") {
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  const kindFilter = kind === "folder" ? ` and mimeType='${FOLDER_MIME}'` : kind === "file" ? ` and mimeType!='${FOLDER_MIME}'` : "";
  const res = await runDrive(
    "files.list (buscar por nombre)",
    (signal) => drive.files.list(
      {
        q: `name='${escapeDriveQuery(name)}' and '${escapeDriveQuery(parentId)}' in parents and trashed=false${kindFilter}`,
        fields: "files(id, name, webViewLink)",
        spaces: "drive",
        pageSize: 1
      },
      { signal }
    ),
    { attempts: 2 }
  );
  return res?.data?.files?.[0]?.id ?? null;
}
async function upsertFileInFolder(drive, params) {
  const { name, parentId, mimeType, body } = params;
  const existingId = await findFileByName(drive, name, parentId, "file");
  if (existingId) {
    const updated = await runDrive(
      `files.update (${name})`,
      (signal) => drive.files.update(
        { fileId: existingId, media: { mimeType, body }, fields: "id, webViewLink" },
        { signal }
      ),
      { timeoutMs: 6e4 }
    );
    return {
      id: updated?.data?.id ?? existingId,
      webViewLink: updated?.data?.webViewLink ?? void 0,
      replaced: true
    };
  }
  const created = await runDrive(
    `files.create (${name})`,
    (signal) => drive.files.create(
      {
        requestBody: { name, parents: [parentId] },
        media: { mimeType, body },
        fields: "id, webViewLink"
      },
      { signal }
    ),
    { timeoutMs: 6e4 }
  );
  return {
    id: created?.data?.id,
    webViewLink: created?.data?.webViewLink ?? void 0,
    replaced: false
  };
}
async function findOrCreateFolder(drive, name, parentId) {
  const existingId = await findFileByName(drive, name, parentId, "folder");
  if (existingId) return { id: existingId, created: false };
  const created = await runDrive(
    `files.create folder (${name})`,
    (signal) => drive.files.create(
      {
        requestBody: {
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId]
        },
        fields: "id"
      },
      { signal }
    )
  );
  return { id: created?.data?.id, created: true };
}

// server/lib/driveClient.ts
var DRIVE_PROVIDER = "google_drive";
var LEGACY_DRIVE_USER_ID = "default_user";
function legacyFallbackEnabled() {
  return (process.env.DRIVE_LEGACY_FALLBACK ?? "true").toLowerCase() !== "false";
}
function candidateDriveUserIds(req) {
  const user = req?.user;
  const ids = [];
  if (user?.id) ids.push(String(user.id));
  if (user?.email) ids.push(String(user.email).trim().toLowerCase());
  if (legacyFallbackEnabled()) ids.push(LEGACY_DRIVE_USER_ID);
  return Array.from(new Set(ids.filter(Boolean)));
}
function newOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}
async function loadTokensForUserIds(userIds) {
  if (userIds.length === 0) return null;
  const placeholders = userIds.map(() => "?").join(",");
  const [rows] = await db_default.query(
    `SELECT user_id, access_token, refresh_token, expiry_date, drive_folder_id
       FROM user_oauth_tokens
      WHERE provider = ? AND user_id IN (${placeholders})`,
    [DRIVE_PROVIDER, ...userIds]
  );
  if (rows.length === 0) return null;
  for (const id of userIds) {
    const hit = rows.find((r) => r.user_id === id && r.access_token);
    if (hit) return hit;
  }
  return null;
}
async function getDriveContext(req) {
  const userIds = candidateDriveUserIds(req);
  let row = null;
  try {
    row = await loadTokensForUserIds(userIds);
  } catch (err) {
    console.error("[drive] no se pudieron leer los tokens:", err?.message);
    return null;
  }
  if (!row) return null;
  const oauth2Client = newOAuthClient();
  oauth2Client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token ?? void 0,
    expiry_date: row.expiry_date ?? void 0
  });
  if (isTokenExpiringSoon(row.expiry_date)) {
    if (!row.refresh_token) {
      console.warn(
        `[drive] token expirado y sin refresh_token (user_id=${row.user_id}). Reconectar Drive.`
      );
      return null;
    }
    try {
      const { credentials } = await withTimeout(
        oauth2Client.refreshAccessToken(),
        15e3,
        "refresh access_token"
      );
      oauth2Client.setCredentials(credentials);
      await db_default.query(
        `UPDATE user_oauth_tokens
            SET access_token  = ?,
                expiry_date   = ?,
                refresh_token = COALESCE(?, refresh_token)
          WHERE user_id = ? AND provider = ?`,
        [
          credentials.access_token ?? row.access_token,
          credentials.expiry_date ?? null,
          credentials.refresh_token ?? null,
          row.user_id,
          DRIVE_PROVIDER
        ]
      );
    } catch (err) {
      console.warn(
        `[drive] refresh fall\xF3 (user_id=${row.user_id}):`,
        err?.message
      );
      return null;
    }
  }
  return {
    drive: google.drive({ version: "v3", auth: oauth2Client }),
    userId: row.user_id,
    rootFolderId: row.drive_folder_id,
    isLegacy: row.user_id === LEGACY_DRIVE_USER_ID
  };
}
async function getDriveClientForRequest(req) {
  const ctx = await getDriveContext(req);
  return ctx?.drive ?? null;
}
async function describeDriveConnection(req) {
  const userIds = candidateDriveUserIds(req);
  let row = null;
  try {
    row = await loadTokensForUserIds(userIds);
  } catch {
    return { connected: false, folderId: null, reason: "no_token", userId: null };
  }
  if (!row) {
    return { connected: false, folderId: null, reason: "no_token", userId: null };
  }
  const isLegacy = row.user_id === LEGACY_DRIVE_USER_ID;
  if (!row.drive_folder_id) {
    return {
      connected: false,
      folderId: null,
      reason: "no_token",
      userId: row.user_id
    };
  }
  if (!row.expiry_date) {
    return {
      connected: false,
      folderId: row.drive_folder_id,
      reason: "no_expiry",
      userId: row.user_id
    };
  }
  if (isTokenExpiringSoon(row.expiry_date)) {
    if (!row.refresh_token) {
      return {
        connected: false,
        folderId: row.drive_folder_id,
        reason: "expired",
        userId: row.user_id
      };
    }
  }
  return {
    connected: true,
    folderId: row.drive_folder_id,
    reason: isLegacy ? "legacy" : "ok",
    userId: row.user_id
  };
}
async function saveDriveTokens(params) {
  await db_default.query(
    `INSERT INTO user_oauth_tokens
       (id, user_id, provider, access_token, refresh_token, expiry_date, drive_folder_id, scopes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       access_token    = VALUES(access_token),
       -- COALESCE: una reconexi\xF3n sin refresh_token NO debe borrar el que ya
       -- ten\xEDamos, o la conexi\xF3n muere cuando expire el access_token.
       refresh_token   = COALESCE(VALUES(refresh_token), refresh_token),
       expiry_date     = VALUES(expiry_date),
       drive_folder_id = COALESCE(VALUES(drive_folder_id), drive_folder_id),
       scopes          = COALESCE(VALUES(scopes), scopes),
       updated_at      = CURRENT_TIMESTAMP`,
    [
      crypto4.randomUUID(),
      params.userId,
      DRIVE_PROVIDER,
      params.accessToken,
      params.refreshToken ?? null,
      params.expiryDate ?? null,
      params.driveFolderId ?? null,
      params.scopes ?? null
    ]
  );
}
async function deleteDriveTokens(userIds) {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const [result] = await db_default.query(
    `DELETE FROM user_oauth_tokens WHERE provider = ? AND user_id IN (${placeholders})`,
    [DRIVE_PROVIDER, ...ids]
  );
  return result?.affectedRows ?? 0;
}

// server/lib/uploadLimits.ts
var MAX_PDF_BYTES = 10 * 1024 * 1024;
var MAX_PHOTO_BATCH_BYTES = 8 * 1024 * 1024;
function base64DecodedBytes(base64) {
  if (!base64) return 0;
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(clean.length * 3 / 4) - padding);
}
function stripDataUrlPrefix(base64) {
  return base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
}
function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function assertBase64Size(base64, maxBytes, label) {
  const size = base64DecodedBytes(base64);
  if (size > maxBytes) {
    throw new AppError(
      413,
      `${label} demasiado grande: ${formatMb(size)} (m\xE1ximo ${formatMb(maxBytes)}).`,
      "PAYLOAD_TOO_LARGE",
      true
    );
  }
}

// server/routes/googleAuth.ts
dotenv2.config({ path: ".env.local" });
var router4 = express.Router();
function newOAuthClient2() {
  return new google2.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}
var SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email"
];
var pendingOAuthStates = /* @__PURE__ */ new Map();
var STATE_TTL_MS = 10 * 60 * 1e3;
var MAX_PENDING_STATES = 500;
function purgeExpiredStates() {
  const now = Date.now();
  for (const [key, value] of pendingOAuthStates) {
    if (now - value.createdAt > STATE_TTL_MS) pendingOAuthStates.delete(key);
  }
  if (pendingOAuthStates.size > MAX_PENDING_STATES) {
    const excess = pendingOAuthStates.size - MAX_PENDING_STATES;
    let removed = 0;
    for (const key of pendingOAuthStates.keys()) {
      if (removed >= excess) break;
      pendingOAuthStates.delete(key);
      removed += 1;
    }
  }
}
router4.get("/auth/google", requireAuth, (req, res) => {
  console.log("[OAuth] /auth/google llamado. GOOGLE_CLIENT_ID presente:", !!process.env.GOOGLE_CLIENT_ID);
  const user = req.user;
  purgeExpiredStates();
  const state = crypto5.randomBytes(24).toString("hex");
  pendingOAuthStates.set(state, {
    profileId: user.id,
    email: user.email,
    createdAt: Date.now()
  });
  const oauth2Client = newOAuthClient2();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    // obtiene refresh_token (persiste entre sesiones)
    scope: SCOPES,
    state,
    // prompt=consent fuerza la pantalla de consentimiento (necesario para recibir
    // el refresh_token la primera vez — sin esto Google puede no devolverlo)
    prompt: "consent",
    include_granted_scopes: true
  });
  res.json({ url });
});
var FRONTEND_REDIRECT_BASE = (process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
router4.get("/auth/google/callback", asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  console.log("[OAuth] Callback recibido:", { error, hasCode: !!code, hasState: !!state, codePreview: code ? code.slice(0, 20) + "..." : null });
  if (error || !code) {
    console.log("[OAuth] Error o sin c\xF3digo:", error);
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=${encodeURIComponent(error || "no_code")}`);
    return;
  }
  const pending = state ? pendingOAuthStates.get(state) : void 0;
  if (state) pendingOAuthStates.delete(state);
  if (!pending) {
    console.warn("[OAuth] state inv\xE1lido o expirado \u2014 flujo rechazado");
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=invalid_state`);
    return;
  }
  if (Date.now() - pending.createdAt > STATE_TTL_MS) {
    console.warn("[OAuth] state expirado (TTL 10 min) \u2014 flujo rechazado");
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=state_expired`);
    return;
  }
  try {
    console.log("[OAuth] Intercambiando code por tokens...");
    const oauth2Client = newOAuthClient2();
    const { tokens } = await oauth2Client.getToken(code);
    console.log("[OAuth] Tokens recibidos:", { hasAccess: !!tokens.access_token, hasRefresh: !!tokens.refresh_token, expiry: tokens.expiry_date });
    if (!tokens.access_token) {
      throw new Error("Google no devolvi\xF3 access_token");
    }
    oauth2Client.setCredentials(tokens);
    const googleAccount = extractEmailFromIdToken(tokens.id_token ?? "");
    console.log(
      `[OAuth] Usuario app: ${pending.email} (${pending.profileId}) \xB7 cuenta Google: ${googleAccount ?? "desconocida"}`
    );
    console.log("[OAuth] Creando/buscando carpeta en Drive...");
    const drive = google2.drive({ version: "v3", auth: oauth2Client });
    const folderId = await getOrCreateInmoControlFolder(drive, pending.profileId);
    console.log("[OAuth] Carpeta:", folderId);
    console.log("[OAuth] Guardando tokens en MySQL...");
    await saveDriveTokens({
      userId: pending.profileId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ?? null,
      driveFolderId: folderId,
      scopes: tokens.scope ?? SCOPES.join(" ")
    });
    console.log("[OAuth] \u2713 \xC9xito! Redirigiendo al frontend.");
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_connected=1&folder=${encodeURIComponent(folderId)}`);
  } catch (err) {
    console.error("[OAuth] Error completo:", err?.message, err?.response?.data);
    const detail = err?.response?.data?.error || err?.message || "token_exchange_failed";
    res.redirect(`${FRONTEND_REDIRECT_BASE}/?gdrive_error=${encodeURIComponent(detail)}`);
  }
}));
router4.post("/upload/google-drive", requireAuth, requireRole("canManageDrive"), asyncHandler(async (req, res) => {
  const { propertyId, docType, fileName, base64Data } = req.body;
  if (!propertyId || !docType || !base64Data) {
    res.status(400).json({ error: "Faltan campos requeridos: propertyId, docType, base64Data" });
    return;
  }
  assertBase64Size(base64Data, MAX_PDF_BYTES, "El PDF");
  const ctx = await getDriveContext(req);
  if (!ctx || !ctx.rootFolderId) {
    res.status(401).json({
      error: "No connected to Google Drive. Please connect first.",
      code: "DRIVE_NOT_CONNECTED"
    });
    return;
  }
  const { drive, rootFolderId: drive_folder_id } = ctx;
  const propFolderId = await getOrCreatePropertyFolder(drive, drive_folder_id, propertyId);
  const buffer = Buffer.from(stripDataUrlPrefix(base64Data), "base64");
  const finalFileName = `${docType}_${fileName}`;
  const uploaded = await upsertFileInFolder(drive, {
    name: finalFileName,
    parentId: propFolderId,
    mimeType: "application/pdf",
    body: buffer
  });
  await runDrive(
    "permissions.create",
    (signal) => drive.permissions.create(
      {
        fileId: uploaded.id,
        requestBody: {
          role: "reader",
          type: "anyone"
        }
      },
      { signal }
    )
  );
  res.json({
    success: true,
    fileId: uploaded.id,
    fileName: finalFileName,
    webViewLink: uploaded.webViewLink,
    replaced: uploaded.replaced
  });
}));
router4.get("/status/google-drive", requireAuth, asyncHandler(async (req, res) => {
  const status = await describeDriveConnection(req);
  if (status.reason === "legacy") {
    const requester = req.user?.id ?? "anon";
    console.warn(
      `[drive] fallback LEGACY en uso \xB7 token_user_id=${status.userId} \xB7 solicitante=${requester}`
    );
  }
  res.json({
    connected: status.connected,
    folderId: status.folderId,
    reason: status.reason === "ok" ? void 0 : status.reason,
    source: status.reason === "legacy" ? "legacy" : status.connected ? "user" : void 0
  });
}));
router4.delete("/auth/google-drive", requireAuth, requireRole("canManageDrive"), asyncHandler(async (req, res) => {
  const deleted = await deleteDriveTokens(candidateDriveUserIds(req));
  console.log(`[OAuth] Drive desconectado \xB7 filas borradas: ${deleted}`);
  res.json({ success: true });
}));
router4.get("/drive/create-property-folders", requireAuth, asyncHandler(async (req, res) => {
  const { propertyId, propertyName } = req.query;
  if (!propertyId || !propertyName) {
    res.status(400).json({ error: "Faltan propertyId o propertyName" });
    return;
  }
  const ctx = await getDriveContext(req);
  if (!ctx?.rootFolderId) {
    res.status(401).json({ error: "No connected to Google Drive" });
    return;
  }
  const { drive, rootFolderId } = ctx;
  const property = await findOrCreateFolder(drive, propertyName, rootFolderId);
  const propietario = await findOrCreateFolder(drive, "Propietario", property.id);
  const inventarios = await findOrCreateFolder(drive, "Inventarios", property.id);
  console.log(
    `[Drive] Carpetas para "${propertyName}": ${property.id} (propiedad=${property.created ? "creada" : "reusada"}, Propietario=${propietario.created ? "creada" : "reusada"}, Inventarios=${inventarios.created ? "creada" : "reusada"})`
  );
  res.json({ propertyFolderId: property.id });
}));
router4.post("/drive/upload-file", requireAuth, requireRole("canManageDrive"), asyncHandler(async (req, res) => {
  const { propertyId, folderId, subfolder, fileName, base64Data } = req.body;
  if (!folderId || !subfolder || !fileName || !base64Data) {
    res.status(400).json({ error: "Faltan campos requeridos" });
    return;
  }
  assertBase64Size(base64Data, MAX_PDF_BYTES, "El PDF");
  const drive = await getDriveClientForRequest(req);
  if (!drive) {
    res.status(401).json({
      error: "No connected to Google Drive",
      code: "DRIVE_NOT_CONNECTED"
    });
    return;
  }
  const subfolderId = await findFileByName(drive, subfolder, folderId, "folder");
  if (!subfolderId) {
    res.status(404).json({ error: `Subcarpeta "${subfolder}" no encontrada dentro de la propiedad` });
    return;
  }
  const fileBuffer = Buffer.from(stripDataUrlPrefix(base64Data), "base64");
  const uploaded = await upsertFileInFolder(drive, {
    name: fileName,
    parentId: subfolderId,
    mimeType: "application/pdf",
    body: fileBuffer
  });
  console.log(
    `[Drive] Archivo "${fileName}" ${uploaded.replaced ? "reemplazado" : "subido"} en "${subfolder}" para propiedad ${propertyId}`
  );
  res.json({
    fileId: uploaded.id,
    webViewLink: uploaded.webViewLink,
    replaced: uploaded.replaced
  });
}));
router4.post("/drive/upload-pdf", requireAuth, requireRole("canManageDrive"), asyncHandler(async (req, res) => {
  const { parentFolderId, parentKind, subfolder, fileName, base64Data } = req.body;
  if (!parentFolderId || !subfolder || !fileName || !base64Data) {
    res.status(400).json({ error: "Faltan campos requeridos (parentFolderId, subfolder, fileName, base64Data)" });
    return;
  }
  assertBase64Size(base64Data, MAX_PDF_BYTES, "El PDF");
  const drive = await getDriveClientForRequest(req);
  if (!drive) {
    res.status(503).json({
      error: "Google Drive no conectado",
      code: "DRIVE_NOT_CONNECTED"
    });
    return;
  }
  const folder = await findOrCreateFolder(drive, subfolder, parentFolderId);
  if (folder.created) {
    console.log(`[Drive] Subcarpeta "${subfolder}/" creada para parent ${parentKind ?? parentFolderId}`);
  }
  const fileBuffer = Buffer.from(stripDataUrlPrefix(base64Data), "base64");
  const uploaded = await upsertFileInFolder(drive, {
    name: fileName,
    parentId: folder.id,
    mimeType: "application/pdf",
    body: fileBuffer
  });
  await runDrive(
    "permissions.create",
    (signal) => drive.permissions.create(
      {
        fileId: uploaded.id,
        requestBody: { role: "reader", type: "anyone" }
      },
      { signal }
    )
  );
  console.log(
    `[Drive] PDF "${fileName}" ${uploaded.replaced ? "reemplazado" : "subido"} \u2192 ${parentKind ?? "parent"}/${subfolder}/`
  );
  res.json({
    fileId: uploaded.id,
    webViewLink: uploaded.webViewLink,
    subfolder,
    replaced: uploaded.replaced
  });
}));
async function getOrCreateInmoControlFolder(drive, userId) {
  void userId;
  const { id } = await findOrCreateFolder(drive, "InmoControl", "root");
  return id;
}
function extractEmailFromIdToken(idToken) {
  try {
    const payload = idToken.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    return decoded.email ?? null;
  } catch {
    return null;
  }
}
async function getOrCreatePropertyFolder(drive, parentId, propertyId) {
  const { id } = await findOrCreateFolder(drive, `Propiedad_${propertyId}`, parentId);
  return id;
}
router4.get("/drive/file", requireAuth, asyncHandler(async (req, res) => {
  const { fileId, download } = req.query;
  if (!fileId) {
    res.status(400).json({ error: "Falta fileId" });
    return;
  }
  try {
    const drive = await getDriveClientForRequest(req);
    if (!drive) {
      res.status(503).json({ error: "Google Drive no conectado. Reconectar en Configuraci\xF3n." });
      return;
    }
    const meta = await runDrive(
      "files.get (metadata)",
      (signal) => drive.files.get(
        { fileId, fields: "id, name, mimeType, size", supportsAllDrives: false },
        { signal }
      ),
      { attempts: 2 }
    );
    const mimeType = meta.data.mimeType ?? "application/octet-stream";
    const name = meta.data.name ?? `drive-${fileId}`;
    const dl = await runDrive(
      "files.get (media)",
      (signal) => drive.files.get(
        { fileId, alt: "media", supportsAllDrives: false },
        { responseType: "stream", signal }
      ),
      { timeoutMs: 6e4 }
    );
    res.setHeader("Content-Type", mimeType);
    if (meta.data.size) res.setHeader("Content-Length", String(meta.data.size));
    if (download) {
      res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${name.replace(/"/g, "")}"`);
    }
    res.setHeader("Cache-Control", "private, max-age=300");
    await pipeline(dl.data, res);
  } catch (err) {
    if (!res.headersSent && !res.writableEnded) {
      if (err.code === 404) {
        res.status(404).json({ error: "Archivo no encontrado en Drive" });
        return;
      }
      if (err.code === 403) {
        res.status(403).json({ error: "Sin permisos para acceder al archivo" });
        return;
      }
    }
    throw err;
  }
}));
router4.get("/drive/thumb", requireAuth, asyncHandler(async (req, res) => {
  const { fileId, sz } = req.query;
  const sizeSuffix = sz && /^w\d+$/.test(sz) ? sz : "w800";
  if (!fileId) {
    res.status(400).json({ error: "Falta fileId" });
    return;
  }
  const drive = await getDriveClientForRequest(req);
  if (!drive) {
    res.status(503).json({ error: "Google Drive no conectado." });
    return;
  }
  const meta = await runDrive(
    "files.get (thumbnail)",
    (signal) => drive.files.get(
      {
        fileId,
        fields: "id, name, mimeType, thumbnailLink",
        supportsAllDrives: false
      },
      { signal }
    ),
    { attempts: 2 }
  );
  const thumb = meta.data.thumbnailLink;
  if (thumb) {
    const sized = thumb.replace(/=s\d+(-c)?$/, `=${sizeSuffix}$1`);
    res.redirect(302, sized);
  } else {
    res.redirect(302, `/api/drive/file?fileId=${encodeURIComponent(fileId)}`);
  }
}));
var googleAuth_default = router4;

// server/routes/tenants.ts
init_db();
import * as dotenv3 from "dotenv";
import express2 from "express";
import crypto6 from "crypto";
import { Readable } from "stream";

// server/lib/driveHelpers.ts
function escapeDriveQueryValue(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// server/routes/tenants.ts
dotenv3.config({ path: ".env.local" });
var GOOGLE_API_TIMEOUT_MS = 8e3;
function withTimeout2(p, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout after ${ms}ms: ${label}`)),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
var router5 = express2.Router();
router5.use(requireAuth);
async function getFreshDriveClient(req) {
  const drive = await getDriveClientForRequest(req);
  if (!drive) throw new Error("No Drive connection");
  return drive;
}
router5.post(
  "/",
  requireRole("canAddTenant"),
  asyncHandler(async (req, res) => {
    try {
      const { propertyId, name, idNumber, email, phone, rent, leaseStartDate } = req.body;
      if (!propertyId || !name || !idNumber) {
        res.status(400).json({
          error: "Faltan campos requeridos: propertyId, name, idNumber"
        });
        return;
      }
      try {
        const [existing] = await db_default.query(
          `SELECT id, name FROM tenants WHERE property_id = ? AND status = 'Activo' LIMIT 1`,
          [propertyId]
        );
        if (existing.length > 0) {
          res.status(409).json({
            error: `Este inmueble ya tiene un arrendatario activo (${existing[0].name}). Finaliza o cancela ese contrato antes de asignar uno nuevo.`
          });
          return;
        }
      } catch (err) {
        console.error("[DB] Error validando duplicado de tenant:", err.message);
        res.status(500).json({ error: "Error validando disponibilidad del inmueble" });
        return;
      }
      const tenantId = crypto6.randomUUID();
      let propertyDriveFolderId = req.body.propertyDriveFolderId;
      const propertyAddress = req.body.propertyAddress;
      const adminFee = req.body.adminFee ?? 0;
      let tenantDriveFolderId = null;
      let drive = null;
      try {
        drive = await getFreshDriveClient(req);
      } catch (driveErr) {
        console.warn(
          `[Drive] No se pudo obtener cliente: ${driveErr?.message ?? driveErr}`
        );
      }
      if (drive) {
        try {
          if (!propertyDriveFolderId && propertyAddress) {
            const driveCtx = await withTimeout2(
              getDriveContext(req),
              GOOGLE_API_TIMEOUT_MS,
              "drive context (tenant POST)"
            );
            const rootFolderId = driveCtx?.rootFolderId;
            if (rootFolderId) {
              const safeAddress = escapeDriveQueryValue(propertyAddress);
              const existing = await withTimeout2(
                drive.files.list({
                  q: `name='${safeAddress}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
                  fields: "files(id)",
                  spaces: "drive"
                }),
                GOOGLE_API_TIMEOUT_MS,
                "drive.files.list (property folder)"
              );
              let propertyFolderId = existing.data.files?.[0]?.id;
              if (!propertyFolderId) {
                const created = await withTimeout2(
                  drive.files.create({
                    requestBody: {
                      name: propertyAddress,
                      mimeType: "application/vnd.google-apps.folder",
                      parents: [rootFolderId]
                    },
                    fields: "id"
                  }),
                  GOOGLE_API_TIMEOUT_MS,
                  "drive.files.create (property folder)"
                );
                propertyFolderId = created.data.id;
                console.log(
                  `[Drive] Carpeta de inmueble creada: "${propertyAddress}" \u2192 ${propertyFolderId}`
                );
              }
              propertyDriveFolderId = propertyFolderId;
            }
          }
          if (propertyDriveFolderId) {
            const folderName = `${name.trim()} (${String(idNumber).replace(/\D/g, "")})`;
            const existingTenantFolder = await withTimeout2(
              drive.files.list({
                q: `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${propertyDriveFolderId}' in parents and trashed=false`,
                fields: "files(id)",
                spaces: "drive"
              }),
              GOOGLE_API_TIMEOUT_MS,
              "drive.files.list (tenant folder)"
            );
            const existingId = existingTenantFolder.data.files?.[0]?.id;
            if (existingId) {
              tenantDriveFolderId = existingId;
              console.log(
                `[Drive] Carpeta de arrendatario ya exist\xEDa: "${folderName}" \u2192 ${tenantDriveFolderId} (reusada por dedupe)`
              );
            } else {
              const folderRes = await withTimeout2(
                drive.files.create({
                  requestBody: {
                    name: folderName,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [propertyDriveFolderId]
                  },
                  fields: "id"
                }),
                GOOGLE_API_TIMEOUT_MS,
                "drive.files.create (tenant folder)"
              );
              tenantDriveFolderId = folderRes.data.id;
              console.log(
                `[Drive] Carpeta de arrendatario creada: "${folderName}" \u2192 ${tenantDriveFolderId}`
              );
            }
            const subfolders = ["Cedula", "Contrato", "Recibos"];
            for (const sf of subfolders) {
              const existingSub = await withTimeout2(
                drive.files.list({
                  q: `name='${sf}' and mimeType='application/vnd.google-apps.folder' and '${tenantDriveFolderId}' in parents and trashed=false`,
                  fields: "files(id)",
                  spaces: "drive"
                }),
                GOOGLE_API_TIMEOUT_MS,
                `drive.files.list (subfolder ${sf})`
              );
              if (existingSub.data.files?.[0]?.id) continue;
              await withTimeout2(
                drive.files.create({
                  requestBody: {
                    name: sf,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [tenantDriveFolderId]
                  },
                  fields: "id"
                }),
                GOOGLE_API_TIMEOUT_MS,
                `drive.files.create (subfolder ${sf})`
              );
            }
          }
        } catch (err) {
          console.warn(
            "[Drive] Error creando carpetas (continuando sin Drive):",
            err.message
          );
          tenantDriveFolderId = null;
        }
      }
      try {
        const ctx = await getOrgIdForRequest(req);
        if (ctx.isLegacySession) {
          return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
        }
        const orgId = ctx.orgId;
        const bodyOrgId = req.body?.organizationId;
        if (bodyOrgId && bodyOrgId !== orgId) {
          return res.status(403).json({
            error: "No pod\xE9s crear recursos en otra organizaci\xF3n",
            code: "CROSS_TENANT_FORBIDDEN"
          });
        }
        let safePropertyId = null;
        if (propertyId) {
          const [propRows] = await db_default.query(
            "SELECT id FROM properties WHERE id = ?",
            [propertyId]
          );
          if (propRows.length > 0) {
            safePropertyId = propertyId;
          } else {
            console.warn(
              `[tenants] propertyId=${propertyId} no existe en BD, guardando NULL`
            );
          }
        }
        await db_default.query(
          `INSERT INTO tenants
        (id, organization_id, property_id, name, document_id, email, phone, rent, admin_fee, lease_start_date, status, tenant_drive_folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo', ?)`,
          [
            tenantId,
            orgId,
            // UUID real de la org
            safePropertyId,
            name.toUpperCase(),
            idNumber,
            email || null,
            phone || null,
            rent || null,
            adminFee,
            leaseStartDate || null,
            tenantDriveFolderId
          ]
        );
      } catch (err) {
        console.error("[DB] Error insertando tenant:", err.message);
        res.status(500).json({ error: "Error guardando arrendatario: " + err.message });
        return;
      }
      res.json({
        success: true,
        tenantId,
        tenantDriveFolderId,
        propertyDriveFolderId: propertyDriveFolderId ?? null,
        message: tenantDriveFolderId ? "Arrendatario creado con carpeta en Google Drive" : "Arrendatario creado (sin Drive \u2014 conecta tu Google Drive en Configuraci\xF3n)"
      });
    } catch (err) {
      console.error("[POST /api/tenants] UNHANDLED:", err?.message ?? err);
      throw err;
    }
  })
);
router5.get(
  "/",
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT id, property_id, name, document_id, email, phone, rent, admin_fee, lease_start_date, status,
            tenant_drive_folder_id, drive_folder_path, created_at
     FROM tenants
     WHERE organization_id = ?
     ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ tenants: rows });
  })
);
async function ensureTenantDriveFolder(drive, rootFolderId, tenant) {
  if (!tenant.propertyId) {
    throw new Error(
      "El arrendatario no tiene propiedad asignada. Asign\xE1 primero una propiedad en su ficha para poder crear la carpeta en Drive."
    );
  }
  const [propRows] = await db_default.query(
    "SELECT id, address, drive_folder_id FROM properties WHERE id = ?",
    [tenant.propertyId]
  );
  if (propRows.length === 0) {
    throw new Error(
      `La propiedad ${tenant.propertyId} no existe en la base de datos.`
    );
  }
  const property = propRows[0];
  let propertyFolderId = property.drive_folder_id;
  if (!propertyFolderId) {
    const address = (property.address ?? "Inmueble").toString();
    const existing = await drive.files.list({
      q: `name='${address.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive"
    });
    propertyFolderId = existing.data.files?.[0]?.id;
    if (!propertyFolderId) {
      const created = await drive.files.create({
        requestBody: {
          name: address,
          mimeType: "application/vnd.google-apps.folder",
          parents: [rootFolderId]
        },
        fields: "id"
      });
      propertyFolderId = created.data.id;
      console.log(
        `[Drive] Carpeta de inmueble creada (recuperaci\xF3n): "${address}" \u2192 ${propertyFolderId}`
      );
    }
    await db_default.query("UPDATE properties SET drive_folder_id = ? WHERE id = ?", [
      propertyFolderId,
      tenant.propertyId
    ]);
  }
  const folderName = `${tenant.name.trim()} (${String(tenant.documentId ?? "").replace(/\D/g, "")})`;
  const tenantExisting = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${propertyFolderId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive"
  });
  let tenantFolderId = tenantExisting.data.files?.[0]?.id;
  if (!tenantFolderId) {
    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [propertyFolderId]
      },
      fields: "id"
    });
    tenantFolderId = created.data.id;
    console.log(
      `[Drive] Carpeta de arrendatario creada (recuperaci\xF3n): "${folderName}" \u2192 ${tenantFolderId}`
    );
  }
  for (const sf of ["Cedula", "Contrato", "Recibos"]) {
    const subExisting = await drive.files.list({
      q: `name='${sf}' and mimeType='application/vnd.google-apps.folder' and '${tenantFolderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive"
    });
    if (!subExisting.data.files?.[0]?.id) {
      await drive.files.create({
        requestBody: {
          name: sf,
          mimeType: "application/vnd.google-apps.folder",
          parents: [tenantFolderId]
        },
        fields: "id"
      });
    }
  }
  return tenantFolderId;
}
router5.post(
  "/:id/ensure-drive-folder",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [rows] = await db_default.query(
      "SELECT id, name, document_id, property_id, tenant_drive_folder_id FROM tenants WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Inquilino no encontrado" });
      return;
    }
    const tenant = rows[0];
    if (tenant.tenant_drive_folder_id) {
      res.json({
        success: true,
        tenantDriveFolderId: tenant.tenant_drive_folder_id,
        created: false,
        message: "El arrendatario ya tiene carpeta en Drive"
      });
      return;
    }
    let drive;
    try {
      drive = await getFreshDriveClient(req);
    } catch (e) {
      res.status(400).json({
        error: "No hay conexi\xF3n con Google Drive. Conect\xE1 Drive en Configuraci\xF3n."
      });
      return;
    }
    const driveCtx = await getDriveContext(req);
    const rootFolderId = driveCtx?.rootFolderId;
    if (!rootFolderId) {
      res.status(400).json({
        error: "No hay carpeta ra\xEDz de InmoControl configurada en Drive. Reconect\xE1 Drive en Configuraci\xF3n."
      });
      return;
    }
    const folderId = await ensureTenantDriveFolder(drive, rootFolderId, {
      id: tenant.id,
      name: tenant.name,
      documentId: tenant.document_id,
      propertyId: tenant.property_id
    });
    await db_default.query(
      "UPDATE tenants SET tenant_drive_folder_id = ? WHERE id = ?",
      [folderId, id]
    );
    res.json({
      success: true,
      tenantDriveFolderId: folderId,
      created: true,
      message: "Carpeta de Drive creada y vinculada al arrendatario"
    });
  })
);
router5.post(
  "/:id/link-drive-folder",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { driveFolderId, createSubfolders } = req.body;
    if (!driveFolderId) {
      res.status(400).json({ error: "Falta driveFolderId en el body" });
      return;
    }
    const [rows] = await db_default.query(
      "SELECT id, tenant_drive_folder_id FROM tenants WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Inquilino no encontrado" });
      return;
    }
    let drive;
    try {
      drive = await getFreshDriveClient(req);
    } catch {
      res.status(400).json({ error: "No hay conexi\xF3n con Google Drive" });
      return;
    }
    const meta = await drive.files.get({
      fileId: driveFolderId,
      fields: "id, name, mimeType, trashed"
    });
    if (meta.data.trashed) {
      res.status(400).json({ error: "La carpeta est\xE1 en la papelera de Drive" });
      return;
    }
    if (meta.data.mimeType !== "application/vnd.google-apps.folder") {
      res.status(400).json({
        error: `El ID apunta a un archivo (${meta.data.name}), no a una carpeta`
      });
      return;
    }
    if (createSubfolders) {
      for (const sf of ["Cedula", "Contrato", "Recibos"]) {
        const subExisting = await drive.files.list({
          q: `name='${sf}' and mimeType='application/vnd.google-apps.folder' and '${driveFolderId}' in parents and trashed=false`,
          fields: "files(id)",
          spaces: "drive"
        });
        if (!subExisting.data.files?.[0]?.id) {
          await drive.files.create({
            requestBody: {
              name: sf,
              mimeType: "application/vnd.google-apps.folder",
              parents: [driveFolderId]
            },
            fields: "id"
          });
        }
      }
    }
    await db_default.query(
      "UPDATE tenants SET tenant_drive_folder_id = ? WHERE id = ?",
      [driveFolderId, id]
    );
    res.json({
      success: true,
      tenantDriveFolderId: driveFolderId,
      folderName: meta.data.name,
      message: `Carpeta "${meta.data.name}" vinculada al arrendatario`
    });
  })
);
router5.get(
  "/:id/documents",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const folder = req.query.folder || "Cedula";
    const allowedFolders = ["Cedula", "Contrato", "Recibos", "Acta"];
    if (!allowedFolders.includes(folder)) {
      res.status(400).json({ error: `Carpeta inv\xE1lida. Usa: ${allowedFolders.join(", ")}` });
      return;
    }
    try {
      const [rows] = await db_default.query(
        "SELECT tenant_drive_folder_id FROM tenants WHERE id = ?",
        [id]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "Inquilino no encontrado" });
        return;
      }
      const tenantDriveFolderId = rows[0]?.tenant_drive_folder_id;
      if (!tenantDriveFolderId) {
        res.json({ files: [] });
        return;
      }
      const drive = await getFreshDriveClient(req);
      const subfolderRes = await drive.files.list({
        q: `name='${folder}' and mimeType='application/vnd.google-apps.folder' and '${tenantDriveFolderId}' in parents and trashed=false`,
        fields: "files(id)",
        spaces: "drive"
      });
      const subfolderId = subfolderRes.data.files?.[0]?.id;
      if (!subfolderId) {
        res.json({ files: [] });
        return;
      }
      const filesRes = await drive.files.list({
        q: `'${subfolderId}' in parents and trashed=false`,
        fields: "files(id, name, webViewLink, mimeType, size, createdTime)",
        spaces: "drive",
        orderBy: "createdTime desc"
      });
      res.json({ files: filesRes.data.files ?? [] });
    } catch (err) {
      console.error("[tenants] list documents error:", err.message);
      res.json({ files: [] });
    }
  })
);
router5.patch(
  "/:id",
  requireRole("canEditTenant"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const allowed = [
      "name",
      "document_id",
      "email",
      "phone",
      "rent",
      "admin_fee",
      "lease_start_date",
      "status",
      "property_id"
    ];
    const updates = [];
    const values = [];
    const map = {
      idNumber: "document_id",
      leaseStartDate: "lease_start_date",
      propertyId: "property_id",
      adminFee: "admin_fee"
    };
    for (const f of allowed) {
      const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const requestKey = Object.keys(map).find((k) => map[k] === camel) ?? camel;
      if (req.body[requestKey] !== void 0) {
        updates.push(`${f} = ?`);
        values.push(req.body[requestKey]);
      }
    }
    if (!updates.length) {
      res.json({ success: true, message: "Nothing to update" });
      return;
    }
    values.push(id);
    const patchCtx = await getOrgIdForRequest(req);
    if (patchCtx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = patchCtx.orgId;
    await db_default.query(
      `UPDATE tenants SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
      [...values, orgId]
    );
    res.json({ success: true });
  })
);
router5.delete(
  "/:id",
  requireRole("canDeleteTenant"),
  asyncHandler(async (req, res) => {
    const delCtx = await getOrgIdForRequest(req);
    if (delCtx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = delCtx.orgId;
    await db_default.query(
      `DELETE FROM tenants WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    res.json({ success: true });
  })
);
router5.post(
  "/upload-document",
  requireRole("canManageDrive"),
  asyncHandler(async (req, res) => {
    const { tenantDriveFolderId, folder, fileName, base64Data } = req.body;
    if (!tenantDriveFolderId || !folder || !fileName || !base64Data) {
      res.status(400).json({ error: "Faltan campos requeridos" });
      return;
    }
    assertBase64Size(base64Data, MAX_PDF_BYTES, "El documento");
    const allowedFolders = ["Cedula", "Contrato", "Recibos"];
    if (!allowedFolders.includes(folder)) {
      res.status(400).json({ error: `Carpeta inv\xE1lida. Usa: ${allowedFolders.join(", ")}` });
      return;
    }
    try {
      const drive = await getFreshDriveClient(req);
      const subfolderRes = await drive.files.list({
        q: `name='${folder}' and mimeType='application/vnd.google-apps.folder' and '${tenantDriveFolderId}' in parents and trashed=false`,
        fields: "files(id)",
        spaces: "drive"
      });
      const subfolderId = subfolderRes.data.files?.[0]?.id;
      if (!subfolderId) {
        res.status(404).json({ error: `Subcarpeta "${folder}" no encontrada en Drive` });
        return;
      }
      const fileBuffer = Buffer.from(base64Data, "base64");
      const uploaded = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [subfolderId]
        },
        media: {
          mimeType: "application/pdf",
          body: Readable.from(fileBuffer)
        },
        fields: "id, webViewLink"
      });
      await drive.permissions.create({
        fileId: uploaded.data.id,
        requestBody: { role: "reader", type: "anyone" }
      });
      console.log(`[Drive] "${fileName}" subido a ${folder} del arrendatario`);
      res.json({
        fileId: uploaded.data.id,
        webViewLink: uploaded.data.webViewLink
      });
    } catch (err) {
      console.error("[Drive] Error subiendo documento:", err);
      throw err;
    }
  })
);
router5.post(
  "/upload-acta",
  requireRole("canManageDrive"),
  asyncHandler(async (req, res) => {
    const { tenantDriveFolderId, fileName, base64Data } = req.body;
    if (!tenantDriveFolderId || !fileName || !base64Data) {
      res.status(400).json({ error: "Faltan campos requeridos" });
      return;
    }
    try {
      const drive = await getFreshDriveClient(req);
      let actaFolderId;
      const subfolderRes = await drive.files.list({
        q: `name='Acta' and mimeType='application/vnd.google-apps.folder' and '${tenantDriveFolderId}' in parents and trashed=false`,
        fields: "files(id)",
        spaces: "drive"
      });
      actaFolderId = subfolderRes.data.files?.[0]?.id;
      if (!actaFolderId) {
        const created = await drive.files.create({
          requestBody: {
            name: "Acta",
            mimeType: "application/vnd.google-apps.folder",
            parents: [tenantDriveFolderId]
          },
          fields: "id"
        });
        actaFolderId = created.data.id;
        console.log(`[Drive] Subcarpeta Acta/ creada para el arrendatario`);
      }
      const fileBuffer = Buffer.from(base64Data, "base64");
      const uploaded = await drive.files.create({
        requestBody: { name: fileName, parents: [actaFolderId] },
        media: { mimeType: "application/pdf", body: Readable.from(fileBuffer) },
        fields: "id, webViewLink"
      });
      await drive.permissions.create({
        fileId: uploaded.data.id,
        requestBody: { role: "reader", type: "anyone" }
      });
      console.log(`[Drive] Acta "${fileName}" subida a Acta/ del arrendatario`);
      res.json({
        fileId: uploaded.data.id,
        webViewLink: uploaded.data.webViewLink
      });
    } catch (err) {
      console.error("[Drive] Error subiendo acta:", err.message);
      res.status(500).json({ error: "Error subiendo acta a Drive: " + err.message });
    }
  })
);
var tenants_default = router5;

// server/routes/properties.ts
init_db();
import * as dotenv4 from "dotenv";
import express3 from "express";
import crypto7 from "crypto";
dotenv4.config({ path: ".env.local" });
var router6 = express3.Router();
router6.use(requireAuth);
var GOOGLE_API_TIMEOUT_MS2 = 8e3;
function withTimeout3(p, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout after ${ms}ms: ${label}`)),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
async function getDriveContextWithTimeout(req) {
  try {
    return await withTimeout3(
      getDriveContext(req),
      GOOGLE_API_TIMEOUT_MS2,
      "drive context"
    );
  } catch (err) {
    console.warn(
      "[Drive] no se pudo preparar el cliente (continuando sin Drive):",
      err?.message
    );
    return null;
  }
}
var DOC_TYPES = {
  cedula: "cedula",
  certificado_tradicion: "certificado_tradicion",
  predial: "predial",
  rut: "rut",
  otro: "otro"
};
var UNIT_TYPES = /* @__PURE__ */ new Set(["parking", "storage", "other"]);
function parseDocumentKey(key, firstOwnerId) {
  if (key.includes(":")) {
    const [docTypeRaw, link] = key.split(":", 2);
    if (!Object.prototype.hasOwnProperty.call(DOC_TYPES, docTypeRaw))
      return null;
    const docType = docTypeRaw;
    if (docType === "cedula" || docType === "rut") {
      return { docType, ownerId: link, unitId: null };
    }
    if (docType === "certificado_tradicion") {
      return { docType, ownerId: null, unitId: link === "main" ? null : link };
    }
    if (docType === "predial") {
      return null;
    }
    return { docType, ownerId: null, unitId: null };
  }
  const LEGACY_MAP = {
    "C\xE9dula de Ciudadan\xEDa": {
      docType: "cedula",
      ownerId: firstOwnerId,
      unitId: null
    },
    "Rut Actualizado": { docType: "rut", ownerId: firstOwnerId, unitId: null },
    "Impuesto Predial": { docType: "predial", ownerId: null, unitId: null },
    "Certificado de Tradici\xF3n": {
      docType: "certificado_tradicion",
      ownerId: null,
      unitId: null
    }
  };
  return LEGACY_MAP[key] ?? null;
}
router6.post(
  "/",
  requireRole("canAddProperty"),
  asyncHandler(async (req, res) => {
    console.log("[POST /api/properties] body:", {
      address: req.body.address,
      owner: req.body.ownerName,
      localId: req.body.localId,
      hasMandate: !!req.body.mandatePdfUrl,
      docsCount: req.body.documents ? Object.keys(req.body.documents).length : 0,
      ownersCount: Array.isArray(req.body.owners) ? req.body.owners.length : 0,
      unitsCount: Array.isArray(req.body.units) ? req.body.units.length : 0
    });
    const {
      localId,
      chip,
      folio,
      ownerIdNumber,
      ownerPhone,
      ownerEmail,
      propertyType,
      mandatePdfUrl,
      mandateSignedAt,
      inventoryCaptacionPdfUrl,
      inventoryColocacionPdfUrl,
      status,
      owners,
      units,
      documents
    } = req.body;
    let { address, ownerName } = req.body;
    try {
      const isUpsert = !!(localId && !String(localId).startsWith("wizard-"));
      if (!address || !ownerName) {
        if (isUpsert) {
          try {
            const [existingRows] = await db_default.query(
              "SELECT id, organization_id FROM properties WHERE id = ?",
              [localId]
            );
            if (existingRows.length === 0) {
              res.status(404).json({
                error: `No se encontr\xF3 la propiedad con id=${localId}.`,
                code: "PROPERTY_NOT_FOUND"
              });
              return;
            }
            console.log(
              `[POST /api/properties] doc-only update detectado (localId=${localId}, sin address/ownerName). OK \u2014 se re-leen del row existente abajo.`
            );
            if (!address && !ownerName) {
            }
          } catch (lookupErr) {
            console.error(
              "[POST /api/properties] no se pudo validar la propiedad existente:",
              lookupErr
            );
            throw internalExpose(
              "No se pudo validar la propiedad existente.",
              "LOOKUP_FAILED"
            );
          }
        } else {
          res.status(400).json({
            error: "Faltan campos requeridos: address, ownerName",
            code: "MISSING_REQUIRED_FIELDS"
          });
          return;
        }
      }
      let driveFolderId = null;
      let driveFolderPath = null;
      if (!isUpsert) {
        const driveCtx = await getDriveContextWithTimeout(req);
        if (driveCtx) {
          try {
            const drive = driveCtx.drive;
            const rootFolderId = driveCtx.rootFolderId;
            if (rootFolderId) {
              const safeAddress = escapeDriveQueryValue(address);
              const existing = await withTimeout3(
                drive.files.list({
                  q: `name='${safeAddress}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
                  fields: "files(id)",
                  spaces: "drive"
                }),
                GOOGLE_API_TIMEOUT_MS2,
                "drive.files.list (property folder)"
              );
              let folderId = existing.data.files?.[0]?.id;
              if (!folderId) {
                const created = await withTimeout3(
                  drive.files.create({
                    requestBody: {
                      name: address,
                      mimeType: "application/vnd.google-apps.folder",
                      parents: [rootFolderId]
                    },
                    fields: "id"
                  }),
                  GOOGLE_API_TIMEOUT_MS2,
                  "drive.files.create (property folder)"
                );
                folderId = created.data.id;
              }
              driveFolderId = folderId;
              driveFolderPath = `InmoControl/${address}`;
              const subs = ["Propietario", "Inventarios"];
              for (const sub of subs) {
                const subExisting = await withTimeout3(
                  drive.files.list({
                    q: `name='${sub}' and mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
                    fields: "files(id)",
                    spaces: "drive"
                  }),
                  GOOGLE_API_TIMEOUT_MS2,
                  `drive.files.list (subfolder ${sub})`
                );
                if (!subExisting.data.files?.length) {
                  await withTimeout3(
                    drive.files.create({
                      requestBody: {
                        name: sub,
                        mimeType: "application/vnd.google-apps.folder",
                        parents: [folderId]
                      },
                      fields: "id"
                    }),
                    GOOGLE_API_TIMEOUT_MS2,
                    `drive.files.create (subfolder ${sub})`
                  );
                }
              }
            }
          } catch (err) {
            console.warn(
              "[Drive] Error creando carpeta de propiedad:",
              err.message
            );
          }
        }
      }
      const propertyId = localId && !String(localId).startsWith("wizard-") ? localId : crypto7.randomUUID();
      const dbStatus = status || "Pendiente";
      if (isUpsert && (!address || !ownerName)) {
        try {
          const [existingForFill] = await db_default.query(
            "SELECT address, owner_name FROM properties WHERE id = ?",
            [propertyId]
          );
          if (existingForFill.length > 0) {
            address = address || existingForFill[0].address;
            ownerName = ownerName || existingForFill[0].owner_name;
            console.log(
              `[POST /api/properties] re-llenado address/ownerName desde row existente: address="${address}", ownerName="${ownerName}"`
            );
          }
        } catch (fillErr) {
          console.warn(
            "[POST /api/properties] no se pudo re-llenar address/ownerName del row:",
            fillErr.message
          );
        }
      }
      const toMysqlDateTime = (iso) => {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      };
      const dbMandateSignedAt = toMysqlDateTime(mandateSignedAt);
      let orgId;
      try {
        const ctx = await getOrgIdForRequest(req);
        if (ctx.isLegacySession) {
          res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
          return;
        }
        orgId = ctx.orgId;
      } catch (err) {
        console.error("[POST /api/properties] Error resolviendo orgId:", err);
        throw internal();
      }
      const bodyOrgId = req.body?.organizationId;
      if (bodyOrgId && bodyOrgId !== orgId) {
        res.status(403).json({
          error: "No pod\xE9s crear recursos en otra organizaci\xF3n",
          code: "CROSS_TENANT_FORBIDDEN"
        });
        return;
      }
      try {
        if (isUpsert) {
          const [updateResult] = await db_default.query(
            `UPDATE properties SET
           address           = COALESCE(?, address),
           chip              = COALESCE(?, chip),
           folio             = COALESCE(?, folio),
           owner_name        = COALESCE(?, owner_name),
           owner_id_number   = COALESCE(?, owner_id_number),
           owner_phone       = COALESCE(?, owner_phone),
           owner_email       = COALESCE(?, owner_email),
           drive_folder_id   = COALESCE(?, drive_folder_id),
           drive_folder_path = COALESCE(?, drive_folder_path),
           property_type     = COALESCE(?, property_type),
           status            = COALESCE(NULLIF(?, ''), status),
           mandato_pdf_url   = CASE WHEN ? IS NULL OR ? = '' THEN mandato_pdf_url ELSE ? END,
           mandato_signed_at = COALESCE(?, mandato_signed_at),
           inventory_captacion_pdf_url = CASE WHEN ? IS NULL OR ? = '' THEN inventory_captacion_pdf_url ELSE ? END,
           inventory_colocacion_pdf_url = CASE WHEN ? IS NULL OR ? = '' THEN inventory_colocacion_pdf_url ELSE ? END
         WHERE id = ? AND organization_id = ?`,
            [
              address ?? null,
              chip ?? null,
              folio ?? null,
              ownerName ?? null,
              ownerIdNumber ?? null,
              ownerPhone ?? null,
              ownerEmail ?? null,
              driveFolderId,
              driveFolderPath,
              propertyType ?? null,
              dbStatus,
              mandatePdfUrl ?? null,
              mandatePdfUrl ?? null,
              mandatePdfUrl ?? null,
              dbMandateSignedAt,
              inventoryCaptacionPdfUrl ?? null,
              inventoryCaptacionPdfUrl ?? null,
              inventoryCaptacionPdfUrl ?? null,
              inventoryColocacionPdfUrl ?? null,
              inventoryColocacionPdfUrl ?? null,
              inventoryColocacionPdfUrl ?? null,
              propertyId,
              orgId
            ]
          );
          if (updateResult.affectedRows === 0) {
            console.error(
              "[POST /api/properties] UPSERT no afect\xF3 ninguna fila:",
              { propertyId, orgId }
            );
            throw internalExpose(
              "No se pudo actualizar la propiedad: el id no existe o pertenece a otra organizaci\xF3n",
              "UPSERT_NO_MATCH"
            );
          }
        } else {
          if (mandatePdfUrl && typeof mandatePdfUrl === "string" && (mandatePdfUrl.startsWith("blob:") || mandatePdfUrl.startsWith("data:"))) {
            return res.status(400).json({
              error: "mandato_pdf_url no puede ser un blob/data URL \u2014 solo URLs de Drive (https://). Reintent\xE1 con Drive conectado."
            });
          }
          await db_default.query(
            `INSERT INTO properties
          (id, organization_id, address, chip, folio, owner_name, owner_id_number, owner_phone, owner_email,
           status, drive_folder_id, drive_folder_path, property_type,
           mandato_pdf_url, mandato_signed_at, inventory_captacion_pdf_url, inventory_colocacion_pdf_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              propertyId,
              orgId,
              address,
              chip || null,
              folio || null,
              ownerName,
              ownerIdNumber || null,
              ownerPhone || null,
              ownerEmail || null,
              dbStatus,
              driveFolderId,
              driveFolderPath,
              propertyType || null,
              mandatePdfUrl ?? null,
              dbMandateSignedAt,
              inventoryCaptacionPdfUrl ?? null,
              inventoryColocacionPdfUrl ?? null
            ]
          );
        }
      } catch (err) {
        console.error("[DB] Error creando propiedad:", err.message);
        res.status(500).json({ error: "Error guardando propiedad: " + err.message });
        return;
      }
      if (Array.isArray(owners)) {
        try {
          await withTransaction(async (conn) => {
            const ownerIds = [];
            await conn.query(
              `DELETE FROM property_owners WHERE property_id = ?`,
              [propertyId]
            );
            for (let i = 0; i < owners.length; i++) {
              const o = owners[i] ?? {};
              const ownerId = typeof o.id === "string" && o.id && !o.id.startsWith("wizard-") ? o.id : crypto7.randomUUID();
              const name = String(o.name ?? "").trim();
              if (!name) continue;
              const idNumber = o.idNumber ?? o.id_number ?? null;
              const phone = o.phone ?? null;
              const email = o.email ?? null;
              let ownershipPct = null;
              if (o.ownershipPct !== void 0 && o.ownershipPct !== null && o.ownershipPct !== "") {
                const n = Number(o.ownershipPct);
                if (!isNaN(n) && n >= 0 && n <= 100) ownershipPct = n;
              }
              const position = Number(o.position) || i + 1;
              await conn.query(
                `INSERT INTO property_owners
              (id, organization_id, property_id, name, id_number, phone, email,
               ownership_pct, position, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  ownerId,
                  orgId,
                  propertyId,
                  name,
                  idNumber ? String(idNumber) : null,
                  phone ? String(phone) : null,
                  email ? String(email) : null,
                  ownershipPct,
                  position,
                  o.notes ?? null
                ]
              );
              ownerIds.push(ownerId);
            }
          });
        } catch (err) {
          console.error(
            "[DB] Error persistiendo property_owners:",
            err.message
          );
          console.error("[DB] Error persistiendo property_owners:", {
            err: err?.message,
            orgId,
            propertyId
          });
          throw err;
        }
      }
      if (Array.isArray(units)) {
        try {
          await withTransaction(async (conn) => {
            await conn.query(
              `DELETE FROM property_units WHERE property_id = ?`,
              [propertyId]
            );
            for (let i = 0; i < units.length; i++) {
              const u = units[i] ?? {};
              const type = String(u.type ?? "").trim();
              if (!UNIT_TYPES.has(type)) {
                console.warn(
                  `[units] tipo inv\xE1lido "${type}" \u2014 se salta. Permitidos: ${[...UNIT_TYPES].join(", ")}`
                );
                continue;
              }
              const label = String(u.label ?? "").trim();
              if (!label) continue;
              const unitId = typeof u.id === "string" && u.id && !u.id.startsWith("wizard-") ? u.id : crypto7.randomUUID();
              const folioMatricula = u.folioMatricula ?? u.folio_matricula ?? null;
              const areaM2 = u.areaM2 ?? u.area_m2 ?? null;
              const position = Number(u.position) || i + 1;
              await conn.query(
                `INSERT INTO property_units
              (id, organization_id, property_id, type, label, folio_matricula,
               area_m2, notes, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  unitId,
                  orgId,
                  propertyId,
                  type,
                  label,
                  folioMatricula ? String(folioMatricula) : null,
                  areaM2 !== null && areaM2 !== "" ? Number(areaM2) : null,
                  u.notes ?? null,
                  position
                ]
              );
            }
          });
        } catch (err) {
          console.error("[DB] Error persistiendo property_units:", {
            err: err?.message,
            orgId,
            propertyId
          });
          throw err;
        }
      }
      let firstOwnerId = null;
      try {
        const [po] = await db_default.query(
          `SELECT id FROM property_owners WHERE property_id = ? ORDER BY position ASC LIMIT 1`,
          [propertyId]
        );
        firstOwnerId = po[0]?.id ?? null;
      } catch {
      }
      if (documents && typeof documents === "object") {
        for (const [key, url] of Object.entries(documents)) {
          if (typeof url !== "string" || !url) continue;
          if (url.startsWith("blob:") || url.startsWith("data:")) {
            console.warn(
              `[docs] rechazando "${key}" \u2014 URL local (${url.slice(0, 40)}...) no se persiste en MySQL. El cliente debe re-subir cuando Drive est\xE9 conectado.`
            );
            continue;
          }
          const parsed = parseDocumentKey(key, firstOwnerId);
          if (!parsed) continue;
          if (parsed.ownerId && String(parsed.ownerId).startsWith("wizard-")) {
            console.warn(`[docs] se salta "${key}" \u2014 ownerId es wizard-temp`);
            continue;
          }
          if (parsed.unitId && String(parsed.unitId).startsWith("wizard-")) {
            console.warn(`[docs] se salta "${key}" \u2014 unitId es wizard-temp`);
            continue;
          }
          try {
            await db_default.query(
              `INSERT INTO property_documents
            (id, property_id, owner_id, unit_id, doc_type, file_name, file_url, file_size, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             owner_id   = VALUES(owner_id),
             unit_id    = VALUES(unit_id),
             file_url   = VALUES(file_url),
             file_name  = VALUES(file_name),
             uploaded_at = CURRENT_TIMESTAMP`,
              [
                crypto7.randomUUID(),
                propertyId,
                parsed.ownerId,
                parsed.unitId,
                parsed.docType,
                `${key}.pdf`,
                url,
                null,
                // Trazabilidad real: antes se guardaba el literal "default_user".
                req.user?.id ?? null
              ]
            );
          } catch (err) {
            console.warn(
              `[DB] No se pudo persistir property_document (${key}):`,
              err.message
            );
          }
        }
      }
      let responseDriveFolderId = driveFolderId;
      let responseDriveFolderPath = driveFolderPath;
      if (isUpsert && (!responseDriveFolderId || !responseDriveFolderPath)) {
        const [existing] = await db_default.query(
          "SELECT drive_folder_id, drive_folder_path FROM properties WHERE id = ?",
          [propertyId]
        );
        if (existing.length) {
          responseDriveFolderId = responseDriveFolderId ?? existing[0].drive_folder_id;
          responseDriveFolderPath = responseDriveFolderPath ?? existing[0].drive_folder_path;
        }
      }
      console.log(
        "[POST /api/properties] OK \u2014 id:",
        propertyId,
        "drive:",
        responseDriveFolderPath ?? "(sin Drive)"
      );
      res.json({
        success: true,
        propertyId,
        driveFolderId: responseDriveFolderId,
        driveFolderPath: responseDriveFolderPath,
        message: responseDriveFolderId ? "Propiedad guardada en MySQL y Drive" : "Propiedad guardada en MySQL (sin Drive \u2014 conecta tu Google Drive)"
      });
    } catch (err) {
      console.error("[POST /api/properties] UNHANDLED:", err?.message ?? err);
      throw err;
    }
  })
);
router6.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const propertyId = req.params.id;
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT p.id, p.address, p.chip, p.folio, p.owner_name, p.owner_id_number, p.owner_phone, p.owner_email,
            p.status, p.property_type, p.drive_folder_id, p.drive_folder_path,
            p.inventory_pdf_url, p.inventory_captacion_pdf_url, p.inventory_colocacion_pdf_url,
            p.mandato_pdf_url, p.mandato_signed_at, p.created_at,
            COALESCE((SELECT COUNT(*) FROM inventories i WHERE i.property_id = p.id), 0) AS inventory_count
     FROM properties p
     WHERE p.id = ? AND p.organization_id = ?
     LIMIT 1`,
      [propertyId, orgId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    const p = rows[0];
    const [ownerRows] = await db_default.query(
      `SELECT id, name, id_number, phone, email, ownership_pct, position, notes
     FROM property_owners
     WHERE property_id = ?
     ORDER BY position ASC`,
      [propertyId]
    );
    const ownerIds = ownerRows.map((o) => o.id);
    const docsByOwner = {};
    if (ownerIds.length > 0) {
      const [docRows] = await db_default.query(
        `SELECT owner_id, doc_type, file_url
       FROM property_documents
       WHERE property_id = ? AND owner_id IN (${ownerIds.map(() => "?").join(",")})`,
        [propertyId, ...ownerIds]
      );
      for (const d of docRows) {
        if (!d.owner_id) continue;
        if (!docsByOwner[d.owner_id]) docsByOwner[d.owner_id] = {};
        if (d.doc_type === "cedula" || d.doc_type === "rut") {
          docsByOwner[d.owner_id][d.doc_type] = d.file_url;
        }
      }
    }
    const owners = ownerRows.map((o) => ({
      id: o.id,
      name: o.name,
      idNumber: o.id_number,
      phone: o.phone,
      email: o.email,
      ownershipPct: o.ownership_pct !== null ? Number(o.ownership_pct) : null,
      position: o.position,
      notes: o.notes,
      documents: docsByOwner[o.id] ?? {}
    }));
    const [unitRows] = await db_default.query(
      `SELECT id, type, label, folio_matricula, area_m2, notes, position
     FROM property_units
     WHERE property_id = ?
     ORDER BY position ASC`,
      [propertyId]
    );
    const unitIds = unitRows.map((u) => u.id);
    const docsByUnit = {};
    if (unitIds.length > 0) {
      const [docRows] = await db_default.query(
        `SELECT unit_id, doc_type, file_url
       FROM property_documents
       WHERE property_id = ? AND unit_id IN (${unitIds.map(() => "?").join(",")})`,
        [propertyId, ...unitIds]
      );
      for (const d of docRows) {
        if (!d.unit_id) continue;
        if (!docsByUnit[d.unit_id]) docsByUnit[d.unit_id] = {};
        if (d.doc_type === "certificado_tradicion") {
          docsByUnit[d.unit_id].certificado_tradicion = d.file_url;
        }
      }
    }
    const units = unitRows.map((u) => ({
      id: u.id,
      type: u.type,
      label: u.label,
      folioMatricula: u.folio_matricula,
      areaM2: u.area_m2 !== null ? Number(u.area_m2) : null,
      notes: u.notes,
      position: u.position,
      documents: docsByUnit[u.id] ?? {}
    }));
    const [propDocRows] = await db_default.query(
      `SELECT doc_type, file_url
     FROM property_documents
     WHERE property_id = ? AND owner_id IS NULL AND unit_id IS NULL`,
      [propertyId]
    );
    const propertyDocuments = {};
    for (const d of propDocRows) {
      if (d.doc_type === "predial" || d.doc_type === "certificado_tradicion") {
        propertyDocuments[d.doc_type] = d.file_url;
      }
    }
    const firstOwner = owners[0];
    const documentsLegacy = {
      "C\xE9dula de Ciudadan\xEDa": firstOwner?.documents?.cedula ?? "",
      "Rut Actualizado": firstOwner?.documents?.rut ?? "",
      "Impuesto Predial": propertyDocuments.predial ?? "",
      "Certificado de Tradici\xF3n": propertyDocuments.certificado_tradicion ?? ""
    };
    for (const k of Object.keys(documentsLegacy)) {
      if (!documentsLegacy[k]) delete documentsLegacy[k];
    }
    res.json({
      id: p.id,
      address: p.address,
      chip: p.chip,
      folio: p.folio,
      owner_name: p.owner_name,
      owner_id_number: p.owner_id_number,
      owner_phone: p.owner_phone,
      owner_email: p.owner_email,
      status: p.status,
      property_type: p.property_type,
      drive_folder_id: p.drive_folder_id,
      drive_folder_path: p.drive_folder_path,
      inventory_pdf_url: p.inventory_pdf_url,
      inventario_captacion_pdf_url: p.inventory_captacion_pdf_url,
      inventario_colocacion_pdf_url: p.inventory_colocacion_pdf_url,
      inventory_captacion_pdf_url: p.inventory_captacion_pdf_url,
      inventory_colocacion_pdf_url: p.inventory_colocacion_pdf_url,
      mandato_pdf_url: p.mandato_pdf_url,
      mandate_pdf_url: p.mandato_pdf_url,
      mandate_signed_at: p.mandato_signed_at,
      created_at: p.created_at,
      inventory_count: p.inventory_count,
      // ── Estructura nueva (migración 010+) ──
      owners,
      units,
      documents: propertyDocuments,
      // ── Compat con frontend legacy ──
      documents_legacy: documentsLegacy
    });
  })
);
router6.get(
  "/",
  asyncHandler(async (req, res) => {
    const expand = req.query.expand === "full";
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT p.id, p.address, p.chip, p.folio, p.owner_name, p.owner_id_number, p.owner_phone, p.owner_email,
            p.status, p.property_type, p.drive_folder_id, p.drive_folder_path,
            p.inventory_pdf_url, p.mandato_pdf_url, p.mandato_signed_at, p.created_at,
            COALESCE((SELECT COUNT(*) FROM inventories i WHERE i.property_id = p.id), 0) AS inventory_count
     FROM properties p
     WHERE p.organization_id = ? AND p.archived = 0
     ORDER BY p.created_at DESC`,
      [orgId]
    );
    const propertyIds = rows.map((r) => r.id);
    if (propertyIds.length === 0) {
      res.json({ properties: [] });
      return;
    }
    const [ownerRows] = await db_default.query(
      `SELECT id, property_id, name, id_number, phone, email, ownership_pct, position
     FROM property_owners
     WHERE property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY position ASC`,
      propertyIds
    );
    const ownersByProperty = {};
    for (const o of ownerRows) {
      if (!ownersByProperty[o.property_id])
        ownersByProperty[o.property_id] = [];
      ownersByProperty[o.property_id].push({
        id: o.id,
        name: o.name,
        idNumber: o.id_number,
        phone: o.phone,
        email: o.email,
        ownershipPct: o.ownership_pct !== null ? Number(o.ownership_pct) : null,
        position: o.position
      });
    }
    const [unitRows] = await db_default.query(
      `SELECT id, property_id, type, label, folio_matricula, area_m2, position
     FROM property_units
     WHERE property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY position ASC`,
      propertyIds
    );
    const unitsByProperty = {};
    for (const u of unitRows) {
      if (!unitsByProperty[u.property_id]) unitsByProperty[u.property_id] = [];
      unitsByProperty[u.property_id].push({
        id: u.id,
        type: u.type,
        label: u.label,
        folioMatricula: u.folio_matricula,
        areaM2: u.area_m2 !== null ? Number(u.area_m2) : null,
        position: u.position
      });
    }
    const [docRows] = await db_default.query(
      `SELECT property_id, doc_type, file_url
     FROM property_documents
     WHERE property_id IN (${propertyIds.map(() => "?").join(",")})`,
      propertyIds
    );
    const docsByProperty = {};
    for (const d of docRows) {
      if (!docsByProperty[d.property_id]) docsByProperty[d.property_id] = {};
      if (d.doc_type === "cedula")
        docsByProperty[d.property_id]["C\xE9dula de Ciudadan\xEDa"] = d.file_url;
      else if (d.doc_type === "rut")
        docsByProperty[d.property_id]["Rut Actualizado"] = d.file_url;
      else if (d.doc_type === "predial")
        docsByProperty[d.property_id]["Impuesto Predial"] = d.file_url;
      else if (d.doc_type === "certificado_tradicion")
        docsByProperty[d.property_id]["Certificado de Tradici\xF3n"] = d.file_url;
    }
    const properties = rows.map((r) => ({
      ...r,
      documents: docsByProperty[r.id] ?? {},
      mandatePdfUrl: r.mandato_pdf_url,
      mandateSignedAt: r.mandato_signed_at,
      driveFolderId: r.drive_folder_id,
      driveFolderPath: r.drive_folder_path,
      propertyType: r.property_type,
      ownerIdNumber: r.owner_id_number,
      // Migración 010+
      owners: ownersByProperty[r.id] ?? [],
      units: unitsByProperty[r.id] ?? []
    }));
    res.json({ properties });
  })
);
router6.patch(
  "/:id",
  requireRole("canEditProperty"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const allowed = [
      "address",
      "chip",
      "folio",
      "owner_name",
      "owner_id_number",
      "owner_phone",
      "owner_email",
      "status",
      "property_type",
      "mandato_pdf_url",
      "mandato_signed_at",
      "drive_folder_id",
      "drive_folder_path",
      "inventory_pdf_url"
    ];
    const updates = [];
    const values = [];
    const toMysqlDateTime = (v) => {
      if (v === null || v === void 0 || v === "") return null;
      if (typeof v !== "string") return null;
      if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(v)) return v;
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 19).replace("T", " ");
    };
    const fieldAliases = {
      mandato_pdf_url: ["mandato_pdf_url", "mandatoPdfUrl", "mandatePdfUrl"],
      mandato_signed_at: [
        "mandato_signed_at",
        "mandatoSignedAt",
        "mandateSignedAt"
      ],
      drive_folder_id: ["drive_folder_id", "driveFolderId"],
      drive_folder_path: ["drive_folder_path", "driveFolderPath"],
      inventory_pdf_url: ["inventory_pdf_url", "inventoryPdfUrl"],
      property_type: ["property_type", "propertyType"],
      owner_name: ["owner_name", "ownerName"],
      owner_id_number: ["owner_id_number", "ownerIdNumber"],
      owner_phone: ["owner_phone", "ownerPhone"],
      owner_email: ["owner_email", "ownerEmail"]
    };
    for (const f of allowed) {
      const keys = fieldAliases[f] ?? [
        f,
        f.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      ];
      let value;
      for (const k of keys) {
        if (req.body[k] !== void 0) {
          value = req.body[k];
          break;
        }
      }
      if (value !== void 0) {
        if (f === "mandato_signed_at") {
          value = toMysqlDateTime(value);
        }
        updates.push(`${f} = ?`);
        values.push(value);
      }
    }
    if (!updates.length) {
      res.json({ success: true, message: "Nothing to update" });
      return;
    }
    for (let i = 0; i < updates.length; i++) {
      if (updates[i].startsWith("mandato_pdf_url = ?")) {
        const v = values[i];
        if (typeof v === "string" && (v.startsWith("blob:") || v.startsWith("data:"))) {
          return res.status(400).json({
            error: "mandato_pdf_url no puede ser un blob/data URL \u2014 solo URLs de Drive (https://). Reintent\xE1 desde el Detalle del Inmueble con Drive conectado."
          });
        }
      }
    }
    values.push(id);
    const patchCtx = await getOrgIdForRequest(req);
    if (patchCtx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = patchCtx.orgId;
    const [exists] = await db_default.query(
      `SELECT 1 FROM properties WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, orgId]
    );
    if (!exists.length) {
      return res.status(404).json({
        error: "Propiedad no encontrada o no pertenece a esta organizaci\xF3n"
      });
    }
    await db_default.query(
      `UPDATE properties SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
      [...values, orgId]
    );
    res.json({ success: true });
  })
);
router6.delete(
  "/:id",
  requireRole("canDeleteProperty"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const delCtx = await getOrgIdForRequest(req);
    if (delCtx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = delCtx.orgId;
    const [propRows] = await db_default.query(
      `SELECT id, address, drive_folder_id
     FROM properties
     WHERE id = ? AND organization_id = ?`,
      [id, orgId]
    );
    if (!propRows.length) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    const [invRows] = await db_default.query(
      `SELECT id, phase FROM inventories WHERE property_id = ? LIMIT 1`,
      [id]
    );
    if (invRows.length > 0) {
      res.status(409).json({
        error: "No se puede eliminar: este inmueble ya tiene inventario(s) asociado(s). Los inventarios son trazabilidad legal y no se pueden deshacer.",
        hasInventories: true,
        inventoryPhase: invRows[0].phase
      });
      return;
    }
    const property = propRows[0];
    await db_default.query(
      `DELETE FROM properties WHERE id = ? AND organization_id = ?`,
      [id, orgId]
    );
    let driveCleanupStatus = "skipped";
    if (property.drive_folder_id) {
      try {
        const drive = await getDriveClientForRequest(req);
        if (drive) {
          const children = await drive.files.list({
            q: `'${property.drive_folder_id}' in parents and trashed=false`,
            fields: "files(id)",
            spaces: "drive"
          });
          const childCount = children.data.files?.length ?? 0;
          if (childCount === 0) {
            await drive.files.update({
              fileId: property.drive_folder_id,
              requestBody: { trashed: true }
            });
            driveCleanupStatus = "deleted";
          } else {
            driveCleanupStatus = "skipped";
          }
        }
      } catch (err) {
        console.warn(
          "[DELETE /api/properties] Drive cleanup error:",
          err.message
        );
        driveCleanupStatus = "failed";
      }
    }
    console.log(
      `[DELETE /api/properties] OK \u2014 id: ${id}, drive: ${driveCleanupStatus}`
    );
    res.json({
      success: true,
      driveCleanupStatus,
      message: driveCleanupStatus === "deleted" ? "Propiedad eliminada y carpeta Drive vaciada" : driveCleanupStatus === "skipped" ? "Propiedad eliminada (la carpeta Drive ten\xEDa archivos; queda como hist\xF3rico)" : "Propiedad eliminada (no se pudo limpiar Drive, hacelo manual si quer\xE9s)"
    });
  })
);
var properties_default = router6;

// server/routes/inventories.ts
init_db();
import * as dotenv5 from "dotenv";
import express4 from "express";
import crypto8 from "crypto";
dotenv5.config({ path: ".env.local" });
var router7 = express4.Router();
router7.use(requireAuth);
async function findPropertyInOrg(propertyId, orgId) {
  const [rows] = await db_default.query(
    `SELECT address, drive_folder_id, drive_folder_path
       FROM properties
      WHERE id = ? AND organization_id = ?`,
    [propertyId, orgId]
  );
  return rows[0] ?? null;
}
async function getOrCreateSubfolder(drive, parentId, name) {
  const { id } = await findOrCreateFolder(drive, name, parentId);
  return id;
}
router7.get(
  "/",
  asyncHandler(async (req, res) => {
    const { propertyId } = req.query;
    if (!propertyId) {
      res.status(400).json({ error: "Falta propertyId" });
      return;
    }
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      res.status(401).json({
        error: "Sesi\xF3n inv\xE1lida",
        code: "SESSION_MISSING_ORG"
      });
      return;
    }
    const property = await findPropertyInOrg(propertyId, _ctx.orgId);
    if (!property) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    const [idRows] = await db_default.query(
      `SELECT id, phase FROM inventories WHERE property_id = ? ORDER BY id DESC`,
      [propertyId]
    );
    if (idRows.length === 0) {
      res.json({ inventories: [] });
      return;
    }
    const ids = idRows.map((r) => r.id);
    const [rows] = await db_default.query(
      `SELECT id, property_id, contract_id, phase, property_type, counters, areas, photos,
            signatures, custom_areas, signed_at, created_at, updated_at
     FROM inventories
     WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    res.json({ inventories: rows });
  })
);
router7.post(
  "/",
  requireRole("canAddInventory"),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.propertyId || !body.phase || !body.propertyType) {
      res.status(400).json({ error: "Faltan: propertyId, phase, propertyType" });
      return;
    }
    if (!["inicial", "final"].includes(body.phase)) {
      res.status(400).json({ error: "phase debe ser 'inicial' o 'final'" });
      return;
    }
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    const property = await findPropertyInOrg(body.propertyId, orgId);
    if (!property) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    const id = body.id && body.id.length <= 36 ? body.id : crypto8.randomUUID();
    await db_default.query(
      `INSERT INTO inventories
        (id, organization_id, property_id, contract_id, phase, property_type,
         counters, areas, photos, signatures, custom_areas, signed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         contract_id = COALESCE(VALUES(contract_id), contract_id),
         property_type = VALUES(property_type),
         counters = VALUES(counters),
         areas = VALUES(areas),
         photos = VALUES(photos),
         signatures = VALUES(signatures),
         custom_areas = VALUES(custom_areas),
         signed_at = VALUES(signed_at),
         updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        orgId,
        body.propertyId,
        body.contractId ?? null,
        body.phase,
        body.propertyType,
        JSON.stringify(body.counters ?? {}),
        JSON.stringify(body.areas ?? []),
        JSON.stringify(body.photos ?? []),
        JSON.stringify(body.signatures ?? []),
        JSON.stringify(body.customAreas ?? []),
        body.signedAt ?? null
      ]
    );
    const [stored] = await db_default.query(
      "SELECT id FROM inventories WHERE property_id = ? AND phase = ? LIMIT 1",
      [body.propertyId, body.phase]
    );
    res.json({ success: true, inventoryId: stored[0]?.id ?? id });
  })
);
router7.post(
  "/upload-photos",
  requireRole("canAddInventory"),
  asyncHandler(async (req, res) => {
    const { propertyId, phase, photos } = req.body;
    if (!propertyId || !phase || !Array.isArray(photos) || photos.length === 0) {
      res.status(400).json({ error: "Faltan: propertyId, phase, photos[]" });
      return;
    }
    const batchBytes = photos.reduce(
      (acc, p) => acc + base64DecodedBytes(p?.base64Data ?? ""),
      0
    );
    if (batchBytes > MAX_PHOTO_BATCH_BYTES) {
      throw payloadTooLarge(
        `Lote de fotos demasiado grande: ${formatMb(batchBytes)} (m\xE1ximo ${formatMb(MAX_PHOTO_BATCH_BYTES)}). Mand\xE1 menos fotos por lote.`
      );
    }
    const drive = await getDriveClientForRequest(req);
    if (!drive) {
      res.status(401).json({
        error: "No conectado a Google Drive",
        code: "DRIVE_NOT_CONNECTED"
      });
      return;
    }
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
      return;
    }
    const property = await findPropertyInOrg(propertyId, _ctx.orgId);
    if (!property) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    if (!property.drive_folder_id) {
      res.status(404).json({ error: "La propiedad no tiene carpeta en Drive" });
      return;
    }
    const propertyFolderId = property.drive_folder_id;
    const folderName = phase === "inicial" ? "Inventario captacion" : "Inventario colocacion";
    const photosFolderId = await getOrCreateSubfolder(
      drive,
      propertyFolderId,
      folderName
    );
    const uploaded = [];
    const failed = [];
    for (const photo of photos) {
      if (!photo?.name || !photo?.base64Data) {
        failed.push({
          name: photo?.name ?? "?",
          error: "missing name or base64Data"
        });
        continue;
      }
      try {
        let mimeType = "image/jpeg";
        const m = /^data:([^;]+);base64,/.exec(photo.base64Data);
        if (m) mimeType = m[1];
        const buffer = Buffer.from(stripDataUrlPrefix(photo.base64Data), "base64");
        const result = await upsertFileInFolder(drive, {
          name: photo.name,
          parentId: photosFolderId,
          mimeType,
          body: buffer
        });
        await runDrive(
          `permissions.create (photo ${photo.name})`,
          (signal) => drive.permissions.create(
            {
              fileId: result.id,
              requestBody: { role: "reader", type: "anyone" }
            },
            { signal }
          )
        );
        uploaded.push({
          name: photo.name,
          webViewLink: result.webViewLink,
          fileId: result.id
        });
      } catch (err) {
        console.warn(
          `[upload-photos] fall\xF3 ${photo.name}:`,
          err.message
        );
        failed.push({ name: photo.name, error: err.message });
      }
    }
    res.json({
      success: failed.length === 0,
      folderName,
      folderId: photosFolderId,
      uploaded,
      failed
    });
  })
);
router7.post(
  "/upload-pdf",
  requireRole("canAddInventory"),
  asyncHandler(async (req, res) => {
    const { propertyId, phase, base64Data, inventoryDate } = req.body;
    if (!propertyId || !phase || !base64Data) {
      res.status(400).json({ error: "Faltan: propertyId, phase, base64Data" });
      return;
    }
    assertBase64Size(base64Data, MAX_PDF_BYTES, "El PDF del inventario");
    const drive = await getDriveClientForRequest(req);
    if (!drive) {
      res.status(401).json({
        error: "No conectado a Google Drive",
        code: "DRIVE_NOT_CONNECTED"
      });
      return;
    }
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
      return;
    }
    const property = await findPropertyInOrg(propertyId, _ctx.orgId);
    if (!property) {
      res.status(404).json({ error: "Propiedad no encontrada" });
      return;
    }
    if (!property.drive_folder_id) {
      res.status(404).json({ error: "La propiedad no tiene carpeta en Drive" });
      return;
    }
    const propertyFolderId = property.drive_folder_id;
    const inventariosFolderId = await getOrCreateSubfolder(
      drive,
      propertyFolderId,
      "Inventarios"
    );
    const phaseLabel = phase === "inicial" ? "Captacion" : "Colocacion";
    const date = inventoryDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const fileName = `Inventario_${phaseLabel}_${date}.pdf`;
    const buffer = Buffer.from(stripDataUrlPrefix(base64Data), "base64");
    let uploaded;
    try {
      const file = await upsertFileInFolder(drive, {
        name: fileName,
        parentId: inventariosFolderId,
        mimeType: "application/pdf",
        body: buffer
      });
      uploaded = { data: { id: file.id, webViewLink: file.webViewLink } };
      await runDrive(
        `permissions.create (${fileName})`,
        (signal) => drive.permissions.create(
          {
            fileId: file.id,
            requestBody: { role: "reader", type: "anyone" }
          },
          { signal }
        )
      );
    } catch (err) {
      console.error("[upload-pdf] drive failed:", err);
      if (err?.code === "DRIVE_TIMEOUT" || err?.message?.includes("Timeout")) {
        return res.status(503).json({
          error: "Drive no responde. Reintent\xE1 en unos segundos."
        });
      }
      return res.status(500).json({ error: err?.message ?? "Error subiendo PDF" });
    }
    const urlField = phase === "inicial" ? "inventory_captacion_pdf_url" : "inventory_colocacion_pdf_url";
    await db_default.query(
      `UPDATE properties SET ${urlField} = ?
        WHERE id = ? AND organization_id = ?`,
      [uploaded.data.webViewLink, propertyId, _ctx.orgId]
    );
    res.json({
      success: true,
      fileId: uploaded.data.id,
      fileName,
      webViewLink: uploaded.data.webViewLink,
      folderPath: `${property.drive_folder_path ?? ""}/Inventarios`
    });
  })
);
var inventories_default = router7;

// server/routes/financialRecords.ts
init_db();
import * as dotenv6 from "dotenv";
import express5 from "express";
import crypto9 from "crypto";
dotenv6.config({ path: ".env.local" });
var router8 = express5.Router();
router8.use(requireAuth);
router8.get(
  "/",
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT id, contract_id, property_id, date, type, category, description, amount,
            attachment_url, created_at
     FROM financial_records
     WHERE organization_id = ?
     ORDER BY date DESC, created_at DESC`,
      [orgId]
    );
    res.json({ records: rows });
  })
);
router8.post(
  "/",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const {
      propertyId,
      contractId,
      date,
      type,
      category,
      description,
      amount,
      attachmentUrl
    } = req.body;
    if (!propertyId || !date || !type || !category || !description || amount == null) {
      res.status(400).json({
        error: "Faltan campos: propertyId, date, type, category, description, amount"
      });
      return;
    }
    if (!["income", "expense"].includes(type)) {
      res.status(400).json({ error: "type debe ser income o expense" });
      return;
    }
    const id = crypto9.randomUUID();
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    await db_default.query(
      `INSERT INTO financial_records
      (id, organization_id, contract_id, property_id, date, type, category, description, amount, attachment_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        orgId,
        contractId || null,
        propertyId,
        date,
        type,
        category,
        description,
        amount,
        attachmentUrl || null
      ]
    );
    res.json({ success: true, recordId: id });
  })
);
router8.patch(
  "/:id",
  requireRole("canAddFinancial"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const fields = [
      "date",
      "type",
      "category",
      "description",
      "amount",
      "attachment_url"
    ];
    const updates = [];
    const values = [];
    for (const f of fields) {
      const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (req.body[camel] !== void 0) {
        updates.push(`${f} = ?`);
        values.push(req.body[camel]);
      }
    }
    if (!updates.length) {
      res.json({ success: true, message: "Nothing to update" });
      return;
    }
    values.push(id);
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    await db_default.query(
      `UPDATE financial_records SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
      [...values, orgId]
    );
    res.json({ success: true });
  })
);
router8.delete(
  "/:id",
  requireRole("canDeleteFinancial"),
  asyncHandler(async (req, res) => {
    const _ctx = await getOrgIdForRequest(req);
    if (_ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = _ctx.orgId;
    await db_default.query(
      `DELETE FROM financial_records WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    res.json({ success: true });
  })
);
var financialRecords_default = router8;

// server/routes/notifications.ts
import { Router as Router4 } from "express";
var router9 = Router4();
router9.use(requireAuth);
function readTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !whatsappFrom) return null;
  return { accountSid, authToken, whatsappFrom };
}
var _client = null;
async function getClient() {
  if (_client) return _client;
  const cfg = readTwilioConfig();
  if (!cfg) return null;
  try {
    const mod = await import("twilio");
    const twilio = mod.default ?? mod;
    _client = twilio(cfg.accountSid, cfg.authToken);
    return _client;
  } catch (err) {
    console.error(
      "[notifications] twilio no instalado. Ejecuta `npm install`.",
      err
    );
    return null;
  }
}
function normalizeColombianPhone(input) {
  if (!input) return null;
  const cleaned = String(input).replace(/[\s\-()]/g, "");
  if (/^\+?57\d{10}$/.test(cleaned)) {
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  }
  if (/^3\d{9}$/.test(cleaned)) return `+57${cleaned}`;
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;
  return null;
}
router9.get(
  "/whatsapp/status",
  asyncHandler(async (_req, res) => {
    const cfg = readTwilioConfig();
    if (!cfg) {
      return res.json({
        configured: false,
        mode: "mock",
        from: null,
        message: "Twilio no configurado. Agrega TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM a .env.local"
      });
    }
    const client = await getClient();
    if (!client) {
      return res.json({
        configured: false,
        mode: "mock",
        from: cfg.whatsappFrom,
        message: "Paquete twilio no instalado. Ejecuta `npm install`."
      });
    }
    res.json({
      configured: true,
      mode: "live",
      from: cfg.whatsappFrom,
      message: "Conectado. Listo para enviar."
    });
  })
);
router9.post(
  "/whatsapp",
  requireRole("canManageNotifications"),
  asyncHandler(async (req, res) => {
    const { to, body, alertId } = req.body;
    if (!to || !body) {
      return res.status(400).json({ error: "Faltan campos: to, body" });
    }
    const phone = normalizeColombianPhone(to);
    if (!phone) {
      return res.status(400).json({
        error: `N\xFAmero inv\xE1lido: "${to}". Esperado formato colombiano (+57 3XX XXX XXXX).`
      });
    }
    const client = await getClient();
    if (!client) {
      return res.status(503).json({
        error: "TWILIO_NOT_CONFIGURED",
        message: "Twilio no configurado en el server"
      });
    }
    const cfg = readTwilioConfig();
    try {
      const msg = await client.messages.create({
        from: cfg.whatsappFrom,
        to: `whatsapp:${phone}`,
        body
      });
      console.info(
        `[notifications/whatsapp] alert=${alertId ?? "n/a"} to=${phone} sid=${msg.sid} status=${msg.status}`
      );
      res.json({ ok: true, sid: msg.sid, status: msg.status, to: phone });
    } catch (err) {
      throw internalExpose(
        err?.message ?? "Twilio error",
        err?.code ?? "TWILIO_ERROR"
      );
    }
  })
);
router9.post(
  "/whatsapp/test",
  requireRole("canManageNotifications"),
  asyncHandler(async (req, res) => {
    const { to } = req.body;
    if (!to) throw badRequest("Falta campo: to", "MISSING_TO");
    const phone = normalizeColombianPhone(to);
    if (!phone) throw badRequest(`N\xFAmero inv\xE1lido: "${to}"`, "INVALID_PHONE");
    const client = await getClient();
    if (!client) {
      return res.status(503).json({
        error: "TWILIO_NOT_CONFIGURED",
        message: "Twilio no configurado en el server"
      });
    }
    const cfg = readTwilioConfig();
    try {
      const msg = await client.messages.create({
        from: cfg.whatsappFrom,
        to: `whatsapp:${phone}`,
        body: "\u{1F9EA} Mensaje de prueba desde InmoControl. Si lees esto, Twilio est\xE1 conectado correctamente."
      });
      res.json({ ok: true, sid: msg.sid, status: msg.status, to: phone });
    } catch (err) {
      throw internalExpose(
        err?.message ?? "Twilio error",
        err?.code ?? "TWILIO_ERROR"
      );
    }
  })
);
var _nodemailer = null;
async function getNodemailer() {
  if (_nodemailer) return _nodemailer;
  try {
    const mod = await import("nodemailer");
    _nodemailer = mod.default ?? mod;
    return _nodemailer;
  } catch (err) {
    console.error(
      "[notifications/email] nodemailer no instalado. Ejecuta `npm install`.",
      err?.message ?? err
    );
    return null;
  }
}
function providerToTransport(provider) {
  if (provider.kind === "sendgrid") {
    return {
      transport: {
        host: "smtp.sendgrid.net",
        port: 587,
        secure: false,
        auth: { user: "apikey", pass: provider.apiKey }
      },
      providerLabel: "sendgrid"
    };
  }
  return {
    transport: {
      host: provider.host,
      port: provider.port,
      secure: provider.secure,
      auth: { user: provider.user, pass: provider.pass }
    },
    providerLabel: `smtp:${provider.host}:${provider.port}`
  };
}
function readEmailFallback() {
  if (process.env.EMAIL_FALLBACK_ENABLED !== "true") return null;
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey) {
    return {
      purpose: "fallback",
      fromName: process.env.EMAIL_FROM_NAME || "InmoControl",
      fromEmail: process.env.EMAIL_FROM_EMAIL || "noreply@inmocontrol.co",
      provider: { kind: "sendgrid", apiKey: sendgridKey }
    };
  }
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    return {
      purpose: "fallback",
      fromName: process.env.EMAIL_FROM_NAME || "InmoControl",
      fromEmail: process.env.EMAIL_FROM_EMAIL || user,
      provider: {
        kind: "smtp",
        host,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        user,
        pass,
        secure: process.env.SMTP_SECURE === "true"
      }
    };
  }
  return null;
}
router9.get(
  "/email/status",
  asyncHandler(async (_req, res) => {
    const nodemailer = await getNodemailer();
    const fallback = readEmailFallback();
    res.json({
      packageInstalled: !!nodemailer,
      fallbackConfigured: !!fallback,
      fallbackProvider: fallback?.provider.kind ?? null,
      message: !nodemailer ? "Paquete nodemailer no instalado. Ejecuta `npm install`." : !fallback ? "Sin fallback centralizado. Configura los buzones en Settings \u2192 Integraciones." : "Listo. Puedes usar buzones por agencia o el fallback centralizado."
    });
  })
);
router9.post(
  "/email/verify",
  requireRole("canManageNotifications"),
  asyncHandler(async (req, res) => {
    const nodemailer = await getNodemailer();
    if (!nodemailer) {
      return res.status(503).json({
        ok: false,
        error: "NODEMAILER_NOT_INSTALLED",
        message: "Ejecuta `npm install`"
      });
    }
    const { mailbox } = req.body;
    if (!mailbox)
      return res.status(400).json({ ok: false, error: "Falta campo: mailbox" });
    try {
      const { transport } = providerToTransport(mailbox.provider);
      const transporter = nodemailer.createTransport(transport);
      await transporter.verify();
      res.json({
        ok: true,
        message: "Conexi\xF3n SMTP/SendGrid verificada correctamente."
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err.message ?? "Verify failed",
        code: err.code
      });
    }
  })
);
router9.post(
  "/email/test",
  requireRole("canManageNotifications"),
  asyncHandler(async (req, res) => {
    const nodemailer = await getNodemailer();
    if (!nodemailer) {
      return res.status(503).json({ ok: false, error: "NODEMAILER_NOT_INSTALLED" });
    }
    const { mailbox, to } = req.body;
    if (!to)
      return res.status(400).json({ ok: false, error: "Falta campo: to" });
    const mb = mailbox ?? readEmailFallback();
    if (!mb)
      return res.status(400).json({
        ok: false,
        error: "Falta mailbox y no hay fallback configurado"
      });
    try {
      const { transport, providerLabel } = providerToTransport(mb.provider);
      const transporter = nodemailer.createTransport(transport);
      const info = await transporter.sendMail({
        from: `"${mb.fromName}" <${mb.fromEmail}>`,
        to,
        subject: "\u{1F9EA} Mensaje de prueba desde InmoControl",
        text: "Si lees esto, tu buz\xF3n de email est\xE1 conectado correctamente. \u2014 Equipo InmoControl",
        html: `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb; margin: 0 0 16px;">\u2705 \xA1Email conectado!</h2>
        <p style="color: #334155; line-height: 1.5;">Si lees esto, tu buz\xF3n <strong>${mb.fromEmail}</strong> est\xE1 configurado correctamente y puede enviar notificaciones.</p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Proveedor: <code>${providerLabel}</code><br/>Prop\xF3sito: ${mb.purpose}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
        <p style="color: #94a3b8; font-size: 12px;">\u2014 Equipo InmoControl</p>
      </div>`,
        replyTo: mb.replyTo
      });
      console.info(
        `[notifications/email/test] to=${to} provider=${providerLabel} messageId=${info.messageId}`
      );
      res.json({
        ok: true,
        messageId: info.messageId,
        to,
        provider: providerLabel
      });
    } catch (err) {
      throw internalExpose(
        err?.message ?? "Send failed",
        err?.code ?? "EMAIL_SEND_FAILED"
      );
    }
  })
);
router9.post(
  "/email/send",
  requireRole("canManageNotifications"),
  asyncHandler(async (req, res) => {
    const nodemailer = await getNodemailer();
    if (!nodemailer) {
      return res.status(503).json({ ok: false, error: "NODEMAILER_NOT_INSTALLED" });
    }
    const { mailbox, to, subject, body, html, alertId } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ ok: false, error: "Faltan campos: to, subject, body" });
    }
    const mb = mailbox ?? readEmailFallback();
    if (!mb)
      return res.status(400).json({
        ok: false,
        error: "Falta mailbox y no hay fallback configurado"
      });
    try {
      const { transport, providerLabel } = providerToTransport(mb.provider);
      const transporter = nodemailer.createTransport(transport);
      const htmlBody = html ? `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #334155;">
          <h2 style="color: #1e293b; margin: 0 0 16px;">${escapeHtml(subject)}</h2>
          <div style="line-height: 1.5; white-space: pre-wrap;">${escapeHtml(body)}</div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
          <p style="color: #94a3b8; font-size: 12px;">\u2014 ${escapeHtml(mb.fromName)} v\xEDa InmoControl</p>
        </div>` : void 0;
      const info = await transporter.sendMail({
        from: `"${mb.fromName}" <${mb.fromEmail}>`,
        to,
        subject,
        text: body,
        html: htmlBody,
        replyTo: mb.replyTo
      });
      console.info(
        `[notifications/email/send] alert=${alertId ?? "n/a"} to=${to} provider=${providerLabel} messageId=${info.messageId}`
      );
      res.json({
        ok: true,
        messageId: info.messageId,
        to,
        provider: providerLabel
      });
    } catch (err) {
      throw internalExpose(
        err?.message ?? "Send failed",
        err?.code ?? "EMAIL_SEND_FAILED"
      );
    }
  })
);
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var notifications_default = router9;

// server/routes/saasBilling.ts
init_db();
import { Router as Router5 } from "express";
import bcrypt2 from "bcryptjs";
import crypto10 from "crypto";
var router10 = Router5();
router10.post(
  "/signup",
  rateLimit({ windowSeconds: 15 * 60, maxAttempts: 5, scope: "ip" }),
  asyncHandler(async (req, res) => {
    const existingSessionId = req.cookies?.["inmocontrol_pilot_session"];
    if (existingSessionId && SESSIONS.has(existingSessionId)) {
      return res.status(409).json({
        error: "Ya ten\xE9s una cuenta activa. Cerr\xE1 sesi\xF3n primero.",
        code: "ALREADY_AUTHENTICATED"
      });
    }
    const {
      email: rawEmail,
      password: rawPassword,
      organizationName: rawOrgName
    } = req.body ?? {};
    if (!rawEmail || !rawPassword || !rawOrgName) {
      return res.status(400).json({
        error: "Faltan campos requeridos: email, password, organizationName",
        code: "MISSING_REQUIRED_FIELDS"
      });
    }
    const email = rawEmail.toLowerCase().trim();
    const password = rawPassword;
    const organizationName = String(rawOrgName).trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "El email no tiene formato v\xE1lido",
        code: "INVALID_EMAIL"
      });
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        error: "La contrase\xF1a debe tener al menos 8 caracteres, 1 letra y 1 n\xFAmero.",
        code: "WEAK_PASSWORD"
      });
    }
    if (organizationName.length < 3 || organizationName.length > 100) {
      return res.status(400).json({
        error: "El nombre de la organizaci\xF3n debe tener entre 3 y 100 caracteres.",
        code: "INVALID_ORG_NAME"
      });
    }
    const [existing] = await db_default.query(
      `SELECT id FROM profiles WHERE email = ? LIMIT 1`,
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        error: "Ya existe una cuenta con ese email. \xBFOlvidaste tu contrase\xF1a?",
        code: "EMAIL_TAKEN"
      });
    }
    let trialPlanId;
    const [trialRows] = await db_default.query(
      `SELECT id FROM saas_plans WHERE slug = 'trial' LIMIT 1`
    );
    if (trialRows.length === 0) {
      trialPlanId = globalThis.crypto.randomUUID();
      try {
        await db_default.query(
          `INSERT INTO saas_plans
            (id, slug, name, price_cop, max_properties, max_users, max_alerts_per_month, sort_order, is_active)
           VALUES (?, 'trial', 'Trial 14 dias', 0, 5, 2, 50, 999, 1)`,
          [trialPlanId]
        );
      } catch (e) {
        if (e?.code !== "ER_DUP_ENTRY") {
          console.error("[signup] auto-seed trial plan fallo:", e);
          throw internalExpose(
            "No se pudo inicializar el plan trial.",
            "NO_TRIAL_PLAN"
          );
        }
        const [retry] = await db_default.query(
          `SELECT id FROM saas_plans WHERE slug = 'trial' LIMIT 1`
        );
        trialPlanId = retry[0].id;
      }
    } else {
      trialPlanId = trialRows[0].id;
    }
    const orgId = globalThis.crypto.randomUUID();
    const profileId = globalThis.crypto.randomUUID();
    const subscriptionId = globalThis.crypto.randomUUID();
    const passwordHash = await bcrypt2.hash(password, 10);
    const conn = await db_default.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO organizations (id, name, created_by) VALUES (?, ?, ?)`,
        [orgId, organizationName, email]
      );
      await conn.query(
        `INSERT INTO profiles
          (id, organization_id, display_name, email, role, password_hash, created_by)
         VALUES (?, ?, ?, ?, 'admin', ?, ?)`,
        [profileId, orgId, organizationName, email, passwordHash, email]
      );
      await conn.query(
        `INSERT INTO saas_subscriptions
          (id, organization_id, plan_id, status,
           current_period_start, current_period_end)
         VALUES (?, ?, ?, 'trialing', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY))`,
        [subscriptionId, orgId, trialPlanId]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error("[signup] transaccion fallo:", e);
      if (e?.code === "ER_DUP_ENTRY") {
        throw conflict(
          "Ya existe una cuenta con ese email. \xBFOlvidaste tu contrase\xF1a?",
          "EMAIL_TAKEN"
        );
      }
      throw internalExpose(
        "Error creando la cuenta. Reintent\xE1 en unos minutos.",
        "DB_UNAVAILABLE"
      );
    } finally {
      conn.release();
    }
    const sessionId = crypto10.randomUUID();
    SESSIONS.set(sessionId, {
      profileId,
      organizationId: orgId,
      email,
      displayName: organizationName,
      role: "admin",
      createdAt: Date.now()
    });
    setSessionCookie(res, sessionId);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1e3);
    return res.status(200).json({
      user: {
        id: profileId,
        email,
        displayName: organizationName,
        role: "admin",
        organizationId: orgId
      },
      organization: {
        id: orgId,
        name: organizationName
      },
      subscription: {
        id: subscriptionId,
        planId: trialPlanId,
        status: "trialing",
        trialEndsAt: trialEndsAt.toISOString()
      }
    });
  })
);
router10.use(requireAuth);
var IVA_RATE2 = 0.19;
function genId2() {
  return globalThis.crypto.randomUUID();
}
function planRowToJson(r) {
  let features = [];
  try {
    features = r.features_json ? typeof r.features_json === "string" ? JSON.parse(r.features_json) : r.features_json : [];
  } catch {
    features = [];
  }
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? void 0,
    priceCop: Number(r.price_cop),
    maxProperties: r.max_properties,
    maxUsers: r.max_users,
    maxAlertsPerMonth: r.max_alerts_per_month,
    features,
    sortOrder: r.sort_order,
    isActive: !!r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}
function pmRowToJson(r) {
  let details = null;
  try {
    details = r.details_json ? typeof r.details_json === "string" ? JSON.parse(r.details_json) : r.details_json : null;
  } catch {
    details = null;
  }
  return {
    id: r.id,
    type: r.type,
    brand: r.brand ?? void 0,
    last4: r.last4 ?? void 0,
    expiryMonth: r.expiry_month ?? void 0,
    expiryYear: r.expiry_year ?? void 0,
    holderName: r.holder_name ?? void 0,
    details,
    isDefault: !!r.is_default,
    createdAt: r.created_at
  };
}
function invoiceRowToJson(r) {
  let planSnapshot = null;
  try {
    planSnapshot = r.plan_snapshot_json ? typeof r.plan_snapshot_json === "string" ? JSON.parse(r.plan_snapshot_json) : r.plan_snapshot_json : null;
  } catch {
    planSnapshot = null;
  }
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    subscriptionId: r.subscription_id,
    paymentMethodId: r.payment_method_id ?? void 0,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    subtotalCop: Number(r.subtotal_cop),
    ivaCop: Number(r.iva_cop),
    totalCop: Number(r.total_cop),
    status: r.status,
    issuedAt: r.issued_at,
    paidAt: r.paid_at ?? void 0,
    planSnapshot
  };
}
function subscriptionRowToJson(r) {
  return {
    id: r.id,
    planId: r.plan_id,
    status: r.status,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: !!r.cancel_at_period_end,
    startedAt: r.started_at,
    canceledAt: r.canceled_at ?? void 0
  };
}
async function nextInvoiceNumber() {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  const [rows] = await db_default.query(
    `SELECT COUNT(*) AS n FROM saas_invoices WHERE invoice_number LIKE ?`,
    [`INV-${year}-%`]
  );
  const n = Number(rows[0]?.n ?? 0) + 1;
  return `INV-${year}-${String(n).padStart(4, "0")}`;
}
router10.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const [rows] = await db_default.query(
      `SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC`
    );
    res.json(rows.map(planRowToJson));
  })
);
router10.get(
  "/plans/all",
  asyncHandler(async (_req, res) => {
    const [rows] = await db_default.query(
      `SELECT * FROM saas_plans ORDER BY sort_order ASC`
    );
    res.json(rows.map(planRowToJson));
  })
);
router10.get(
  "/plans/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await db_default.query(`SELECT * FROM saas_plans WHERE id = ?`, [
      req.params.id
    ]);
    const list = rows;
    if (list.length === 0)
      return res.status(404).json({ error: "Plan no encontrado" });
    res.json(planRowToJson(list[0]));
  })
);
router10.post(
  "/plans",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const p = req.body;
    if (!p.slug || !p.name)
      return res.status(400).json({ error: "Faltan slug o name" });
    const id = genId2();
    try {
      await db_default.query(
        `INSERT INTO saas_plans
         (id, slug, name, description, price_cop, max_properties, max_users, max_alerts_per_month, features_json, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          id,
          p.slug,
          p.name,
          p.description ?? null,
          Number(p.priceCop),
          Number(p.maxProperties),
          Number(p.maxUsers),
          Number(p.maxAlertsPerMonth),
          JSON.stringify(p.features ?? []),
          Number(p.sortOrder ?? 100)
        ]
      );
      const [rows] = await db_default.query(`SELECT * FROM saas_plans WHERE id = ?`, [
        id
      ]);
      res.status(201).json(planRowToJson(rows[0]));
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY")
        return res.status(409).json({ error: `Ya existe un plan con slug "${p.slug}"` });
      throw err;
    }
  })
);
router10.put(
  "/plans/:id",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const p = req.body;
    await db_default.query(
      `UPDATE saas_plans SET
       name = COALESCE(?, name),
       description = ?,
       price_cop = COALESCE(?, price_cop),
       max_properties = COALESCE(?, max_properties),
       max_users = COALESCE(?, max_users),
       max_alerts_per_month = COALESCE(?, max_alerts_per_month),
       features_json = COALESCE(?, features_json),
       sort_order = COALESCE(?, sort_order),
       is_active = COALESCE(?, is_active)
     WHERE id = ?`,
      [
        p.name ?? null,
        p.description ?? void 0,
        // null permite limpiar
        p.priceCop ?? null,
        p.maxProperties ?? null,
        p.maxUsers ?? null,
        p.maxAlertsPerMonth ?? null,
        p.features ? JSON.stringify(p.features) : null,
        p.sortOrder ?? null,
        p.isActive == null ? null : p.isActive ? 1 : 0,
        req.params.id
      ]
    );
    const [rows] = await db_default.query(`SELECT * FROM saas_plans WHERE id = ?`, [
      req.params.id
    ]);
    const list = rows;
    if (list.length === 0)
      return res.status(404).json({ error: "Plan no encontrado" });
    res.json(planRowToJson(list[0]));
  })
);
router10.delete(
  "/plans/:id",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const [subs] = await db_default.query(
      `SELECT COUNT(*) AS n FROM saas_subscriptions WHERE plan_id = ? AND status IN ('active','trialing','past_due')`,
      [req.params.id]
    );
    const activeCount = Number(subs[0]?.n ?? 0);
    if (activeCount > 0) {
      await db_default.query(`UPDATE saas_plans SET is_active = 0 WHERE id = ?`, [
        req.params.id
      ]);
      return res.json({
        ok: true,
        deactivated: true,
        activeSubscriptions: activeCount
      });
    }
    await db_default.query(`DELETE FROM saas_plans WHERE id = ?`, [req.params.id]);
    res.json({ ok: true, deactivated: false });
  })
);
router10.get(
  "/subscription",
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM saas_subscriptions WHERE organization_id = ?`,
      [orgId]
    );
    const list = rows;
    if (list.length === 0) return res.json(null);
    res.json(subscriptionRowToJson(list[0]));
  })
);
router10.post(
  "/subscription",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const { planId, paymentMethodId } = req.body;
    if (!planId) return res.status(400).json({ error: "Falta planId" });
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [planRows] = await db_default.query(
      `SELECT * FROM saas_plans WHERE id = ? AND is_active = 1`,
      [planId]
    );
    const planList = planRows;
    if (planList.length === 0)
      return res.status(404).json({ error: "Plan no encontrado o inactivo" });
    const plan = planRowToJson(planList[0]);
    const [existing] = await db_default.query(
      `SELECT * FROM saas_subscriptions WHERE organization_id = ?`,
      [orgId]
    );
    const existingList = existing;
    const now = /* @__PURE__ */ new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const periodStartStr = fmt(now);
    const periodEndStr = fmt(periodEnd);
    let subscriptionId;
    if (existingList.length > 0) {
      subscriptionId = existingList[0].id;
      await db_default.query(
        `UPDATE saas_subscriptions SET
         plan_id = ?, status = 'active',
         current_period_start = ?, current_period_end = ?,
         cancel_at_period_end = 0,
         canceled_at = NULL,
         updated_at = NOW()
       WHERE id = ?`,
        [planId, periodStartStr, periodEndStr, subscriptionId]
      );
    } else {
      subscriptionId = genId2();
      await db_default.query(
        `INSERT INTO saas_subscriptions
         (id, organization_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES (?, ?, ?, 'active', ?, ?, 0)`,
        [subscriptionId, orgId, planId, periodStartStr, periodEndStr]
      );
    }
    const subtotal = plan.priceCop;
    const iva = Math.round(subtotal * IVA_RATE2);
    const total = subtotal + iva;
    const invNumber = await nextInvoiceNumber();
    const invoiceId = genId2();
    await db_default.query(
      `INSERT INTO saas_invoices
       (id, organization_id, subscription_id, payment_method_id,
        invoice_number, period_start, period_end,
        subtotal_cop, iva_cop, total_cop,
        status, issued_at, paid_at, plan_snapshot_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', NOW(), NOW(), ?)`,
      [
        invoiceId,
        orgId,
        subscriptionId,
        paymentMethodId ?? null,
        invNumber,
        periodStartStr,
        periodEndStr,
        subtotal,
        iva,
        total,
        JSON.stringify(plan)
      ]
    );
    const [subRows] = await db_default.query(
      `SELECT * FROM saas_subscriptions WHERE id = ?`,
      [subscriptionId]
    );
    res.status(201).json({
      subscription: subscriptionRowToJson(subRows[0]),
      plan,
      invoiceId,
      invoiceNumber: invNumber
    });
  })
);
router10.delete(
  "/subscription",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [result] = await db_default.query(
      `UPDATE saas_subscriptions SET
       cancel_at_period_end = 1,
       canceled_at = NULL,
       updated_at = NOW()
     WHERE organization_id = ? AND status IN ('active','trialing','past_due')`,
      [orgId]
    );
    const affected = result.affectedRows;
    if (affected === 0)
      return res.status(404).json({ error: "No hay subscripci\xF3n activa para cancelar" });
    res.json({
      ok: true,
      message: "Subscripci\xF3n se cancelar\xE1 al final del periodo actual."
    });
  })
);
router10.post(
  "/subscription/reactivate",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [result] = await db_default.query(
      `UPDATE saas_subscriptions SET cancel_at_period_end = 0, updated_at = NOW()
     WHERE organization_id = ? AND status = 'active'`,
      [orgId]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "No hay subscripci\xF3n activa para reactivar" });
    res.json({ ok: true });
  })
);
router10.get(
  "/payment-methods",
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM saas_payment_methods WHERE organization_id = ? ORDER BY is_default DESC, created_at DESC`,
      [orgId]
    );
    res.json(rows.map(pmRowToJson));
  })
);
router10.post(
  "/payment-methods",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const pm = req.body;
    if (!pm.type) return res.status(400).json({ error: "Falta type" });
    if (pm.type === "card" && (!pm.brand || !pm.last4 || !pm.expiryMonth || !pm.expiryYear)) {
      return res.status(400).json({
        error: "Para tarjeta se requiere brand, last4, expiryMonth y expiryYear"
      });
    }
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const id = genId2();
    if (pm.makeDefault) {
      await db_default.query(
        `UPDATE saas_payment_methods SET is_default = 0 WHERE organization_id = ?`,
        [orgId]
      );
    }
    const [countRows] = await db_default.query(
      `SELECT COUNT(*) AS n FROM saas_payment_methods WHERE organization_id = ?`,
      [orgId]
    );
    const isFirst = Number(countRows[0]?.n ?? 0) === 0;
    const isDefault = !!(pm.makeDefault ?? isFirst);
    await db_default.query(
      `INSERT INTO saas_payment_methods
       (id, organization_id, type, brand, last4, expiry_month, expiry_year, holder_name, details_json, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        orgId,
        pm.type,
        pm.brand ?? null,
        pm.last4 ?? null,
        pm.expiryMonth ?? null,
        pm.expiryYear ?? null,
        pm.holderName ?? null,
        pm.details ? JSON.stringify(pm.details) : null,
        isDefault ? 1 : 0
      ]
    );
    const [rows] = await db_default.query(
      `SELECT * FROM saas_payment_methods WHERE id = ?`,
      [id]
    );
    res.status(201).json(pmRowToJson(rows[0]));
  })
);
router10.delete(
  "/payment-methods/:id",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM saas_payment_methods WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    const list = rows;
    if (list.length === 0)
      return res.status(404).json({ error: "M\xE9todo de pago no encontrado" });
    if (list[0].is_default)
      return res.status(409).json({
        error: "No pod\xE9s eliminar el m\xE9todo default. Marc\xE1 otro como default primero."
      });
    await db_default.query(`DELETE FROM saas_payment_methods WHERE id = ?`, [
      req.params.id
    ]);
    res.json({ ok: true });
  })
);
router10.put(
  "/payment-methods/:id/default",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM saas_payment_methods WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "M\xE9todo de pago no encontrado" });
    await db_default.query(
      `UPDATE saas_payment_methods SET is_default = 0 WHERE organization_id = ?`,
      [orgId]
    );
    await db_default.query(
      `UPDATE saas_payment_methods SET is_default = 1 WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true });
  })
);
router10.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM saas_invoices WHERE organization_id = ? ORDER BY issued_at DESC LIMIT 200`,
      [orgId]
    );
    res.json(rows.map(invoiceRowToJson));
  })
);
router10.get(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT * FROM saas_invoices WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    const list = rows;
    if (list.length === 0)
      return res.status(404).json({ error: "Factura no encontrada" });
    res.json(invoiceRowToJson(list[0]));
  })
);
router10.post(
  "/invoices/:id/pay",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { paymentMethodId } = req.body;
    const [rows] = await db_default.query(
      `SELECT * FROM saas_invoices WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    const list = rows;
    if (list.length === 0)
      return res.status(404).json({ error: "Factura no encontrada" });
    if (list[0].status === "paid")
      return res.status(409).json({ error: "La factura ya est\xE1 pagada" });
    await new Promise((r) => setTimeout(r, 300));
    await db_default.query(
      `UPDATE saas_invoices SET status = 'paid', paid_at = NOW(), payment_method_id = COALESCE(?, payment_method_id) WHERE id = ?`,
      [paymentMethodId ?? null, req.params.id]
    );
    const [updated] = await db_default.query(
      `SELECT * FROM saas_invoices WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true, invoice: invoiceRowToJson(updated[0]) });
  })
);
async function countActiveSeats(orgId) {
  const [profileRows] = await db_default.query(
    `SELECT COUNT(*) AS n FROM profiles WHERE organization_id = ?`,
    [orgId]
  );
  const [pendingRows] = await db_default.query(
    `SELECT COUNT(*) AS n FROM org_invitations
     WHERE organization_id = ?
       AND accepted_at IS NULL
       AND expires_at > NOW()`,
    [orgId]
  );
  return Number(profileRows[0].n) + Number(pendingRows[0].n);
}
async function getMaxUsersForOrg(orgId) {
  const [rows] = await db_default.query(
    `SELECT p.max_users, p.name
     FROM saas_subscriptions s
     JOIN saas_plans p ON s.plan_id = p.id
     WHERE s.organization_id = ?
       AND s.status IN ('trialing', 'active', 'past_due')
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [orgId]
  );
  if (rows.length === 0) return { max: 1, planName: null };
  return { max: Number(rows[0].max_users), planName: rows[0].name };
}
async function sendInvitationEmail(args) {
  try {
    const mod = await import("nodemailer");
    const nodemailer = mod.default ?? mod;
    const fromAddress = process.env.SMTP_FROM_INVITATIONS || process.env.SMTP_FROM || `InmoControl <no-reply@inmocontrol.tecnowebsupportia.com>`;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      } : void 0
    });
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1f2937;">Te invitaron a ${args.organizationName}</h2>
        <p><strong>${args.inviterName}</strong> (${args.inviterEmail}) te invit\xF3 a
          unirte a <strong>${args.organizationName}</strong> en InmoControl como
          <strong>${args.role}</strong>.</p>
        <p>Para aceptar la invitaci\xF3n, hac\xE9 click en el siguiente link:</p>
        <p style="margin: 24px 0;">
          <a href="${args.acceptUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Aceptar invitaci\xF3n
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          O copi\xE1 y peg\xE1 este link en tu navegador:<br>
          <code>${args.acceptUrl}</code>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          Esta invitaci\xF3n expira el ${args.expiresAt.toISOString().slice(0, 10)}.
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          InmoControl \xB7 Sistema de gesti\xF3n inmobiliaria
        </p>
      </div>
    `;
    const text = `${args.inviterName} (${args.inviterEmail}) te invit\xF3 a unirte a ${args.organizationName} en InmoControl como ${args.role}.

Acept\xE1 la invitaci\xF3n ac\xE1:
${args.acceptUrl}

Esta invitaci\xF3n expira el ${args.expiresAt.toISOString().slice(0, 10)}.`;
    await transport.sendMail({
      from: fromAddress,
      to: args.to,
      subject: `${args.inviterName} te invit\xF3 a ${args.organizationName} en InmoControl`,
      html,
      text,
      replyTo: args.inviterEmail
    });
    return { sent: true };
  } catch (e) {
    console.error("[invitations] email send failed:", e?.message ?? e);
    return { sent: false, error: e?.message ?? String(e) };
  }
}
router10.get(
  "/invitations/:token",
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      return res.status(404).json({
        error: "Invitaci\xF3n no encontrada",
        code: "INVITATION_NOT_FOUND"
      });
    }
    const [rows] = await db_default.query(
      `SELECT i.email, i.role, i.expires_at, i.accepted_at, o.name AS org_name
       FROM org_invitations i
       JOIN organizations o ON i.organization_id = o.id
       WHERE i.token = ?
       LIMIT 1`,
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        error: "Invitaci\xF3n no encontrada",
        code: "INVITATION_NOT_FOUND"
      });
    }
    const r = rows[0];
    if (r.accepted_at) {
      return res.status(404).json({
        error: "Esta invitaci\xF3n ya fue aceptada",
        code: "INVITATION_ALREADY_ACCEPTED"
      });
    }
    if (new Date(r.expires_at) <= /* @__PURE__ */ new Date()) {
      return res.status(404).json({ error: "Esta invitaci\xF3n expir\xF3", code: "INVITATION_EXPIRED" });
    }
    return res.json({
      email: r.email,
      organizationName: r.org_name,
      role: r.role,
      expiresAt: new Date(r.expires_at).toISOString(),
      acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null
    });
  })
);
router10.post(
  "/invitations/:token/accept",
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password, displayName } = req.body ?? {};
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      return res.status(404).json({
        error: "Invitaci\xF3n no encontrada",
        code: "INVITATION_NOT_FOUND"
      });
    }
    if (!password) {
      return res.status(400).json({
        error: "Falta el campo password",
        code: "MISSING_REQUIRED_FIELDS"
      });
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        error: "La contrase\xF1a debe tener al menos 8 caracteres, 1 letra y 1 n\xFAmero.",
        code: "WEAK_PASSWORD"
      });
    }
    const existingSessionId = req.cookies?.["inmocontrol_pilot_session"];
    if (existingSessionId && SESSIONS.has(existingSessionId)) {
      const existing = SESSIONS.get(existingSessionId);
      const [peekRows] = await db_default.query(
        `SELECT organization_id FROM org_invitations WHERE token = ? LIMIT 1`,
        [token]
      );
      if (peekRows.length > 0 && existing && existing.organizationId !== peekRows[0].organization_id) {
        return res.status(409).json({
          error: "Ya ten\xE9s una sesi\xF3n activa de otra organizaci\xF3n. Cerr\xE1 sesi\xF3n primero.",
          code: "ALREADY_AUTHENTICATED_OTHER_ORG"
        });
      }
    }
    const conn = await db_default.getConnection();
    let invitation;
    let orgId;
    let invitedRole;
    let invitedEmail;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT id, organization_id, email, role, expires_at, accepted_at
         FROM org_invitations WHERE token = ? FOR UPDATE`,
        [token]
      );
      if (rows.length === 0) {
        await conn.rollback();
        return res.status(404).json({
          error: "Invitaci\xF3n no encontrada",
          code: "INVITATION_NOT_FOUND"
        });
      }
      invitation = rows[0];
      if (invitation.accepted_at) {
        await conn.rollback();
        return res.status(404).json({
          error: "Esta invitaci\xF3n ya fue aceptada",
          code: "INVITATION_ALREADY_ACCEPTED"
        });
      }
      if (new Date(invitation.expires_at) <= /* @__PURE__ */ new Date()) {
        await conn.rollback();
        return res.status(404).json({
          error: "Esta invitaci\xF3n expir\xF3",
          code: "INVITATION_EXPIRED"
        });
      }
      orgId = invitation.organization_id;
      invitedRole = invitation.role;
      invitedEmail = invitation.email;
      const profileId = globalThis.crypto.randomUUID();
      const finalDisplayName = displayName && displayName.trim() || invitedEmail.split("@")[0];
      const passwordHash = await bcrypt2.hash(password, 10);
      await conn.query(
        `INSERT INTO profiles
          (id, organization_id, display_name, email, role, password_hash, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          profileId,
          orgId,
          finalDisplayName,
          invitedEmail,
          invitedRole,
          passwordHash,
          invitedEmail
        ]
      );
      await conn.query(
        `UPDATE org_invitations SET accepted_at = NOW() WHERE id = ?`,
        [invitation.id]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error("[invitations] accept failed:", e);
      if (e?.code === "ER_DUP_ENTRY") {
        throw conflict(
          "Ya existe un miembro con ese email en esta organizaci\xF3n.",
          "EMAIL_ALREADY_MEMBER"
        );
      }
      throw internalExpose("Error al aceptar la invitaci\xF3n", "DB_UNAVAILABLE");
    } finally {
      conn.release();
    }
    const sessionId = globalThis.crypto.randomUUID();
    SESSIONS.set(sessionId, {
      profileId: await (async () => {
        const [pr] = await db_default.query(
          `SELECT id FROM profiles WHERE email = ? AND organization_id = ?`,
          [invitedEmail, orgId]
        );
        return pr[0]?.id;
      })(),
      organizationId: orgId,
      email: invitedEmail,
      displayName: displayName && displayName.trim() || invitedEmail.split("@")[0],
      role: invitedRole,
      createdAt: Date.now()
    });
    setSessionCookie(res, sessionId);
    return res.status(200).json({
      user: {
        id: SESSIONS.get(sessionId).profileId,
        email: invitedEmail,
        displayName: displayName && displayName.trim() || invitedEmail.split("@")[0],
        role: invitedRole,
        organizationId: orgId
      },
      organization: {
        id: orgId,
        name: await (async () => {
          const [or] = await db_default.query(
            `SELECT name FROM organizations WHERE id = ?`,
            [orgId]
          );
          return or[0]?.name ?? "";
        })()
      }
    });
  })
);
var requireCanManageOrgUsers = requireRole("canManageOrgUsers");
router10.post(
  "/invitations",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const me = req.user;
    const { email: rawEmail, role: rawRole } = req.body ?? {};
    if (!rawEmail || !rawRole) {
      return res.status(400).json({
        error: "Faltan campos requeridos: email, role",
        code: "MISSING_REQUIRED_FIELDS"
      });
    }
    const email = rawEmail.toLowerCase().trim();
    const role = rawRole;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "El email no tiene formato v\xE1lido",
        code: "INVALID_EMAIL"
      });
    }
    if (!["gestor", "propietario", "inquilino"].includes(role)) {
      return res.status(400).json({
        error: `Rol inv\xE1lido: ${role}. Roles permitidos: gestor, propietario, inquilino.`,
        code: "INVALID_ROLE"
      });
    }
    const [existing] = await db_default.query(
      `SELECT id FROM profiles WHERE email = ? AND organization_id = ? LIMIT 1`,
      [email, orgId]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        error: `${email} ya es miembro de esta organizaci\xF3n.`,
        code: "EMAIL_ALREADY_MEMBER"
      });
    }
    const seats = await countActiveSeats(orgId);
    const { max, planName } = await getMaxUsersForOrg(orgId);
    if (seats >= max) {
      return res.status(402).json({
        error: `Llegaste al l\xEDmite de ${max} usuario(s) de tu plan ${planName ?? "actual"}. Actualiz\xE1 tu plan para invitar m\xE1s.`,
        code: "PLAN_LIMIT_REACHED"
      });
    }
    const id = globalThis.crypto.randomUUID();
    const token = globalThis.crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
    await db_default.query(
      `INSERT INTO org_invitations
        (id, organization_id, email, role, token, invited_by, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, orgId, email, role, token, me.id, expiresAt, me.email]
    );
    const publicUrl = process.env.PUBLIC_URL || `http://localhost:3000`;
    const acceptUrl = `${publicUrl}/accept-invitation?token=${token}`;
    const mailResult = await sendInvitationEmail({
      to: email,
      inviterName: me.displayName,
      inviterEmail: me.email,
      organizationName: "(tu organizaci\xF3n)",
      role,
      acceptUrl,
      expiresAt
    });
    const response = {
      id,
      email,
      role,
      token,
      acceptUrl,
      expiresAt: expiresAt.toISOString()
    };
    if (!mailResult.sent) {
      response.warning = "EMAIL_FAILED";
    }
    return res.status(201).json(response);
  })
);
router10.get(
  "/invitations",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT id, email, role, created_at, expires_at, accepted_at
       FROM org_invitations WHERE organization_id = ?
       ORDER BY created_at DESC LIMIT 500`,
      [orgId]
    );
    const now = /* @__PURE__ */ new Date();
    const invitations = rows.map((r) => {
      let status;
      if (r.accepted_at) status = "accepted";
      else if (new Date(r.expires_at) <= now) status = "expired";
      else status = "pending";
      return {
        id: r.id,
        email: r.email,
        role: r.role,
        status,
        createdAt: new Date(r.created_at).toISOString(),
        expiresAt: new Date(r.expires_at).toISOString(),
        acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null
      };
    });
    return res.json({ invitations });
  })
);
router10.delete(
  "/invitations/:id",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { id } = req.params;
    const [rows] = await db_default.query(
      `SELECT id, accepted_at FROM org_invitations WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, orgId]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        error: "Invitaci\xF3n no encontrada",
        code: "INVITATION_NOT_FOUND"
      });
    }
    if (rows[0].accepted_at) {
      return res.status(409).json({
        error: "No se puede borrar una invitaci\xF3n ya aceptada",
        code: "CANNOT_DELETE_ACCEPTED_INVITATION"
      });
    }
    await db_default.query(`DELETE FROM org_invitations WHERE id = ?`, [id]);
    return res.status(204).send();
  })
);
router10.post(
  "/invitations/:id/resend",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { id } = req.params;
    const [rows] = await db_default.query(
      `SELECT i.id, i.email, i.role, i.accepted_at, i.expires_at, o.name AS org_name
       FROM org_invitations i
       JOIN organizations o ON i.organization_id = o.id
       WHERE i.id = ? AND i.organization_id = ? LIMIT 1`,
      [id, orgId]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        error: "Invitaci\xF3n no encontrada",
        code: "INVITATION_NOT_FOUND"
      });
    }
    if (rows[0].accepted_at) {
      return res.status(409).json({
        error: "La invitaci\xF3n ya fue aceptada",
        code: "INVITATION_ALREADY_ACCEPTED"
      });
    }
    const newToken = globalThis.crypto.randomBytes(32).toString("hex");
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
    await db_default.query(
      `UPDATE org_invitations SET token = ?, expires_at = ? WHERE id = ?`,
      [newToken, newExpires, id]
    );
    const publicUrl = process.env.PUBLIC_URL || `http://localhost:3000`;
    const acceptUrl = `${publicUrl}/accept-invitation?token=${newToken}`;
    const me = req.user;
    const mailResult = await sendInvitationEmail({
      to: rows[0].email,
      inviterName: me.displayName,
      inviterEmail: me.email,
      organizationName: rows[0].org_name,
      role: rows[0].role,
      acceptUrl,
      expiresAt: newExpires
    });
    const response = { acceptUrl, expiresAt: newExpires.toISOString() };
    if (!mailResult.sent) response.warning = "EMAIL_FAILED";
    return res.json(response);
  })
);
router10.get(
  "/members",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await db_default.query(
      `SELECT p.id, p.email, p.display_name, p.role, p.created_at, o.created_by AS org_created_by
       FROM profiles p
       JOIN organizations o ON p.organization_id = o.id
       WHERE p.organization_id = ?
       ORDER BY p.created_at ASC`,
      [orgId]
    );
    const members = rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      createdAt: new Date(r.created_at).toISOString(),
      isOrgOwner: r.role === "admin" && r.email === r.org_created_by
    }));
    return res.json({ members });
  })
);
router10.patch(
  "/members/:id",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { id } = req.params;
    const { role } = req.body ?? {};
    if (!role || !["gestor", "propietario", "inquilino"].includes(role)) {
      return res.status(400).json({ error: `Rol inv\xE1lido: ${role}.`, code: "INVALID_ROLE" });
    }
    const [rows] = await db_default.query(
      `SELECT p.id, p.role, p.email, o.created_by AS org_created_by
       FROM profiles p
       JOIN organizations o ON p.organization_id = o.id
       WHERE p.id = ? AND p.organization_id = ? LIMIT 1`,
      [id, orgId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Member no encontrado", code: "MEMBER_NOT_FOUND" });
    }
    const target = rows[0];
    if (target.role === "admin" && target.email === target.org_created_by) {
      return res.status(409).json({
        error: "No pod\xE9s cambiar el rol del due\xF1o de la organizaci\xF3n.",
        code: "CANNOT_REMOVE_ORG_OWNER"
      });
    }
    await db_default.query(`UPDATE profiles SET role = ? WHERE id = ?`, [role, id]);
    return res.json({
      id,
      email: target.email,
      role,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  })
);
router10.delete(
  "/members/:id",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { id } = req.params;
    const [rows] = await db_default.query(
      `SELECT p.id, p.role, p.email, o.created_by AS org_created_by
       FROM profiles p
       JOIN organizations o ON p.organization_id = o.id
       WHERE p.id = ? AND p.organization_id = ? LIMIT 1`,
      [id, orgId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Member no encontrado", code: "MEMBER_NOT_FOUND" });
    }
    const target = rows[0];
    if (target.role === "admin" && target.email === target.org_created_by) {
      return res.status(409).json({
        error: "No pod\xE9s eliminar al due\xF1o de la organizaci\xF3n.",
        code: "CANNOT_REMOVE_ORG_OWNER"
      });
    }
    await db_default.query(`DELETE FROM profiles WHERE id = ?`, [id]);
    return res.status(204).send();
  })
);
var saasBilling_default = router10;

// server/routes/admin.ts
import { Router as Router6 } from "express";

// server/seed/pilotSeed.ts
init_db();
import crypto11 from "node:crypto";
import bcrypt3 from "bcryptjs";
var ORG_ID = "00000000-0000-0000-0000-000000000001";
var PROPERTY_ID = "00000000-0000-0000-0000-000000000010";
var TENANT_ID = "00000000-0000-0000-0000-000000000020";
var CONTRACT_ID = "00000000-0000-0000-0000-000000000030";
var POLICY_ID = PROPERTY_ID;
var BANK_ACCOUNT_ID = "00000000-0000-0000-0000-000000000040";
var PROFILE_ID = "00000000-0000-0000-0000-000000000005";
var DISCOUNT_ID = "00000000-0000-0000-0000-000000000050";
var PILOT_EMAIL = (process.env.PILOT_EMAIL ?? "admin@inmocontrol.local").toLowerCase().trim();
var PILOT_PASSWORD = process.env.PILOT_PASSWORD ?? "inmo2026!";
var PERIOD_START = "2026-01-15";
var PERIOD_END = "2027-01-14";
var RENT_AMOUNT = 1696037;
var ADMIN_FEE = 25e4;
async function runPilotSeed() {
  const [existingAdmins] = await db_default.query(
    `SELECT id, email FROM profiles WHERE role = 'admin' LIMIT 1`
  );
  if (existingAdmins.length > 0) {
    return {
      alreadySeeded: true,
      stages: ["admin_existed"],
      admin: {
        id: existingAdmins[0].id,
        email: existingAdmins[0].email
      }
    };
  }
  const stages = [];
  await db_default.query(
    `INSERT INTO organizations
       (id, name, nit, address, phone, website, created_by)
     VALUES (?, 'InmoControl Piloto', '900.123.456-7',
             'Calle 100 #15-20, Bogot\xE1 D.C.', '+57 1 555 1234',
             'https://inmocontrol.example', 'pilot-seed')
     ON DUPLICATE KEY UPDATE name = VALUES(name), nit = VALUES(nit)`,
    [ORG_ID]
  );
  stages.push("organizations");
  await db_default.query(
    `INSERT INTO properties
       (id, organization_id, address, chip, folio,
        owner_name, owner_id_number, owner_phone, owner_email,
        property_type, status, archived,
        mandato_pdf_url, mandato_signed_at, created_by)
     VALUES (?, ?, 'Calle 93 #11-27, Apto 501', 'AAA0123BMCY', '50N-1234567',
             'Carlos Andr\xE9s P\xE9rez Restrepo', '79.456.123',
             '+57 310 456 7890', 'carlos.perez@example.com',
             'apartamento', 'Arrendado', 0,
             'https://example.com/mandato-firmado.pdf', NOW(),
             'pilot-seed')
     ON DUPLICATE KEY UPDATE address = VALUES(address), owner_name = VALUES(owner_name)`,
    [PROPERTY_ID, ORG_ID]
  );
  stages.push("properties");
  await db_default.query(
    `INSERT INTO tenants
       (id, organization_id, property_id, name, document_id, email, phone,
        rent, admin_fee, lease_start_date, status)
     VALUES (?, ?, ?, 'Mar\xEDa Fernanda G\xF3mez Salazar', '52.987.654',
             'maria.gomez@example.com', '+57 315 987 6543',
             ?, ?, ?, 'Activo')
     ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status)`,
    [TENANT_ID, ORG_ID, PROPERTY_ID, RENT_AMOUNT, ADMIN_FEE, PERIOD_START]
  );
  stages.push("tenants");
  await db_default.query(
    `INSERT INTO contracts
       (id, organization_id, property_id, tenant_id,
        rent_amount, admin_fee, commission_pct, insurance_pct,
        start_date, end_date, status, renewal_strategy, inventory_end_required,
        contract_pdf_url, signed_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 8, 0, ?, ?, 'active', 'auto', 1,
             'https://example.com/contrato-firmado.pdf', NOW(), 'pilot-seed')
     ON DUPLICATE KEY UPDATE status = VALUES(status), start_date = VALUES(start_date)`,
    [CONTRACT_ID, ORG_ID, PROPERTY_ID, TENANT_ID, RENT_AMOUNT, ADMIN_FEE, PERIOD_START, PERIOD_END]
  );
  stages.push("contracts");
  await db_default.query(
    `INSERT INTO billing_policies
       (property_id, organization_id, rent_amount, admin_fee,
        late_fee_mid_pct, late_fee_late_pct, grace_day,
        apply_annual_ipc, expected_ipc_pct, apply_ipc_to_admin,
        allow_admin_changes, primary_bank_account_id, created_by)
     VALUES (?, ?, ?, ?, 5, 10, 10, 1, 5, 1, 1, ?, 'pilot-seed')
     ON DUPLICATE KEY UPDATE rent_amount = VALUES(rent_amount), admin_fee = VALUES(admin_fee)`,
    [POLICY_ID, ORG_ID, RENT_AMOUNT, ADMIN_FEE, BANK_ACCOUNT_ID]
  );
  stages.push("billing_policies");
  await db_default.query(
    `INSERT INTO bank_accounts
       (id, organization_id, property_id, bank, account_type, account_number,
        holder_name, holder_id_number, is_primary, notes)
     VALUES (?, ?, ?, 'Bancolombia', 'savings', '123-456789-00',
             'Carlos Andr\xE9s P\xE9rez Restrepo', '79.456.123', 1,
             'Cuenta principal del propietario')
     ON DUPLICATE KEY UPDATE holder_name = VALUES(holder_name), is_primary = VALUES(is_primary)`,
    [BANK_ACCOUNT_ID, ORG_ID, PROPERTY_ID]
  );
  stages.push("bank_accounts");
  const monthsBetween2 = (a, b) => {
    const aa = new Date(a);
    const bb = new Date(b);
    return Math.max(
      1,
      (bb.getFullYear() - aa.getFullYear()) * 12 + (bb.getMonth() - aa.getMonth())
    );
  };
  const totalMonths = monthsBetween2(PERIOD_START, PERIOD_END);
  const amortRows = [];
  for (let m = 1; m <= totalMonths; m++) {
    const start = new Date(PERIOD_START);
    start.setMonth(start.getMonth() + (m - 1));
    const periodStart = start.toISOString().slice(0, 10);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const periodEnd = end.toISOString().slice(0, 10);
    const subtotal = RENT_AMOUNT + ADMIN_FEE;
    amortRows.push({
      id: crypto11.randomUUID(),
      propertyId: PROPERTY_ID,
      contractId: CONTRACT_ID,
      monthNumber: m,
      periodStart,
      periodEnd,
      dueDate: `${periodStart.slice(0, 7)}-10`,
      baseRent: RENT_AMOUNT,
      baseAdmin: ADMIN_FEE,
      adminAdjustment: 0,
      ipcAdjustment: 0,
      subtotal,
      appliedLateFeePct: 0,
      lateFeeAmount: 0,
      paidOnDayOfMonth: null,
      total: subtotal,
      totalEarly: subtotal,
      totalMid: subtotal + Math.round(subtotal * 0.05),
      totalLate: subtotal + Math.round(subtotal * 0.1),
      status: "pending"
    });
  }
  await db_default.query(`DELETE FROM amortization_rows WHERE contract_id = ?`, [CONTRACT_ID]);
  for (const r of amortRows) {
    await db_default.query(
      `INSERT INTO amortization_rows
         (id, organization_id, property_id, contract_id,
          month_number, period_start, period_end, due_date,
          base_rent, base_admin, admin_adjustment, ipc_adjustment,
          subtotal, applied_late_fee_pct, late_fee_amount,
          paid_on_day_of_month,
          total, total_early, total_mid, total_late, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?,
               ?, ?, ?, ?, 'pending')`,
      [
        r.id,
        ORG_ID,
        r.propertyId,
        r.contractId,
        r.monthNumber,
        r.periodStart,
        r.periodEnd,
        r.dueDate,
        r.baseRent,
        r.baseAdmin,
        r.adminAdjustment,
        r.ipcAdjustment,
        r.subtotal,
        r.appliedLateFeePct,
        r.lateFeeAmount,
        r.paidOnDayOfMonth,
        r.total,
        r.totalEarly,
        r.totalMid,
        r.totalLate
      ]
    );
  }
  stages.push(`amortization_rows(${amortRows.length})`);
  await db_default.query(
    `INSERT INTO property_discounts
       (id, organization_id, property_id, type, description, amount, month_period, recorded_by)
     VALUES (?, ?, ?, 'public_services', 'Servicio de energ\xEDa apartamento 501 (julio 2026)', 180000, '2026-07', 'pilot-seed')
     ON DUPLICATE KEY UPDATE amount = VALUES(amount), description = VALUES(description)`,
    [DISCOUNT_ID, ORG_ID, PROPERTY_ID]
  );
  stages.push("property_discounts");
  const passwordHash = await bcrypt3.hash(PILOT_PASSWORD, 10);
  await db_default.query(
    `INSERT INTO profiles
       (id, organization_id, display_name, email, role, photo_url, password_hash, created_by)
     VALUES (?, ?, 'Administrador Piloto', ?, 'admin', NULL, ?, 'pilot-seed')
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash)`,
    [PROFILE_ID, ORG_ID, PILOT_EMAIL, passwordHash]
  );
  stages.push("profiles");
  return {
    alreadySeeded: false,
    stages,
    admin: { id: PROFILE_ID, email: PILOT_EMAIL }
  };
}

// server/routes/admin.ts
var router11 = Router6();
router11.post("/seed", async (req, res) => {
  const expected = process.env.ADMIN_SEED_TOKEN;
  if (!expected) {
    return res.status(503).json({
      ok: false,
      code: "ADMIN_SEED_TOKEN_NOT_CONFIGURED",
      error: "Server admin no configur\xF3 ADMIN_SEED_TOKEN. Definilo en el panel de Hostinger antes de invocar."
    });
  }
  const provided = req.headers["x-admin-seed-token"];
  if (typeof provided !== "string" || provided !== expected) {
    return res.status(401).json({
      ok: false,
      code: "INVALID_TOKEN",
      error: "Falta o es incorrecto el header X-Admin-Seed-Token."
    });
  }
  try {
    const result = await runPilotSeed();
    return res.status(200).json({
      ok: true,
      alreadySeeded: result.alreadySeeded,
      stages: result.stages,
      admin: result.admin,
      message: result.alreadySeeded ? "DB ya tiene admin \u2014 seed no ejecutado." : "Seed del piloto completado."
    });
  } catch (err) {
    console.error("[admin/seed] failed:", err);
    throw internal("SEED_ERROR");
  }
});
router11.get("/seed/status", async (_req, res) => {
  try {
    const { default: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const [rows] = await pool2.query(
      `SELECT
         (SELECT COUNT(*) FROM organizations) AS orgs,
         (SELECT COUNT(*) FROM properties) AS properties,
         (SELECT COUNT(*) FROM profiles WHERE role='admin') AS admins,
         (SELECT COUNT(*) FROM tenants WHERE status='Activo') AS tenants,
         (SELECT COUNT(*) FROM contracts WHERE status='active') AS contracts,
         (SELECT COUNT(*) FROM amortization_rows) AS amort_rows`
    );
    return res.json({ ok: true, counts: rows[0] });
  } catch {
    throw internal();
  }
});
var admin_default = router11;

// server.ts
init_db();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
async function startServer() {
  const app = express6();
  const PORT = Number(
    process.env.PORT ?? (process.env.NODE_ENV === "production" ? 3e3 : 3001)
  );
  const HOST = process.env.HOST ?? "0.0.0.0";
  const allowedOrigins = [
    process.env.APP_URL,
    process.env.SHARED_APP_URL,
    "http://localhost:3000"
  ].filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== "production") {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-goog-api-key"]
    })
  );
  app.use(express6.json({ limit: "15mb" }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const reqPath = req.path;
    if (!reqPath.startsWith("/api")) return next();
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const cookiePresent = req.headers.cookie ? "yes" : "no";
      console.log(
        `[req] ${req.method} ${reqPath} \u2192 ${res.statusCode} (${ms}ms, cookie=${cookiePresent}, len=${res.getHeader("content-length") ?? "?"})`
      );
    });
    next();
  });
  app.get("/api/health", async (req, res) => {
    const dbStatus = await checkDb();
    res.json({
      status: dbStatus.ok ? "ok" : "degraded",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      db: dbStatus
    });
  });
  app.use("/api/auth", auth_default);
  app.use("/api/admin", admin_default);
  app.use("/api/entities", entities_default);
  app.use("/api/billing", billing_default);
  app.use("/api", googleAuth_default);
  app.use("/api/tenants", tenants_default);
  app.use("/api/properties", properties_default);
  app.use("/api/financial-records", financialRecords_default);
  app.use("/api/notifications", notifications_default);
  app.use("/api/saas-billing", saasBilling_default);
  app.use("/api/inventories", inventories_default);
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express6.static(distPath, { index: false }));
    app.get(["/sw.js", "/sw.js.map"], (_req, res) => {
      res.set("Cache-Control", "no-store");
      res.sendFile(path.join(distPath, "sw.js"));
    });
    app.get("/manifest.webmanifest", (_req, res) => {
      res.set("Content-Type", "application/manifest+json");
      res.sendFile(path.join(distPath, "manifest.webmanifest"));
    });
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.use(
    (err, _req, res, next) => {
      if (err && (err.type === "aborted" || err.message === "request aborted" || err.code === "ECONNABORTED")) {
        if (!res.headersSent) res.status(499).end();
        return;
      }
      next(err);
    }
  );
  app.use(errorHandler);
  httpServer = app.listen(PORT, HOST, () => {
    console.log(
      `[server] Listening on http://${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`
    );
    checkDb().then((s) => {
      if (s.ok) {
        console.log(`[db] MySQL OK \u2014 ${s.version}`);
      } else {
        console.warn(`[db] MySQL NO disponible: ${s.error}`);
        console.warn(`[db] Los endpoints devolver\xE1n 503 hasta que se conecte.`);
      }
    });
  });
}
var httpServer = null;
var shuttingDown = false;
async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`
[server] ${reason} \u2014 cerrando ordenadamente...`);
  const force = setTimeout(() => {
    console.error("[server] cierre forzado tras 8s");
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, 8e3);
  force.unref();
  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(() => resolve()));
      console.log("[server] HTTP cerrado");
    }
    await db_default.end().catch(() => {
    });
    console.log("[server] pool de MySQL cerrado");
  } catch (err) {
    console.error("[server] error durante el cierre:", err?.message ?? err);
  }
  clearTimeout(force);
  process.exit(exitCode);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error(
    "[server] UNHANDLED REJECTION (no mat\xF3 el proceso):",
    reason?.message ?? reason
  );
  if (reason?.stack) console.error(reason.stack);
  if (reason?.sql) console.error("  sql:", reason.sql);
});
process.on("uncaughtException", (err) => {
  console.error(
    "[server] UNCAUGHT EXCEPTION \u2014 el proceso sale para que el supervisor lo reinicie:",
    err?.message ?? err
  );
  if (err?.stack) console.error(err.stack);
  void shutdown("uncaughtException", 1);
});
startServer().catch((err) => {
  console.error("[server] Error fatal en startServer():", err);
  process.exit(1);
});
