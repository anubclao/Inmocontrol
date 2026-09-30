/**
 * InmoControl — SaaS Subscription Billing (Fase 8)
 * ============================================================================
 * NO confundir con `routes/billing.ts` que es el billing de PROPIEDADES
 * (arriendos, amortización, recibos). Este módulo es la subscripción de la
 * ORGANIZACIÓN al SaaS InmoControl.
 *
 * Endpoints:
 *   GET    /api/saas-billing/plans                       — catálogo de planes (público)
 *   GET    /api/saas-billing/plans/:id                   — un plan
 *   POST   /api/saas-billing/plans                       — crear plan (admin)
 *   PUT    /api/saas-billing/plans/:id                   — editar plan (admin)
 *   DELETE /api/saas-billing/plans/:id                   — desactivar plan (admin)
 *
 *   GET    /api/saas-billing/subscription                — subscripción actual de la org
 *   POST   /api/saas-billing/subscription                — subscribirse / cambiar plan (mock pay)
 *   DELETE /api/saas-billing/subscription                — cancelar al final del periodo
 *
 *   GET    /api/saas-billing/payment-methods             — métodos de pago de la org
 *   POST   /api/saas-billing/payment-methods             — agregar método (mock — solo metadata)
 *   DELETE /api/saas-billing/payment-methods/:id        — eliminar método
 *   PUT    /api/saas-billing/payment-methods/:id/default — marcar como default
 *
 *   GET    /api/saas-billing/invoices                    — facturas de la org
 *   GET    /api/saas-billing/invoices/:id                — factura puntual
 *   POST   /api/saas-billing/invoices/:id/pay            — pagar factura (mock)
 *
 * PSP (Wompi, MercadoPago, etc.): MOCK por ahora. Cuando se enchufe el real,
 * los endpoints /pay y /subscribe llaman al PSP real + guardan el resultado.
 * Para SaaS multi-tenant real, mover credenciales cifradas al backend.
 *
 * Multi-tenant: orgId viene del request autenticado (getOrgIdForRequest).
 */

import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "../db.js";
// FIX 2026-09-25 (saas_multitenant.md): usar getOrgIdForRequest en vez de
// ensureDefaultOrg() para que el orgId venga del req.user, no del primero
// de la tabla. ensureDefaultOrg() se mantiene para bootstrap/tests.
import { getOrgIdForRequest } from "../lib/orgContext.js";
// FIX #2 (P0 seguridad): requireAuth en SaaS billing (planes, suscripción, pagos).
import { requireAuth, setSessionCookie, SESSIONS } from "./auth.js";
// fix-issue-permissions-by-endpoint: requiere canManageSaasBilling.
import { requireRole } from "../middleware/requireRole.js";
// FIX 2026-09-26 (saas_signup.md): rate limit por IP para el signup publico.
import { rateLimit } from "../middleware/rateLimit.js";
// BUG-029: asyncHandler para propagación central de errores.
import { asyncHandler } from "../lib/asyncHandler.js";
// fix-issue-27: helper de errores tipado.
import { internalExpose, conflict } from "../lib/errors.js";

const router = Router();

