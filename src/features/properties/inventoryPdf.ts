import { jsPDF } from 'jspdf';
import type { Inventory, ItemMedia, Signature } from './inventoryTypes';
import { ITEM_STATUS_LABEL } from './inventoryConfig';

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  apartaestudio: 'apartaestudio',
  apartamento: 'apartamento',
  casa: 'casa',
  oficina: 'oficina',
  local: 'local',
  bodega: 'bodega',
};

/** Textos jurídicos — ver SignatureStep para fuente única. */
const LEGAL_TEXTS = [
  {
    title: 'Declaración de entrega',
    body: 'Declaramos expresamente las partes que el (la) {propertyType} ha sido entregado al arrendatario o a quien éste ha delegado para recibirlo, conforme al presente inventario. Acorde con el contrato de arrendamiento, los arrendatarios se comprometen a conservar y mantener el inmueble y su correspondiente dotación en el mismo estado en el que lo reciben, salvo los deterioros naturales originados en el uso decente del mismo, así como a arreglar los daños resultantes del mal trato o del descuido en el lapso de la tenencia. Si esos arreglos no se hicieren queda {empresa} autorizado para hacerlos por su cuenta y para cobrar ejecutivamente las sumas correspondiente a los arrendatarios, para este efecto convienen las partes que las facturas de reparación de daños o de reposición de faltantes junto con el contrato de arrendamiento prestan merito ejecutivo suficiente.',
  },
  {
    title: 'Aire Acondicionado',
    body: 'En caso de que el(la) {propertyType} este dotado con uno o mas equipos de aire acondicionado, sus respectivas conexión y unidades de condensación, realizare los mantenimientos periódicos pertinentes para su correcto funcionamiento.',
  },
  {
    title: 'Calentadores',
    body: 'En caso de que el(la) {propertyType} este dotado con uno o mas calentadores de agua ya sea a gas o eléctrico, sus respectivas conexión y baterías, realizare los mantenimientos periódicos pertinentes para su correcto funcionamiento.',
  },
  {
    title: 'Estufas y hornos',
    body: 'En caso de que el(la) {propertyType} este dotado con uno o mas estufas y hornos de cocina, realizare los mantenimientos periodicos pertinentes para su correcto funcionamiento.',
  },
  {
    title: 'Extractores de cocina',
    body: 'En caso de que el inmueble este dotado con uno o mas extractores de cocina, realizare los mantenimientos periódicos pertinentes para su correcto funcionamiento y cambio periódico de filtro.',
  },
  {
    title: 'Plazo para reportar anomalías',
    body: 'A partir de la fecha, el inquilino cuenta con 15 días calendario para reportar cualquier anomalía o avería en el inmueble.',
  },
];

interface PdfOptions {
  /** Nombre de la empresa que aparece en el texto jurídico (de Settings) */
  agencyName: string;
}

const DEFAULT_OPTS: PdfOptions = { agencyName: 'la agencia' };

/**
 * Genera el PDF del Inventario (Inicial o Final) y dispara la descarga.
 * Embebe:
 *  - Header con datos del inmueble y del tipo
 *  - Una página compacta por cada área: tabla de items (con su media) + fotos de área
 *  - Una página con los Textos Jurídicos
 *  - Una página final con las firmas (foto + datos del firmante)
 *
 * `getMedia` es inyectado porque las fotos/videos están en IndexedDB
 * (key: `<inventoryId>:<mediaId>`).
 */
export async function generateInventoryPDF(
  inventory: Inventory,
  property: { address: string; owner: string; chip: string },
  getMediaDataUrl: (mediaId: string) => Promise<string | null>,
  opts: PdfOptions = DEFAULT_OPTS,
): Promise<void> {
  const blob = await generateInventoryPdfBlob(inventory, property, getMediaDataUrl, opts);
  const filename = `Inventario_${inventory.phase}_${property.address.replace(/\s+/g, '_').slice(0, 40)}_${Date.now()}.pdf`;
  triggerDownload(blob, filename);
}

