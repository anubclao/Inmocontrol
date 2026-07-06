import { jsPDF } from 'jspdf';

interface MandatoPdfData {
  property: { address: string; owner: string; chip?: string; ownerIdNumber?: string };
  owner: { name: string; documentId: string; phone?: string; email?: string };
  agency: { name: string; nit?: string; representative: string; representativeIdNumber?: string; address?: string };
  /** Comisión pactada (ej: 8 = 8%) */
  commissionPct: number;
  /** Fecha de inicio del mandato */
  startDate: string;
  /** Vigencia en meses (default 12) */
  durationMonths?: number;
  /** Notas opcionales */
  notes?: string;
}

/**
 * Genera el PDF del Contrato de Mandato Comercial con Representación.
 * Se celebra entre el PROPIETARIO (Mandante) y la INMOBILIARIA (Mandatario)
 * para que la inmobiliaria gestione el arriendo del inmueble.
 *
 * Modelo basado en el PDF de referencia (Código de Comercio Arts. 1262-1278).
 */
export async function generateMandatoPdf(data: MandatoPdfData): Promise<void> {
  const blob = await generateMandatoPdfBlob(data);
  const filename = `Mandato_${data.property.address.replace(/\s+/g, '_').slice(0, 40)}_${Date.now()}.pdf`;
  triggerDownload(blob, filename);
}