// ─── SIGNUP PUBLICO (saas_signup.md) ──────────────────────────────────────
// IMPORTANTE: este endpoint es PUBLICO (no requireAuth). Va ANTES del
// `router.use(requireAuth)` de mas abajo para que no quede protegido.
// Rate limit: 5 signups por IP cada 15 minutos (mismo que /api/auth/login).
// ──────────────────────────────────────────────────────────────────────────
router.post(
  "/signup",
  rateLimit({ windowSeconds: 15 * 60, maxAttempts: 5, scope: "ip" }),
  asyncHandler(async (req: Request, res: Response) => {
    // EC-10: si ya hay sesión activa, rechazar el signup.
    const existingSessionId = req.cookies?.["inmocontrol_pilot_session"];
    if (existingSessionId && SESSIONS.has(existingSessionId)) {
      return res.status(409).json({
        error: "Ya tenés una cuenta activa. Cerrá sesión primero.",
        code: "ALREADY_AUTHENTICATED",
      });
    }

    // AC-4: campos requeridos.
    const {
      email: rawEmail,
      password: rawPassword,
      organizationName: rawOrgName,
    } = (req.body ?? {}) as {
      email?: string;
      password?: string;
      organizationName?: string;
    };

    if (!rawEmail || !rawPassword || !rawOrgName) {
      return res.status(400).json({
        error: "Faltan campos requeridos: email, password, organizationName",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // EC-1, EC-2: normalizar email antes de validar.
    const email = rawEmail.toLowerCase().trim();
    const password = rawPassword;
    const organizationName = String(rawOrgName).trim();

    // AC-5: email RFC basico.
    // No usamos una regex completa de RFC-5322 (seria overkill); una regex
    // comun que cubre el 99% de los casos reales.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "El email no tiene formato válido",
        code: "INVALID_EMAIL",
      });
    }

    // AC-6: password 8+ chars, 1 letra, 1 numero.
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return res.status(400).json({
        error:
          "La contraseña debe tener al menos 8 caracteres, 1 letra y 1 número.",
        code: "WEAK_PASSWORD",
      });
    }

    // AC-7: orgName 3-100 chars (despues de trim, EC-8).
    if (organizationName.length < 3 || organizationName.length > 100) {
      return res.status(400).json({
        error:
          "El nombre de la organización debe tener entre 3 y 100 caracteres.",
        code: "INVALID_ORG_NAME",
      });
    }

    // AC-8: email duplicado.
    const [existing] = await pool.query<any[]>(
      `SELECT id FROM profiles WHERE email = ? LIMIT 1`,
      [email],
    );
    if (existing.length > 0) {
      return res.status(409).json({
        error: "Ya existe una cuenta con ese email. ¿Olvidaste tu contraseña?",
        code: "EMAIL_TAKEN",
      });
    }

    // AC-15: auto-seed del plan 'trial' si no existe (idempotente).
    let trialPlanId: string;
    const [trialRows] = await pool.query<any[]>(
      `SELECT id FROM saas_plans WHERE slug = 'trial' LIMIT 1`,
    );
    if (trialRows.length === 0) {
      trialPlanId = (globalThis as any).crypto.randomUUID();
      try {
        await pool.query(
          `INSERT INTO saas_plans
            (id, slug, name, price_cop, max_properties, max_users, max_alerts_per_month, sort_order, is_active)
           VALUES (?, 'trial', 'Trial 14 dias', 0, 5, 2, 50, 999, 1)`,
          [trialPlanId],
        );
      } catch (e: any) {
        if (e?.code !== "ER_DUP_ENTRY") {
          // fix-issue-27: mensaje custom es seguro (no leak). internalExpose.
          console.error("[signup] auto-seed trial plan fallo:", e);
          throw internalExpose(
            "No se pudo inicializar el plan trial.",
            "NO_TRIAL_PLAN",
          );
        }
        // Si hubo carrera y otro request creo el plan, lo recuperamos.
        const [retry] = await pool.query<any[]>(
          `SELECT id FROM saas_plans WHERE slug = 'trial' LIMIT 1`,
        );
        trialPlanId = retry[0].id;
      }
    } else {
      trialPlanId = trialRows[0].id;
    }

    // Transaccion: 3 INSERTs (org, profile, subscription).
    // Si cualquiera falla, rollback completo. El cliente no debe ver
    // una org creada sin su admin (o viceversa).
    const orgId = (globalThis as any).crypto.randomUUID();
    const profileId = (globalThis as any).crypto.randomUUID();
    const subscriptionId = (globalThis as any).crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // AC-9: org con UUID, name trimmeado, created_by = email.
      await conn.query(
        `INSERT INTO organizations (id, name, created_by) VALUES (?, ?, ?)`,
        [orgId, organizationName, email],
      );

      // AC-10: profile admin con bcrypt hash.
      await conn.query(
        `INSERT INTO profiles
          (id, organization_id, display_name, email, role, password_hash, created_by)
         VALUES (?, ?, ?, ?, 'admin', ?, ?)`,
        [profileId, orgId, organizationName, email, passwordHash, email],
      );

      // AC-11: subscription trial 14 dias.
      // La tabla real (saas_subscriptions) no tiene columna `trial_ends_at`
      // ni `created_by`. La convencion SaaS clasica: durante el trial,
      // `current_period_end` es la fecha en que termina el trial (sin cargo).
      // Cuando se paga, esa misma columna pasa a ser el fin del periodo pago.
      // Status = 'trialing' indica que esta en trial.
      await conn.query(
        `INSERT INTO saas_subscriptions
          (id, organization_id, plan_id, status,
           current_period_start, current_period_end)
         VALUES (?, ?, ?, 'trialing', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY))`,
        [subscriptionId, orgId, trialPlanId],
      );

      await conn.commit();
    } catch (e: any) {
      await conn.rollback();
      console.error("[signup] transaccion fallo:", e);
      // EC-5: error de DB -> 500 con code.
      if (e?.code === "ER_DUP_ENTRY") {
        throw conflict(
          "Ya existe una cuenta con ese email. ¿Olvidaste tu contraseña?",
          "EMAIL_TAKEN",
        );
      }
      // fix-issue-27: 500 con mensaje custom seguro. internalExpose.
      throw internalExpose(
        "Error creando la cuenta. Reintentá en unos minutos.",
        "DB_UNAVAILABLE",
      );
    } finally {
      conn.release();
    }

    // AC-12: crear sesion httpOnly con el profile y org nuevos.
    const sessionId = crypto.randomUUID();
    SESSIONS.set(sessionId, {
      profileId,
      organizationId: orgId,
      email,
      displayName: organizationName,
      role: "admin",
      createdAt: Date.now(),
    });
    setSessionCookie(res, sessionId);

    // AC-13: response con user + organization + subscription.
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return res.status(200).json({
      user: {
        id: profileId,
        email,
        displayName: organizationName,
        role: "admin",
        organizationId: orgId,
      },
      organization: {
        id: orgId,
        name: organizationName,
      },
      subscription: {
        id: subscriptionId,
        planId: trialPlanId,
        status: "trialing",
        trialEndsAt: trialEndsAt.toISOString(),
      },
    });
  }),
);

// ─── ENDPOINTS AUTENTICADOS ──────────────────────────────────────────────
// A partir de aca, TODAS las rutas requieren sesion valida.
router.use(requireAuth);

// ─── Helpers ───────────────────────────────────────────────────────────

const IVA_RATE = 0.19; // Colombia standard 19%

function genId(): string {
  return (globalThis as any).crypto.randomUUID();
}

function planRowToJson(r: any) {
  let features: string[] = [];
  try {
    features = r.features_json
      ? typeof r.features_json === "string"
        ? JSON.parse(r.features_json)
        : r.features_json
      : [];
  } catch {
    features = [];
  }
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? undefined,
    priceCop: Number(r.price_cop),
    maxProperties: r.max_properties,
    maxUsers: r.max_users,
    maxAlertsPerMonth: r.max_alerts_per_month,
    features,
    sortOrder: r.sort_order,
    isActive: !!r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function pmRowToJson(r: any) {
  let details: any = null;
  try {
    details = r.details_json
      ? typeof r.details_json === "string"
        ? JSON.parse(r.details_json)
        : r.details_json
      : null;
  } catch {
    details = null;
  }
  return {
    id: r.id,
    type: r.type,
    brand: r.brand ?? undefined,
    last4: r.last4 ?? undefined,
    expiryMonth: r.expiry_month ?? undefined,
    expiryYear: r.expiry_year ?? undefined,
    holderName: r.holder_name ?? undefined,
    details,
    isDefault: !!r.is_default,
    createdAt: r.created_at,
  };
}

function invoiceRowToJson(r: any) {
  let planSnapshot: any = null;
  try {
    planSnapshot = r.plan_snapshot_json
      ? typeof r.plan_snapshot_json === "string"
        ? JSON.parse(r.plan_snapshot_json)
        : r.plan_snapshot_json
      : null;
  } catch {
    planSnapshot = null;
  }
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    subscriptionId: r.subscription_id,
    paymentMethodId: r.payment_method_id ?? undefined,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    subtotalCop: Number(r.subtotal_cop),
    ivaCop: Number(r.iva_cop),
    totalCop: Number(r.total_cop),
    status: r.status,
    issuedAt: r.issued_at,
    paidAt: r.paid_at ?? undefined,
    planSnapshot,
  };
}

