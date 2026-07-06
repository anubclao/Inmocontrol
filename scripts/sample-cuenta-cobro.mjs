/**
 * Genera un PDF de muestra del formato de cuenta de cobro con datos ficticios.
 * Útil para preview sin tener que levantar todo el sistema.
 *
 * Ejecutar con:  node scripts/sample-cuenta-cobro.mjs
 */
import { generateCuentaCobroPdfBlob } from '../src/features/billing/cuentaCobroPdf.ts';
import fs from 'fs';
import path from 'path';

const blob = await generateCuentaCobroPdfBlob({
  invoice: {
    id: 'inv-sample-001',
    invoiceNumber: 'CC-202607-001',
    propertyId: 'prop-sample-1',
    contractId: 'ct-sample-2026-001',
    period: '2026-07',
    dueDate: '2026-07-10',
    subtotal: 1_946_037,
    totalEarly: 1_946_037,
    totalMid: 2_043_339,
    totalLate: 2_140_641,
    status: 'pending',
    sentAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
  },
  owner: { name: 'Carlos Andrés Pérez Restrepo', idNumber: '79.456.123' },
  tenant: {
    name: 'María Fernanda Gómez Salazar',
    idNumber: '52.987.654',
    email: 'maria.gomez@example.com',
    phone: '+57 315 987 6543',
  },
  bankAccount: {
    id: 'ba-1',
    bank: 'Bancolombia',
    accountType: 'savings',
    accountNumber: '123-456789-00',
    holderName: 'INMOVIRTUAL S.A. E.S.P.',
    holderIdNumber: '800.175.746-9',
    isPrimary: true,
  },
  agency: { name: 'INMOVIRTUAL S.A. E.S.P.', nit: '800.175.746-9' },
  city: 'Bogotá D.C.',
  totalAmount: 1_946_037,
});

const out = path.resolve('D:/desarrollos/Inmocontrol/muestra-cuenta-cobro.pdf');
const buf = Buffer.from(await blob.arrayBuffer());
fs.writeFileSync(out, buf);
console.log(`[muestra] PDF escrito en ${out} (${buf.length} bytes)`);