export async function generateMandatoPdfBlob(data: MandatoPdfData): Promise<Blob> {
  const { property, owner, agency, commissionPct, startDate, durationMonths = 12, notes } = data;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // ─── Header ───────────────────────────────────────────────
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTRATO DE MANDATO COMERCIAL CON REPRESENTACIÓN', pageW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.text('Regulado por el Código de Comercio de Colombia (Artículos 1262 a 1278)', pageW / 2, y, { align: 'center' });
  y += 12;

  // ─── Nota legal ───────────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageW - 2 * margin, 18, 'F');
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const nota = 'Nota de orientación legal: El contrato de mandato es el acuerdo mediante el cual una parte (Mandante) encarga a otra (Mandatario) la gestión de uno o más negocios comerciales o actos jurídicos por su cuenta y riesgo. Puede incluir o no facultad de representación explícita.';
  const notaLines = doc.splitTextToSize(nota, pageW - 2 * margin - 8);
  doc.text(notaLines, margin + 4, y);
  y += notaLines.length * 3.5 + 6;

  // ─── Identificación de las partes ─────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Entre los suscritos a saber:', margin, y); y += 6;

  // MANDANTE
  doc.setFont('helvetica', 'bold');
  doc.text('EL MANDANTE:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${owner.name}, mayor de edad, identificado con la cédula de ciudadanía No. ${owner.documentId}${owner.phone ? `, teléfono ${owner.phone}` : ''}${owner.email ? `, correo ${owner.email}` : ''}.`, margin + 28, y, { maxWidth: pageW - 2 * margin - 28 });
  y += 12;

  // MANDATARIO
  doc.setFont('helvetica', 'bold');
  doc.text('EL MANDATARIO:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${agency.representative}, mayor de edad, identificado con la cédula de ciudadanía No. ${agency.representativeIdNumber || '___'}, domiciliado en ${agency.address || 'la ciudad de ' + (property.address.split(',').pop()?.trim() || 'Bogotá D.C.')}, quien actúa en nombre y representación de ${agency.name}${agency.nit ? ` (NIT ${agency.nit})` : ''}.`, margin + 32, y, { maxWidth: pageW - 2 * margin - 32 });
  y += 16;

  doc.text('Han acordado celebrar el presente contrato de mandato comercial contenido en las siguientes cláusulas:', margin, y);
  y += 8;

  // ─── Cláusulas ───────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Cláusulas del Contrato', margin, y); y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const clauses = [
    {
      title: 'Primera. Objeto del Mandato',
      body: `El Mandante confiere un mandato comercial con representación al Mandatario para que este, por cuenta y riesgo de aquel, ejecute la gestión de captación, administración, arrendamiento y representación legal del inmueble ubicado en ${property.address}${property.chip ? ` (CHIP Catastral ${property.chip})` : ''}, incluyendo: buscar arrendatarios, negociar las condiciones del arriendo, suscribir los contratos de arrendamiento respectivos en nombre del Mandante, cobrar cánones y administración, atender reparaciones y mantenimiento, y representar al Mandante ante entidades públicas y privadas en todo lo relacionado con la gestión del inmueble.`,
    },
    {
      title: 'Segunda. Facultades del Mandatario',
      body: 'En cumplimiento del objeto del presente contrato, el Mandatario estará facultado para comparecer ante entidades públicas o privadas, firmar los documentos requeridos, presentar solicitudes, suscribir contratos de arrendamiento en nombre del Mandante (con obligación de rendición de cuentas), recibir pagos y realizar todas las actuaciones necesarias para el correcto desarrollo del encargo, conforme a los poderes que se le confieren mediante escritura pública adjunta.',
    },
    {
      title: 'Tercera. Remuneración o Honorarios',
      body: `Como contraprestación por la ejecución del mandato, el Mandante pagará al Mandatario una comisión equivalente al ${commissionPct}% (${numeroALetras(commissionPct)} por ciento) del valor del canon mensual de arrendamiento efectivamente recaudado, más IVA si aplica. La comisión se causará y pagará mes a mes, una vez el canon haya sido recibido del arrendatario.`,
    },
    {
      title: 'Cuarta. Obligaciones del Mandatario',
      body: 'El Mandatario se obliga a: 1) Ejecutar el encargo con la debida diligencia y cuidado profesional. 2) Rendir cuentas detalladas y documentadas de su gestión al Mandante de manera mensual, mediante reporte escrito que incluya ingresos, egresos, estado de cuenta y novedades del inmueble. 3) Comunicar de forma inmediata cualquier novedad o situación que afecte el negocio. 4) Conservar y mantener el inmueble en buen estado, destinando los fondos de mantenimiento que el Mandante provea. 5) Velar por el cumplimiento del contrato de arrendamiento por parte del arrendatario.',
    },
    {
      title: 'Quinta. Obligaciones del Mandante',
      body: 'El Mandante se obliga a: 1) Proveer oportunamente los fondos, documentos e información indispensables para la ejecución del encargo, incluyendo los documentos legales del inmueble (escritura, certificado de tradición, paz y salvo de administración e impuestos). 2) Pagar la remuneración pactada en la cláusula tercera. 3) Reembolsar los gastos justificados y necesarios en los que incurra el Mandatario para la conservación del inmueble. 4) Firmar el Inventario Inicial del inmueble al momento de la entrega al Mandatario.',
    },
    {
      title: 'Sexta. Duración y Terminación',
      body: `El presente contrato tendrá una vigencia de ${durationMonths} (${numeroALetras(durationMonths)}) meses contados a partir del ${startDate}, renovable por períodos iguales salvo que cualquiera de las partes manifieste su intención de no renovarlo con al menos treinta (30) días calendario de anticipación. El contrato podrá terminarse en cualquier momento por: a) revocación del Mandante mediante aviso escrito con 30 días de anticipación; b) renuncia del Mandatario con el mismo preaviso; c) mutuo acuerdo; d) incumplimiento grave de cualquiera de las partes.`,
    },
  ];

  for (const clause of clauses) {
    const titleLines = doc.splitTextToSize(clause.title, pageW - 2 * margin);
    ensureSpace(titleLines.length * 4 + 4);
    doc.setFont('helvetica', 'bold');
    doc.text(titleLines, margin, y);
    y += titleLines.length * 4 + 1;
    doc.setFont('helvetica', 'normal');
    const bodyLines = doc.splitTextToSize(clause.body, pageW - 2 * margin);
    ensureSpace(bodyLines.length * 4 + 6);
    doc.text(bodyLines, margin, y);
    y += bodyLines.length * 4 + 6;
  }

  if (notes) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Notas adicionales:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(notes, pageW - 2 * margin);
    doc.text(notesLines, margin, y);
    y += notesLines.length * 4 + 4;
  }

  // ─── Firmas (página nueva) ────────────────────────────────
  doc.addPage();
  y = margin + 20;

  const sigW = (pageW - 2 * margin - 10) / 2;
  const sigX1 = margin;
  const sigX2 = margin + sigW + 10;
  const sigY = y;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(sigX1, sigY, sigX1 + sigW, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('EL MANDANTE', sigX1, sigY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(owner.name, sigX1, sigY + 12);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`C.C. No. ${owner.documentId}`, sigX1, sigY + 17);

  doc.line(sigX2, sigY, sigX2 + sigW, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('EL MANDATARIO', sigX2, sigY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(agency.representative, sigX2, sigY + 12);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`En representación de ${agency.name}`, sigX2, sigY + 17);
  if (agency.representativeIdNumber) {
    doc.text(`C.C. No. ${agency.representativeIdNumber}`, sigX2, sigY + 22);
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Documento generado por InmoControl el ${new Date().toLocaleString('es-CO')}.`,
    pageW / 2, pageH - 10, { align: 'center' }
  );

  return doc.output('blob');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const NUMEROS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno', 'treinta y dos', 'treinta y tres', 'treinta y cuatro', 'treinta y cinco', 'treinta y seis', 'treinta y siete', 'treinta y ocho', 'treinta y nueve', 'cuarenta'];
function numeroALetras(n: number): string {
  if (n < 0) return 'menos ' + numeroALetras(-n);
  if (Number.isInteger(n) && n >= 0 && n < NUMEROS.length) return NUMEROS[n];
  return n.toString();
}