function subscriptionRowToJson(r: any) {
  return {
    id: r.id,
    planId: r.plan_id,
    status: r.status,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: !!r.cancel_at_period_end,
    startedAt: r.started_at,
    canceledAt: r.canceled_at ?? undefined,
  };
}

/** Genera número de factura correlativo: INV-YYYY-NNNN */
async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM saas_invoices WHERE invoice_number LIKE ?`,
    [`INV-${year}-%`],
  );
  const n = Number((rows as any[])[0]?.n ?? 0) + 1;
  return `INV-${year}-${String(n).padStart(4, "0")}`;
}

// ─── PLANS ─────────────────────────────────────────────────────────────

/** GET /plans — lista planes activos ordenados por sort_order. */
// BUG-029: migrado a asyncHandler.
router.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC`,
    );
    res.json((rows as any[]).map(planRowToJson));
  }),
);

/** GET /plans/all — incluye inactivos (admin). */
// BUG-029: migrado a asyncHandler.
router.get(
  "/plans/all",
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query(
      `SELECT * FROM saas_plans ORDER BY sort_order ASC`,
    );
    res.json((rows as any[]).map(planRowToJson));
  }),
);

/** GET /plans/:id */
// BUG-029: migrado a asyncHandler.
router.get(
  "/plans/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`SELECT * FROM saas_plans WHERE id = ?`, [
      req.params.id,
    ]);
    const list = rows as any[];
    if (list.length === 0)
      return res.status(404).json({ error: "Plan no encontrado" });
    res.json(planRowToJson(list[0]));
  }),
);

/** POST /plans — crear plan (admin). */
// BUG-029: migrado a asyncHandler (preserva 409 para slug duplicado).
router.post(
  "/plans",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const p = req.body as {
      slug: string;
      name: string;
      description?: string;
      priceCop: number;
      maxProperties: number;
      maxUsers: number;
      maxAlertsPerMonth: number;
      features?: string[];
      sortOrder?: number;
    };
    if (!p.slug || !p.name)
      return res.status(400).json({ error: "Faltan slug o name" });
    const id = genId();
    try {
      await pool.query(
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
          Number(p.sortOrder ?? 100),
        ],
      );
      const [rows] = await pool.query(`SELECT * FROM saas_plans WHERE id = ?`, [
        id,
      ]);
      res.status(201).json(planRowToJson((rows as any[])[0]));
    } catch (err: any) {
      if (err?.code === "ER_DUP_ENTRY")
        return res
          .status(409)
          .json({ error: `Ya existe un plan con slug "${p.slug}"` });
      throw err; // BUG-029: propagar al errorHandler central
    }
  }),
);

/** PUT /plans/:id — editar plan (admin). */
// BUG-029: migrado a asyncHandler.
router.put(
  "/plans/:id",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const p = req.body as Partial<{
      name: string;
      description: string | null;
      priceCop: number;
      maxProperties: number;
      maxUsers: number;
      maxAlertsPerMonth: number;
      features: string[];
      sortOrder: number;
      isActive: boolean;
    }>;
    await pool.query(
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
        p.description ?? undefined, // null permite limpiar
        p.priceCop ?? null,
        p.maxProperties ?? null,
        p.maxUsers ?? null,
        p.maxAlertsPerMonth ?? null,
        p.features ? JSON.stringify(p.features) : null,
        p.sortOrder ?? null,
        p.isActive == null ? null : p.isActive ? 1 : 0,
        req.params.id,
      ],
    );
    const [rows] = await pool.query(`SELECT * FROM saas_plans WHERE id = ?`, [
      req.params.id,
    ]);
    const list = rows as any[];
    if (list.length === 0)
      return res.status(404).json({ error: "Plan no encontrado" });
    res.json(planRowToJson(list[0]));
  }),
);

/** DELETE /plans/:id — desactivar (soft delete — no borramos por FK con subscriptions). */
// BUG-029: migrado a asyncHandler (preserva lógica de soft delete si hay subs activas).
router.delete(
  "/plans/:id",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    // Si hay suscripciones activas referenciando este plan, no dejamos borrarlo duro.
    const [subs] = await pool.query(
      `SELECT COUNT(*) AS n FROM saas_subscriptions WHERE plan_id = ? AND status IN ('active','trialing','past_due')`,
      [req.params.id],
    );
    const activeCount = Number((subs as any[])[0]?.n ?? 0);
    if (activeCount > 0) {
      // Soft delete: desactivar
      await pool.query(`UPDATE saas_plans SET is_active = 0 WHERE id = ?`, [
        req.params.id,
      ]);
      return res.json({
        ok: true,
        deactivated: true,
        activeSubscriptions: activeCount,
      });
    }
    await pool.query(`DELETE FROM saas_plans WHERE id = ?`, [req.params.id]);
    res.json({ ok: true, deactivated: false });
  }),
);

// ─── SUBSCRIPTION ──────────────────────────────────────────────────────

/** GET /subscription — subscripción actual de la org (o null si no hay). */
// BUG-029: migrado a asyncHandler.
router.get(
  "/subscription",
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await pool.query(
      `SELECT * FROM saas_subscriptions WHERE organization_id = ?`,
      [orgId],
    );
    const list = rows as any[];
    if (list.length === 0) return res.json(null);
    res.json(subscriptionRowToJson(list[0]));
  }),
);

