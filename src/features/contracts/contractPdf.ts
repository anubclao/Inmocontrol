import { jsPDF } from 'jspdf';
import type { Contract } from './contractTypes';

interface ArrendamientoPdfData {
  contract: Contract;
  property: { address: string; owner: string; chip: string; ownerIdNumber?: string };
  tenant: { name: string; documentId: string; email?: string; phone?: string };
  agencyName?: string;
}

const DEFAULT_AGENCY = 'la agencia';

/**
 * Genera el PDF del Contrato de Arrendamiento de Vivienda Urbana.
 * Modelo basado en la Ley 820 de 2003 (Colombia) — Secretaría Distrital
 * del Hábitat. Se celebra entre el Arrendador (propietario) y el Arrendatario
 * (inquilino), con la inmobiliaria como mandataria.
 *
 * Partes: EL ARRENDADOR y EL ARRENDATARIO. (No incluye al agente.)
 */
export async function generateArrendamientoPdf(data: ArrendamientoPdfData): Promise<void> {
  const blob = await generateArrendamientoPdfBlob(data);
  const filename = `Arrendamiento_${data.tenant.name.replace(/\s+/g, '_')}_${data.contract.id.slice(0, 8)}.pdf`;
  triggerDownload(blob, filename);
}

/** Devuelve el blob del PDF sin descargar — para subir a Drive. */
export async function generateArrendamientoPdfBlobOnly(data: ArrendamientoPdfData): Promise<Blob> {
  return generateArrendamientoPdfBlob(data);
}

