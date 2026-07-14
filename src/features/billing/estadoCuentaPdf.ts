/**
 * InmoControl — Generador de PDF "Estado de Cuenta" del propietario.
 * ============================================================================
 * Documento MENSUAL que INMOVIRTUAL le envía al propietario del inmueble,
 * informándole:
 *
 *   1. Lo que se RECAUDÓ del inquilino (canon + admin + mora, si hubo)
 *   2. Los GASTOS que asumió el propietario (servicios, mantenimiento, etc.)
 *   3. Las RETENCIONES que aplica la inmobiliaria (comisión, IVA, retefuente, GMF)
 *   4. El NETO calculado (teórico)
 *   5. Los PAGOS REALES que se le giraron
 *   6. El SALDO FINAL del mes (a favor del propietario, en contra, o en cero)
 *
 * Adaptación del modelo `modelo-estado-de-cuenta.pdf`:
 *   - Sección 5 (clasificación por antigüedad): OMITIDA. En InmoControl
 *     no manejamos "cartera" del propietario — siempre es a favor después
 *     de la transferencia. Si en el futuro hay casos de saldo negativo
 *     acumulado跨月, se agregará.
 *   - Sección 6 (instrucciones de pago): adaptada. Son los datos bancarios
 *     del PROPIETARIO (a dónde le transferimos), no del cliente.
 *   - Sección 7 (observaciones legales): se mantiene con copy adaptado.
 *
 * Impresión: A4 portrait, 8 secciones. Tablas con cabecera gris y filas
 * alternadas para legibilidad en impresión blanco/negro.
 *
 * Uso:
 *   await generateEstadoCuentaPDF({
 *     statement, contract, property, owner, tenant,
 *     bankAccount, agency, statementNumber,
 *   });
 */

import { jsPDF } from 'jspdf';
import { formatCurrency } from '../../utils/calculations';
import type {
  BankAccount, Contract, OwnerPayout, OwnerStatement,
} from './types';
import type { Property, PropertyOwner } from '../../types';
import { computeOwnerDistribution } from './ownerDistribution';

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  public_services: 'Servicios públicos',
  maintenance: 'Mantenimiento',
  tax: 'Impuestos',
  insurance: 'Póliza',
  commission: 'Comisión',
  other: 'Otro',
};

export interface EstadoCuentaPdfInput {
  /** Statement consolidado del endpoint /billing/owner-statement. */
  statement: OwnerStatement;
  /** Datos del contrato activo (para el # de contrato). */
  contract: Contract;
  /** Datos de la propiedad. */
  property: Property;
  /**
   * Propietario principal (receptor del estado de cuenta).
   * Para compatibilidad con propiedades legacy de 1 solo dueño, se sigue
   * pasando este campo. Si la propiedad tiene N copropietarios, también
   * hay que pasar `owners` para que el PDF incluya el desglose.
   */
  owner: { name: string; idNumber?: string; email?: string; phone?: string };
  /**
   * Migración 010+: lista de copropietarios. Si tiene N > 1, el PDF incluye
   * una sección de "Desglose por copropietario" con la distribución del
   * neto y las transferencias según el % de participación de cada uno.
   */
  owners?: PropertyOwner[];
  /** Inquilino (referencia, no destinatario). */
  tenant: { name: string; idNumber: string };
  /** Cuenta bancaria del PROPIETARIO (a donde se le transfiere). */
  bankAccount?: BankAccount | null;
  /** Agencia que emite (default: INMOVIRTUAL). */
  agency?: { name: string; nit: string; address?: string; phone?: string; email?: string };
  /** Consecutivo del estado de cuenta (default: EC-YYYYMM-NNN auto-generado). */
  statementNumber?: string;
  /** Nombre del agente que elaboró. */
  elaboratedBy?: string;
}

export async function generateEstadoCuentaPDF(input: EstadoCuentaPdfInput): Promise<void> {
  const doc = buildEstadoCuentaDoc(input);
  const periodSafe = input.statement.period.replace('-', '');
  const addressSafe = (input.property.address ?? 'inmueble').replace(/\s+/g, '_').slice(0, 30);
  const numberSafe = input.statementNumber ?? `EC-${periodSafe}`;
  doc.save(`EstadoCuenta_${numberSafe}_${periodSafe}_${addressSafe}.pdf`);
}

