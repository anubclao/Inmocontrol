import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import express from 'express';
import crypto from 'crypto';
import pool, { ensureDefaultOrg } from '../db.js';

// FIX #1/#2 (P0 seguridad): requireAuth en todas las rutas de financial-records.
import { requireAuth } from "./auth.js";
// fix-issue-permissions-by-endpoint: requireRole valida acción específica.
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/financial-records
 * Lista todos los movimientos financieros de la organización.
 */
// BUG-029: migrado a asyncHandler.
router.get('/', asyncHandler(async (_req, res) => {
  const orgId = await ensureDefaultOrg();
  const [rows] = await pool.query<any[]>(
    `SELECT id, contract_id, property_id, date, type, category, description, amount,
            attachment_url, created_at
     FROM financial_records
     WHERE organization_id = ?
     ORDER BY date DESC, created_at DESC`,
    [orgId],
  );
  res.json({ records: rows });
}));

/**
 * POST /api/financial-records
 * Body: { propertyId, contractId?, date, type ('income'|'expense'),
 *         category, description, amount, attachmentUrl? }
 */
// BUG-029: migrado a asyncHandler.
router.post('/', requireRole('canAddFinancial'), asyncHandler(async (req, res) => {
  const { propertyId, contractId, date, type, category, description, amount, attachmentUrl } = req.body as Record<string, any>;
  if (!propertyId || !date || !type || !category || !description || amount == null) {
    res.status(400).json({ error: 'Faltan campos: propertyId, date, type, category, description, amount' });
    return;
  }
  if (!['income', 'expense'].includes(type)) {
    res.status(400).json({ error: 'type debe ser income o expense' });
    return;
  }

  const id = crypto.randomUUID();
  const orgId = await ensureDefaultOrg();
  await pool.query(
    `INSERT INTO financial_records
      (id, organization_id, contract_id, property_id, date, type, category, description, amount, attachment_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, orgId, contractId || null, propertyId, date, type, category, description, amount, attachmentUrl || null],
  );
  res.json({ success: true, recordId: id });
}));

/**
 * PATCH /api/financial-records/:id
 */
// BUG-029: migrado a asyncHandler.
router.patch('/:id', requireRole('canAddFinancial'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const fields = ['date', 'type', 'category', 'description', 'amount', 'attachment_url'];
  const updates: string[] = [];
  const values: any[] = [];

  for (const f of fields) {
    const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[camel] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[camel]);
    }
  }

  if (!updates.length) {
    res.json({ success: true, message: 'Nothing to update' });
    return;
  }

  values.push(id);
  const orgId = await ensureDefaultOrg();
  await pool.query(
    `UPDATE financial_records SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
    [...values, orgId],
  );
  res.json({ success: true });
}));

/**
 * DELETE /api/financial-records/:id
 */
// BUG-029: migrado a asyncHandler.
router.delete('/:id', requireRole('canDeleteFinancial'), asyncHandler(async (req, res) => {
  const orgId = await ensureDefaultOrg();
  await pool.query(
    `DELETE FROM financial_records WHERE id = ? AND organization_id = ?`,
    [req.params.id, orgId],
  );
  res.json({ success: true });
}));

export default router;