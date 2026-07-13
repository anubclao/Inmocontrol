import { jsPDF } from 'jspdf';

/** Datos de un firmante (mandante / propietario) en el Contrato de Mandato. */
export interface MandatoOwner {
  name: string;
  documentId: string;
  phone?: string;
  email?: string;
  /** Porcentaje de participación (0-100). Opcional — se muestra al lado del nombre si está. */
  ownershipPct?: number | null;
}

interface MandatoPdfData {
  property: { address: string; owner?: string; chip?: string; ownerIdNumber?: string };
  /**
   * Lista de mandantes (propietarios). Si la propiedad tiene N dueños, van N firmas
   * en el PDF. Si solo se pasa el legacy `owner` (singular) o `owners` con 1 elemento,
   * el layout es el mismo de antes (horizontal 1×2).
   */
  owners: MandatoOwner[];
  /**
   * @deprecated Usar `owners`. Si se pasa, se convierte a `owners` de 1 elemento.
   * Mantenido para compat con llamadas existentes.
   */
  owner?: { name: string; documentId: string; phone?: string; email?: string };
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
 * Se celebra entre el/los PROPIETARIO(S) (Mandante/Mandantes) y la INMOBILIARIA
 * (Mandatario) para que la inmobiliaria gestione el arriendo del inmueble.
 *
 * Soporta N propietarios (firmantes). Si la propiedad tiene varios dueños,
 * todos firman y cada uno aparece con su % de participación (si está definido).
 *
 * Modelo basado en el PDF de referencia (Código de Comercio Arts. 1262-1278).
 */
export async function generateMandatoPdf(data: MandatoPdfData): Promise<void> {
  const blob = await generateMandatoPdfBlob(data);
  const filename = `Mandato_${data.property.address.replace(/\s+/g, '_').slice(0, 40)}_${Date.now()}.pdf`;
  triggerDownload(blob, filename);
}

export async function generateMandatoPdfBlob(data: MandatoPdfData): Promise<Blob> {
  // ── Normalizar la lista de owners (compat con `owner` legacy) ──
  const owners: MandatoOwner[] = (() => {
    if (data.owners && data.owners.length > 0) return data.owners;
    if (data.owner) return [{ ...data.owner }];
    return [];
  })();
  if (owners.length === 0) {
    throw new Error('generateMandatoPdf: se requiere al menos un propietario (owners u owner)');
  }

  const { property, agency, commissionPct, startDate, durationMonths = 12, notes } = data;
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

  // MANDANTE(S) — lista de N propietarios
  doc.setFont('helvetica', 'bold');
  const mandanteLabel = owners.length === 1 ? 'EL MANDANTE:' : `LOS MANDANTES (${owners.length} copropietarios):`;
  doc.text(mandanteLabel, margin, y);
  y += 5;

  for (let i = 0; i < owners.length; i++) {
    const o = owners[i];
    const isFirst = i === 0;
    const prefix = isFirst ? '1)' : `${i + 1})`;
    const pctStr = o.ownershipPct != null ? ` (participación: ${o.ownershipPct.toFixed(2)}%)` : '';
    const phoneStr = o.phone ? `, teléfono ${o.phone}` : '';
    const emailStr = o.email ? `, correo ${o.email}` : '';
    const line = `${prefix} ${o.name}, mayor de edad, identificado con cédula de ciudadanía No. ${o.documentId}${pctStr}${phoneStr}${emailStr}.`;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(line, pageW - 2 * margin - 8);
    ensureSpace(lines.length * 4 + 2);
    doc.text(lines, margin + 6, y);
    y += lines.length * 4 + 2;
  }
  y += 4;

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
      body: `${owners.length > 1 ? 'Los Mandantes' : 'El Mandante'} confieren${owners.length > 1 ? '' : ''} un mandato comercial con representación al Mandatario para que este, por cuenta y riesgo de ${owners.length > 1 ? 'aquellos' : 'aquel'}, ejecute la gestión de captación, administración, arrendamiento y representación legal del inmueble ubicado en ${property.address}${property.chip ? ` (CHIP Catastral ${property.chip})` : ''}, incluyendo: buscar arrendatarios, negociar las condiciones del arriendo, suscribir los contratos de arrendamiento respectivos en nombre ${owners.length > 1 ? 'de los Mandantes' : 'del Mandante'}, cobrar cánones y administración, atender reparaciones y mantenimiento, y representar ${owners.length > 1 ? 'a los Mandantes' : 'al Mandante'} ante entidades públicas y privadas en todo lo relacionado con la gestión del inmueble.`,
    },
    {
      title: 'Segunda. Facultades del Mandatario',
      body: 'En cumplimiento del objeto del presente contrato, el Mandatario estará facultado para comparecer ante entidades públicas o privadas, firmar los documentos requeridos, presentar solicitudes, suscribir contratos de arrendamiento en nombre del Mandante (con obligación de rendición de cuentas), recibir pagos y realizar todas las actuaciones necesarias para el correcto desarrollo del encargo, conforme a los poderes que se le confieren mediante escritura pública adjunta.',
    },
    {
      title: 'Tercera. Remuneración o Honorarios',
      body: `Como contraprestación por la ejecución del mandato, ${owners.length > 1 ? 'los Mandantes' : 'el Mandante'} pagará${owners.length > 1 ? 'n' : ''} al Mandatario una comisión equivalente al ${commissionPct}% (${numeroALetras(commissionPct)} por ciento) del valor del canon mensual de arrendamiento efectivamente recaudado, más IVA si aplica. La comisión se causará y pagará mes a mes, una vez el canon haya sido recibido del arrendatario.${owners.length > 1 ? ` En caso de copropiedad, la comisión se distribuirá proporcionalmente a la participación de cada Mandante.` : ''}`,
    },
    {
      title: 'Cuarta. Obligaciones del Mandatario',
      body: 'El Mandatario se obliga a: 1) Ejecutar el encargo con la debida diligencia y cuidado profesional. 2) Rendir cuentas detalladas y documentadas de su gestión al Mandante de manera mensual, mediante reporte escrito que incluya ingresos, egresos, estado de cuenta y novedades del inmueble. 3) Comunicar de forma inmediata cualquier novedad o situación que afecte el negocio. 4) Conservar y mantener el inmueble en buen estado, destinando los fondos de mantenimiento que el Mandante provea. 5) Velar por el cumplimiento del contrato de arrendamiento por parte del arrendatario.',
    },
    {
      title: 'Quinta. Obligaciones del Mandante',
      body: `${owners.length > 1 ? 'Los Mandantes se obligan' : 'El Mandante se obliga'} a: 1) Proveer oportunamente los fondos, documentos e información indispensables para la ejecución del encargo, incluyendo los documentos legales del inmueble (escritura, certificado de tradición, paz y salvo de administración e impuestos). 2) Pagar la remuneración pactada en la cláusula tercera${owners.length > 1 ? ' en proporción a su participación' : ''}. 3) Reembolsar los gastos justificados y necesarios en los que incurra el Mandatario para la conservación del inmueble. 4) Firmar el Inventario Inicial del inmueble al momento de la entrega al Mandatario.`,
    },
    {
      title: 'Sexta. Duración y Terminación',
      body: `El presente contrato tendrá una vigencia de ${durationMonths} (${numeroALetras(durationMonths)}) meses contados a partir del ${startDate}, renovable por períodos iguales salvo que cualquiera de las partes manifieste su intención de no renovarlo con al menos treinta (30) días calendario de anticipación. El contrato podrá terminarse en cualquier momento por: a) revocación ${owners.length > 1 ? 'de los Mandantes' : 'del Mandante'} mediante aviso escrito con 30 días de anticipación; b) renuncia del Mandatario con el mismo preaviso; c) mutuo acuerdo; d) incumplimiento grave de cualquiera de las partes.`,
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
  y = margin + 10;

  // Subtítulo: "Firmas" — para que se vea prolijo cuando hay muchas firmas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  const firmantesLabel = owners.length === 1 ? '1 propietario' : `${owners.length} propietarios`;
  doc.text(`Firmas (${firmantesLabel} + inmobiliaria)`, margin, y);
  y += 12;

  // ── Layout adaptativo ──
  // 1 propietario: 1×2 (horizontal — prop | mandatario)
  // 2+ propietarios: lista vertical (1 firma por línea a full width)
  if (owners.length === 1) {
    const sigW = (pageW - 2 * margin - 10) / 2;
    const sigX1 = margin;
    const sigX2 = margin + sigW + 10;
    const sigY = y;

    drawFirma(doc, sigX1, sigY, sigW, {
      rol: 'EL MANDANTE',
      name: owners[0].name,
      docId: owners[0].documentId,
      pct: owners[0].ownershipPct,
    });
    drawFirma(doc, sigX2, sigY, sigW, {
      rol: 'EL MANDATARIO',
      name: agency.representative,
      sublabel: `En representación de ${agency.name}`,
      docId: agency.representativeIdNumber,
    });
  } else {
    // 2+ propietarios: vertical stack
    const sigW = pageW - 2 * margin;
    const rowH = 32; // alto de cada bloque de firma
    for (let i = 0; i < owners.length; i++) {
      const o = owners[i];
      drawFirma(doc, margin, y, sigW, {
        rol: i === 0 ? 'MANDANTE 1 (PRINCIPAL)' : `MANDANTE ${i + 1}`,
        name: o.name,
        docId: o.documentId,
        pct: o.ownershipPct,
      });
      y += rowH;
    }
    // Mandatario al final
    ensureSpace(rowH);
    drawFirma(doc, margin, y, sigW, {
      rol: 'EL MANDATARIO',
      name: agency.representative,
      sublabel: `En representación de ${agency.name}`,
      docId: agency.representativeIdNumber,
    });
  }

  // Footer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Documento generado por InmoControl el ${new Date().toLocaleString('es-CO')}.`,
    pageW / 2, pageH - 10, { align: 'center' }
  );

  return doc.output('blob');
}

/** Dibuja un bloque de firma: línea horizontal + rol + nombre + CC + (opcional) % participación. */
function drawFirma(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  data: {
    rol: string;
    name: string;
    docId?: string;
    pct?: number | null;
    sublabel?: string;
  },
) {
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(data.rol, x, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(data.name, x, y + 12);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  let yExtra = y + 17;
  if (data.pct != null) {
    doc.text(`Participación: ${data.pct.toFixed(2)}%`, x, yExtra);
    yExtra += 4;
  }
  if (data.docId) {
    doc.text(`C.C. No. ${data.docId}`, x, yExtra);
    yExtra += 4;
  }
  if (data.sublabel) {
    doc.text(data.sublabel, x, yExtra);
  }
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

const NUMEROS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trecce', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno', 'treinta y dos', 'treinta y tres', 'treinta y cuatro', 'treinta y cinco', 'treinta y seis', 'treinta y siete', 'treinta y ocho', 'treinta y nueve', 'cuarenta'];
function numeroALetras(n: number): string {
  if (n < 0) return 'menos ' + numeroALetras(-n);
  if (Number.isInteger(n) && n >= 0 && n < NUMEROS.length) return NUMEROS[n];
  return n.toString();
}