/** POST /subscription — subscribe o cambia de plan. Mock pay: emite invoice y la marca como pagada. */
// BUG-029: migrado a asyncHandler (preserva 404 para plan inactivo).
router.post(
  "/subscription",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const { planId, paymentMethodId } = req.body as {
      planId: string;
      paymentMethodId?: string;
    };
    if (!planId) return res.status(400).json({ error: "Falta planId" });
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    // Validar plan
    const [planRows] = await pool.query(
      `SELECT * FROM saas_plans WHERE id = ? AND is_active = 1`,
      [planId],
    );
    const planList = planRows as any[];
    if (planList.length === 0)
      return res.status(404).json({ error: "Plan no encontrado o inactivo" });
    const plan = planRowToJson(planList[0]);

    // ¿Existe ya subscripción?
    const [existing] = await pool.query(
      `SELECT * FROM saas_subscriptions WHERE organization_id = ?`,
      [orgId],
    );
    const existingList = existing as any[];
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const periodStartStr = fmt(now);
    const periodEndStr = fmt(periodEnd);

    let subscriptionId: string;
    if (existingList.length > 0) {
      subscriptionId = existingList[0].id;
      await pool.query(
        `UPDATE saas_subscriptions SET
         plan_id = ?, status = 'active',
         current_period_start = ?, current_period_end = ?,
         cancel_at_period_end = 0,
         canceled_at = NULL,
         updated_at = NOW()
       WHERE id = ?`,
        [planId, periodStartStr, periodEndStr, subscriptionId],
      );
    } else {
      subscriptionId = genId();
      await pool.query(
        `INSERT INTO saas_subscriptions
         (id, organization_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES (?, ?, ?, 'active', ?, ?, 0)`,
        [subscriptionId, orgId, planId, periodStartStr, periodEndStr],
      );
    }

    // Generar invoice del primer mes (MOCK: lo marcamos paid de una vez)
    const subtotal = plan.priceCop;
    const iva = Math.round(subtotal * IVA_RATE);
    const total = subtotal + iva;
    const invNumber = await nextInvoiceNumber();
    const invoiceId = genId();
    await pool.query(
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
        JSON.stringify(plan),
      ],
    );

    const [subRows] = await pool.query(
      `SELECT * FROM saas_subscriptions WHERE id = ?`,
      [subscriptionId],
    );
    res.status(201).json({
      subscription: subscriptionRowToJson((subRows as any[])[0]),
      plan,
      invoiceId,
      invoiceNumber: invNumber,
    });
  }),
);

/** DELETE /subscription — cancelar al final del periodo actual (no inmediato). */
// BUG-029: migrado a asyncHandler (preserva 404 si no hay sub activa).
router.delete(
  "/subscription",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [result] = await pool.query(
      `UPDATE saas_subscriptions SET
       cancel_at_period_end = 1,
       canceled_at = NULL,
       updated_at = NOW()
     WHERE organization_id = ? AND status IN ('active','trialing','past_due')`,
      [orgId],
    );
    const affected = (result as any).affectedRows;
    if (affected === 0)
      return res
        .status(404)
        .json({ error: "No hay subscripción activa para cancelar" });
    res.json({
      ok: true,
      message: "Subscripción se cancelará al final del periodo actual.",
    });
  }),
);

/** POST /subscription/reactivate — quitar cancel_at_period_end antes del fin del periodo. */
// BUG-029: migrado a asyncHandler (preserva 404 si no hay sub activa).
router.post(
  "/subscription/reactivate",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [result] = await pool.query(
      `UPDATE saas_subscriptions SET cancel_at_period_end = 0, updated_at = NOW()
     WHERE organization_id = ? AND status = 'active'`,
      [orgId],
    );
    if ((result as any).affectedRows === 0)
      return res
        .status(404)
        .json({ error: "No hay subscripción activa para reactivar" });
    res.json({ ok: true });
  }),
);

// ─── PAYMENT METHODS ───────────────────────────────────────────────────

/** GET /payment-methods */
// BUG-029: migrado a asyncHandler.
router.get(
  "/payment-methods",
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await pool.query(
      `SELECT * FROM saas_payment_methods WHERE organization_id = ? ORDER BY is_default DESC, created_at DESC`,
      [orgId],
    );
    res.json((rows as any[]).map(pmRowToJson));
  }),
);

/**
 * POST /payment-methods — agregar método.
 * MOCK: solo guardamos metadata visible (brand, last4, expiry). El PAN real
 * nunca toca nuestro backend. Cuando se enchufe un PSP, este endpoint recibe
 * un token opaco del frontend (generado por el JS del PSP).
 */
// BUG-029: migrado a asyncHandler (preserva 400 de validación + lógica de default).
router.post(
  "/payment-methods",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    const pm = req.body as {
      type: "card" | "pse" | "nequi" | "bancolombia";
      brand?: string;
      last4?: string;
      expiryMonth?: number;
      expiryYear?: number;
      holderName?: string;
      details?: any;
      makeDefault?: boolean;
    };
    if (!pm.type) return res.status(400).json({ error: "Falta type" });
    if (
      pm.type === "card" &&
      (!pm.brand || !pm.last4 || !pm.expiryMonth || !pm.expiryYear)
    ) {
      return res.status(400).json({
        error:
          "Para tarjeta se requiere brand, last4, expiryMonth y expiryYear",
      });
    }
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const id = genId();
    // Si es default, desmarcar los demás primero
    if (pm.makeDefault) {
      await pool.query(
        `UPDATE saas_payment_methods SET is_default = 0 WHERE organization_id = ?`,
        [orgId],
      );
    }
    // Si es el primer método, hacerlo default automáticamente
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS n FROM saas_payment_methods WHERE organization_id = ?`,
      [orgId],
    );
    const isFirst = Number((countRows as any[])[0]?.n ?? 0) === 0;
    const isDefault = !!(pm.makeDefault ?? isFirst);

    await pool.query(
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
        isDefault ? 1 : 0,
      ],
    );
    const [rows] = await pool.query(
      `SELECT * FROM saas_payment_methods WHERE id = ?`,
      [id],
    );
    res.status(201).json(pmRowToJson((rows as any[])[0]));
  }),
);

/** DELETE /payment-methods/:id */
// BUG-029: migrado a asyncHandler (preserva 404/409 cuando aplica).
router.delete(
  "/payment-methods/:id",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await pool.query(
      `SELECT * FROM saas_payment_methods WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    const list = rows as any[];
    if (list.length === 0)
      return res.status(404).json({ error: "Método de pago no encontrado" });
    if (list[0].is_default)
      return res.status(409).json({
        error:
          "No podés eliminar el método default. Marcá otro como default primero.",
      });
    await pool.query(`DELETE FROM saas_payment_methods WHERE id = ?`, [
      req.params.id,
    ]);
    res.json({ ok: true });
  }),
);

