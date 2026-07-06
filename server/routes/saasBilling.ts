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
 * Multi-tenant: por ahora single-org (`ensureDefaultOrg()`). En producción
 * derivar del usuario autenticado (ver AGENTS.md Fase 3 Auth diferida).
 */

import { Router } from 'express';
import pool, { ensureDefaultOrg } from '../db.js';

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────

const IVA_RATE = 0.19; // Colombia standard 19%

function genId(): string {
  return (globalThis as any).crypto.randomUUID();
}

function planRowToJson(r: any) {
  let features: string[] = [];
  try {
    features = r.features_json ? (typeof r.features_json === 'string' ? JSON.parse(r.features_json) : r.features_json) : [];
  } catch { features = []; }
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
    details = r.details_json ? (typeof r.details_json === 'string' ? JSON.parse(r.details_json) : r.details_json) : null;
  } catch { details = null; }
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
    planSnapshot = r.plan_snapshot_json ? (typeof r.plan_snapshot_json === 'string' ? JSON.parse(r.plan_snapshot_json) : r.plan_snapshot_json) : null;
  } catch { planSnapshot = null; }
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
    [`INV-${year}-%`]
  );
  const n = Number((rows as any[])[0]?.n ?? 0) + 1;
  return `INV-${year}-${String(n).padStart(4, '0')}`;
}

// ─── PLANS ─────────────────────────────────────────────────────────────

/** GET /plans — lista planes activos ordenados por sort_order. */
router.get('/plans', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM saas_plans WHERE is_active = 1 ORDER BY sort_order ASC`
    );
    res.json((rows as any[]).map(planRowToJson));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** GET /plans/all — incluye inactivos (admin). */
router.get('/plans/all', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM saas_plans ORDER BY sort_order ASC`
    );
    res.json((rows as any[]).map(planRowToJson));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** GET /plans/:id */
