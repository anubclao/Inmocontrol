/**
 * InmoControl — Endpoints de Billing
 * ============================================================================
 * Implementa los 16 endpoints que src/features/billing/api.ts consume.
 * Reutiliza las funciones puras de cálculo del cliente (single source of truth).
 *
 * Endpoints:
 *   GET    /api/billing/policies/:propertyId
 *   PUT    /api/billing/policies/:propertyId       (upsert)
 *   POST   /api/billing/amortization/generate       body: { contract, policy }
 *   GET    /api/billing/amortization/:contractId
 *   POST   /api/billing/payments                    body: { contractId, rowId, paidOnDayOfMonth }
 *   POST   /api/billing/discounts                   (LEGACY — usar /charges)
 *   GET    /api/billing/discounts?propertyId=       (LEGACY — usa /charges por debajo)
 *   POST   /api/billing/charges                     (modelo unificado de novedades)
 *   GET    /api/billing/charges?propertyId=&period=
 *   DELETE /api/billing/charges/:id
 *   GET    /api/billing/charges/invoice-summary?propertyId=&period=
 *   POST   /api/billing/increases
 *   GET    /api/billing/increases?propertyId=
 *   GET    /api/billing/account-statement?propertyId=&period=
 *   GET    /api/billing/owner-statement?propertyId=&period=
 *   POST   /api/billing/invoices/generate           body: { propertyId, contractId, period }
 *   POST   /api/billing/invoices/send               body: { propertyId, contractId, period }
 *   GET    /api/billing/invoices?propertyId=
 *   GET    /api/billing/invoices/lookup?contractId=&period=
 *   POST   /api/billing/owner-payouts
 *   GET    /api/billing/owner-payouts?propertyId=&period=
 *   DELETE /api/billing/owner-payouts/:id
 *   POST   /api/billing/actions
 *   GET    /api/billing/actions?propertyId=
 */

import { Router } from "express";
import crypto from "crypto";
import pool, { ensureDefaultOrg } from "../db.js";
// Reutilizamos los cálculos del cliente. tsx resuelve TS, no hay problema.
import {
  generateAmortization,
  applyPaymentToRow,
  calculateAccountStatement,
  generateInvoiceFromRow,
  calculateLateFee,
} from "../../src/features/billing/calculations.js";
import {
  calculateMonthlySettlement,
  type SettlementInputs,
} from "../../src/utils/calculations.js";
import type {
  Contract,
  BillingPolicy,
  RentInvoice,
  OwnerPayout,
  OwnerStatement,
} from "../../src/features/billing/types.js";

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────

async function loadPolicy(
  orgId: string,
  propertyId: string,
): Promise<BillingPolicy | null> {
  const [rows] = await pool.query(
    `SELECT * FROM billing_policies WHERE property_id = ? AND organization_id = ?`,
    [propertyId, orgId],
  );
  const list = rows as any[];
  if (list.length === 0) return null;

  const r = list[0];
  const bankAccounts = await loadBankAccounts(orgId, propertyId);
  const policy = r.policy_id
    ? await loadInsurancePolicy(orgId, propertyId)
    : null;

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
    primaryBankAccountId: r.primary_bank_account_id ?? undefined,
    bankAccounts,
    policy: policy ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  };
}

async function loadBankAccounts(orgId: string, propertyId: string) {
  const [rows] = await pool.query(
    `SELECT * FROM bank_accounts WHERE organization_id = ? AND (property_id = ? OR property_id IS NULL) ORDER BY is_primary DESC, created_at ASC`,
    [orgId, propertyId],
  );
  return (rows as any[]).map((r) => ({
    id: r.id,
    bank: r.bank,
    accountType: r.account_type,
    accountNumber: r.account_number,
    holderName: r.holder_name,
    holderIdNumber: r.holder_id_number,
    isPrimary: !!r.is_primary,
    notes: r.notes ?? undefined,
  }));
}

async function loadInsurancePolicy(orgId: string, propertyId: string) {
  const [rows] = await pool.query(
    `SELECT * FROM policies WHERE organization_id = ? AND property_id = ? ORDER BY approved_at DESC LIMIT 1`,
    [orgId, propertyId],
  );
  const list = rows as any[];
  if (list.length === 0) return null;
  const r = list[0];
  return {
    insurer: r.insurer,
    policyNumber: r.policy_number,
    startDate: r.start_date,
    endDate: r.end_date,
    premiumAmount: Number(r.premium_amount),
    approvalPdfDataUrl: r.approval_pdf_url ?? undefined,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
    notes: r.notes ?? undefined,
  };
}

function rowToAmortization(r: any) {
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
    paidAt: r.paid_at ?? undefined,
    paidAmount: r.paid_amount != null ? Number(r.paid_amount) : undefined,
  };
}