/** PUT /payment-methods/:id/default */
// BUG-029: migrado a asyncHandler (preserva 404 cuando el método no existe).
router.put(
  "/payment-methods/:id/default",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await pool.query(
      `SELECT * FROM saas_payment_methods WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    if ((rows as any[]).length === 0)
      return res.status(404).json({ error: "Método de pago no encontrado" });
    await pool.query(
      `UPDATE saas_payment_methods SET is_default = 0 WHERE organization_id = ?`,
      [orgId],
    );
    await pool.query(
      `UPDATE saas_payment_methods SET is_default = 1 WHERE id = ?`,
      [req.params.id],
    );
    res.json({ ok: true });
  }),
);

// ─── INVOICES ──────────────────────────────────────────────────────────

/** GET /invoices */
// BUG-029: migrado a asyncHandler.
router.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await pool.query(
      `SELECT * FROM saas_invoices WHERE organization_id = ? ORDER BY issued_at DESC LIMIT 200`,
      [orgId],
    );
    res.json((rows as any[]).map(invoiceRowToJson));
  }),
);

/** GET /invoices/:id */
// BUG-029: migrado a asyncHandler (preserva 404 cuando no pertenece a la org).
router.get(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await pool.query(
      `SELECT * FROM saas_invoices WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    const list = rows as any[];
    if (list.length === 0)
      return res.status(404).json({ error: "Factura no encontrada" });
    res.json(invoiceRowToJson(list[0]));
  }),
);

/** POST /invoices/:id/pay — mock pay (en producción llama al PSP). */
// BUG-029: migrado a asyncHandler (preserva 404 + 409 si ya está pagada).
router.post(
  "/invoices/:id/pay",
  requireRole("canManageSaasBilling"),
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { paymentMethodId } = req.body as { paymentMethodId?: string };
    const [rows] = await pool.query(
      `SELECT * FROM saas_invoices WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    const list = rows as any[];
    if (list.length === 0)
      return res.status(404).json({ error: "Factura no encontrada" });
    if (list[0].status === "paid")
      return res.status(409).json({ error: "La factura ya está pagada" });
    // MOCK: simular delay y éxito
    await new Promise((r) => setTimeout(r, 300));
    await pool.query(
      `UPDATE saas_invoices SET status = 'paid', paid_at = NOW(), payment_method_id = COALESCE(?, payment_method_id) WHERE id = ?`,
      [paymentMethodId ?? null, req.params.id],
    );
    const [updated] = await pool.query(
      `SELECT * FROM saas_invoices WHERE id = ?`,
      [req.params.id],
    );
    res.json({ ok: true, invoice: invoiceRowToJson((updated as any[])[0]) });
  }),
);

// ─── INVITATIONS (saas_user_mgmt.md) ────────────────────────────────────
// IMPORTANTE: los 2 endpoints públicos (GET/POST /invitations/:token/...)
// van DESPUÉS del requireAuth del bloque "endpoints autenticados" pero
// los montamos con un truco: usamos el router.post/get ANTES del
// requireAuth que ya está aplicado arriba. Para eso, registramos un
// sub-router con su propio middleware.
// ──────────────────────────────────────────────────────────────────────────

// Helper: cuenta miembros reales + invitaciones pending no expiradas
// para chequear max_users del plan activo.
async function countActiveSeats(orgId: string): Promise<number> {
  const [profileRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS n FROM profiles WHERE organization_id = ?`,
    [orgId],
  );
  const [pendingRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS n FROM org_invitations
     WHERE organization_id = ?
       AND accepted_at IS NULL
       AND expires_at > NOW()`,
    [orgId],
  );
  return Number(profileRows[0].n) + Number(pendingRows[0].n);
}

// Helper: devuelve el max_users del plan activo, o 1 si la org no
// tiene subscription activa.
async function getMaxUsersForOrg(
  orgId: string,
): Promise<{ max: number; planName: string | null }> {
  const [rows] = await pool.query<any[]>(
    `SELECT p.max_users, p.name
     FROM saas_subscriptions s
     JOIN saas_plans p ON s.plan_id = p.id
     WHERE s.organization_id = ?
       AND s.status IN ('trialing', 'active', 'past_due')
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [orgId],
  );
  if (rows.length === 0) return { max: 1, planName: null };
  return { max: Number(rows[0].max_users), planName: rows[0].name };
}