export async function generateArrendamientoPdfBlob(data: ArrendamientoPdfData): Promise<Blob> {
  const { contract, property, tenant, agencyName = DEFAULT_AGENCY } = data;
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
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTRATO DE ARRENDAMIENTO DE VIVIENDA URBANA', pageW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text('Regulado por la Ley 820 de 2003 y lineamientos de la Secretaría Distrital del Hábitat', pageW / 2, y, { align: 'center' });
  y += 12;

  // ─── Nota de orientación legal ───────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageW - 2 * margin, 18, 'F');
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const nota = 'Nota de orientación legal: Este modelo cumple con las disposiciones de la Ley 820 de 2003 de Colombia y se alinea con la inspección, vigilancia y control asignados a la Secretaría Distrital del Hábitat en Bogotá. Recuerde que el arrendador (si es comercial o supera el número de inmuebles permitidos) debe contar con matrícula de arrendador ante dicha entidad.';
  const notaLines = doc.splitTextToSize(nota, pageW - 2 * margin - 8);
  doc.text(notaLines, margin + 4, y);
  y += notaLines.length * 3.5 + 6;

  // ─── Lugar y fecha ───────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const fecha = new Date(contract.signedAt || new Date()).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Lugar y Fecha del Contrato: ${property.address.split(',').pop()?.trim() || 'Bogotá D.C.'}, ${fecha}.`, margin, y);
  y += 8;

  // ─── Identificación de las partes ─────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('EL ARRENDADOR:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${property.owner}, mayor(es) de edad, domiciliado(s) en ${property.address.split(',').pop()?.trim() || 'la ciudad'}, identificado(s) con C.C. No. ${property.ownerIdNumber || '___'}.`, margin, y + 5, { maxWidth: pageW - 2 * margin });
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.text('EL ARRENDATARIO:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${tenant.name}, mayor(es) de edad, domiciliado(s) en ${tenant.phone || '___'}, identificado(s) con C.C. No. ${tenant.documentId}${tenant.email ? `, correo ${tenant.email}` : ''}.`, margin, y + 5, { maxWidth: pageW - 2 * margin });
  y += 16;

  // ─── Cláusulas del Contrato ──────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Cláusulas del Contrato', margin, y); y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const fmt = (n: number) => '$' + (n || 0).toLocaleString('es-CO');

  const clauses = [
    {
      title: 'Primera. Objeto del Contrato',
      body: `El Arrendador concede al Arrendatario el goce del inmueble apto para vivienda urbana ubicado en la dirección: ${property.address} de la ciudad de ${property.address.split(',').pop()?.trim() || '___'}, cuyos linderos y dotación se detallan en el Inventario Inicial firmado por las partes, el cual forma parte integral del presente contrato.`,
    },
    {
      title: 'Segunda. Canon de Arrendamiento',
      body: `El Arrendatario pagará al Arrendador por concepto de canon mensual la suma de ${fmt(contract.rentAmount)} pesos M/CTE, pagaderos dentro de los primeros cinco (5) días de cada período mensual. La administración de ${fmt(contract.adminFee)} se paga por separado y de forma independiente.`,
    },
    {
      title: 'Tercera. Reajuste del Canon',
      body: 'Cada doce (12) meses de ejecución del contrato, el valor del canon se incrementará de forma automática en un porcentaje igual al Índice de Precios al Consumidor (IPC) del año calendario inmediatamente anterior, conforme a lo estipulado en el Artículo 20 de la Ley 820 de 2003.',
    },
    {
      title: 'Cuarta. Vigencia y Prórroga',
      body: `El término de duración de este contrato será de ${mesesEntre(contract.startDate, contract.endDate)} meses contados a partir del ${contract.startDate}. El contrato se entenderá prorrogado en iguales condiciones por un término idéntico, siempre que ninguna de las partes manifieste a la otra su intención de no prorrogarlo con una antelación no menor a tres (3) meses a la fecha de vencimiento, por correo certificado.`,
    },
    {
      title: 'Quinta. Servicios Públicos y Gastos',
      body: 'El pago de los servicios públicos de agua, alcantarillado, energía eléctrica, gas domiciliario y administración de la propiedad horizontal estará a cargo exclusivamente del Arrendatario. La inmobiliaria mandataria (' + agencyName + ') supervisará el pago oportuno.',
    },
    {
      title: 'Sexta. Uso del Inmueble',
      body: 'El Arrendatario se obliga a destinar el inmueble única y exclusivamente para su vivienda y la de su familia. No podrá subarrendar, ceder el contrato ni cambiar su destinación sin autorización previa y escrita del Arrendador. Cualquier cambio de uso requiere aviso escrito con treinta (30) días de anticipación.',
    },
    {
      title: 'Séptima. Reparaciones e Inventario',
      body: 'El Arrendatario se compromete a conservar el inmueble en el mismo estado en que lo recibió, salvo el deterioro natural por el uso legítimo. De acuerdo con el Artículo 15 de la Ley 820 de 2003, el Arrendatario cuenta con un término de quince (15) días calendario desde la entrega para reportar formalmente por escrito cualquier anomalía o daño oculto en el inmueble. Si esos arreglos no se hicieren, queda ' + agencyName + ' autorizado para hacerlos por su cuenta y para cobrar ejecutivamente las sumas correspondientes al Arrendatario.',
    },
    {
      title: 'Octava. Inspección, Vigilancia y Control',
      body: 'Las partes reconocen que la actividad de arrendamiento de vivienda urbana está sujeta a la inspección, vigilancia y control de la autoridad administrativa local, la cual para el Distrito Capital es la Secretaría Distrital del Hábitat. La inmobiliaria mandataria queda facultada para atender las visitas de inspección y responder ante la autoridad en nombre del Arrendador, en el marco del Contrato de Mandato celebrado con el propietario.',
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

  // ─── Notas (si hay) ──────────────────────────────────────
  if (contract.notes) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Notas del contrato:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(contract.notes, pageW - 2 * margin);
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
  doc.text('EL ARRENDADOR', sigX1, sigY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(property.owner, sigX1, sigY + 12);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`C.C. No. ${property.ownerIdNumber || ''}`, sigX1, sigY + 17);

  doc.line(sigX2, sigY, sigX2 + sigW, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('EL ARRENDATARIO', sigX2, sigY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(tenant.name, sigX2, sigY + 12);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`C.C. No. ${tenant.documentId}`, sigX2, sigY + 17);
  if (tenant.phone) doc.text(`Tel: ${tenant.phone}`, sigX2, sigY + 22);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Documento generado por InmoControl el ${new Date().toLocaleString('es-CO')}. Contrato N° ${contract.id.slice(0, 12).toUpperCase()}.`,
    pageW / 2, pageH - 10, { align: 'center' }
  );

  return doc.output('blob');
}

/** Backward-compat: el export anterior `generateContractPdf` ahora es de arrendamiento. */
export const generateContractPdf = generateArrendamientoPdf;
export const generateContractPdfBlob = generateArrendamientoPdfBlob;

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

function mesesEntre(ini: string, fin: string): number {
  const a = new Date(ini);
  const b = new Date(fin);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
}
