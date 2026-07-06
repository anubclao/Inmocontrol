/**
 * InmoControl — Seed del Piloto (módulo compartido)
 * ============================================================================
 * Lógica unificada del seed piloto, expuesta como función `runPilotSeed()`.
 *
 * Consumida por DOS callers:
 *   1) `scripts/seed-pilot.mjs` — CLI que corre vía SSH desde el server
 *      (lee .env.local antes de importar este módulo)
 *   2) `server/routes/admin.ts`  — endpoint HTTP POST /api/admin/seed
 *      (las env vars vienen del panel de Hostinger)
 *
 * Idempotente: si ya existe el admin user, retorna `alreadySeeded=true`
 * sin tocar nada más.
 *
 * SEGURIDAD: este módulo hace write directo a la DB. No tocar en caliente.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from '../db.js';

const ORG_ID           = '00000000-0000-0000-0000-000000000001';
const PROPERTY_ID     = '00000000-0000-0000-0000-000000000010';
const TENANT_ID       = '00000000-0000-0000-0000-000000000020';
const CONTRACT_ID     = '00000000-0000-0000-0000-000000000030';
const POLICY_ID       = PROPERTY_ID; // billing_policies PK = property_id
const BANK_ACCOUNT_ID = '00000000-0000-0000-0000-000000000040';
const PROFILE_ID      = '00000000-0000-0000-0000-000000000005';
const DISCOUNT_ID     = '00000000-0000-0000-0000-000000000050';

// Credenciales del admin del piloto — vienen de env (Hostinger panel / .env.local)
const PILOT_EMAIL    = (process.env.PILOT_EMAIL    ?? 'admin@inmocontrol.local').toLowerCase().trim();
const PILOT_PASSWORD =  process.env.PILOT_PASSWORD ?? 'inmo2026!';

const NOW          = new Date();
const PERIOD_START = '2026-01-15';
const PERIOD_END   = '2027-01-14';
const RENT_AMOUNT  = 1_696_037;
const ADMIN_FEE    = 250_000;

export interface PilotSeedResult {
  alreadySeeded: boolean;
  stages: string[];
  admin: { id: string; email: string };
}

/**
 * Idempotent pilot bootstrap. Devuelve un resumen del estado.
 * - Si ya hay un admin user registrado → no toca nada, marca `alreadySeeded`.
 * - Si la DB está vacía → crea org + propiedad + tenant + contrato + policy +
 *   bank_account + 12 amortizaciones + 1 descuento de ejemplo + 1 admin user.
 */
