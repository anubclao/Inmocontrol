/**
 * InmoControl — Generador de PDF de "Cuenta de Cobro"
 * ============================================================================
 * Replica el formato colombiano clásico de cuenta de cobro (modelo:
 * `Modelo-cuenta-de-cobro.pdf`) adaptado al flujo SaaS:
 *
 *   - "DEBE A": NOMBRE DEL INQUILINO  (persona natural que paga)
 *   - "INMOVIRTUAL S.A. E.S.P." (o nombre de agencia): quien cobra
 *   - OBJETO: Canon de arrendamiento + cuota de administración del
 *     inmueble [dirección], según Contrato de Arrendamiento No. [X]
 *   - PERÍODO: YYYY-MM (mes facturado)
 *   - Datos de consignación: cuenta bancaria de INMOVIRTUAL donde el
 *     inquilino debe pagar
 *
 * El PDF se imprime en A4 vertical (replica el modelo original).
 *
 * Uso:
 *   await generateCuentaCobroPDF({
 *     invoice, period, contract, property, owner, tenant,
 *     bankAccount, agency, totalAmount, dueDate, invoiceNumber,
 *   });
 */

import { jsPDF } from 'jspdf';
import { formatCurrency } from '../../utils/calculations';
import { numeroAPesosColombianosCaps } from '../../utils/numeroALetras';
import type { RentInvoice, Contract, PropertyCharge } from './types';
import type { BankAccount } from './types';
import type { Property } from '../../types';

/**
 * Etiqueta corta de cada ChargeType para el PDF de cuenta de cobro.
 * Es independiente del CHARGE_TYPE_LABELS de la UI porque el PDF debe
 * tener labels más formales.
 */
const CHARGE_TYPE_LABEL_PDF: Record<string, string> = {
  public_services: 'Servicios públicos',
  maintenance:     'Mantenimiento',
  repair:          'Reparación',
  tax:             'Impuestos',
  insurance:       'Póliza',
  commission:      'Comisión adicional',
  parking:         'Parqueo adicional',
  other:           'Otro concepto',
};

export interface CuentaCobroPdfInput {
  /** Invoice ya emitida (con sent_at + invoice_number). */
  invoice: RentInvoice;
  /** Datos del contrato (para el número de contrato en el OBJETO). */
  contract: Contract;
  /** Datos de la propiedad (dirección, propietario, etc.). */
  property: Property;
  /** Datos del propietario (firmante en nombre del propietario/INMOVIRTUAL). */
  owner: { name: string; idNumber?: string };
  /** Datos del inquilino (el DEUDOR de la cuenta de cobro). */
  tenant: { name: string; idNumber: string; email?: string; phone?: string };
  /** Cuenta bancaria destino donde el inquilino debe consignar. */
  bankAccount?: BankAccount | null;
  /** Nombre de la agencia que aparece en el encabezado (default: INMOVIRTUAL). */
  agency?: { name: string; nit: string };
  /** Ciudad que aparece en la línea "Ciudad, día-mes-año". Default: Bogotá. */
  city?: string;
  /** Total a cobrar (en número). Por defecto usa invoice.totalEarly (sin mora). */
  totalAmount?: number;
  /**
   * Cargos extra del mes que aplica al inquilino (chargedTo ∈ 'tenant'/'both'
   * AND appliesToInvoice=true). Si vienen, se imprimen en una mini-tabla
   * "Otros cargos del mes" antes de "La suma de". El subtotal de la CC
   * ya los incluye (el backend los suma en /invoices/send).
   */
  extraCharges?: PropertyCharge[];
}

/**
 * Genera el PDF de la cuenta de cobro y dispara la descarga en el browser.
 */
export async function generateCuentaCobroPDF(input: CuentaCobroPdfInput): Promise<void> {
  const doc = buildCuentaCobroDoc(input);
  const periodSafe = input.invoice.period.replace('-', '');
  const addressSafe = (input.property.address ?? 'inmueble').replace(/\s+/g, '_').slice(0, 30);
  const numberSafe = input.invoice.invoiceNumber ?? 'sin-numero';
  doc.save(`CuentaCobro_${numberSafe}_${periodSafe}_${addressSafe}.pdf`);
}