// Helper: envía el email de invitación con nodemailer.
// NO BLOQUEANTE: si falla, devuelve { sent: false, error }.
// Spec: AC-9 + AC-10. El caller loguea el error pero la invitación
// sigue creada.
async function sendInvitationEmail(args: {
  to: string;
  inviterName: string;
  inviterEmail: string;
  organizationName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}): Promise<{ sent: boolean; error?: string }> {
  try {
    const mod = await import("nodemailer");
    const nodemailer: any = (mod as any).default ?? mod;
    // Email from: el "from" por default (igual que Fase 7).
    // Si tenés un buzón específico para invitaciones, configurá
    // SMTP_FROM_INVITATIONS en el server. Si no, usa el genérico.
    const fromAddress =
      process.env.SMTP_FROM_INVITATIONS ||
      process.env.SMTP_FROM ||
      `InmoControl <no-reply@inmocontrol.tecnowebsupportia.com>`;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    });
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1f2937;">Te invitaron a ${args.organizationName}</h2>
        <p><strong>${args.inviterName}</strong> (${args.inviterEmail}) te invitó a
          unirte a <strong>${args.organizationName}</strong> en InmoControl como
          <strong>${args.role}</strong>.</p>
        <p>Para aceptar la invitación, hacé click en el siguiente link:</p>
        <p style="margin: 24px 0;">
          <a href="${args.acceptUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Aceptar invitación
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          O copiá y pegá este link en tu navegador:<br>
          <code>${args.acceptUrl}</code>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          Esta invitación expira el ${args.expiresAt.toISOString().slice(0, 10)}.
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          InmoControl · Sistema de gestión inmobiliaria
        </p>
      </div>
    `;
    const text = `${args.inviterName} (${args.inviterEmail}) te invitó a unirte a ${args.organizationName} en InmoControl como ${args.role}.\n\nAceptá la invitación acá:\n${args.acceptUrl}\n\nEsta invitación expira el ${args.expiresAt.toISOString().slice(0, 10)}.`;
    await transport.sendMail({
      from: fromAddress,
      to: args.to,
      subject: `${args.inviterName} te invitó a ${args.organizationName} en InmoControl`,
      html,
      text,
      replyTo: args.inviterEmail,
    });
    return { sent: true };
  } catch (e: any) {
    console.error("[invitations] email send failed:", e?.message ?? e);
    return { sent: false, error: e?.message ?? String(e) };
  }
}

// ─── ENDPOINTS PÚBLICOS (sin requireAuth) ──────────────────────────────
// IMPORTANTE: estos 2 endpoints son los únicos que pueden llamarse sin
// sesión. Van ANTES del bloque autenticado porque necesitan ser públicos.

// GET /api/saas-billing/invitations/:token
// Spec: AC-1. Devuelve metadata de la invitación. 404 si no existe
// / expirada / ya aceptada.
router.get(
  "/invitations/:token",
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      return res.status(404).json({
        error: "Invitación no encontrada",
        code: "INVITATION_NOT_FOUND",
      });
    }
    const [rows] = await pool.query<any[]>(
      `SELECT i.email, i.role, i.expires_at, i.accepted_at, o.name AS org_name
       FROM org_invitations i
       JOIN organizations o ON i.organization_id = o.id
       WHERE i.token = ?
       LIMIT 1`,
      [token],
    );
    if (rows.length === 0) {
      return res.status(404).json({
        error: "Invitación no encontrada",
        code: "INVITATION_NOT_FOUND",
      });
    }
    const r = rows[0];
    // Distinguir entre no encontrada / expirada / ya aceptada.
    if (r.accepted_at) {
      return res.status(404).json({
        error: "Esta invitación ya fue aceptada",
        code: "INVITATION_ALREADY_ACCEPTED",
      });
    }
    if (new Date(r.expires_at) <= new Date()) {
      return res
        .status(404)
        .json({ error: "Esta invitación expiró", code: "INVITATION_EXPIRED" });
    }
    return res.json({
      email: r.email,
      organizationName: r.org_name,
      role: r.role,
      expiresAt: new Date(r.expires_at).toISOString(),
      acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
    });
  }),
);

// POST /api/saas-billing/invitations/:token/accept
// Spec: AC-2. Crea el profile + setea cookie. Si ya hay sesión de
// OTRA org, rechaza con 409 (EC-15).
router.post(
  "/invitations/:token/accept",
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password, displayName } = (req.body ?? {}) as {
      password?: string;
      displayName?: string;
    };

    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      return res.status(404).json({
        error: "Invitación no encontrada",
        code: "INVITATION_NOT_FOUND",
      });
    }
    if (!password) {
      return res.status(400).json({
        error: "Falta el campo password",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return res.status(400).json({
        error:
          "La contraseña debe tener al menos 8 caracteres, 1 letra y 1 número.",
        code: "WEAK_PASSWORD",
      });
    }

    // EC-15: si hay sesión activa de OTRA org, rechazar.
    const existingSessionId = req.cookies?.["inmocontrol_pilot_session"];
    if (existingSessionId && SESSIONS.has(existingSessionId)) {
      const existing = SESSIONS.get(existingSessionId);
      // Buscar la invitación primero para saber a qué org quiere ir.
      const [peekRows] = await pool.query<any[]>(
        `SELECT organization_id FROM org_invitations WHERE token = ? LIMIT 1`,
        [token],
      );
      if (
        peekRows.length > 0 &&
        existing &&
        existing.organizationId !== peekRows[0].organization_id
      ) {
        return res.status(409).json({
          error:
            "Ya tenés una sesión activa de otra organización. Cerrá sesión primero.",
          code: "ALREADY_AUTHENTICATED_OTHER_ORG",
        });
      }
    }

    // Load invitation (con lock para evitar race condition de doble-accept).
    const conn = await pool.getConnection();
    let invitation: any;
    let orgId: string;
    let invitedRole: string;
    let invitedEmail: string;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<any[]>(
        `SELECT id, organization_id, email, role, expires_at, accepted_at
         FROM org_invitations WHERE token = ? FOR UPDATE`,
        [token],
      );
      if (rows.length === 0) {
        await conn.rollback();
        return res.status(404).json({
          error: "Invitación no encontrada",
          code: "INVITATION_NOT_FOUND",
        });
      }
      invitation = rows[0];
      if (invitation.accepted_at) {
        await conn.rollback();
        return res.status(404).json({
          error: "Esta invitación ya fue aceptada",
          code: "INVITATION_ALREADY_ACCEPTED",
        });
      }
      if (new Date(invitation.expires_at) <= new Date()) {
        await conn.rollback();
        return res.status(404).json({
          error: "Esta invitación expiró",
          code: "INVITATION_EXPIRED",
        });
      }
      orgId = invitation.organization_id;
      invitedRole = invitation.role;
      invitedEmail = invitation.email;

      // Crear profile.
      const profileId = (globalThis as any).crypto.randomUUID();
      const finalDisplayName =
        (displayName && displayName.trim()) || invitedEmail.split("@")[0];
      const passwordHash = await bcrypt.hash(password, 10);
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
          invitedEmail,
        ],
      );
      // Marcar invitación como aceptada.
      await conn.query(
        `UPDATE org_invitations SET accepted_at = NOW() WHERE id = ?`,
        [invitation.id],
      );
      await conn.commit();
    } catch (e: any) {
      await conn.rollback();
      console.error("[invitations] accept failed:", e);
      if (e?.code === "ER_DUP_ENTRY") {
        // fix-issue-27: throw conflict (no return res).
        throw conflict(
          "Ya existe un miembro con ese email en esta organización.",
          "EMAIL_ALREADY_MEMBER",
        );
      }
      // fix-issue-27: throw internalExpose con mensaje custom.
      throw internalExpose(
        "Error al aceptar la invitación",
        "DB_UNAVAILABLE",
      );
    } finally {
      conn.release();
    }

    // Setear sesión automáticamente.
    const sessionId = (globalThis as any).crypto.randomUUID();
    SESSIONS.set(sessionId, {
      profileId: (await (async () => {
        const [pr] = await pool.query<any[]>(
          `SELECT id FROM profiles WHERE email = ? AND organization_id = ?`,
          [invitedEmail, orgId],
        );
        return pr[0]?.id;
      })()) as string,
      organizationId: orgId,
      email: invitedEmail,
      displayName:
        (displayName && displayName.trim()) || invitedEmail.split("@")[0],
      role: invitedRole,
      createdAt: Date.now(),
    });
    setSessionCookie(res, sessionId);

    return res.status(200).json({
      user: {
        id: SESSIONS.get(sessionId)!.profileId,
        email: invitedEmail,
        displayName:
          (displayName && displayName.trim()) || invitedEmail.split("@")[0],
        role: invitedRole,
        organizationId: orgId,
      },
      organization: {
        id: orgId,
        name: await (async () => {
          const [or] = await pool.query<any[]>(
            `SELECT name FROM organizations WHERE id = ?`,
            [orgId],
          );
          return or[0]?.name ?? "";
        })(),
      },
    });
  }),
);

// ─── ENDPOINTS AUTENTICADOS (requireAuth + canManageOrgUsers) ──────────
// Estos endpoints requieren que el user esté logueado Y tenga la acción
// canManageOrgUsers en su rol (en v1: solo admin).
// A partir de acá, todas las rutas de /invitations y /members requieren auth.

const requireCanManageOrgUsers = requireRole("canManageOrgUsers");

// POST /api/saas-billing/invitations
// Spec: AC-3. Crea una invitación + envía email.
router.post(
  "/invitations",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    // requireAuth setea req.user, lo usamos para el profile.
    const me = (req as any).user as {
      id: string;
      email: string;
      displayName: string;
    };

    const { email: rawEmail, role: rawRole } = (req.body ?? {}) as {
      email?: string;
      role?: string;
    };
    if (!rawEmail || !rawRole) {
      return res.status(400).json({
        error: "Faltan campos requeridos: email, role",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }
    const email = rawEmail.toLowerCase().trim();
    const role = rawRole;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "El email no tiene formato válido",
        code: "INVALID_EMAIL",
      });
    }
    if (!["gestor", "propietario", "inquilino"].includes(role)) {
      return res.status(400).json({
        error: `Rol inválido: ${role}. Roles permitidos: gestor, propietario, inquilino.`,
        code: "INVALID_ROLE",
      });
    }

    // EC-3: email ya es miembro de esta org.
    const [existing] = await pool.query<any[]>(
      `SELECT id FROM profiles WHERE email = ? AND organization_id = ? LIMIT 1`,
      [email, orgId],
    );
    if (existing.length > 0) {
      return res.status(409).json({
        error: `${email} ya es miembro de esta organización.`,
        code: "EMAIL_ALREADY_MEMBER",
      });
    }

    // AC-11/12: chequeo de quota.
    const seats = await countActiveSeats(orgId);
    const { max, planName } = await getMaxUsersForOrg(orgId);
    if (seats >= max) {
      return res.status(402).json({
        error: `Llegaste al límite de ${max} usuario(s) de tu plan ${planName ?? "actual"}. Actualizá tu plan para invitar más.`,
        code: "PLAN_LIMIT_REACHED",
      });
    }

    // Generar token + insertar invitación.
    const id = (globalThis as any).crypto.randomUUID();
    const token = (globalThis as any).crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO org_invitations
        (id, organization_id, email, role, token, invited_by, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, orgId, email, role, token, me.id, expiresAt, me.email],
    );

    // Construir acceptUrl.
    const publicUrl = process.env.PUBLIC_URL || `http://localhost:3000`;
    const acceptUrl = `${publicUrl}/accept-invitation?token=${token}`;

    // Enviar email (no bloqueante).
    const mailResult = await sendInvitationEmail({
      to: email,
      inviterName: me.displayName,
      inviterEmail: me.email,
      organizationName: "(tu organización)",
      role,
      acceptUrl,
      expiresAt,
    });

    const response: any = {
      id,
      email,
      role,
      token,
      acceptUrl,
      expiresAt: expiresAt.toISOString(),
    };
    if (!mailResult.sent) {
      response.warning = "EMAIL_FAILED";
    }
    return res.status(201).json(response);
  }),
);

