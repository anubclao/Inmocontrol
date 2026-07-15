import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import express from 'express';
import crypto from 'crypto';
import pool, { ensureDefaultOrg } from '../db.js';

const router = express.Router();

/**
 * GET /api/financial-records
 * Lista todos los movimientos financieros de la organización.
 */
router.get('/', async (_req, res) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/financial-records
 * Body: { propertyId, contractId?, date, type ('income'|'expense'),
 *         category, description, amount, attachmentUrl? }
 */
router.post('/', async (req, res) => {
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
  try {
    const orgId = await ensureDefaultOrg();
    await pool.query(
      `INSERT INTO financial_records
        (id, organization_id, contract_id, property_id, date, type, category, description, amount, attachment_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, orgId, contractId || null, propertyId, date, type, category, description, amount, attachmentUrl || null],
    );
    res.json({ success: true, recordId: id });
  } catch (err: any) {
    console.error('[DB] Error insertando financial_record:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/financial-records/:id
 */
router.patch('/:id', async (req, res) => {
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
  try {
    const orgId = await ensureDefaultOrg();
    await pool.query(
      `UPDATE financial_records SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
      [...values, orgId],
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/financial-records/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const orgId = await ensureDefaultOrg();
    await pool.query(
      `DELETE FROM financial_records WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;