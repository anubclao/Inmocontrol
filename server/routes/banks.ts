/**
 * InmoControl — Endpoints para cuentas bancarias y pólizas de seguro.
 *
 *   GET   /api/billing/bank-accounts?propertyId=
 *   POST  /api/billing/bank-accounts
 *   DELETE /api/billing/bank-accounts/:id
 *   GET   /api/billing/insurance-policies/:propertyId
 *   POST  /api/billing/insurance-policies
 */

import { Router } from 'express';
import pool, { ensureDefaultOrg } from '../db.js';

const router = Router();

// ─── Bank Accounts ─────────────────────────────────────────────────────

router.get('/bank-accounts', async (req, res) => {
  const propertyId = req.query.propertyId as string | undefined;
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = propertyId
      ? await pool.query(
          `SELECT * FROM bank_accounts WHERE organization_id = ? AND (property_id = ? OR property_id IS NULL) ORDER BY is_primary DESC, created_at ASC`,
          [orgId, propertyId]
        )
      : await pool.query(
          `SELECT * FROM bank_accounts WHERE organization_id = ? ORDER BY is_primary DESC, created_at ASC`,
          [orgId]
        );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post('/bank-accounts', async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const b = req.body as {
    id: string;
    propertyId?: string | null;
    bank: string;
    accountType: 'savings' | 'checking';
    accountNumber: string;
    holderName: string;
    holderIdNumber: string;
    isPrimary?: boolean;
    notes?: string;
  };
  try {
    // Si se marca como primary, desmarcar las demás del mismo property/org
    if (b.isPrimary) {
      await pool.query(
        `UPDATE bank_accounts SET is_primary = 0
         WHERE organization_id = ? AND (property_id = ? OR (property_id IS NULL AND ? IS NULL))`,
        [orgId, b.propertyId ?? null, b.propertyId ?? null]
      );
    }
    await pool.query(
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
        b.id, orgId, b.propertyId ?? null, b.bank, b.accountType, b.accountNumber,
        b.holderName, b.holderIdNumber, b.isPrimary ? 1 : 0, b.notes ?? null,
      ]
    );

    // Si es primary, actualizar billing_policies
    if (b.isPrimary && b.propertyId) {
      await pool.query(
        `UPDATE billing_policies SET primary_bank_account_id = ? WHERE property_id = ?`,
        [b.id, b.propertyId]
      );
    }
    res.json({ ok: true, id: b.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.delete('/bank-accounts/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM bank_accounts WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Insurance Policies ────────────────────────────────────────────────

router.get('/insurance-policies/:propertyId', async (req, res) => {
  const orgId = await ensureDefaultOrg();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM policies WHERE organization_id = ? AND property_id = ? ORDER BY approved_at DESC`,
      [orgId, req.params.propertyId]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post('/insurance-policies', async (req, res) => {
  const orgId = await ensureDefaultOrg();
  const p = req.body as {
    id?: string;
    propertyId: string;
    insurer: string;
    policyNumber: string;
    startDate: string;
    endDate: string;
    premiumAmount: number;
    approvalPdfUrl?: string;
    approvedBy: string;
    notes?: string;
  };
  const id = p.id ?? (globalThis as any).crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO policies
         (id, organization_id, property_id, insurer, policy_number, start_date, end_date,
          premium_amount, approval_pdf_url, approved_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, orgId, p.propertyId, p.insurer, p.policyNumber, p.startDate, p.endDate,
        Number(p.premiumAmount), p.approvalPdfUrl ?? null, p.approvedBy, p.notes ?? null,
      ]
    );

    // Linkear a la billing_policy si existe
    await pool.query(
      `UPDATE billing_policies SET policy_id = ? WHERE property_id = ?`,
      [id, p.propertyId]
    );
    res.json({ ok: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;