// GET /api/saas-billing/invitations
// Spec: AC-4. Lista invitaciones de la org con status calculado.
router.get(
  "/invitations",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await pool.query<any[]>(
      `SELECT id, email, role, created_at, expires_at, accepted_at
       FROM org_invitations WHERE organization_id = ?
       ORDER BY created_at DESC LIMIT 500`,
      [orgId],
    );
    const now = new Date();
    const invitations = (rows as any[]).map((r) => {
      let status: "pending" | "accepted" | "expired";
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
        acceptedAt: r.accepted_at
          ? new Date(r.accepted_at).toISOString()
          : null,
      };
    });
    return res.json({ invitations });
  }),
);

// DELETE /api/saas-billing/invitations/:id
// Spec: AC-5. Solo se pueden borrar pending o expired.
router.delete(
  "/invitations/:id",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { id } = req.params;
    const [rows] = await pool.query<any[]>(
      `SELECT id, accepted_at FROM org_invitations WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, orgId],
    );
    if (rows.length === 0) {
      return res.status(404).json({
        error: "Invitación no encontrada",
        code: "INVITATION_NOT_FOUND",
      });
    }
    if (rows[0].accepted_at) {
      return res.status(409).json({
        error: "No se puede borrar una invitación ya aceptada",
        code: "CANNOT_DELETE_ACCEPTED_INVITATION",
      });
    }
    await pool.query(`DELETE FROM org_invitations WHERE id = ?`, [id]);
    return res.status(204).send();
  }),
);

// POST /api/saas-billing/invitations/:id/resend
// Spec: EC-17. Regenera token + extiende expiración + reenvía mail.
router.post(
  "/invitations/:id/resend",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { id } = req.params;
    const [rows] = await pool.query<any[]>(
      `SELECT i.id, i.email, i.role, i.accepted_at, i.expires_at, o.name AS org_name
       FROM org_invitations i
       JOIN organizations o ON i.organization_id = o.id
       WHERE i.id = ? AND i.organization_id = ? LIMIT 1`,
      [id, orgId],
    );
    if (rows.length === 0) {
      return res.status(404).json({
        error: "Invitación no encontrada",
        code: "INVITATION_NOT_FOUND",
      });
    }
    if (rows[0].accepted_at) {
      return res.status(409).json({
        error: "La invitación ya fue aceptada",
        code: "INVITATION_ALREADY_ACCEPTED",
      });
    }
    const newToken = (globalThis as any).crypto.randomBytes(32).toString("hex");
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE org_invitations SET token = ?, expires_at = ? WHERE id = ?`,
      [newToken, newExpires, id],
    );
    const publicUrl = process.env.PUBLIC_URL || `http://localhost:3000`;
    const acceptUrl = `${publicUrl}/accept-invitation?token=${newToken}`;
    const me = (req as any).user as {
      id: string;
      email: string;
      displayName: string;
    };
    const mailResult = await sendInvitationEmail({
      to: rows[0].email,
      inviterName: me.displayName,
      inviterEmail: me.email,
      organizationName: rows[0].org_name,
      role: rows[0].role,
      acceptUrl,
      expiresAt: newExpires,
    });
    const response: any = { acceptUrl, expiresAt: newExpires.toISOString() };
    if (!mailResult.sent) response.warning = "EMAIL_FAILED";
    return res.json(response);
  }),
);

