import { jsPDF } from 'jspdf';

/**
 * Datos del "Acta de Entrega de Inmueble Arrendado y Recibo de Llaves".
 * Modelo: C:\Users\VibeCoder\Desktop\ACTA DE ENTREGA DE INMUEBLE ARRENDADO Y RECIBO DE LLAVES.pdf
 */
export interface ActaEntregaData {
  ciudad: string;
  /** Fecha en que se firma el acta. Por defecto, hoy. */
  fechaActa: string; // ISO YYYY-MM-DD
  arrendador: { nombre: string; cedula: string };
  arrendatario: { nombre: string; cedula: string };
  /** Fecha en que se firmó el contrato de arrendamiento (input del usuario) */
  fechaFirmaContrato: string;
  inmueble: { direccion: string };

  servicios: {
    energia: { lectura: string; estado: 'Bueno' | 'Regular' | 'Malo' | '' };
    agua: { lectura: string; estado: 'Bueno' | 'Regular' | 'Malo' | '' };
    gas: { lectura: string; estado: 'Bueno' | 'Regular' | 'Malo' | '' };
  };

  /** Descripción libre del estado Paredes, Techos y Pisos */
  paredes: string;
  /** Descripción libre del estado de Puertas y Ventanas */
  puertasVentanas: string;
  /** Descripción libre del estado de la Cocina */
  cocina: string;
  /** Descripción libre del estado de los Baños */
  banos: string;
  /** Descripción libre de las Instalaciones Eléctricas */
  instalaciones: string;

  /** Llaves entregadas */
  llaves: {
    principal: number;
    habitaciones: number;
    controles: number;
  };