router.get('/plans/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM saas_plans WHERE id = ?`, [req.params.id]);
    const list = rows as any[];
    if (list.length === 0) return res.status(404).json({ error: 'Plan no encontrado' });
    res.json(planRowToJson(list[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** POST /plans — crear plan (admin). */
router.post('/plans', async (req, res) => {
  const p = req.body as {
    slug: string; name: string; description?: string;
    priceCop: number; maxProperties: number; maxUsers: number; maxAlertsPerMonth: number;
    features?: string[]; sortOrder?: number;
  };
  if (!p.slug || !p.name) return res.status(400).json({ error: 'Faltan slug o name' });
  const id = genId();
  try {
    await pool.query(
      `INSERT INTO saas_plans
         (id, slug, name, description, price_cop, max_properties, max_users, max_alerts_per_month, features_json, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id, p.slug, p.name, p.description ?? null,
        Number(p.priceCop), Number(p.maxProperties), Number(p.maxUsers), Number(p.maxAlertsPerMonth),
        JSON.stringify(p.features ?? []),
        Number(p.sortOrder ?? 100),
      ]
    );
    const [rows] = await pool.query(`SELECT * FROM saas_plans WHERE id = ?`, [id]);
    res.status(201).json(planRowToJson((rows as any[])[0]));
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: `Ya existe un plan con slug "${p.slug}"` });
    res.status(500).json({ error: err?.message });
  }
});

/** PUT /plans/:id — editar plan (admin). */
router.put('/plans/:id', async (req, res) => {
  const p = req.body as Partial<{
    name: string; description: string | null; priceCop: number;
    maxProperties: number; maxUsers: number; maxAlertsPerMonth: number;
    features: string[]; sortOrder: number; isActive: boolean;
  }>;
  try {
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
        p.description ?? undefined,  // null permite limpiar
        p.priceCop ?? null,
        p.maxProperties ?? null,
        p.maxUsers ?? null,
        p.maxAlertsPerMonth ?? null,
        p.features ? JSON.stringify(p.features) : null,
        p.sortOrder ?? null,
        p.isActive == null ? null : (p.isActive ? 1 : 0),
        req.params.id,
      ]
    );
    const [rows] = await pool.query(`SELECT * FROM saas_plans WHERE id = ?`, [req.params.id]);
    const list = rows as any[];
    if (list.length === 0) return res.status(404).json({ error: 'Plan no encontrado' });
    res.json(planRowToJson(list[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** DELETE /plans/:id — desactivar (soft delete — no borramos por FK con subscriptions). */
router.delete('/plans/:id', async (req, res) => {
  try {
    // Si hay suscripciones activas referenciando este plan, no dejamos borrarlo duro.
    const [subs] = await pool.query(
      `SELECT COUNT(*) AS n FROM saas_subscriptions WHERE plan_id = ? AND status IN ('active','trialing','past_due')`,
      [req.params.id]
    );
    const activeCount = Number((subs as any[])[0]?.n ?? 0);
    if (activeCount > 0) {
      // Soft delete: desactivar
      await pool.query(`UPDATE saas_plans SET is_active = 0 WHERE id = ?`, [req.params.id]);
      return res.json({ ok: true, deactivated: true, activeSubscriptions: activeCount });
    }
    await pool.query(`DELETE FROM saas_plans WHERE id = ?`, [req.params.id]);
    res.json({ ok: true, deactivated: false });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── SUBSCRIPTION ──────────────────────────────────────────────────────

/** GET /subscription — subscripción actual de la org (o null si no hay). */
router.get('/subscription', async (_req, res) => {
  try {
    const orgId = await ensureDefaultOrg();
    const [rows] = await pool.query(
      `SELECT * FROM saas_subscriptions WHERE organization_id = ?`,
      [orgId]
    );
    const list = rows as any[];
    if (list.length === 0) return res.json(null);
    res.json(subscriptionRowToJson(list[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** POST /subscription — subscribe o cambia de plan. Mock pay: emite invoice y la marca como pagada. */
router.post('/subscription', async (req, res) => {
  const { planId, paymentMethodId } = req.body as { planId: string; paymentMethodId?: string };
  if (!planId) return res.status(400).json({ error: 'Falta planId' });
  const orgId = await ensureDefaultOrg();
  try {
    // Validar plan
    const [planRows] = await pool.query(`SELECT * FROM saas_plans WHERE id = ? AND is_active = 1`, [planId]);
    const planList = planRows as any[];
    if (planList.length === 0) return res.status(404).json({ error: 'Plan no encontrado o inactivo' });
    const plan = planRowToJson(planList[0]);

    // ¿Existe ya subscripción?
    const [existing] = await pool.query(
      `SELECT * FROM saas_subscriptions WHERE organization_id = ?`,
      [orgId]
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
        [planId, periodStartStr, periodEndStr, subscriptionId]
      );
    } else {
      subscriptionId = genId();
      await pool.query(
        `INSERT INTO saas_subscriptions
           (id, organization_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
         VALUES (?, ?, ?, 'active', ?, ?, 0)`,
        [subscriptionId, orgId, planId, periodStartStr, periodEndStr]
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
        invoiceId, orgId, subscriptionId, paymentMethodId ?? null,
        invNumber, periodStartStr, periodEndStr,
        subtotal, iva, total,
        JSON.stringify(plan),
      ]
    );

    const [subRows] = await pool.query(`SELECT * FROM saas_subscriptions WHERE id = ?`, [subscriptionId]);
    res.status(201).json({
      subscription: subscriptionRowToJson((subRows as any[])[0]),
      plan,
      invoiceId,
      invoiceNumber: invNumber,
    });
  } catch (err: any) {
    console.error('[subscription POST]', err);
    res.status(500).json({ error: err?.message });
  }
});

/** DELETE /subscription — cancelar al final del periodo actual (no inmediato). */
router.delete('/subscription', async (_req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [result] = await pool.query(
      `UPDATE saas_subscriptions SET
         cancel_at_period_end = 1,
         canceled_at = NULL,
         updated_at = NOW()
       WHERE organization_id = ? AND status IN ('active','trialing','past_due')`,
      [orgId]
    );
    const affected = (result as any).affectedRows;
    if (affected === 0) return res.status(404).json({ error: 'No hay subscripción activa para cancelar' });
    res.json({ ok: true, message: 'Subscripción se cancelará al final del periodo actual.' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** POST /subscription/reactivate — quitar cancel_at_period_end antes del fin del periodo. */
router.post('/subscription/reactivate', async (_req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [result] = await pool.query(
      `UPDATE saas_subscriptions SET cancel_at_period_end = 0, updated_at = NOW()
       WHERE organization_id = ? AND status = 'active'`,
      [orgId]
    );
    if ((result as any).affectedRows === 0) return res.status(404).json({ error: 'No hay subscripción activa para reactivar' });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── PAYMENT METHODS ───────────────────────────────────────────────────

/** GET /payment-methods */
router.get('/payment-methods', async (_req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM saas_payment_methods WHERE organization_id = ? ORDER BY is_default DESC, created_at DESC`,
      [orgId]
    );
    res.json((rows as any[]).map(pmRowToJson));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/**
 * POST /payment-methods — agregar método.
 * MOCK: solo guardamos metadata visible (brand, last4, expiry). El PAN real
 * nunca toca nuestro backend. Cuando se enchufe un PSP, este endpoint recibe
 * un token opaco del frontend (generado por el JS del PSP).
 */
router.post('/payment-methods', async (req, res) => {
  const pm = req.body as {
    type: 'card' | 'pse' | 'nequi' | 'bancolombia';
    brand?: string; last4?: string; expiryMonth?: number; expiryYear?: number;
    holderName?: string; details?: any; makeDefault?: boolean;
  };
  if (!pm.type) return res.status(400).json({ error: 'Falta type' });
  if (pm.type === 'card' && (!pm.brand || !pm.last4 || !pm.expiryMonth || !pm.expiryYear)) {
    return res.status(400).json({ error: 'Para tarjeta se requiere brand, last4, expiryMonth y expiryYear' });
  }
  const orgId = await ensureDefaultOrg();
  const id = genId();
  try {
    // Si es default, desmarcar los demás primero
    if (pm.makeDefault) {
      await pool.query(`UPDATE saas_payment_methods SET is_default = 0 WHERE organization_id = ?`, [orgId]);
    }
    // Si es el primer método, hacerlo default automáticamente
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS n FROM saas_payment_methods WHERE organization_id = ?`,
      [orgId]
    );
    const isFirst = Number((countRows as any[])[0]?.n ?? 0) === 0;
    const isDefault = !!(pm.makeDefault ?? isFirst);

    await pool.query(
      `INSERT INTO saas_payment_methods
         (id, organization_id, type, brand, last4, expiry_month, expiry_year, holder_name, details_json, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, orgId, pm.type,
        pm.brand ?? null, pm.last4 ?? null,
        pm.expiryMonth ?? null, pm.expiryYear ?? null,
        pm.holderName ?? null,
        pm.details ? JSON.stringify(pm.details) : null,
        isDefault ? 1 : 0,
      ]
    );
    const [rows] = await pool.query(`SELECT * FROM saas_payment_methods WHERE id = ?`, [id]);
    res.status(201).json(pmRowToJson((rows as any[])[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** DELETE /payment-methods/:id */
router.delete('/payment-methods/:id', async (req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM saas_payment_methods WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    const list = rows as any[];
    if (list.length === 0) return res.status(404).json({ error: 'Método de pago no encontrado' });
    if (list[0].is_default) return res.status(409).json({ error: 'No podés eliminar el método default. Marcá otro como default primero.' });
    await pool.query(`DELETE FROM saas_payment_methods WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** PUT /payment-methods/:id/default */
router.put('/payment-methods/:id/default', async (req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM saas_payment_methods WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    if ((rows as any[]).length === 0) return res.status(404).json({ error: 'Método de pago no encontrado' });
    await pool.query(`UPDATE saas_payment_methods SET is_default = 0 WHERE organization_id = ?`, [orgId]);
    await pool.query(`UPDATE saas_payment_methods SET is_default = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── INVOICES ──────────────────────────────────────────────────────────

/** GET /invoices */
router.get('/invoices', async (_req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM saas_invoices WHERE organization_id = ? ORDER BY issued_at DESC LIMIT 200`,
      [orgId]
    );
    res.json((rows as any[]).map(invoiceRowToJson));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** GET /invoices/:id */
router.get('/invoices/:id', async (req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM saas_invoices WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    const list = rows as any[];
    if (list.length === 0) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json(invoiceRowToJson(list[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** POST /invoices/:id/pay — mock pay (en producción llama al PSP). */
router.post('/invoices/:id/pay', async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const { paymentMethodId } = req.body as { paymentMethodId?: string };
  try {
    const [rows] = await pool.query(
      `SELECT * FROM saas_invoices WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId]
    );
    const list = rows as any[];
    if (list.length === 0) return res.status(404).json({ error: 'Factura no encontrada' });
    if (list[0].status === 'paid') return res.status(409).json({ error: 'La factura ya está pagada' });
    // MOCK: simular delay y éxito
    await new Promise((r) => setTimeout(r, 300));
    await pool.query(
      `UPDATE saas_invoices SET status = 'paid', paid_at = NOW(), payment_method_id = COALESCE(?, payment_method_id) WHERE id = ?`,
      [paymentMethodId ?? null, req.params.id]
    );
    const [updated] = await pool.query(`SELECT * FROM saas_invoices WHERE id = ?`, [req.params.id]);
    res.json({ ok: true, invoice: invoiceRowToJson((updated as any[])[0]) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