// ─── BillingPolicy ─────────────────────────────────────────────────────

router.get("/policies/:propertyId", async (req, res) => {
  try {
    const orgId = await ensureDefaultOrg();
    const policy = await loadPolicy(orgId, req.params.propertyId);
    if (!policy) return res.status(404).json({ error: "not found" });
    res.json(policy);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.put("/policies/:propertyId", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const propertyId = req.params.propertyId;
  const p: BillingPolicy = req.body;
  try {
    // FIX Karpathy (jul-2026): bug histórico. La columna `policy_id` NO
    // existe en el schema de `billing_policies` (ver
    // db/mysql/schema-hostinger.sql líneas 370-385). Incluirla en el INSERT
    // causaba `Error: Unknown column 'policy_id' in 'field list'`, lo
    // cual hacía que el server devolviera 500 en TODA llamada a
    // PUT /api/billing/policies/:id. Resultado: el cliente mostraba
    // "✓ Billing configurado" porque `getOrGenerateAmortization` veía
    // filas de una corrida anterior y el `tryBackendOrFallback` cacheaba
    // localmente — toast mentiroso. La policy NUNCA se persistía en
    // MySQL hasta que el server empezó a responder 200.
    await pool.query(
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
        p.createdBy ?? "agent",
      ],
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Amortización ───────────────────────────────────────────────────────

router.post("/amortization/generate", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const { contract, policy } = req.body as {
    contract: Contract;
    policy: BillingPolicy;
  };
  if (!contract?.id || !policy?.propertyId) {
    return res.status(400).json({ error: "contract y policy son requeridos" });
  }

  try {
    const [incRows] = await pool.query(
      `SELECT * FROM rent_increases WHERE contract_id = ? ORDER BY effective_from ASC`,
      [contract.id],
    );
    const increases = (incRows as any[]).map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      contractId: r.contract_id,
      type: r.type,
      description: r.description,
      amount: Number(r.amount),
      effectiveFrom: r.effective_from,
      recordedAt: r.recorded_at,
      recordedBy: r.recorded_by,
    }));

    const rows = generateAmortization(contract, policy, { increases });

    // Persistir (INSERT ... ON DUPLICATE KEY UPDATE para idempotencia)
    for (const row of rows) {
      await pool.query(
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
           total_late   = VALUES(total_late),
           status       = VALUES(status)`,
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
          row.status,
        ],
      );
    }
    res.json(rows);
  } catch (err: any) {
    console.error("[amortization/generate]", err);
    res.status(500).json({ error: err?.message });
  }
});

router.get("/amortization/:contractId", async (req, res) => {
  try {
    const orgId = await ensureDefaultOrg();
    const [rows] = await pool.query(
      `SELECT * FROM amortization_rows
       WHERE contract_id = ? AND organization_id = ?
       ORDER BY month_number ASC`,
      [req.params.contractId, orgId],
    );
    res.json((rows as any[]).map(rowToAmortization));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── GET /api/billing/amortization ───────────────────────────────────────
// Lista TODA la amortización del org. Usado por el frontend en hydrate
// para sincronizar el cache local con la realidad del server (caso típico:
// admin borró contratos en MySQL pero el cache de Zustand tiene amortización
// huérfana que sigue apareciendo en la UI).
//
// Devuelve: { rows: AmortizationRow[] } con TODAS las filas del org, sin
// agrupar por contrato (el frontend agrupa por contractId).

router.get("/amortization", async (_req, res) => {
  try {
    const orgId = await ensureDefaultOrg();
    const [rows] = await pool.query(
      `SELECT * FROM amortization_rows
       WHERE organization_id = ?
       ORDER BY contract_id, month_number ASC`,
      [orgId],
    );
    res.json({ rows: (rows as any[]).map(rowToAmortization) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Pagos ─────────────────────────────────────────────────────────────

router.post("/payments", async (req, res) => {
  const { contractId, rowId, paidOnDayOfMonth } = req.body as {
    contractId: string;
    rowId: string;
    paidOnDayOfMonth: number;
  };
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM amortization_rows WHERE id = ? AND contract_id = ?`,
      [rowId, contractId],
    );
    const list = rows as any[];
    if (list.length === 0)
      return res.status(404).json({ error: "row not found" });
    const row = rowToAmortization(list[0]);
    const policy = await loadPolicy(orgId, row.propertyId);
    if (!policy) return res.status(404).json({ error: "policy not found" });

    const updated = applyPaymentToRow(row, paidOnDayOfMonth, policy);

    await pool.query(
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
        updated.paidAt ??
          new Date().toISOString().slice(0, 19).replace("T", " "),
        updated.paidAmount ?? updated.total,
        rowId,
      ],
    );

    // Marca el invoice existente como pagado. Si todavía no fue enviado
    // (caso edge: agente pagó directo sin enviar antes), lo crea como paid
    // sin sent_at para no perder trazabilidad.
    await markInvoicePaid(
      orgId,
      row.propertyId,
      contractId,
      row.periodStart.slice(0, 7),
      updated.total,
    );

    res.json(updated);
  } catch (err: any) {
    console.error("[payments]", err);
    res.status(500).json({ error: err?.message });
  }
});

/**
 * Marca una cuenta de cobro como PAGADA. Si ya existe el invoice (caso normal:
 // fue enviado antes con POST /invoices/send), solo actualiza status + paid_*.
 // Si NO existe (caso edge: agente registró el pago sin enviar antes), crea
 // uno nuevo con status='paid' y sent_at=NULL (queda como evidencia histórica).
 */
async function markInvoicePaid(
  orgId: string,
  propertyId: string,
  contractId: string,
  period: string,
  paidAmount: number,
) {
  const [existing] = await pool.query(
    `SELECT id FROM rent_invoices WHERE contract_id = ? AND period = ?`,
    [contractId, period],
  );
  if ((existing as any[]).length > 0) {
    await pool.query(
      `UPDATE rent_invoices
       SET status = 'paid', paid_at = NOW(), paid_amount = ?
       WHERE contract_id = ? AND period = ?`,
      [paidAmount, contractId, period],
    );
    return;
  }

  const [rows] = await pool.query(
    `SELECT * FROM amortization_rows
     WHERE contract_id = ? AND period_start LIKE ? LIMIT 1`,
    [contractId, `${period}%`],
  );
  const list = rows as any[];
  if (list.length === 0) return;
  const row = rowToAmortization(list[0]);

  const [bankRows] = await pool.query(
    `SELECT id FROM bank_accounts WHERE property_id = ? AND is_primary = 1 LIMIT 1`,
    [propertyId],
  );
  const primaryBankId = (bankRows as any[])[0]?.id ?? null;

  const invoice = generateInvoiceFromRow(row, { paymentLink: primaryBankId });
  await pool.query(
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
      paidAmount,
    ],
  );
}

