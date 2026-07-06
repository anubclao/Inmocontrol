import { jsPDF } from 'jspdf';
import type { Inventory, Signature } from './inventoryTypes';
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
 *  - Una página por cada área con sus items + fotos
 *  - Una página con los Textos Jurídicos
 *  - Una página final con las firmas (foto + datos del firmante)
 *
 * `getPhotos` es inyectado porque las fotos están en IndexedDB.
 */
export async function generateInventoryPDF(
  inventory: Inventory,
  property: { address: string; owner: string; chip: string },
  getPhotoDataUrl: (photoId: string) => Promise<string | null>,
  opts: PdfOptions = DEFAULT_OPTS,
): Promise<void> {
  const blob = await generateInventoryPdfBlob(inventory, property, getPhotoDataUrl, opts);
  const filename = `Inventario_${inventory.phase}_${property.address.replace(/\s+/g, '_').slice(0, 40)}_${Date.now()}.pdf`;
  triggerDownload(blob, filename);
}

/** Variante que devuelve el PDF como Blob (para Web Share API, mailto, etc.) */
export async function generateInventoryPdfBlob(
  inventory: Inventory,
  property: { address: string; owner: string; chip: string },
  getPhotoDataUrl: (photoId: string) => Promise<string | null>,
  opts: PdfOptions = DEFAULT_OPTS,
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
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
  doc.text(
    `INVENTARIO ${inventory.phase === 'inicial' ? 'INICIAL' : 'FINAL'} - INMOCONTROL`,
    pageW / 2, y, { align: 'center' }
  );
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${new Date(inventory.createdAt).toLocaleString('es-CO')}`, pageW / 2, y, { align: 'center' });
  y += 8;

  // ─── Datos del inmueble ───────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageW - 2 * margin, 26, 'F');
  y += 6;
  doc.setFontSize(9); doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold');
  doc.text('INMUEBLE', margin + 4, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Dirección: ${property.address}`, margin + 4, y); y += 5;
  doc.text(`Propietario: ${property.owner}`, margin + 4, y); y += 5;
  doc.text(`CHIP: ${property.chip}`, margin + 4, y); y += 5;
  doc.text(`Tipo: ${(PROPERTY_TYPE_LABEL[inventory.propertyType] ?? inventory.propertyType).toUpperCase()}`, margin + 4, y);
  y += 10;

  // ─── Una sección por área ─────────────────────────────────
  for (const area of inventory.areas) {
    ensureSpace(40);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(area.label.toUpperCase(), margin, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('ITEM', margin + 2, y);
    doc.text('ESTADO', pageW - margin - 30, y);
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 3;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    Object.values(area.items).forEach((item) => {
      ensureSpace(8);
      doc.setFontSize(9);
      const itemLabel = doc.splitTextToSize(item.label, pageW - margin - 50);
      doc.text(itemLabel, margin + 2, y);
      const status = ITEM_STATUS_LABEL[item.status];
      const color = item.status === 'bueno' ? [16, 185, 129]
        : item.status === 'regular' ? [245, 158, 11]
        : item.status === 'malo' ? [239, 68, 68]
        : [148, 163, 184];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(pageW - margin - 28, y - 3.5, 24, 5, 1.5, 1.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(status, pageW - margin - 16, y, { align: 'center' });
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      y += Math.max(5, itemLabel.length * 1.4);
    });

    if (area.observations) {
      ensureSpace(10);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const obs = doc.splitTextToSize(`Obs: ${area.observations}`, pageW - 2 * margin - 4);
      doc.text(obs, margin + 2, y);
      y += obs.length * 4 + 2;
    }

    if (area.photos.length > 0) {
      ensureSpace(50);
      y += 4;
      const photoW = (pageW - 2 * margin - 4) / 2;
      const photoH = photoW * 0.66;
      for (let i = 0; i < area.photos.length; i += 2) {
        ensureSpace(photoH + 2);
        const id1 = area.photos[i];
        const url1 = await getPhotoDataUrl(id1);
        if (url1) {
          try { doc.addImage(url1, 'JPEG', margin, y, photoW, photoH); } catch { /* ignore dataURL issues */ }
        } else {
          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, y, photoW, photoH);
        }
        if (i + 1 < area.photos.length) {
          const id2 = area.photos[i + 1];
          const url2 = await getPhotoDataUrl(id2);
          if (url2) {
            try { doc.addImage(url2, 'JPEG', margin + photoW + 4, y, photoW, photoH); } catch { /* ignore */ }
          } else {
            doc.setDrawColor(226, 232, 240);
            doc.rect(margin + photoW + 4, y, photoW, photoH);
          }
        }
        y += photoH + 4;
      }
    }

    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  }

  // ─── Textos jurídicos ─────────────────────────────────────
  doc.addPage();
  y = margin;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('TEXTOS JURÍDICOS', pageW / 2, y, { align: 'center' });
  y += 10;

  const propertyLabel = PROPERTY_TYPE_LABEL[inventory.propertyType] ?? 'inmueble';
  for (const t of LEGAL_TEXTS) {
    const body = t.body
      .replaceAll('{propertyType}', propertyLabel)
      .replaceAll('{empresa}', opts.agencyName);
    const lines = doc.splitTextToSize(body, pageW - 2 * margin);
    ensureSpace(lines.length * 4 + 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${t.title}.`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 4;
  }

  // ─── Firmas ───────────────────────────────────────────────
  doc.addPage();
  y = margin;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FIRMAS Y CONFORMIDAD', pageW / 2, y, { align: 'center' });
  y += 12;

  // Inventario de Colocación: SOLO 2 firmas (arrendatario + agente).
  // La firma del propietario va en el Contrato de Mandato y en el Contrato
  // de Arrendamiento, no en este documento.
  const roles: Array<{ key: Signature['signerRole']; label: string }> = [
    { key: 'arrendatario', label: 'Arrendatario' },
    { key: 'agente', label: 'Agente inmobiliario' },
  ];

  for (const r of roles) {
    const sig = inventory.signatures.find((s) => s.signerRole === r.key);
    ensureSpace(70);
    drawSignatureBlock(doc, margin, y, pageW - 2 * margin, 35, r.label, sig);
    y += 62;
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
    try { doc.addImage(sig.signerPhotoDataUrl, 'JPEG', x, y, photoSize, photoSize); } catch { /* ignore */ }
  } else {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, photoSize, photoSize, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'italic');
    doc.text('Sin foto', x + photoSize / 2, y + photoSize / 2, { align: 'center' });
  }

  // Firma (canvas, al centro-derecha)
  const sigX = x + photoSize + 4;
  const sigW = w - photoSize - 4;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.rect(sigX, y, sigW, h);
  if (sig?.dataUrl) {
    try { doc.addImage(sig.dataUrl, 'PNG', sigX + 2, y + 2, sigW - 4, h - 4); } catch { /* ignore */ }
  } else {
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'italic');
    doc.text('Sin firma', sigX + sigW / 2, y + h / 2, { align: 'center' });
  }

  // Datos del firmante (debajo)
  const textX = x;
  let textY = y + photoSize + 5;
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), textX, textY);
  textY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (sig) {
    doc.text(`${sig.signerName}${sig.signerIdNumber ? ' • CC: ' + sig.signerIdNumber : ''}`, textX, textY); textY += 4;
    if (sig.signerPhone) { doc.text(`Tel: ${sig.signerPhone}`, textX, textY); textY += 4; }
    if (sig.signerEmail) { doc.text(`Email: ${sig.signerEmail}`, textX, textY); textY += 4; }
    doc.text(`Firmado: ${new Date(sig.signedAt).toLocaleDateString('es-CO')}`, textX, textY);
  } else {
    doc.text('(pendiente)', textX, textY);
  }
}