// GET /api/saas-billing/members
// Spec: AC-6. Lista profiles de la org con isOrgOwner.
router.get(
  "/members",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const [rows] = await pool.query<any[]>(
      `SELECT p.id, p.email, p.display_name, p.role, p.created_at, o.created_by AS org_created_by
       FROM profiles p
       JOIN organizations o ON p.organization_id = o.id
       WHERE p.organization_id = ?
       ORDER BY p.created_at ASC`,
      [orgId],
    );
    const members = (rows as any[]).map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      createdAt: new Date(r.created_at).toISOString(),
      isOrgOwner: r.role === "admin" && r.email === r.org_created_by,
    }));
    return res.json({ members });
  }),
);

// PATCH /api/saas-billing/members/:id
// Spec: AC-7. Cambia el rol de un member. No permite cambiar al admin
// original (dejaría a la org sin owner).
router.patch(
  "/members/:id",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { id } = req.params;
    const { role } = (req.body ?? {}) as { role?: string };
    if (!role || !["gestor", "propietario", "inquilino"].includes(role)) {
      return res
        .status(400)
        .json({ error: `Rol inválido: ${role}.`, code: "INVALID_ROLE" });
    }
    // Load target profile + check que pertenece a la org.
    const [rows] = await pool.query<any[]>(
      `SELECT p.id, p.role, p.email, o.created_by AS org_created_by
       FROM profiles p
       JOIN organizations o ON p.organization_id = o.id
       WHERE p.id = ? AND p.organization_id = ? LIMIT 1`,
      [id, orgId],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Member no encontrado", code: "MEMBER_NOT_FOUND" });
    }
    const target = rows[0];
    if (target.role === "admin" && target.email === target.org_created_by) {
      return res.status(409).json({
        error: "No podés cambiar el rol del dueño de la organización.",
        code: "CANNOT_REMOVE_ORG_OWNER",
      });
    }
    await pool.query(`UPDATE profiles SET role = ? WHERE id = ?`, [role, id]);
    return res.json({
      id,
      email: target.email,
      role,
      updatedAt: new Date().toISOString(),
    });
  }),
);

// DELETE /api/saas-billing/members/:id
// Spec: AC-8 + AC-9 del spec. No permite borrar al admin original.
router.delete(
  "/members/:id",
  requireCanManageOrgUsers,
  asyncHandler(async (req, res) => {
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const { id } = req.params;
    const [rows] = await pool.query<any[]>(
      `SELECT p.id, p.role, p.email, o.created_by AS org_created_by
       FROM profiles p
       JOIN organizations o ON p.organization_id = o.id
       WHERE p.id = ? AND p.organization_id = ? LIMIT 1`,
      [id, orgId],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Member no encontrado", code: "MEMBER_NOT_FOUND" });
    }
    const target = rows[0];
    if (target.role === "admin" && target.email === target.org_created_by) {
      return res.status(409).json({
        error: "No podés eliminar al dueño de la organización.",
        code: "CANNOT_REMOVE_ORG_OWNER",
      });
    }
    await pool.query(`DELETE FROM profiles WHERE id = ?`, [id]);
    return res.status(204).send();
  }),
);

export default router;