export async function runPilotSeed(): Promise<PilotSeedResult> {
  // ── Idempotencia: si ya hay admin, no hacer nada
  const [existingAdmins] = await pool.query(
    `SELECT id, email FROM profiles WHERE role = 'admin' LIMIT 1`,
  );
  if ((existingAdmins as any[]).length > 0) {
    return {
      alreadySeeded: true,
      stages: ['admin_existed'],
      admin: {
        id: (existingAdmins as any[])[0].id,
        email: (existingAdmins as any[])[0].email,
      },
    };
  }

  const stages: string[] = [];

  // 1. Organización
  await pool.query(
    `INSERT INTO organizations
       (id, name, nit, address, phone, website, created_by)
     VALUES (?, 'InmoControl Piloto', '900.123.456-7',
             'Calle 100 #15-20, Bogotá D.C.', '+57 1 555 1234',
             'https://inmocontrol.example', 'pilot-seed')
     ON DUPLICATE KEY UPDATE name = VALUES(name), nit = VALUES(nit)`,
    [ORG_ID],
  );
  stages.push('organizations');

  // 2. Propiedad
  await pool.query(
    `INSERT INTO properties
       (id, organization_id, address, chip, folio,
        owner_name, owner_id_number, owner_phone, owner_email,
        property_type, status, archived,
        mandato_pdf_url, mandato_signed_at, created_by)
     VALUES (?, ?, 'Calle 93 #11-27, Apto 501', 'AAA0123BMCY', '50N-1234567',
             'Carlos Andrés Pérez Restrepo', '79.456.123',
             '+57 310 456 7890', 'carlos.perez@example.com',
             'apartamento', 'Arrendado', 0,
             'https://example.com/mandato-firmado.pdf', NOW(),
             'pilot-seed')
     ON DUPLICATE KEY UPDATE address = VALUES(address), owner_name = VALUES(owner_name)`,
    [PROPERTY_ID, ORG_ID],
  );
  stages.push('properties');

  // 3. Tenant
  await pool.query(
    `INSERT INTO tenants
       (id, organization_id, property_id, name, document_id, email, phone,
        rent, admin_fee, lease_start_date, status)
     VALUES (?, ?, ?, 'María Fernanda Gómez Salazar', '52.987.654',
             'maria.gomez@example.com', '+57 315 987 6543',
             ?, ?, ?, 'Activo')
     ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status)`,
    [TENANT_ID, ORG_ID, PROPERTY_ID, RENT_AMOUNT, ADMIN_FEE, PERIOD_START],
  );
  stages.push('tenants');

  // 4. Contrato
  await pool.query(
    `INSERT INTO contracts
       (id, organization_id, property_id, tenant_id,
        rent_amount, admin_fee, commission_pct, insurance_pct,
        start_date, end_date, status, renewal_strategy, inventory_end_required,
        contract_pdf_url, signed_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 8, 0, ?, ?, 'active', 'auto', 1,
             'https://example.com/contrato-firmado.pdf', NOW(), 'pilot-seed')
     ON DUPLICATE KEY UPDATE status = VALUES(status), start_date = VALUES(start_date)`,
    [CONTRACT_ID, ORG_ID, PROPERTY_ID, TENANT_ID, RENT_AMOUNT, ADMIN_FEE, PERIOD_START, PERIOD_END],
  );
  stages.push('contracts');

  // 5. BillingPolicy
  await pool.query(
    `INSERT INTO billing_policies
       (property_id, organization_id, rent_amount, admin_fee,
        late_fee_mid_pct, late_fee_late_pct, grace_day,
        apply_annual_ipc, expected_ipc_pct, apply_ipc_to_admin,
        allow_admin_changes, primary_bank_account_id, created_by)
     VALUES (?, ?, ?, ?, 5, 10, 10, 1, 5, 1, 1, ?, 'pilot-seed')
     ON DUPLICATE KEY UPDATE rent_amount = VALUES(rent_amount), admin_fee = VALUES(admin_fee)`,
    [POLICY_ID, ORG_ID, RENT_AMOUNT, ADMIN_FEE, BANK_ACCOUNT_ID],
  );
  stages.push('billing_policies');

  // 6. Bank Account
  await pool.query(
    `INSERT INTO bank_accounts
       (id, organization_id, property_id, bank, account_type, account_number,
        holder_name, holder_id_number, is_primary, notes)
     VALUES (?, ?, ?, 'Bancolombia', 'savings', '123-456789-00',
             'Carlos Andrés Pérez Restrepo', '79.456.123', 1,
             'Cuenta principal del propietario')
     ON DUPLICATE KEY UPDATE holder_name = VALUES(holder_name), is_primary = VALUES(is_primary)`,
    [BANK_ACCOUNT_ID, ORG_ID, PROPERTY_ID],
  );
  stages.push('bank_accounts');

  // 7. Amortización — 12 meses
  const monthsBetween = (a: string, b: string): number => {
    const aa = new Date(a);
    const bb = new Date(b);
    return Math.max(1,
      (bb.getFullYear() - aa.getFullYear()) * 12 + (bb.getMonth() - aa.getMonth()),
    );
  };
  const totalMonths = monthsBetween(PERIOD_START, PERIOD_END);
  const amortRows: any[] = [];
  for (let m = 1; m <= totalMonths; m++) {
    const start = new Date(PERIOD_START);
    start.setMonth(start.getMonth() + (m - 1));
    const periodStart = start.toISOString().slice(0, 10);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const periodEnd = end.toISOString().slice(0, 10);
    const subtotal = RENT_AMOUNT + ADMIN_FEE;
    amortRows.push({
      id: crypto.randomUUID(),
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
      totalLate: subtotal + Math.round(subtotal * 0.10),
      status: 'pending',
    });
  }
  // Wipe + reinsert (la amortización no es idempotente con constraint PK variable)
  await pool.query(`DELETE FROM amortization_rows WHERE contract_id = ?`, [CONTRACT_ID]);
  for (const r of amortRows) {
    await pool.query(
      `INSERT INTO amortization_rows
         (id, organization_id, property_id, contract_id,
          month_number, period_start, period_end, due_date,
          base_rent, base_admin, admin_adjustment, ipc_adjustment,
          subtotal, applied_late_fee_pct, late_fee_amount,
          total, total_early, total_mid, total_late, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [r.id, ORG_ID, r.propertyId, r.contractId, r.monthNumber, r.periodStart, r.periodEnd,
       r.dueDate, r.baseRent, r.baseAdmin, r.adminAdjustment, r.ipcAdjustment,
       r.subtotal, r.appliedLateFeePct, r.lateFeeAmount, r.total, r.totalEarly, r.totalMid, r.totalLate],
    );
  }
  stages.push(`amortization_rows(${amortRows.length})`);

  // 8. Descuento de ejemplo
  await pool.query(
    `INSERT INTO property_discounts
       (id, organization_id, property_id, type, description, amount, month_period, recorded_by)
     VALUES (?, ?, ?, 'public_services', 'Servicio de energía apartamento 501 (julio 2026)', 180000, '2026-07', 'pilot-seed')
     ON DUPLICATE KEY UPDATE amount = VALUES(amount), description = VALUES(description)`,
    [DISCOUNT_ID, ORG_ID, PROPERTY_ID],
  );
  stages.push('property_discounts');

  // 9. Profile (admin user)
  const passwordHash = await bcrypt.hash(PILOT_PASSWORD, 10);
  await pool.query(
    `INSERT INTO profiles
       (id, organization_id, display_name, email, role, photo_url, password_hash, created_by)
     VALUES (?, ?, 'Administrador Piloto', ?, 'admin', NULL, ?, 'pilot-seed')
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash)`,
    [PROFILE_ID, ORG_ID, PILOT_EMAIL, passwordHash],
  );
  stages.push('profiles');

  return {
    alreadySeeded: false,
    stages,
    admin: { id: PROFILE_ID, email: PILOT_EMAIL },
  };
}