// ─── Novedades de cargos (property_charges — modelo unificado) ─────────

function rowToCharge(r: any) {
  return {
    id: r.id,
    propertyId: r.property_id,
    period: r.period,
    type: r.type,
    description: r.description,
    amount: Number(r.amount),
    chargedTo: r.charged_to,
    appliesToInvoice: !!r.applies_to_invoice,
    attachmentUrl: r.attachment_url ?? undefined,
    recordedAt: r.recorded_at,
    recordedBy: r.recorded_by,
  };
}

const CHARGE_COLS = `(id, organization_id, property_id, period, type,
                       description, amount, charged_to, applies_to_invoice,
                       attachment_url, recorded_by)`;

router.post("/charges", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const c = req.body as {
    id: string;
    propertyId: string;
    period: string;
    type: string;
    description: string;
    amount: number;
    chargedTo: "owner" | "tenant" | "both";
    appliesToInvoice?: boolean;
    attachmentUrl?: string;
    recordedBy: string;
  };
  try {
    await pool.query(
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
        c.recordedBy,
      ],
    );
    res.json({ ok: true, id: c.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/charges", async (req, res) => {
  const propertyId = req.query.propertyId as string | undefined;
  const period = req.query.period as string | undefined;
  const orgId = await ensureDefaultOrg();
  try {
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (propertyId) {
      where.push("property_id = ?");
      args.push(propertyId);
    }
    if (period) {
      where.push("period = ?");
      args.push(period);
    }
    const [rows] = await pool.query(
      `SELECT * FROM property_charges
       WHERE ${where.join(" AND ")}
       ORDER BY period DESC, recorded_at DESC`,
      args,
    );
    res.json((rows as any[]).map(rowToCharge));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.delete("/charges/:id", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [result] = await pool.query(
      `DELETE FROM property_charges WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    res.json({ ok: true, deleted: (result as any).affectedRows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/**
 * GET /api/billing/charges/invoice-summary?propertyId=&period=
 *
 * Devuelve el detalle de cargos del mes que entran a la cuenta de cobro
 * del inquilino (chargedTo ∈ 'tenant'/'both' AND appliesToInvoice=true).
 * El front lo usa para pintar la sección "Otros cargos del mes" del PDF
 * y para saber cuánto sumar al subtotal.
 */
router.get("/charges/invoice-summary", async (req, res) => {
  const propertyId = req.query.propertyId as string;
  const period = req.query.period as string;
  if (!propertyId || !period) {
    return res
      .status(400)
      .json({ error: "propertyId y period son requeridos" });
  }
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM property_charges
       WHERE organization_id = ?
         AND property_id = ?
         AND period = ?
         AND applies_to_invoice = 1
         AND charged_to IN ('tenant','both')
       ORDER BY recorded_at ASC`,
      [orgId, propertyId, period],
    );
    const charges = (rows as any[]).map(rowToCharge);
    const total = charges.reduce((s, c) => s + c.amount, 0);
    res.json({ propertyId, period, total, charges });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Descuentos (LEGACY — compat con /api/billing/discounts) ───────────
// Mantener el endpoint viejo para que cualquier llamada existente siga
// funcionando. Internamente escribe en `property_charges` con
// `charged_to='owner'` (el modelo unificado) Y en `property_discounts`
// (tabla histórica) para mantener trazabilidad legacy.

router.post("/discounts", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const d = req.body as {
    id: string;
    propertyId: string;
    type: string;
    description: string;
    amount: number;
    monthPeriod: string;
    attachmentUrl?: string;
    recordedBy: string;
  };
  try {
    await pool.query(
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
        d.recordedBy,
      ],
    );
    // Mirror en property_charges con charged_to='owner' — modelo unificado.
    // Usamos el mismo `id` si es posible (CHAR(36) lo permite); si el id
    // viejo no calza (más de 36 chars), generamos uno local.
    const chargeId =
      d.id && String(d.id).length <= 36 ? d.id : `disc-${d.id}-${Date.now()}`;
    await pool.query(
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
        d.recordedBy,
      ],
    );
    res.json({ ok: true, id: d.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/discounts", async (req, res) => {
  const propertyId = req.query.propertyId as string | undefined;
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = propertyId
      ? await pool.query(
          `SELECT * FROM property_discounts WHERE property_id = ? AND organization_id = ? ORDER BY recorded_at DESC`,
          [propertyId, orgId],
        )
      : await pool.query(
          `SELECT * FROM property_discounts WHERE organization_id = ? ORDER BY recorded_at DESC`,
          [orgId],
        );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Aumentos (al inquilino) ────────────────────────────────────────────

router.post("/increases", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const i = req.body as {
    id: string;
    propertyId: string;
    contractId: string;
    type: "admin_change" | "ipc_annual";
    description: string;
    amount: number;
    effectiveFrom: string;
    recordedBy: string;
  };
  try {
    await pool.query(
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
        i.recordedBy,
      ],
    );
    res.json({ ok: true, id: i.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/increases", async (req, res) => {
  const propertyId = req.query.propertyId as string | undefined;
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = propertyId
      ? await pool.query(
          `SELECT * FROM rent_increases WHERE property_id = ? AND organization_id = ? ORDER BY effective_from ASC`,
          [propertyId, orgId],
        )
      : await pool.query(
          `SELECT * FROM rent_increases WHERE organization_id = ? ORDER BY effective_from ASC`,
          [orgId],
        );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Estado de cuenta ─────────────────────────────────────────────────

router.get("/account-statement", async (req, res) => {
  const propertyId = req.query.propertyId as string;
  const period = req.query.period as string; // 'YYYY-MM'
  const orgId = await ensureDefaultOrg();
  try {
    const [paidRows] = await pool.query(
      `SELECT COALESCE(SUM(total), 0) AS gross
       FROM amortization_rows
       WHERE property_id = ? AND status = 'paid'
         AND period_start LIKE ?`,
      [propertyId, `${period}%`],
    );
    const grossIncome = Number((paidRows as any[])[0]?.gross ?? 0);

    // Fuente unificada: traer cargos chargedTo='owner'/'both' del período
    // desde property_charges. Compat: si property_charges no tiene la fila
    // (datos muy viejos), caemos a property_discounts.
    const [chargeRows] = await pool.query(
      `SELECT * FROM property_charges
       WHERE property_id = ? AND period = ?
         AND charged_to IN ('owner','both')`,
      [propertyId, period],
    );
    let discountsOrCharges: any[] = (chargeRows as any[]).map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      type: r.type,
      description: r.description,
      amount: Number(r.amount),
      monthPeriod: r.period,
      attachmentUrl: r.attachment_url ?? undefined,
      recordedAt: r.recorded_at,
      recordedBy: r.recorded_by,
    }));
    if (discountsOrCharges.length === 0) {
      // Fallback legacy
      const [legacyRows] = await pool.query(
        `SELECT * FROM property_discounts
         WHERE property_id = ? AND month_period = ?`,
        [propertyId, period],
      );
      discountsOrCharges = (legacyRows as any[]).map((r) => ({
        id: r.id,
        propertyId: r.property_id,
        type: r.type,
        description: r.description,
        amount: Number(r.amount),
        monthPeriod: r.month_period,
        attachmentUrl: r.attachment_url ?? undefined,
        recordedAt: r.recorded_at,
        recordedBy: r.recorded_by,
      }));
    }

    const statement = calculateAccountStatement(
      propertyId,
      period,
      grossIncome,
      discountsOrCharges,
    );
    res.json(statement);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Cuenta de cobro ──────────────────────────────────────────────────

/**
 * Genera el siguiente consecutivo de cuenta de cobro para una propiedad+period.
 * Formato: CC-YYYYMM-NNN (NNN padded a 3 dígitos, scoped a la propiedad).
 * Ej: primera cuenta de cobro de "Calle 123" en 2026-07 → CC-202607-001.
 *
 * Scoping por propiedad: si la misma org maneja varios inmuebles, cada uno
 * tiene su propio contador. Esto evita saltos raros entre propiedades y es
 // consistente con el # de cuenta de cobro físico que suele ir por serie.
 */
async function generateInvoiceNumber(
  orgId: string,
  propertyId: string,
  period: string,
): Promise<string> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM rent_invoices
     WHERE organization_id = ? AND property_id = ? AND period = ?`,
    [orgId, propertyId, period],
  );
  const n = Number((rows as any[])[0]?.n ?? 0) + 1;
  // YYYY-MM → YYYYMM (sin guión)
  const periodCompact = period.replace("-", "");
  return `CC-${periodCompact}-${String(n).padStart(3, "0")}`;
}

function rowToInvoice(r: any): RentInvoice {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number ?? undefined,
    propertyId: r.property_id,
    contractId: r.contract_id,
    period: r.period,
    dueDate: r.due_date,
    subtotal: Number(r.subtotal),
    totalEarly: Number(r.total_early),
    totalMid: Number(r.total_mid),
    totalLate: Number(r.total_late),
    status: r.status,
    sentAt: r.sent_at ?? undefined,
    paidAt: r.paid_at ?? undefined,
    paidAmount: r.paid_amount != null ? Number(r.paid_amount) : undefined,
    paymentLink: r.payment_link ?? undefined,
    notes: r.notes ?? undefined,
  };
}

/**
 * POST /api/billing/invoices/generate
 *
 * Crea (si no existe) o actualiza (si existe pero no fue enviado) el invoice
 // para un period. NO marca sent_at — eso lo hace /invoices/send.
 *
 * Útil para previsualizar la cuenta de cobro antes de "enviarla" (el agente
 // la ve en pantalla, verifica valores, y solo cuando confirma hace click en
 // Enviar → /invoices/send que marca sent_at y genera invoice_number).
 */
router.post("/invoices/generate", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const { propertyId, contractId, period } = req.body as {
    propertyId: string;
    contractId: string;
    period: string;
  };
  try {
    const [rows] = await pool.query(
      `SELECT * FROM amortization_rows WHERE contract_id = ? AND period_start LIKE ?`,
      [contractId, `${period}%`],
    );
    const list = rows as any[];
    if (list.length === 0)
      return res.status(404).json({ error: "no row for period" });
    const row = rowToAmortization(list[0]);

    const [bankRows] = await pool.query(
      `SELECT id FROM bank_accounts WHERE property_id = ? AND is_primary = 1 LIMIT 1`,
      [propertyId],
    );
    const primaryBankId = (bankRows as any[])[0]?.id ?? null;

    const invoice = generateInvoiceFromRow(row, { paymentLink: primaryBankId });
    await pool.query(
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
        invoice.status,
      ],
    );
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/**
 * POST /api/billing/invoices/send
 *
 * Marca la cuenta de cobro como ENVIADA: genera `invoice_number` (CC-YYYYMM-NNN)
 * y setea `sent_at`. Devuelve la invoice actualizada para que el frontend la
 // pinte en el PDF y guarde el consecutivo en el histórico.
 *
 * Body: { propertyId, contractId, period }
 */
router.post("/invoices/send", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const { propertyId, contractId, period } = req.body as {
    propertyId: string;
    contractId: string;
    period: string;
  };
  try {
    // 0. Sumar cargos al inquilino para este período (chargedTo IN ('tenant','both'),
    //    appliesToInvoice=true). Si hay cargos, los añadimos al subtotal.
    const [chargeRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS charges_total
       FROM property_charges
       WHERE organization_id = ?
         AND property_id = ?
         AND period = ?
         AND applies_to_invoice = 1
         AND charged_to IN ('tenant','both')`,
      [orgId, propertyId, period],
    );
    const chargesTotal = Number((chargeRows as any[])[0]?.charges_total ?? 0);

    // 1. Asegurar que existe la fila de rent_invoices
    const [existing] = await pool.query(
      `SELECT * FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [contractId, period],
    );
    if ((existing as any[]).length === 0) {
      // No existe → la creamos primero con /generate
      const [rows] = await pool.query(
        `SELECT * FROM amortization_rows WHERE contract_id = ? AND period_start LIKE ?`,
        [contractId, `${period}%`],
      );
      const list = rows as any[];
      if (list.length === 0)
        return res.status(404).json({ error: "no row for period" });
      const row = rowToAmortization(list[0]);

      const [bankRows] = await pool.query(
        `SELECT id FROM bank_accounts WHERE property_id = ? AND is_primary = 1 LIMIT 1`,
        [propertyId],
      );
      const primaryBankId = (bankRows as any[])[0]?.id ?? null;

      const invoice = generateInvoiceFromRow(row, {
        paymentLink: primaryBankId,
      });
      // Sumar cargos al inquilino al subtotal (si los hay)
      const subtotalWithCharges = invoice.subtotal + chargesTotal;
      const totalEarlyWith = invoice.totalEarly + chargesTotal;
      const totalMidWith = invoice.totalMid + chargesTotal;
      const totalLateWith = invoice.totalLate + chargesTotal;
      await pool.query(
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
          invoice.status,
        ],
      );
    } else if (chargesTotal > 0) {
      // Ya existía: actualizar subtotales para incluir cargos nuevos.
      // Solo si todavía no fue pagado (no bajamos un paid a pending para
      // no perder trazabilidad).
      await pool.query(
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
          period,
        ],
      );
    }

    // 2. Generar consecutivo si aún no tiene uno (re-envío es idempotente)
    const [rowsAfter] = await pool.query(
      `SELECT * FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [contractId, period],
    );
    const r = (rowsAfter as any[])[0];
    let invoiceNumber = r.invoice_number as string | null;
    if (!invoiceNumber) {
      invoiceNumber = await generateInvoiceNumber(orgId, propertyId, period);
      await pool.query(
        `UPDATE rent_invoices
         SET invoice_number = ?, sent_at = COALESCE(sent_at, NOW()), status = CASE
           WHEN status = 'paid' THEN 'paid'  -- si ya estaba pagado (caso edge), no bajamos a pending
           ELSE 'pending'
         END
         WHERE contract_id = ? AND period = ?`,
        [invoiceNumber, contractId, period],
      );
    } else {
      // Ya tenía invoice_number (re-envío): solo actualizar sent_at si es null
      await pool.query(
        `UPDATE rent_invoices
         SET sent_at = COALESCE(sent_at, NOW())
         WHERE contract_id = ? AND period = ? AND sent_at IS NULL`,
        [contractId, period],
      );
    }

    // 3. Devolver invoice actualizada
    const [final] = await pool.query(
      `SELECT * FROM rent_invoices WHERE contract_id = ? AND period = ?`,
      [contractId, period],
    );
    res.json(rowToInvoice((final as any[])[0]));
  } catch (err: any) {
    console.error("[invoices/send]", err);
    res.status(500).json({ error: err?.message });
  }
});

router.get("/invoices", async (req, res) => {
  const propertyId = req.query.propertyId as string | undefined;
  const contractId = req.query.contractId as string | undefined;
  const orgId = await ensureDefaultOrg();
  try {
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (propertyId) {
      where.push("property_id = ?");
      args.push(propertyId);
    }
    if (contractId) {
      where.push("contract_id = ?");
      args.push(contractId);
    }
    const [rows] = await pool.query(
      `SELECT * FROM rent_invoices WHERE ${where.join(" AND ")} ORDER BY period DESC`,
      args,
    );
    res.json((rows as any[]).map(rowToInvoice));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/**
 * GET /api/billing/invoices/lookup?contractId=&period=
 *
 * Lookup directo por contrato + period (lo usa el frontend para mostrar el
 * estado de envío del mes en la tabla de amortización: ¿ya fue enviado?
 * ¿tiene invoice_number?).
 */
router.get("/invoices/lookup", async (req, res) => {
  const contractId = req.query.contractId as string | undefined;
  const period = req.query.period as string | undefined;
  const orgId = await ensureDefaultOrg();
  if (!contractId || !period)
    return res
      .status(400)
      .json({ error: "contractId y period son requeridos" });
  try {
    const [rows] = await pool.query(
      `SELECT * FROM rent_invoices WHERE contract_id = ? AND period = ? AND organization_id = ?`,
      [contractId, period, orgId],
    );
    const list = rows as any[];
    if (list.length === 0) return res.json(null);
    res.json(rowToInvoice(list[0]));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Histórico (append-only) ───────────────────────────────────────────

router.post("/actions", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const a = req.body as {
    id: string;
    propertyId: string;
    type: string;
    description: string;
    payload?: any;
    actorName: string;
  };
  try {
    await pool.query(
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
        a.actorName,
      ],
    );
    res.json({ ok: true, id: a.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/actions", async (req, res) => {
  const propertyId = req.query.propertyId as string | undefined;
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = propertyId
      ? await pool.query(
          `SELECT * FROM property_actions WHERE property_id = ? AND organization_id = ? ORDER BY occurred_at DESC`,
          [propertyId, orgId],
        )
      : await pool.query(
          `SELECT * FROM property_actions WHERE organization_id = ? ORDER BY occurred_at DESC LIMIT 200`,
          [orgId],
        );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Mora (utilidad de cálculo, útil para preview en UI) ───────────────

router.post("/late-fee", (req, res) => {
  const {
    subtotal,
    paidOnDayOfMonth,
    graceDay,
    lateFeeMidPct,
    lateFeeLatePct,
  } = req.body;
  const result = calculateLateFee({
    subtotal,
    paidOnDayOfMonth,
    graceDay,
    lateFeeMidPct,
    lateFeeLatePct,
  });
  res.json(result);
});

// ─── Owner payouts (transferencias reales al propietario) ──────────────

function rowToOwnerPayout(r: any): OwnerPayout {
  return {
    id: r.id,
    propertyId: r.property_id,
    contractId: r.contract_id ?? undefined,
    period: r.period,
    amount: Number(r.amount),
    paidAt: r.paid_at,
    bankAccountId: r.bank_account_id ?? undefined,
    reference: r.reference ?? undefined,
    notes: r.notes ?? undefined,
    recordedBy: r.recorded_by,
    recordedAt: r.recorded_at,
  };
}

router.post("/owner-payouts", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const p = req.body as Omit<OwnerPayout, "id" | "recordedAt"> & {
    id?: string;
  };
  try {
    const id = p.id ?? crypto.randomUUID();
    const recordedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    await pool.query(
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
        recordedAt,
      ],
    );
    // Devolver la fila creada
    const [rows] = await pool.query(
      `SELECT * FROM owner_payouts WHERE id = ?`,
      [id],
    );
    res.json(rowToOwnerPayout((rows as any[])[0]));
  } catch (err: any) {
    console.error("[owner-payouts POST]", err);
    res.status(500).json({ error: err?.message });
  }
});

router.get("/owner-payouts", async (req, res) => {
  const propertyId = req.query.propertyId as string | undefined;
  const period = req.query.period as string | undefined;
  const orgId = await ensureDefaultOrg();
  try {
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (propertyId) {
      where.push("property_id = ?");
      args.push(propertyId);
    }
    if (period) {
      where.push("period = ?");
      args.push(period);
    }
    const [rows] = await pool.query(
      `SELECT * FROM owner_payouts WHERE ${where.join(" AND ")} ORDER BY paid_at DESC`,
      args,
    );
    res.json((rows as any[]).map(rowToOwnerPayout));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.delete("/owner-payouts/:id", async (req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    await pool.query(
      `DELETE FROM owner_payouts WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/**
 * GET /api/billing/owner-statement?propertyId=&period=
 *
 * Devuelve el estado de cuenta consolidado del propietario para un mes:
 * ingresos del inquilino + descuentos + retenciones del motor + payouts
 * reales. El PDF de estado de cuenta consume esta salida.
 */
router.get("/owner-statement", async (req, res) => {
  const propertyId = req.query.propertyId as string | undefined;
  const period = req.query.period as string;
  const orgId = await ensureDefaultOrg();
  if (!propertyId || !period) {
    return res
      .status(400)
      .json({ error: "propertyId y period son requeridos" });
  }
  try {
    // 1) Ingresos del mes (amortization_rows pagados del period)
    const [paidRows] = await pool.query(
      `SELECT
         COALESCE(SUM(base_rent), 0)        AS rent,
         COALESCE(SUM(base_admin), 0)       AS admin,
         COALESCE(SUM(late_fee_amount), 0)  AS late_fee,
         COALESCE(SUM(total), 0)            AS total
       FROM amortization_rows
       WHERE property_id = ? AND status = 'paid' AND period_start LIKE ?`,
      [propertyId, `${period}%`],
    );
    const paid = (paidRows as any[])[0] ?? {};
    const grossRent = Number(paid.rent ?? 0);
    const grossAdmin = Number(paid.admin ?? 0);
    const grossLateFee = Number(paid.late_fee ?? 0);
    const totalGrossIncome = grossRent + grossAdmin + grossLateFee;

    // 2) Cargos del mes que aplican al propietario (property_charges
    //    con charged_to IN ('owner','both')). Compat: si la tabla nueva está
    //    vacía para esta propiedad/period, caemos a property_discounts.
    const [chargeRowsOwner] = await pool.query(
      `SELECT * FROM property_charges
       WHERE property_id = ? AND period = ?
         AND charged_to IN ('owner','both')
       ORDER BY recorded_at ASC`,
      [propertyId, period],
    );
    let chargesForOwner = (chargeRowsOwner as any[]).map(rowToCharge);
    if (chargesForOwner.length === 0) {
      const [legacyRows] = await pool.query(
        `SELECT * FROM property_discounts
         WHERE property_id = ? AND month_period = ?
         ORDER BY recorded_at ASC`,
        [propertyId, period],
      );
      chargesForOwner = (legacyRows as any[]).map((r) => ({
        id: r.id,
        propertyId: r.property_id,
        period: r.month_period,
        type: r.type,
        description: r.description,
        amount: Number(r.amount),
        chargedTo: "owner" as const,
        appliesToInvoice: false,
        attachmentUrl: r.attachment_url ?? undefined,
        recordedAt: r.recorded_at,
        recordedBy: r.recorded_by,
      }));
    }
    const totalDiscounts = chargesForOwner.reduce((s, c) => s + c.amount, 0);
    // Mapear a la forma legacy `PropertyDiscount` para no romper la UI actual.
    const discounts = chargesForOwner.map((c) => ({
      id: c.id,
      propertyId: c.propertyId,
      type: c.type,
      description: c.description,
      amount: c.amount,
      monthPeriod: c.period,
      attachmentUrl: c.attachmentUrl,
      recordedAt: c.recordedAt,
      recordedBy: c.recordedBy,
    }));

    // 2b) Cargos pasados al inquilino (solo auditoría — no afecta el neto)
    const [chargeRowsTenant] = await pool.query(
      `SELECT * FROM property_charges
       WHERE property_id = ? AND period = ?
         AND charged_to IN ('tenant','both')
       ORDER BY recorded_at ASC`,
      [propertyId, period],
    );
    const chargesToTenant = (chargeRowsTenant as any[]).map(rowToCharge);
    const totalChargesToTenant = chargesToTenant.reduce(
      (s, c) => s + c.amount,
      0,
    );

    // 3) Retenciones del motor de liquidación (calculateMonthlySettlement)
    // Usamos el rent_amount del contrato activo (si hay), la comisión del
    // contrato, y tipo "natural" por default. El tipo de contribuyente
    // puede ajustarse desde la UI en el futuro.
    const policy = await loadPolicy(orgId, propertyId);
    const [contracts] = await pool.query(
      `SELECT * FROM contracts WHERE property_id = ? AND status = 'active' ORDER BY start_date DESC LIMIT 1`,
      [propertyId],
    );
    const contract = (contracts as any[])[0];
    const rentAmount = contract
      ? Number(contract.rent_amount)
      : (policy?.rentAmount ?? 0);
    const adminFee = contract
      ? Number(contract.admin_fee)
      : (policy?.adminFee ?? 0);
    const commissionPct = contract?.commission_pct ?? 8;

    const settlementInputs: SettlementInputs = {
      canon: rentAmount,
      administracionPH: adminFee,
      otrosIngresos: 0,
      gastosOperativos: totalDiscounts,
      comisionPct: Number(commissionPct),
      seguroPct: 0,
      ownerTaxType: "natural",
      tenantTaxType: "natural",
      period,
      closed: false,
    };
    const settlementResult = calculateMonthlySettlement(settlementInputs);

    // 4) Payouts reales del mes
    const [payoutRows] = await pool.query(
      `SELECT * FROM owner_payouts
       WHERE property_id = ? AND period = ? AND organization_id = ?
       ORDER BY paid_at ASC`,
      [propertyId, period, orgId],
    );
    const payouts = (payoutRows as any[]).map(rowToOwnerPayout);
    const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);

    // 5) Saldo final
    const netCalculated = settlementResult.totales.saldoTransferir;
    const finalBalance = netCalculated - totalPayouts;

    const stmt: OwnerStatement = {
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
        totalRetentions:
          settlementResult.totales.impuestos +
          settlementResult.trace.comision +
          settlementResult.trace.gmf,
        commissionPct: Number(commissionPct),
      },
      netCalculated,
      totalPayouts,
      payouts,
      totalChargesToTenant,
      finalBalance,
    };
    res.json(stmt);
  } catch (err: any) {
    console.error("[owner-statement]", err);
    res.status(500).json({ error: err?.message });
  }
});

export default router;