/** Variante que devuelve el PDF como Blob (para Web Share API, mailto, etc.) */
export async function generateInventoryPdfBlob(
  inventory: Inventory,
  property: { address: string; owner: string; chip: string },
  getMediaDataUrl: (mediaId: string) => Promise<string | null>,
  opts: PdfOptions = DEFAULT_OPTS,
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - 2 * margin;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // ─── Header ───────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `INVENTARIO ${inventory.phase === 'inicial' ? 'INICIAL' : 'FINAL'} - INMOCONTROL`,
    pageW / 2, y, { align: 'center' }
  );
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${new Date(inventory.createdAt).toLocaleString('es-CO')}`, pageW / 2, y, { align: 'center' });
  y += 5;

  // ─── Datos del inmueble (caja compacta) ──────────────────
  const headerBoxH = 16;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentW, headerBoxH, 'F');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('INMUEBLE', margin + 2, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Dir: ${property.address}`, margin + 2, y + 7);
  doc.text(`Propietario: ${property.owner}`, margin + 2, y + 11);
  doc.text(`CHIP: ${property.chip}`, margin + 2, y + 15);
  // Columna derecha: tipo + fase
  const rightX = pageW - margin - 2;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(
    (PROPERTY_TYPE_LABEL[inventory.propertyType] ?? inventory.propertyType).toUpperCase(),
    rightX, y + 7, { align: 'right' }
  );
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.text(
    inventory.phase === 'inicial' ? 'Inventario de captación' : 'Inventario de colocación',
    rightX, y + 11, { align: 'right' }
  );
  y += headerBoxH + 4;

  // ─── Una sección compacta por área ────────────────────────
  for (const area of inventory.areas) {
    ensureSpace(20);
    // Título del área
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(area.label.toUpperCase(), margin, y);
    y += 5;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y - 1, pageW - margin, y - 1);

    // Definir columnas de la tabla de items (compacta, sin badges gigantes)
    const colQtyX = pageW - margin - 38;     // 8mm ancho
    const colEstadoX = pageW - margin - 22;  // 18mm ancho
    const colItemX = margin + 1;
    const colItemW = colQtyX - colItemX - 2;

    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('ITEM', colItemX, y);
    doc.text('CANT', colQtyX + 4, y, { align: 'center' });
    doc.text('ESTADO', colEstadoX + 9, y, { align: 'center' });
    y += 3;
    doc.line(margin, y, pageW - margin, y);
    y += 1.5;

    // Filas de items
    doc.setFont('helvetica', 'normal');
    for (const item of Object.values(area.items)) {
      ensureSpace(8);

      // Label del item (puede hacer wrap si es largo)
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      const labelLines = doc.splitTextToSize(item.label, colItemW);
      doc.text(labelLines, colItemX, y + 2);

      // Cantidad
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      const qty = item.qty ?? 1;
      doc.text(String(qty), colQtyX + 4, y + 2, { align: 'center' });
      doc.setFont('helvetica', 'normal');

      // Estado: barrita de color (4mm alto) + label
      const statusColor = item.status === 'bueno' ? [16, 185, 129]
        : item.status === 'regular' ? [245, 158, 11]
        : item.status === 'malo' ? [239, 68, 68]
        : [148, 163, 184];
      const badgeX = colEstadoX;
      const badgeW = 22;
      const badgeH = 4;
      const badgeY = y;
      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text(ITEM_STATUS_LABEL[item.status].toUpperCase(), badgeX + badgeW / 2, badgeY + 2.8, { align: 'center' });
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');

      // Material (al lado del label, en gris pequeño)
      if (item.material) {
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        const matText = doc.splitTextToSize(
          `· ${item.material}`,
          colQtyX - colItemX - 4,
        );
        doc.text(matText[0] ?? '', colItemX, y + 2 + labelLines.length * 3);
        doc.setTextColor(15, 23, 42);
      }

      // Altura consumida por label (mín 4mm)
      const rowH = Math.max(4, labelLines.length * 3);
      y += rowH;

      // Observaciones del item (italic pequeño debajo)
      const itemObs = item.observations ?? item.notes;
      if (itemObs) {
        ensureSpace(4);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        const obs = doc.splitTextToSize(`↳ ${itemObs}`, colItemW + 16);
        doc.text(obs, colItemX, y + 2);
        y += obs.length * 2.5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
      }

      // Media del item (fotos/videos) — thumbnails inline 18x13.5mm
      const itemMedia: ItemMedia[] = (item as any).media ?? [];
      if (itemMedia.length > 0) {
        ensureSpace(16);
        const thumbW = 18;
        const thumbH = 13.5;
        const gap = 1.5;
        const perRow = Math.floor((colItemW + 16) / (thumbW + gap));
        let thumbX = colItemX;
        let thumbY = y + 1;
        let count = 0;
        for (const m of itemMedia) {
          if (count > 0 && count % perRow === 0) {
            thumbX = colItemX;
            thumbY += thumbH + gap;
            ensureSpace(thumbH + 2);
          }
          if (m.type === 'video') {
            // Video: dibujar marco + icono play
            doc.setDrawColor(148, 163, 184);
            doc.setFillColor(241, 245, 249);
            doc.rect(thumbX, thumbY, thumbW, thumbH, 'FD');
            // Triángulo de "play"
            doc.setFillColor(71, 85, 105);
            const cx = thumbX + thumbW / 2;
            const cy = thumbY + thumbH / 2;
            doc.triangle(
              cx - 2, cy - 3,
              cx - 2, cy + 3,
              cx + 3, cy,
              'F',
            );
            doc.setFontSize(5);
            doc.setTextColor(100, 116, 139);
            doc.text('VIDEO', thumbX + thumbW - 1, thumbY + thumbH - 0.5, { align: 'right' });
            doc.setTextColor(15, 23, 42);
          } else {
            const url = await getMediaDataUrl(m.id);
            if (url) {
              try {
                doc.addImage(url, 'JPEG', thumbX, thumbY, thumbW, thumbH, undefined, 'FAST');
              } catch {
                doc.setDrawColor(226, 232, 240);
                doc.rect(thumbX, thumbY, thumbW, thumbH);
              }
            } else {
              doc.setDrawColor(226, 232, 240);
              doc.rect(thumbX, thumbY, thumbW, thumbH);
            }
          }
          thumbX += thumbW + gap;
          count++;
        }
        y += thumbH + gap + 1;
      }

      y += 1.5;
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y, pageW - margin, y);
      y += 1.5;
    }

    // Observaciones del área
    if (area.observations) {
      ensureSpace(6);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      const obs = doc.splitTextToSize(`Obs: ${area.observations}`, contentW - 2);
      doc.text(obs, margin + 1, y);
      y += obs.length * 3 + 1;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
    }

    // Fotos de área (las que el agente subió sin asociar a un item específico)
    if (area.photos.length > 0) {
      ensureSpace(20);
      y += 1;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('FOTOS DEL ÁREA', margin, y);
      y += 3;

      // 3 fotos por fila, más pequeñas
      const photoW = (contentW - 4) / 3;
      const photoH = photoW * 0.66;
      for (let i = 0; i < area.photos.length; i += 3) {
        ensureSpace(photoH + 2);
        for (let j = 0; j < 3 && i + j < area.photos.length; j++) {
          const id = area.photos[i + j];
          const url = await getMediaDataUrl(id);
          const x = margin + j * (photoW + 2);
          if (url) {
            try { doc.addImage(url, 'JPEG', x, y, photoW, photoH, undefined, 'FAST'); }
            catch { doc.setDrawColor(226, 232, 240); doc.rect(x, y, photoW, photoH); }
          } else {
            doc.setDrawColor(226, 232, 240);
            doc.rect(x, y, photoW, photoH);
          }
        }
        y += photoH + 2;
      }
    }

    y += 3;
  }

  // ─── Textos jurídicos ─────────────────────────────────────
  doc.addPage();
  y = margin;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('TEXTOS JURÍDICOS', pageW / 2, y, { align: 'center' });
  y += 8;

  const propertyLabel = PROPERTY_TYPE_LABEL[inventory.propertyType] ?? 'inmueble';
  for (const t of LEGAL_TEXTS) {
    const body = t.body
      .replaceAll('{propertyType}', propertyLabel)
      .replaceAll('{empresa}', opts.agencyName);
    const lines = doc.splitTextToSize(body, contentW);
    ensureSpace(lines.length * 4 + 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`${t.title}.`, margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(lines, margin, y);
    y += lines.length * 3.5 + 3;
  }

  // ─── Firmas ───────────────────────────────────────────────
  doc.addPage();
  y = margin;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FIRMAS Y CONFORMIDAD', pageW / 2, y, { align: 'center' });
  y += 10;

  // Inventario de Colocación: SOLO 2 firmas (arrendatario + agente).
  // La firma del propietario va en el Contrato de Mandato y en el Contrato
  // de Arrendamiento, no en este documento.
  const roles: Array<{ key: Signature['signerRole']; label: string }> = [
    { key: 'arrendatario', label: 'Arrendatario' },
    { key: 'agente', label: 'Agente inmobiliario' },
  ];

  for (const r of roles) {
    const sig = inventory.signatures.find((s) => s.signerRole === r.key);
    ensureSpace(60);
    drawSignatureBlock(doc, margin, y, contentW, 30, r.label, sig);
    y += 52;
  }

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

function drawSignatureBlock(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  label: string,
  sig?: Signature,
) {
  // Foto del firmante (esquina izquierda)
  const photoSize = h;
  if (sig?.signerPhotoDataUrl) {
    try { doc.addImage(sig.signerPhotoDataUrl, 'JPEG', x, y, photoSize, photoSize, undefined, 'FAST'); } catch { /* ignore */ }
  } else {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, photoSize, photoSize, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'italic');
    doc.text('Sin foto', x + photoSize / 2, y + photoSize / 2, { align: 'center' });
  }

  // Firma (canvas, al centro-derecha)
  const sigX = x + photoSize + 3;
  const sigW = w - photoSize - 3;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.2);
  doc.rect(sigX, y, sigW, h);
  if (sig?.dataUrl) {
    try { doc.addImage(sig.dataUrl, 'PNG', sigX + 1, y + 1, sigW - 2, h - 2); } catch { /* ignore */ }
  } else {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'italic');
    doc.text('Sin firma', sigX + sigW / 2, y + h / 2, { align: 'center' });
  }

  // Datos del firmante (debajo)
  const textX = x;
  let textY = y + photoSize + 4;
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), textX, textY);
  textY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  if (sig) {
    doc.text(`${sig.signerName}${sig.signerIdNumber ? ' • CC: ' + sig.signerIdNumber : ''}`, textX, textY); textY += 3.5;
    if (sig.signerPhone) { doc.text(`Tel: ${sig.signerPhone}`, textX, textY); textY += 3.5; }
    if (sig.signerEmail) { doc.text(`Email: ${sig.signerEmail}`, textX, textY); textY += 3.5; }
    doc.text(`Firmado: ${new Date(sig.signedAt).toLocaleDateString('es-CO')}`, textX, textY);
  } else {
    doc.text('(pendiente)', textX, textY);
  }
}