export async function generateEstadoCuentaPdfBlob(input: EstadoCuentaPdfInput): Promise<Blob> {
  const doc = buildEstadoCuentaDoc(input);
  return doc.output('blob');
}

function buildEstadoCuentaDoc(input: EstadoCuentaPdfInput): jsPDF {
  const {
    statement, contract, property, owner, tenant, bankAccount,
    agency = { name: 'INMOVIRTUAL S.A. E.S.P.', nit: '800.175.746-9' },
    statementNumber,
    elaboratedBy = 'Administrador',
    owners,
  } = input;

  // Migración 010+: si hay N copropietarios, calculamos el desglose del
  // neto y las transferencias por cada uno según su % de participación.
  const ownerDistribution = computeOwnerDistribution(
    statement.netCalculated,
    statement.totalPayouts,
    owners,
  );

  const numberStr = statementNumber ?? `EC-${statement.period.replace('-', '')}`;
  const today = new Date();
  const fechaStr = today.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fechaCorteStr = `${statement.period}-28`;
  const [yyyy, mm] = statement.period.split('-');
  const periodoStr = `${mm}/${yyyy}`;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  // ─── Header institucional ────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(agency.name, pageW / 2, 10, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`NIT ${agency.nit}${agency.address ? ` · ${agency.address}` : ''}`, pageW / 2, 16, { align: 'center' });
  y = 28;

  // ─── Título del documento ───────────────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('ESTADO DE CUENTA — PROPIETARIO', pageW / 2, y, { align: 'center' });
  y += 6;

  // ─── 1. INFORMACIÓN GENERAL ─────────────────────────────────────────
  y = drawSectionTitle(doc, '1. INFORMACIÓN GENERAL DEL ESTADO DE CUENTA', margin, y, pageW);
  y = drawKvTable(doc, [
    ['Fecha de emisión', fechaStr,          'Periodo liquidado', periodoStr],
    ['No. de estado de cuenta', numberStr,  'Fecha de corte',    fechaCorteStr],
    ['Empresa / Administración', agency.name, 'NIT', agency.nit],
  ], margin, y, pageW);
  y = drawKvTable(doc, [
    ['Dirección de la administración',
      `${agency.address ?? '—'}${agency.phone ? ` · Tel: ${agency.phone}` : ''}${agency.email ? ` · ${agency.email}` : ''}`,
      '', ''],
  ], margin, y + 2, pageW, [pageW - 2 * margin]);

  // ─── 2. DATOS DEL INMUEBLE Y DEL INQUILINO ──────────────────────────
  y = drawSectionTitle(doc, '2. DATOS DEL INMUEBLE Y DEL INQUILINO', margin, y + 4, pageW);
  y = drawKvTable(doc, [
    ['Nombre del propietario', owner.name,                                  'Documento / NIT', owner.idNumber ?? '—'],
    ['Nombre del arrendatario', tenant.name,                                'Documento / NIT', tenant.idNumber],
    ['Inmueble', property.propertyType ?? 'Apartamento',                    'No. interno',     property.chip ?? '—'],
    ['Dirección del inmueble', property.address ?? '—',                     'Contrato / ref.', contract.id.slice(0, 12).toUpperCase()],
    ['Estado del contrato', contract.status === 'active' ? 'Vigente' : (contract.status ?? '—'), '', ''],
  ], margin, y, pageW);

  // ─── 3. RESUMEN EJECUTIVO ────────────────────────────────────────────
  y = drawSectionTitle(doc, '3. RESUMEN EJECUTIVO DEL MES', margin, y + 4, pageW);

  // Calcular resumen
  const ingresos = statement.totalGrossIncome;
  const descuentos = statement.totalDiscounts;
  const retenciones = statement.settlement.totalRetentions;
  const netoTeorico = statement.netCalculated;
  const transferencias = statement.totalPayouts;
  const saldoFinal = statement.finalBalance;

  const W = (pageW - 2 * margin) / 4;
  // Fila 1: ingresos + descuentos
  drawKvBlock(doc, margin,         y, W, [
    ['Ingresos del mes', ingresos],
  ]);
  drawKvBlock(doc, margin + W,     y, W, [
    ['Gastos del mes', descuentos],
  ]);
  drawKvBlock(doc, margin + 2 * W, y, W, [
    ['Retenciones', retenciones],
  ]);
  drawKvBlock(doc, margin + 3 * W, y, W, [
    ['Neto teórico', netoTeorico],
  ]);
  y += 18;

  // Fila 2: transferencias + saldo
  drawKvBlock(doc, margin,         y, W, [
    ['Transferencias al propietario', transferencias],
  ], false);
  drawKvBlock(doc, margin + W,     y, W, [
    ['Saldo final del mes', saldoFinal],
  ], saldoFinal > 0 ? 'positive' : saldoFinal < 0 ? 'negative' : 'neutral');
  // Celdas vacías para alinear
  doc.setFillColor(248, 250, 252);
  doc.rect(margin + 2 * W, y, W, 14, 'F');
  doc.rect(margin + 3 * W, y, W, 14, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin + 2 * W, y, W, 14);
  doc.rect(margin + 3 * W, y, W, 14);
  y += 18;

  // ─── 3.5. DESGLOSE POR COPROPIETARIO (migración 010+) ────────────────
  // Solo si la propiedad tiene N > 1 propietarios. Si los % no están
  // configurados, se asigna 100% al primero y se muestra un aviso.
  if (ownerDistribution.items.length > 1) {
    if (pageH - y < 60) {
      doc.addPage();
      y = margin;
    }
    y = drawSectionTitle(doc, '3.5. DESGLOSE POR COPROPIETARIO', margin, y, pageW);

    // Nota si los % fueron asumidos/renormalizados
    if (ownerDistribution.assumedDistribution && ownerDistribution.note) {
      doc.setFillColor(254, 243, 199); // amarillo suave
      doc.rect(margin, y, pageW - 2 * margin, 8, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(146, 64, 14);
      doc.text(`⚠ ${ownerDistribution.note}`, margin + 2, y + 5);
      doc.setTextColor(15, 23, 42);
      y += 11;
    }

    // Cabecera de la tabla
    const disCols: Array<{ label: string; w: number; align?: 'left' | 'right' }> = [
      { label: 'Propietario',     w: 60, align: 'left' },
      { label: 'Cédula',          w: 28, align: 'left' },
      { label: '% Part.',         w: 18, align: 'right' },
      { label: 'Neto',            w: 28, align: 'right' },
      { label: 'Transferido',     w: 28, align: 'right' },
      { label: 'Saldo',           w: pageW - 2 * margin - 60 - 28 - 18 - 28 - 28, align: 'right' },
    ];
    drawDisHeader(doc, disCols, margin, y, pageW);
    y += 7;

    // Filas
    for (let i = 0; i < ownerDistribution.items.length; i++) {
      const d = ownerDistribution.items[i];
      if (pageH - y < 12) {
        doc.addPage();
        y = margin;
        drawDisHeader(doc, disCols, margin, y, pageW);
        y += 7;
      }
      const rowH = 7;
      // Fondo alternado
      doc.setFillColor(i % 2 === 0 ? 255 : 248, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
      doc.rect(margin, y, pageW - 2 * margin, rowH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      // Propietario
      const ownerName = doc.splitTextToSize(d.owner.name, disCols[0].w - 2)[0] ?? d.owner.name;
      doc.text(ownerName, margin + 1, y + 5);
      // Cédula
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(d.owner.idNumber ?? '—', margin + disCols[0].w + 1, y + 5);
      // %
      doc.setTextColor(15, 23, 42);
      doc.text(`${d.pct.toFixed(2)}%`, margin + disCols[0].w + disCols[1].w + disCols[2].w - 1, y + 5, { align: 'right' });
      // Neto
      doc.text(COP(d.netCalculated), margin + disCols[0].w + disCols[1].w + disCols[2].w + disCols[3].w - 1, y + 5, { align: 'right' });
      // Transferido
      doc.text(COP(d.totalPayouts), margin + disCols[0].w + disCols[1].w + disCols[2].w + disCols[3].w + disCols[4].w - 1, y + 5, { align: 'right' });
      // Saldo
      if (d.finalBalance > 0) doc.setTextColor(5, 150, 105);
      else if (d.finalBalance < 0) doc.setTextColor(220, 38, 38);
      doc.text(COP(d.finalBalance), pageW - margin - 1, y + 5, { align: 'right' });
      doc.setTextColor(15, 23, 42);
      // Borde inferior
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + rowH, pageW - margin, y + rowH);
      y += rowH;
    }
    y += 4;
  }

  // ─── 4. DETALLE DE MOVIMIENTOS DEL MES ───────────────────────────────
  y = drawSectionTitle(doc, '4. DETALLE DE MOVIMIENTOS DEL MES', margin, y, pageW);

  // Cabecera de la tabla
  const cols: Array<{ label: string; w: number; align?: 'left' | 'right' | 'center' }> = [
    { label: 'Fecha',         w: 18, align: 'left' },
    { label: 'Soporte',       w: 24, align: 'left' },
    { label: 'Concepto',      w: pageW - 2 * margin - 18 - 24 - 24 - 22 - 22 - 6, align: 'left' },
    { label: 'Cargo',         w: 22, align: 'right' },
    { label: 'Abono',         w: 22, align: 'right' },
    { label: 'Saldo',         w: 22, align: 'right' },
  ];
  // Recalcular ancho del concepto para que sume exacto
  const conceptoW = pageW - 2 * margin - cols.reduce((s, c) => s + c.w, 0);
  cols[2].w = conceptoW;

  // Header
  let x = margin;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageW - 2 * margin, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  cols.forEach((c) => {
    const tx = c.align === 'right' ? x + c.w - 2 : x + 2;
    doc.text(c.label, tx, y + 5, { align: c.align ?? 'left' });
    x += c.w;
  });
  y += 7;

  // Filas del detalle
  type Row = [date: string, doc: string, concept: string, cargo: number, abono: number, obs?: string];
  let saldoAcum = 0;
  const rows: Row[] = [];

  // Ingresos (cargos al inquilino)
  if (statement.grossRent > 0) {
    rows.push([`${statement.period}-05`, `CC-${statement.period.replace('-', '')}-001`, 'Canon de arrendamiento', statement.grossRent, 0, 'Cobrado al inquilino']);
  }
  if (statement.grossAdmin > 0) {
    rows.push([`${statement.period}-05`, `CC-${statement.period.replace('-', '')}-001`, 'Cuota de administración', statement.grossAdmin, 0, 'Cobrada al inquilino']);
  }
  if (statement.grossLateFee > 0) {
    rows.push([`${statement.period}-15`, 'Liquidación', 'Mora cobrada al inquilino', statement.grossLateFee, 0, 'Pago fuera del día de gracia']);
  }

  // Descuentos (gastos aplicados al propietario)
  for (const d of statement.discounts) {
    rows.push([
      d.recordedAt.slice(0, 10),
      d.id.slice(0, 8).toUpperCase(),
      `${DISCOUNT_TYPE_LABELS[d.type] ?? d.type}: ${d.description}`,
      d.amount,
      0,
      `Registrado por ${d.recordedBy}`,
    ]);
  }

  // Retenciones del motor
  if (statement.settlement.commission > 0) {
    rows.push([`${statement.period}-28`, 'Liquidación', `Comisión administración (${statement.settlement.commissionPct}%)`, statement.settlement.commission, 0, 'ET art. 468']);
  }
  if (statement.settlement.ivaOnCommission > 0) {
    rows.push([`${statement.period}-28`, 'Liquidación', 'IVA sobre comisión (19%)', statement.settlement.ivaOnCommission, 0, 'ET art. 468']);
  }
  if (statement.settlement.retefuente > 0) {
    rows.push([`${statement.period}-28`, 'Liquidación', 'Retención en la fuente (3.5%)', statement.settlement.retefuente, 0, 'ET art. 383']);
  }
  if (statement.settlement.gmf > 0) {
    rows.push([`${statement.period}-28`, 'Liquidación', 'GMF (4x1000)', statement.settlement.gmf, 0, 'ET art. 871']);
  }

  // Línea resumen del neto teórico (sin cargo/abono, solo saldo)
  // La agregamos como cargo (representa la "deuda" calculada de la inmobiliaria con el propietario)
  if (netoTeorico > 0) {
    rows.push([`${statement.period}-28`, 'Cálculo', 'Neto calculado a transferir', netoTeorico, 0, 'Proyectado por motor de liquidación']);
  }

  // Payouts reales (abonos)
  for (const p of statement.payouts) {
    rows.push([
      p.paidAt.slice(0, 10),
      p.reference ?? p.id.slice(0, 8).toUpperCase(),
      `Transferencia al propietario${p.notes ? ` — ${p.notes}` : ''}`,
      0,
      p.amount,
      `Girado por ${p.recordedBy}`,
    ]);
  }

  // Render filas + acumular saldo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cargo = r[3];
    const abono = r[4];
    saldoAcum += cargo - abono;

    // Página nueva si no entra
    if (y > pageH - margin - 20) {
      doc.addPage();
      y = margin;
    }

    // Zebra
    if (i % 2 === 0) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageW - 2 * margin, 6, 'F');
    }

    let cx = margin;
    doc.setTextColor(15, 23, 42);
    doc.text(r[0], cx + 1, y + 4); cx += cols[0].w;
    doc.text(r[1], cx + 1, y + 4); cx += cols[1].w;
    const conceptoStr = doc.splitTextToSize(r[2], cols[2].w - 2)[0] ?? '';
    doc.text(conceptoStr, cx + 1, y + 4); cx += cols[2].w;
    if (cargo > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(COP(cargo), cx + cols[3].w - 2, y + 4, { align: 'right' });
    }
    cx += cols[3].w;
    if (abono > 0) {
      doc.setTextColor(16, 185, 129);
      doc.text(COP(abono), cx + cols[4].w - 2, y + 4, { align: 'right' });
    }
    cx += cols[4].w;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(COP(saldoAcum), cx + cols[5].w - 2, y + 4, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    // Bordes verticales suaves
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, pageW - 2 * margin, 6);

    y += 6;
  }

  // Fila totales
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageW - 2 * margin, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  let tx2 = margin;
  doc.text('TOTALES', tx2 + 2, y + 5); tx2 += cols[0].w + cols[1].w + cols[2].w;
  const totalCargo = rows.reduce((s, r) => s + r[3], 0);
  const totalAbono = rows.reduce((s, r) => s + r[4], 0);
  doc.setTextColor(220, 38, 38);
  doc.text(COP(totalCargo), tx2 + cols[3].w - 2, y + 5, { align: 'right' });
  tx2 += cols[3].w;
  doc.setTextColor(16, 185, 129);
  doc.text(COP(totalAbono), tx2 + cols[4].w - 2, y + 5, { align: 'right' });
  tx2 += cols[4].w;
  doc.setTextColor(15, 23, 42);
  doc.text(COP(saldoAcum), tx2 + cols[5].w - 2, y + 5, { align: 'right' });
  y += 12;

  // ─── 6. INSTRUCCIONES DE PAGO (datos del propietario) ────────────────
  if (y > pageH - 50) { doc.addPage(); y = margin; }
  y = drawSectionTitle(doc, '6. INSTRUCCIONES DE PAGO (DATOS DEL PROPIETARIO)', margin, y, pageW);
  if (bankAccount) {
    y = drawKvTable(doc, [
      ['Banco',           bankAccount.bank,                                              'Tipo de cuenta', bankAccount.accountType === 'savings' ? 'Ahorros' : 'Corriente'],
      ['Número de cuenta', bankAccount.accountNumber,                                     'Titular',        bankAccount.holderName],
      ['NIT / Documento titular', bankAccount.holderIdNumber,                            'Referencia de pago', `${property.address ?? ''} ${statement.period}`.slice(0, 60)],
    ], margin, y, pageW);
    if (owner.email || owner.phone) {
      y = drawKvTable(doc, [
        ['Correo para envío de soporte',
          `${owner.email ?? ''}${owner.phone ? `  ·  ${owner.phone}` : ''}`,
          '', ''],
      ], margin, y + 1, pageW, [pageW - 2 * margin]);
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No hay cuenta bancaria configurada para este propietario en BillingPolicy.bankAccounts.', margin, y);
    y += 6;
  }

  // ─── 7. OBSERVACIONES ADMINISTRATIVAS Y LEGALES ──────────────────────
  if (y > pageH - 60) { doc.addPage(); y = margin; }
  y = drawSectionTitle(doc, '7. OBSERVACIONES ADMINISTRATIVAS Y LEGALES', margin, y + 2, pageW);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  const legalTexts = [
    'Este estado de cuenta se emite con fines de control administrativo, contable y de conciliación entre INMOVIRTUAL y el propietario del inmueble. El propietario deberá revisar la información detallada y reportar cualquier inconsistencia dentro de los cinco (5) días hábiles siguientes a su recepción.',
    'En caso de no recibir observaciones dentro de dicho término, INMOVIRTUAL podrá entender aceptado el saldo informado para efectos de conciliación interna y seguimiento de pagos.',
    'Las transferencias se realizan únicamente a las cuentas bancarias registradas en la política de billing. Todo soporte de pago queda archivado en el sistema (referencia + fecha + banco).',
    `Este documento refleja dos componentes: (a) el NETO CALCULADO según el motor de liquidación mensual (incluye canon + admin, menos comisión, IVA, retefuente y GMF), y (b) las TRANSFERENCIAS REALES registradas por el agente durante el periodo. El SALDO FINAL es la diferencia entre ambos.`,
  ];
  for (const t of legalTexts) {
    const lines = doc.splitTextToSize(t, pageW - 2 * margin);
    doc.text(lines, margin, y + 4);
    y += lines.length * 3.5 + 2;
  }

  // ─── 8. FIRMAS ───────────────────────────────────────────────────────
  if (y > pageH - 50) { doc.addPage(); y = margin; }
  y += 6;
  y = drawSectionTitle(doc, '8. FIRMAS', margin, y, pageW);
  const sigW = (pageW - 2 * margin - 16) / 3;
  drawSignatureBlock(doc, margin,                 y, sigW, 'Elaboró',    elaboratedBy);
  drawSignatureBlock(doc, margin + sigW + 8,      y, sigW, 'Aprobó',     'Gerencia');
  drawSignatureBlock(doc, margin + 2 * sigW + 16, y, sigW, 'Recibido por', owner.name);
  y += 30;

  // ─── Pie de página ───────────────────────────────────────────────────
  const totalPages = (doc as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${agency.name} · Estado de cuenta ${numberStr} · ${statement.period} · Página ${i} de ${totalPages}`,
      pageW / 2, pageH - 6, { align: 'center' }
    );
  }

  return doc;
}

// ─── Helpers de layout ────────────────────────────────────────────────

function drawSectionTitle(doc: jsPDF, title: string, x: number, y: number, pageW: number): number {
  doc.setFillColor(15, 23, 42);
  doc.rect(x, y, pageW - 2 * x, 6.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(title, x + 2, y + 4.5);
  doc.setTextColor(15, 23, 42);
  return y + 8.5;
}

/**
 * Tabla key-value de 2 columnas (4 columnas reales: label, value, label, value).
 * Cada fila tiene 4 celdas.
 *
 * Si `widths` viene con un solo elemento, se trata de una fila full-width
 * (1 sola celda, label + value en la misma línea).
 */
function drawKvTable(
  doc: jsPDF,
  rows: Array<[string, string, string, string]>,
  x: number,
  y: number,
  pageW: number,
  widths?: number[]
): number {
  const totalW = pageW - 2 * x;
  const w = (widths && widths.length === 4)
    ? widths
    : [totalW * 0.22, totalW * 0.28, totalW * 0.22, totalW * 0.28];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setFillColor(241, 245, 249);

  for (const r of rows) {
    // Skip filas vacías
    if (!r[0] && !r[1] && !r[2] && !r[3]) continue;

    // Modo full-width: una sola celda label+value
    if (widths && widths.length === 1) {
      const fw = widths[0];
      // Label
      if (r[0]) {
        doc.setFillColor(241, 245, 249);
        doc.rect(x, y, fw * 0.22, 5.5, 'F');
        doc.setTextColor(71, 85, 105);
        doc.text(r[0].toUpperCase(), x + 1.5, y + 3.8);
      }
      // Value
      if (r[1]) {
        const vx = x + fw * 0.22;
        const vw = fw - fw * 0.22;
        doc.setFillColor(255, 255, 255);
        doc.rect(vx, y, vw, 5.5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        const v1Lines = doc.splitTextToSize(r[1], vw - 3);
        doc.text(v1Lines[0] ?? '', vx + 1.5, y + 3.8);
        doc.setFont('helvetica', 'bold');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(x, y, fw, 5.5);
      y += 5.5;
      continue;
    }

    // Modo 4 columnas
    let cx = x;
    if (r[0]) {
      doc.setFillColor(241, 245, 249);
      doc.rect(cx, y, w[0], 5.5, 'F');
      doc.setTextColor(71, 85, 105);
      doc.text(r[0].toUpperCase(), cx + 1.5, y + 3.8);
    }
    cx += w[0];
    if (r[1]) {
      doc.setFillColor(255, 255, 255);
      doc.rect(cx, y, w[1], 5.5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const v1Lines = doc.splitTextToSize(r[1], w[1] - 3);
      doc.text(v1Lines[0] ?? '', cx + 1.5, y + 3.8);
      doc.setFont('helvetica', 'bold');
    }
    cx += w[1];
    if (r[2]) {
      doc.setFillColor(241, 245, 249);
      doc.rect(cx, y, w[2], 5.5, 'F');
      doc.setTextColor(71, 85, 105);
      doc.text(r[2].toUpperCase(), cx + 1.5, y + 3.8);
    }
    cx += w[2];
    if (r[3]) {
      doc.setFillColor(255, 255, 255);
      doc.rect(cx, y, w[3], 5.5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const v3Lines = doc.splitTextToSize(r[3], w[3] - 3);
      doc.text(v3Lines[0] ?? '', cx + 1.5, y + 3.8);
      doc.setFont('helvetica', 'bold');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(x, y, totalW, 5.5);
    y += 5.5;
  }
  return y;
}

/**
 * Bloque cuadrado paraResumen ejecutivo (label + valor COP grande).
 */
function drawKvBlock(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  rows: Array<[string, number]>,
  highlight: 'positive' | 'negative' | 'neutral' | false = false
): void {
  const h = 14;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, w, h, 'FD');

  if (highlight === 'positive') {
    doc.setFillColor(236, 253, 245);
    doc.rect(x, y, w, h, 'F');
  } else if (highlight === 'negative') {
    doc.setFillColor(254, 226, 226);
    doc.rect(x, y, w, h, 'F');
  } else if (highlight === 'neutral') {
    doc.setFillColor(239, 246, 255);
    doc.rect(x, y, w, h, 'F');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(rows[0][0].toUpperCase(), x + 2, y + 4);

  doc.setFontSize(11);
  if (highlight === 'positive') doc.setTextColor(5, 150, 105);
  else if (highlight === 'negative') doc.setTextColor(220, 38, 38);
  else doc.setTextColor(15, 23, 42);
  doc.text(COP(rows[0][1]), x + 2, y + 10);
}

function drawSignatureBlock(
  doc: jsPDF, x: number, y: number, w: number, role: string, name: string
): void {
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.2);
  doc.line(x, y + 12, x + w, y + 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(role.toUpperCase(), x, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(name, x, y + 18);
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Fecha: ____/____/________', x, y + 23);
}
/** Dibuja la cabecera de la tabla de desglose por copropietario.
 *  Separada de drawSectionTitle porque usa un estilo m�s compacto
 *  (gris claro, no banda azul) � se parece m�s a una tabla normal. */
function drawDisHeader(
  doc: jsPDF,
  cols: Array<{ label: string; w: number; align?: 'left' | 'right' }>,
  x: number,
  y: number,
  pageW: number,
): void {
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  doc.setFillColor(241, 245, 249);
  doc.rect(x, y, totalW, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  let cx = x;
  for (const c of cols) {
    if (c.align === 'right') {
      doc.text(c.label.toUpperCase(), cx + c.w - 1, y + 4.5, { align: 'right' });
    } else {
      doc.text(c.label.toUpperCase(), cx + 1, y + 4.5);
    }
    cx += c.w;
  }
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(226, 232, 240);
  doc.line(x, y + 6.5, x + totalW, y + 6.5);
}