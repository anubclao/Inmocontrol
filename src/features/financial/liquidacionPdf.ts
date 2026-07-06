import { jsPDF } from 'jspdf';
import { formatCurrency, UVT_2026, RETEFUENTE_THRESHOLD_UVT, type SettlementInputs, type SettlementResult } from '../../utils/calculations';

/**
 * Genera el PDF de Liquidación Mensual — documento legal que respalda
 * la transferencia al propietario, con el desglose de retenciones
 * aplicables según normatividad colombiana.
 *
 * Se imprime en A4 horizontal para que la tabla de cálculo respire.
 */
export async function generateLiquidacionPDF(
  inputs: SettlementInputs,
  result: SettlementResult,
  property: { address: string; owner: string; ownerIdNumber?: string; tenantName?: string; tenantIdNumber?: string },
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // ─── Header ───────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('LIQUIDACIÓN MENSUAL DE ARRENDAMIENTO', pageW / 2, 13, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periodo: ${result.period} · Generado: ${new Date().toLocaleString('es-CO')}`, pageW / 2, 21, { align: 'center' });
  y = 36;

  // ─── Datos del inmueble ───────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  const labelBold = (l: string) => { doc.setFont('helvetica', 'bold'); doc.text(l, margin, y); };
  const labelVal = (l: string) => { doc.setFont('helvetica', 'normal'); doc.text(l, margin + 30, y); };
  const nextLine = () => { y += 5; };

  labelBold('Inmueble:'); labelVal(property.address); nextLine();
  labelBold('Propietario:'); labelVal(`${property.owner}${property.ownerIdNumber ? ` · CC: ${property.ownerIdNumber}` : ''}`); nextLine();
  labelBold('Arrendatario:'); labelVal(`${property.tenantName ?? 'N/A'}${property.tenantIdNumber ? ` · CC: ${property.tenantIdNumber}` : ''}`); nextLine();
  labelBold('Tipo contribuyente:'); labelVal(inputs.ownerTaxType === 'juridica' ? 'Persona jurídica' : 'Persona natural'); nextLine();
  y += 4;

  // ─── Tabla de cálculo ─────────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageW - 2 * margin, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('CONCEPTO', margin + 4, y + 5.5);
  doc.text('DETALLE / BASE', pageW / 2, y + 5.5, { align: 'center' });
  doc.text('REF. LEGAL', pageW - margin - 35, y + 5.5);
  doc.text('VALOR', pageW - margin - 4, y + 5.5, { align: 'right' });
  y += 12;

  doc.setFont('helvetica', 'normal');

  // Ingresos
  drawRow(doc, pageW, margin, y, '+', 'Canon de arrendamiento', '', '', inputs.canon, 'ingreso');
  y += 7;
  if (inputs.otrosIngresos > 0) {
    drawRow(doc, pageW, margin, y, '+', 'Otros ingresos', '', '', inputs.otrosIngresos, 'ingreso');
    y += 7;
  }
  if (inputs.administracionPH > 0) {
    drawRow(doc, pageW, margin, y, '+', 'Administración PH (reembolso)', 'Pasa íntegra al propietario', 'Ley 675/2001 art. 30', inputs.administracionPH, 'ingreso');
    y += 7;
  }

  // Subtotal ingresos
  drawSeparator(doc, margin, y, pageW);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text('Total ingresos brutos', margin + 4, y + 3);
  doc.text(formatCurrency(result.totales.ingresosBrutos + inputs.administracionPH), pageW - margin - 4, y + 3, { align: 'right' });
  y += 8;
  doc.setFont('helvetica', 'normal');

  // Descuentos
  drawRow(doc, pageW, margin, y, '−', `Comisión administración (${inputs.comisionPct}%)`, `${inputs.comisionPct}% × ${formatCurrency(inputs.canon)}`, '', result.trace.comision, 'descuento');
  y += 7;
  drawRow(doc, pageW, margin, y, '−', 'IVA sobre comisión (19%)', `Base: ${formatCurrency(result.trace.comision)}`, 'ET art. 468', result.trace.ivaSobreComision, 'impuesto');
  y += 7;
  if (result.trace.seguro > 0) {
    drawRow(doc, pageW, margin, y, '−', `Seguro (${inputs.seguroPct}%)`, `${inputs.seguroPct}% × ${formatCurrency(inputs.canon)}`, '', result.trace.seguro, 'descuento');
    y += 7;
  }
  if (result.trace.retefuenteApplied) {
    const refMsg = inputs.ownerTaxType === 'juridica'
      ? `11% s/ canon (jurídica)`
      : `3.5% s/ canon (>${RETEFUENTE_THRESHOLD_UVT} UVT)`;
    drawRow(doc, pageW, margin, y, '−', 'Retención en la fuente', refMsg, 'ET art. 383', result.trace.retefuente, 'impuesto');
    y += 7;
  } else {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageW - 2 * margin, 6, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('  Sin retención en la fuente: canon no supera 27 UVT (' + formatCurrency(RETEFUENTE_THRESHOLD_UVT * UVT_2026) + ')', margin + 4, y + 4);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    y += 7;
  }
  drawRow(doc, pageW, margin, y, '−', 'GMF (4x1000)', `Base: ${formatCurrency(result.trace.baseGmf)}`, 'ET art. 871', result.trace.gmf, 'descuento');
  y += 7;
  if (result.totales.gastosOperativos > 0) {
    drawRow(doc, pageW, margin, y, '−', 'Gastos operativos', 'Reparaciones, servicios, predial…', '', result.totales.gastosOperativos, 'descuento');
    y += 7;
  }

  // Total descuentos
  drawSeparator(doc, margin, y, pageW);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total descuentos: ${formatCurrency(result.totales.descuentosFijos + result.trace.gmf + result.totales.gastosOperativos)}`, margin + 4, y + 3);
  y += 10;
  doc.setFont('helvetica', 'normal');

  // ─── Gran total ───────────────────────────────────────────
  doc.setFillColor(16, 185, 129);
  doc.rect(margin, y, pageW - 2 * margin, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('SALDO A TRANSFERIR AL PROPIETARIO', margin + 4, y + 9);
  doc.setFontSize(14);
  doc.text(formatCurrency(result.totales.saldoTransferir), pageW - margin - 4, y + 9, { align: 'right' });
  y += 22;

  // ─── Firmas ───────────────────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  const colW = (pageW - 2 * margin - 20) / 2;
  drawSignatureLine(doc, margin, y, colW, 'Representante legal / Administrador');
  drawSignatureLine(doc, margin + colW + 20, y, colW, `Propietario: ${property.owner}`);
  y += 25;

  // ─── Footer legal ─────────────────────────────────────────
  const totalPages = (doc as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `InmoControl · Liquidación generada el ${new Date().toLocaleString('es-CO')} · Página ${i} de ${totalPages}`,
      pageW / 2, pageH - 6, { align: 'center' }
    );
  }

  const filename = `Liquidacion_${result.period}_${property.address.replace(/\s+/g, '_').slice(0, 40)}.pdf`;
  doc.save(filename);
}

function drawRow(
  doc: jsPDF,
  pageW: number,
  margin: number,
  y: number,
  sign: string,
  label: string,
  detail: string,
  legalRef: string,
  amount: number,
  tone: 'ingreso' | 'descuento' | 'impuesto',
) {
  const color = tone === 'ingreso' ? [16, 185, 129] : tone === 'impuesto' ? [185, 28, 28] : [220, 38, 38];
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(sign, margin + 3, y + 3);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(label, margin + 10, y + 3);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(detail, pageW / 2, y + 3, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(120, 130, 145);
  doc.text(legalRef, pageW - margin - 35, y + 3);
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(amount), pageW - margin - 4, y + 3, { align: 'right' });
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
}

function drawSeparator(doc: jsPDF, x: number, y: number, pageW: number) {
  doc.setDrawColor(226, 232, 240);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x, y + 2, pageW - x, y + 2);
  doc.setLineDashPattern([], 0);
}

function drawSignatureLine(doc: jsPDF, x: number, y: number, w: number, label: string) {
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(x, y + 14, x + w, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), x, y + 19);
  doc.setFont('helvetica', 'normal');
  doc.text('Firma', x, y + 24);
  doc.text(`Fecha: ____/____/________`, x + w - 50, y + 24);
}
