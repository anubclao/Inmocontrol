/**
 * Genera un PDF de muestra del formato "Estado de Cuenta" con datos ficticios.
 * Ejecutar con: npx tsx scripts/sample-estado-cuenta.mjs
 */
import { generateEstadoCuentaPdfBlob } from '../src/features/billing/estadoCuentaPdf.ts';
import fs from 'fs';
import path from 'path';

const blob = await generateEstadoCuentaPdfBlob({
  statement: {
    propertyId: 'prop-sample-1',
    period: '2026-07',
    grossRent: 1_696_037,
    grossAdmin: 250_000,
    grossLateFee: 84_802,            // 5% de mora
    totalGrossIncome: 2_030_839,
    totalDiscounts: 320_000,
    discounts: [
      {
        id: 'disc-001',
        propertyId: 'prop-sample-1',
        type: 'public_services',
        description: 'Servicio de energía apartamento 501 (julio)',
        amount: 180_000,
        monthPeriod: '2026-07',
        recordedAt: '2026-07-08T10:00:00Z',
        recordedBy: 'Ana Pérez',
      },
      {
        id: 'disc-002',
        propertyId: 'prop-sample-1',
        type: 'maintenance',
        description: 'Reparación fuga lavamanos baño principal',
        amount: 140_000,
        monthPeriod: '2026-07',
        recordedAt: '2026-07-12T15:00:00Z',
        recordedBy: 'Ana Pérez',
      },
    ],
    settlement: {
      commission: 135_683,            // 8% del canon
      ivaOnCommission: 25_780,         // 19% sobre la comisión
      retefuente: 59_361,              // 3.5% sobre el canon (>27 UVT)
      gmf: 5_500,                      // 4x1000 sobre base
      totalRetentions: 226_324,
      commissionPct: 8,
    },
    netCalculated: 1_484_515,
    totalPayouts: 1_484_515,
    payouts: [
      {
        id: 'payout-001',
        propertyId: 'prop-sample-1',
        period: '2026-07',
        amount: 1_484_515,
        paidAt: '2026-07-30T09:30:00Z',
        reference: 'TRF-2026-0789123',
        notes: 'Transferencia mensual — Bancolombia ahorros',
        recordedBy: 'Ana Pérez',
        recordedAt: '2026-07-30T09:35:00Z',
      },
    ],
    finalBalance: 0,
  },
  contract: {
    id: 'ct-sample-2026-001',
    propertyId: 'prop-sample-1',
    tenantId: 't-sample-1',
    rentAmount: 1_696_037,
    adminFee: 250_000,
    commissionPercentage: 8,
    insurancePercentage: 0,
    startDate: '2026-01-15',
    endDate: '2027-01-14',
    renewalStrategy: 'auto',
    inventoryEndRequired: true,
    status: 'active',
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    signedAt: '2026-01-15T10:00:00Z',
  },
  property: {
    id: 'prop-sample-1',
    address: 'Calle 93 #11-27, Apto 501',
    chip: 'AAA0123BMCY',
    folio: '50N-1234567',
    ownerId: 'o-sample-1',
    status: 'Arrendado',
    ownerName: 'Carlos Andrés Pérez Restrepo',
    ownerIdNumber: '79.456.123',
    ownerPhone: '+57 310 456 7890',
    ownerEmail: 'carlos.perez@example.com',
    propertyType: 'Apartamento',
  },
  owner: { name: 'Carlos Andrés Pérez Restrepo', idNumber: '79.456.123', email: 'carlos.perez@example.com', phone: '+57 310 456 7890' },
  tenant: { name: 'María Fernanda Gómez Salazar', idNumber: '52.987.654' },
  bankAccount: {
    id: 'ba-1',
    bank: 'Bancolombia',
    accountType: 'savings',
    accountNumber: '123-456789-00',
    holderName: 'Carlos Andrés Pérez Restrepo',
    holderIdNumber: '79.456.123',
    isPrimary: true,
  },
  agency: {
    name: 'INMOVIRTUAL S.A. E.S.P.',
    nit: '800.175.746-9',
    address: 'Calle 100 #15-20, Bogotá D.C.',
    phone: '+57 1 555 1234',
    email: 'admin@inmocontrol.co',
  },
  statementNumber: 'EC-202607',
  elaboratedBy: 'Ana Pérez',
});

const out = path.resolve('D:/desarrollos/Inmocontrol/muestra-estado-cuenta.pdf');
const buf = Buffer.from(await blob.arrayBuffer());
fs.writeFileSync(out, buf);
console.log(`[muestra] PDF escrito en ${out} (${buf.length} bytes)`);