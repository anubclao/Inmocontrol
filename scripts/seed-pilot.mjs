/**
 * Seed de datos para el piloto del cliente.
 *
 * Inserta en MySQL:
 *   - 1 organización ("InmoControl Piloto")
 *   - 1 propiedad de ejemplo (Calle 93 #11-27)
 *   - 1 contrato activo con el inquilino
 *   - 1 BillingPolicy parametrizada
 *   - 1 cuenta bancaria (para consignar al propietario)
 *   - 12 filas de amortización (un año)
 *   - 1 tenant activo (María Fernanda Gómez)
 *   - 1 descuento de ejemplo (servicios públicos)
 *
 * Idempotente: si ya hay datos, los UPSERT. Seguro correr múltiples veces.
 *
 * Corrida:
 *   node scripts/seed-pilot.mjs
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
  waitForConnections: true,
  connectionLimit: 2,
});

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const PROPERTY_ID = '00000000-0000-0000-0000-000000000010';
const TENANT_ID = '00000000-0000-0000-0000-000000000020';
const CONTRACT_ID = '00000000-0000-0000-0000-000000000030';
const POLICY_ID = PROPERTY_ID; // billing_policies PK = property_id
const BANK_ACCOUNT_ID = '00000000-0000-0000-0000-000000000040';
const PROFILE_ID = '00000000-0000-0000-0000-000000000005';

// Credenciales del piloto. Por seguridad:
//   - Email: viene de PILOT_EMAIL env (default: admin@inmocontrol.local)
//   - Password: viene de PILOT_PASSWORD env (default: inmo2026! SOLO PARA PRIMER SEED)
//
// EN PRODUCCIÓN (Hostinger): setea estas env vars en el panel. NO uses el default.
// El default existe solo para que el seed funcione out-of-the-box la primera vez.
const PILOT_EMAIL = (process.env.PILOT_EMAIL ?? 'admin@inmocontrol.local').toLowerCase().trim();
const PILOT_PASSWORD = process.env.PILOT_PASSWORD ?? 'inmo2026!';

const NOW = new Date();
const PERIOD_START = '2026-01-15';
const PERIOD_END = '2027-01-14';
const RENT_AMOUNT = 1_696_037;
const ADMIN_FEE = 250_000;

async function main() {
  console.log('Seed piloto InmoControl — MySQL: ' + (process.env.DB_HOST ?? '127.0.0.1') + ':' + (process.env.DB_PORT ?? 3306) + '/' + (process.env.DB_NAME ?? 'inmocontrol'));
  console.log('');

  // 1. Organización
  await pool.query(
    `INSERT INTO organizations (id, name, nit, address, phone, website, created_by)
     VALUES (?, 'InmoControl Piloto', '900.123.456-7', 'Calle 100 #15-20, Bogotá D.C.', '+57 1 555 1234', 'https://inmocontrol.example', 'seed-pilot')
     ON DUPLICATE KEY UPDATE name = VALUES(name), nit = VALUES(nit)`,
    [ORG_ID]
  );
  console.log('✔ organizations');

  // 2. Propiedad
  await pool.query(
    `INSERT INTO properties
       (id, organization_id, address, chip, folio,
        owner_name, owner_id_number, owner_phone, owner_email,
        property_type, status, archived,
        mandato_pdf_url, mandato_signed_at,
        created_by)
     VALUES (?, ?, 'Calle 93 #11-27, Apto 501', 'AAA0123BMCY', '50N-1234567',
             'Carlos Andrés Pérez Restrepo', '79.456.123', '+57 310 456 7890', 'carlos.perez@example.com',
             'apartamento', 'Arrendado', 0,
             'https://example.com/mandato-firmado.pdf', NOW(),
             'seed-pilot')
     ON DUPLICATE KEY UPDATE address = VALUES(address), owner_name = VALUES(owner_name)`,
    [PROPERTY_ID, ORG_ID]
  );
  console.log('✔ properties');

  // 3. Tenant
  await pool.query(
    `INSERT INTO tenants (id, organization_id, property_id, name, document_id, email, phone,
                          rent, admin_fee, lease_start_date, status)
     VALUES (?, ?, ?, 'María Fernanda Gómez Salazar', '52.987.654',
             'maria.gomez@example.com', '+57 315 987 6543',
             ?, ?, ?, 'Activo')
     ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status)`,
    [TENANT_ID, ORG_ID, PROPERTY_ID, RENT_AMOUNT, ADMIN_FEE, PERIOD_START]
  );
  console.log('✔ tenants');

  // 4. Contrato
  await pool.query(
    `INSERT INTO contracts
       (id, organization_id, property_id, tenant_id,
        rent_amount, admin_fee, commission_pct, insurance_pct,
        start_date, end_date, status, renewal_strategy, inventory_end_required,
        contract_pdf_url, signed_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 8, 0, ?, ?, 'active', 'auto', 1,
             'https://example.com/contrato-firmado.pdf', NOW(), 'seed-pilot')
     ON DUPLICATE KEY UPDATE status = VALUES(status), start_date = VALUES(start_date)`,
    [CONTRACT_ID, ORG_ID, PROPERTY_ID, TENANT_ID, RENT_AMOUNT, ADMIN_FEE, PERIOD_START, PERIOD_END]
  );
  console.log('✔ contracts');

  // 5. BillingPolicy
  await pool.query(
    `INSERT INTO billing_policies
       (property_id, organization_id, rent_amount, admin_fee,
        late_fee_mid_pct, late_fee_late_pct, grace_day,
        apply_annual_ipc, expected_ipc_pct, apply_ipc_to_admin,
        allow_admin_changes, primary_bank_account_id, created_by)
     VALUES (?, ?, ?, ?, 5, 10, 10, 1, 5, 1, 1, ?, 'seed-pilot')
     ON DUPLICATE KEY UPDATE rent_amount = VALUES(rent_amount), admin_fee = VALUES(admin_fee)`,
    [POLICY_ID, ORG_ID, RENT_AMOUNT, ADMIN_FEE, BANK_ACCOUNT_ID]
  );
  console.log('✔ billing_policies');

  // 6. Bank Account (del propietario — donde se le gira)
  await pool.query(
    `INSERT INTO bank_accounts
       (id, organization_id, property_id, bank, account_type, account_number,
        holder_name, holder_id_number, is_primary, notes)
     VALUES (?, ?, ?, 'Bancolombia', 'savings', '123-456789-00',
             'Carlos Andrés Pérez Restrepo', '79.456.123', 1,
             'Cuenta principal del propietario — se deposita la liquidación mensual')
     ON DUPLICATE KEY UPDATE holder_name = VALUES(holder_name), is_primary = VALUES(is_primary)`,
    [BANK_ACCOUNT_ID, ORG_ID, PROPERTY_ID]
  );
  console.log('✔ bank_accounts');

  // 7. Amortización — 12 filas
  const monthsBetween = (startISO, endISO) => {
    const a = new Date(startISO);
    const b = new Date(endISO);
    return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
  };
  const totalMonths = monthsBetween(PERIOD_START, PERIOD_END);
  const amortRows = [];
  for (let m = 1; m <= totalMonths; m++) {
    const startDate = new Date(PERIOD_START);
    startDate.setMonth(startDate.getMonth() + (m - 1));
    const periodStart = startDate.toISOString().slice(0, 10);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    const periodEnd = endDate.toISOString().slice(0, 10);
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
      subtotal: RENT_AMOUNT + ADMIN_FEE,
      appliedLateFeePct: 0,
      lateFeeAmount: 0,
      paidOnDayOfMonth: null,
      total: RENT_AMOUNT + ADMIN_FEE,
      totalEarly: RENT_AMOUNT + ADMIN_FEE,
      totalMid: RENT_AMOUNT + ADMIN_FEE + Math.round((RENT_AMOUNT + ADMIN_FEE) * 0.05),
      totalLate: RENT_AMOUNT + ADMIN_FEE + Math.round((RENT_AMOUNT + ADMIN_FEE) * 0.10),
      status: 'pending',
    });
  }
  // Borrar amortización previa del contrato para evitar duplicados
  await pool.query(`DELETE FROM amortization_rows WHERE contract_id = ?`, [CONTRACT_ID]);
  for (const r of amortRows) {
    await pool.query(
      `INSERT INTO amortization_rows
         (id, organization_id, property_id, contract_id,
          month_number, period_start, period_end, due_date,
          base_rent, base_admin, admin_adjustment, ipc_adjustment,
          subtotal, applied_late_fee_pct, late_fee_amount,
          total, total_early, total_mid, total_late, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [r.id, ORG_ID, r.propertyId, r.contractId, r.monthNumber, r.periodStart, r.periodEnd,
       r.dueDate, r.baseRent, r.baseAdmin, r.adminAdjustment, r.ipcAdjustment,
       r.subtotal, r.appliedLateFeePct, r.lateFeeAmount, r.total, r.totalEarly, r.totalMid, r.totalLate]
    );
  }
  console.log(`✔ amortization_rows (${amortRows.length} meses)`);

  // 8. Descuento de ejemplo (servicios públicos de julio)
  const discountId = '00000000-0000-0000-0000-000000000050';
  await pool.query(
    `INSERT INTO property_discounts
       (id, organization_id, property_id, type, description, amount, month_period, recorded_by)
     VALUES (?, ?, ?, 'public_services', 'Servicio de energía apartamento 501 (julio 2026)', 180000, '2026-07', 'seed-pilot')
     ON DUPLICATE KEY UPDATE amount = VALUES(amount), description = VALUES(description)`,
    [discountId, ORG_ID, PROPERTY_ID]
  );
  console.log('✔ property_discounts (1 descuento de ejemplo)');

  // 0. Profile (usuario admin del piloto) — se crea DESPUÉS de la org (FK)
  const passwordHash = await bcrypt.hash(PILOT_PASSWORD, 10);
  await pool.query(
    `INSERT INTO profiles
       (id, organization_id, display_name, email, role, photo_url, password_hash, created_by)
     VALUES (?, ?, 'Administrador Piloto', ?, 'admin', NULL, ?, 'seed-pilot')
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash)`,
    [PROFILE_ID, ORG_ID, PILOT_EMAIL, passwordHash]
  );
  console.log(`✔ profiles (${PILOT_EMAIL})`);

  console.log('');
  console.log('═══ Seed completado ═══');
  console.log('');
  console.log('Credenciales del piloto:');
  console.log(`  Email:        ${PILOT_EMAIL}`);
  console.log(`  Password:     ${PILOT_PASSWORD}`);
  console.log('');
  console.log('  Organización: InmoControl Piloto (NIT 900.123.456-7)');
  console.log('  Propiedad:    Calle 93 #11-27, Apto 501 (Arrendado)');
  console.log('  Inquilino:    María Fernanda Gómez (CC 52.987.654)');
  console.log('  Propietario:  Carlos Andrés Pérez (CC 79.456.123)');
  console.log('  Contrato:     2026-01-15 → 2027-01-14, canon $1.696.037 + admin $250.000');
  console.log('');
  console.log('Próximos pasos:');
  console.log('  1. Levantar el server: npm run dev');
  console.log(`  2. Abrir http://localhost:3000 → login con ${PILOT_EMAIL} / ${PILOT_PASSWORD}`);
  console.log('  3. Billing → seleccionar la propiedad → ver amortización de 12 meses');
  console.log('  4. Enviar CC del mes 1 → debería aparecer el descuento de julio y la comisión');
  console.log('  5. Descargar PDF del estado de cuenta del propietario del mes 1');
  console.log('');
  console.log('⚠️  CAMBIA EL PASSWORD después del primer login (sprint 0).');

  await pool.end();
}

main().catch((err) => {
  console.error('[seed-pilot] FAILED:', err.message);
  console.error(err);
  process.exit(1);
});