  /** Observaciones adicionales (texto libre) */
  observaciones: string;
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Devuelve "5 de junio de 2026" para una fecha ISO YYYY-MM-DD. */
function formatFechaLarga(iso: string): string {
  if (!iso) return '____________';
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES_ES[m - 1] ?? ''} de ${y}`;
}

function safe(s: string | undefined | null, fallback = '____________'): string {
  const v = (s ?? '').trim();
  return v.length > 0 ? v : fallback;
}

/** Construye el PDF y devuelve el Blob (no descarga). */
export async function generateActaEntregaPdf(data: ActaEntregaData): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // ─── Header ───────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ACTA DE ENTREGA DE INMUEBLE ARRENDADO Y RECIBO DE LLAVES', pageW / 2, 14, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('InmoControl · Documento legal de entrega', pageW / 2, 22, { align: 'center' });
  y = 38;

  // ─── Párrafo introductorio ────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const intro1 = doc.splitTextToSize(
    `En la ciudad de ${safe(data.ciudad)}, el día ${formatFechaLarga(data.fechaActa)}, se reúnen por una parte ${safe(data.arrendador.nombre)}, identificado con Cédula de Ciudadanía / Identificación No. ${safe(data.arrendador.cedula)}, en adelante denominado EL ARRENDADOR; y por la otra parte ${safe(data.arrendatario.nombre)}, identificado con Cédula de Ciudadanía / Identificación No. ${safe(data.arrendatario.cedula)}, en adelante denominado EL ARRENDATARIO.`,
    pageW - 2 * margin,
  );
  doc.text(intro1, margin, y);
  y += intro1.length * 5 + 3;

  const intro2 = doc.splitTextToSize(
    `Ambas partes se han reunido con el fin de realizar la entrega formal del inmueble, objeto del contrato de arrendamiento suscrito el día ${formatFechaLarga(data.fechaFirmaContrato)}.`,
    pageW - 2 * margin,
  );
  doc.text(intro2, margin, y);
  y += intro2.length * 5 + 3;

  doc.text('Las partes acuerdan y hacen constar lo siguiente:', margin, y);
  y += 8;

  // ─── PRIMERA: OBJETO ─────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PRIMERA: OBJETO DE LA ENTREGA', margin, y); y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const t1 = doc.splitTextToSize(
    `EL ARRENDADOR hace entrega material y EL ARRENDATARIO recibe a entera satisfacción el inmueble ubicado en ${safe(data.inmueble.direccion)}.`,
    pageW - 2 * margin,
  );
  doc.text(t1, margin, y);
  y += t1.length * 5 + 6;

  // ─── SEGUNDA: INVENTARIO GENERAL ─────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SEGUNDA: INVENTARIO GENERAL Y ESTADO DE LA PROPIEDAD', margin, y); y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Las partes han revisado conjuntamente el inmueble y constatan que su estado actual es el siguiente:', margin, y);
  y += 7;

  // Servicios públicos (con bullet ● y sub-bullet ○)
  doc.setFont('helvetica', 'bold');
  doc.text('• Servicios Públicos (Medidores):', margin, y); y += 5;

  const serviciosLines: Array<[string, { lectura: string; estado: string }]> = [
    ['Energía eléctrica', data.servicios.energia],
    ['Agua potable', data.servicios.agua],
    ['Gas domiciliario', data.servicios.gas],
  ];
  for (const [label, svc] of serviciosLines) {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    const head = `○ ${label}: `;
    doc.text(head, margin + 4, y);
    const headW = doc.getTextWidth(head);
    doc.setFont('helvetica', 'normal');
    const body = `Lectura actual: ${safe(svc.lectura, '—')}. Estado general: ${safe(svc.estado, '—')}.`;
    const bodyLines = doc.splitTextToSize(body, pageW - margin - 4 - headW);
    doc.text(bodyLines, margin + 4 + headW, y);
    y += Math.max(5, bodyLines.length * 5);
  }
  y += 3;

  // Estado físico (texto libre por sección)
  const secciones: Array<[string, string]> = [
    ['Paredes, Techos y Pisos', data.paredes],
    ['Puertas y Ventanas', data.puertasVentanas],
    ['Cocina', data.cocina],
    ['Baños', data.banos],
    ['Instalaciones Eléctricas', data.instalaciones],
  ];
  for (const [label, val] of secciones) {
    ensureSpace(15);
    doc.setFont('helvetica', 'bold');
    doc.text(`• ${label}:`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(safe(val), pageW - 2 * margin - 4);
    doc.text(lines, margin + 4, y);
    y += lines.length * 5 + 2;
  }
  y += 3;

  // ─── TERCERA: LLAVES ─────────────────────────────────────
  ensureSpace(35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TERCERA: ENTREGA DE LLAVES', margin, y); y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const llavesIntro = doc.splitTextToSize(
    'EL ARRENDADOR hace entrega formal de los siguientes juegos de llaves al ARRENDATARIO, quien se hace responsable de su custodia a partir de este momento:',
    pageW - 2 * margin,
  );
  doc.text(llavesIntro, margin, y);
  y += llavesIntro.length * 5 + 3;

  doc.setFont('helvetica', 'normal');
  doc.text(`• ${data.llaves.principal || 0} llave${data.llaves.principal === 1 ? '' : 's'} de la puerta principal.`, margin + 4, y); y += 5;
  doc.text(`• ${data.llaves.habitaciones || 0} llave${data.llaves.habitaciones === 1 ? '' : 's'} de las habitaciones.`, margin + 4, y); y += 5;
  doc.text(`• ${data.llaves.controles || 0} control${data.llaves.controles === 1 ? '' : 'es'} de acceso vehicular o chips (si aplica).`, margin + 4, y); y += 8;

  // ─── OBSERVACIONES ───────────────────────────────────────
  ensureSpace(30);
  doc.setFont('helvetica', 'bold');
  doc.text('OBSERVACIONES:', margin, y); y += 5;
  doc.setFont('helvetica', 'normal');
  const obsLines = doc.splitTextToSize(safe(data.observaciones, 'Sin observaciones adicionales.'), pageW - 2 * margin);
  doc.text(obsLines, margin, y);
  y += obsLines.length * 5 + 4;

  // Línea para firma
  ensureSpace(20);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // ─── CUARTA: CONFORMIDAD ─────────────────────────────────
  ensureSpace(45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CUARTA: CONFORMIDAD', margin, y); y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const c1 = doc.splitTextToSize(
    'EL ARRENDATARIO declara que recibe el inmueble en las condiciones descritas en este documento y se obliga a conservarlo en el mismo estado, salvo el deterioro natural por el uso legítimo de la propiedad.',
    pageW - 2 * margin,
  );
  doc.text(c1, margin, y);
  y += c1.length * 5 + 3;

  const c2 = doc.splitTextToSize(
    'Para constancia de lo anterior y en señal de conformidad, las partes firman el presente documento en dos (2) ejemplares del mismo tenor, el día y fecha indicados en el encabezado.',
    pageW - 2 * margin,
  );
  doc.text(c2, margin, y);
  y += c2.length * 5 + 8;

  // ─── Bloque de firmas (líneas para firmar) ───────────────
  ensureSpace(40);
  const firmaY = y + 12;
  const colW = (pageW - 2 * margin) / 2;
  // Línea del ARRENDADOR
  doc.line(margin, firmaY, margin + colW - 6, firmaY);
  doc.line(margin + colW + 6, firmaY, pageW - margin, firmaY);
  doc.setFont('helvetica', 'bold');
  doc.text('EL ARRENDADOR', margin, firmaY + 5);
  doc.text('EL ARRENDATARIO', margin + colW + 6, firmaY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Nombre: ${safe(data.arrendador.nombre, '—')}`, margin, firmaY + 12);
  doc.text(`Nombre: ${safe(data.arrendatario.nombre, '—')}`, margin + colW + 6, firmaY + 12);
  doc.text(`CC / ID: ${safe(data.arrendador.cedula, '—')}`, margin, firmaY + 17);
  doc.text(`CC / ID: ${safe(data.arrendatario.cedula, '—')}`, margin + colW + 6, firmaY + 17);

  return doc.output('blob');
}

/** Dispara la descarga del PDF en el navegador. */
export function downloadActaEntregaPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