/**
 * Variante que devuelve el PDF como Blob — útil para previsualización,
 * Web Share API, o subirlo a Drive (futuro).
 */
export async function generateCuentaCobroPdfBlob(input: CuentaCobroPdfInput): Promise<Blob> {
  const doc = buildCuentaCobroDoc(input);
  return doc.output('blob');
}

function buildCuentaCobroDoc(input: CuentaCobroPdfInput): jsPDF {
  const {
    invoice,
    contract,
    property,
    owner,
    tenant,
    bankAccount,
    agency = { name: 'INMOVIRTUAL S.A. E.S.P.', nit: '800.175.746-9' },
    city = 'Bogotá D.C.',
    totalAmount,
    extraCharges,
  } = input;

  const total = totalAmount ?? invoice.subtotal; // ya incluye cargos al inquilino si los hay
  const baseRent = invoice.subtotal - (extraCharges?.reduce((s, c) => s + c.amount, 0) ?? 0);
  const totalLetters = numeroAPesosColombianosCaps(total);
  const totalFormatted = formatCurrency(total);
  const today = new Date();
  const fechaStr = `${city}, ${today.getDate()}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  // ─── Línea 1: Ciudad, fecha (izq) | CUENTA DE COBRO No. (der) ────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(fechaStr, margin, y);

  doc.setFont('helvetica', 'bold');
  doc.text('CUENTA DE COBRO No.', pageW - margin, y, { align: 'right' });
  // Línea para escribir el número (o lo escribe si viene)
  const invoiceNumStr = invoice.invoiceNumber ?? '';
  doc.setFont('helvetica', 'normal');
  // Si hay invoice_number, lo imprimimos a la derecha de la etiqueta
  if (invoiceNumStr) {
    doc.text(invoiceNumStr, pageW - margin, y + 5, { align: 'right' });
  } else {
    // Dibujar línea punteada para llenar a mano
    const lineX1 = pageW - margin - 50;
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(lineX1, y + 5, pageW - margin, y + 5);
    doc.setLineDashPattern([], 0);
  }
  y += 18;

  // ─── Encabezado empresa ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(agency.name, pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`NIT ${agency.nit}`, pageW / 2, y, { align: 'center' });
  y += 14;

  // ─── DEBE A ─────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('DEBE A:', pageW / 2, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(tenant.name || '—', pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`C.C. ${tenant.idNumber || '—'}`, pageW / 2, y, { align: 'center' });
  y += 14;

  // ─── "Otros cargos del mes" (si hay cargos al inquilino) ─────────────────
  // Esta sección muestra de dónde sale el subtotal cuando hay cargos
  // imputedos al inquilino (daños, parqueos, etc.). Aparece ANTES de
  // "La suma de" para que el inquilino entienda cómo se compone el total.
  if (extraCharges && extraCharges.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('OTROS CARGOS DEL MES', margin, y);
    y += 6;

    // Mini-tabla: Fecha | Concepto | Valor
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const colConcepto = margin;
    const colValorX = pageW - margin;

    for (const c of extraCharges) {
      // No rompemos línea; si el concepto es muy largo se trunca con ellipsis
      let desc = c.description;
      const maxConceptoWidth = pageW - 2 * margin - 50;
      if (doc.getTextWidth(desc) > maxConceptoWidth) {
        while (doc.getTextWidth(`${desc}…`) > maxConceptoWidth && desc.length > 0) {
          desc = desc.slice(0, -1);
        }
        desc += '…';
      }
      const labelText = `• ${CHARGE_TYPE_LABEL_PDF[c.type]}: ${desc}`;
      doc.text(labelText, colConcepto, y);
      doc.text(formatCurrency(c.amount), colValorX, y, { align: 'right' });
      y += 6;
    }
    y += 2;

    // Subtotal desglosado: canon+admin + cargos = total
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Canon + administración:', margin, y);
    doc.text(formatCurrency(baseRent), pageW - margin, y, { align: 'right' });
    y += 5;
    doc.text('Otros cargos del mes:', margin, y);
    const cargosTotal = extraCharges.reduce((s, c) => s + c.amount, 0);
    doc.text(formatCurrency(cargosTotal), pageW - margin, y, { align: 'right' });
    y += 8;

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y - 2, pageW - margin, y - 2);

    doc.setTextColor(15, 23, 42);
  }

  // ─── "La suma de:" ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const sumaLine1 = 'La suma de:';
  const valorEnLetras = totalLetters;
  const valorEnNumeros = totalFormatted;

  // Texto con bold inline es complejo con jsPDF, simplificamos: una línea con
  // "La suma de: VALOR EN LETRAS ($VALOR EN NÚMEROS)".
  doc.text(sumaLine1, margin, y);
  // Bold para valorEnLetras (continuación en la misma línea)
  doc.setFont('helvetica', 'bold');
  const sumaLabelWidth = doc.getTextWidth(`${sumaLine1} `);
  doc.text(valorEnLetras, margin + sumaLabelWidth, y);
  // Cerrar paréntesis y volver a normal
  doc.setFont('helvetica', 'normal');
  const letrasWidth = doc.getTextWidth(valorEnLetras);
  doc.text(` (${valorEnNumeros})`, margin + sumaLabelWidth + letrasWidth, y);
  y += 12;

  // ─── OBJETO ─────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const hasExtraCharges = !!extraCharges && extraCharges.length > 0;
  const objetoBase = `OBJETO: Canon de arrendamiento y cuota de administración del inmueble ${property.address ?? '—'}${
    property.chip ? ` (CHIP ${property.chip})` : ''
  }${hasExtraCharges ? ', más los cargos del mes descritos abajo' : ''}, de acuerdo a lo establecido en el Contrato de Arrendamiento No. ${contract.id.slice(0, 8).toUpperCase()}.`;
  const objetoTxt = objetoBase;
  const objetoLines = doc.splitTextToSize(objetoTxt, pageW - 2 * margin);
  doc.text(objetoLines, margin, y);
  y += objetoLines.length * 6 + 2;

  // ─── PERÍODO ────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PERÍODO:', margin, y);
  doc.setFont('helvetica', 'normal');
  const periodoLabelW = doc.getTextWidth('PERÍODO: ');
  doc.text(invoice.period, margin + periodoLabelW, y);
  y += 12;

  // ─── Datos de consignación ──────────────────────────────────────────────
  if (bankAccount) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const tipo = bankAccount.accountType === 'savings' ? 'Ahorros' : 'Corriente';
    const consignarTxt = `Favor consignar en la Cuenta de ${tipo}, No. ${bankAccount.accountNumber} del Banco ${bankAccount.bank}, de la cual es titular ${bankAccount.holderName} (C.C. ${bankAccount.holderIdNumber}).`;
    const consignarLines = doc.splitTextToSize(consignarTxt, pageW - 2 * margin);
    doc.text(consignarLines, margin, y);
    y += consignarLines.length * 5 + 4;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('[No hay cuenta bancaria configurada para esta propiedad]', margin, y);
    doc.setTextColor(15, 23, 42);
    y += 8;
  }

  // ─── Espacio para firma ─────────────────────────────────────────────────
  // Forzar al menos 40mm antes de la firma
  y = Math.max(y, 200);

  // Línea de firma
  const sigLineX1 = margin;
  const sigLineX2 = margin + 80;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(sigLineX1, y, sigLineX2, y);
  doc.line(sigLineX2 + 20, y, pageW - margin, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(owner.name || 'Firma autorizada', sigLineX1, y);
  doc.text(tenant.name || 'El deudor', sigLineX2 + 20, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`C.C. ${owner.idNumber ?? '—'}`, sigLineX1, y);
  doc.text(`C.C. ${tenant.idNumber ?? '—'}`, sigLineX2 + 20, y);

  return doc;
}