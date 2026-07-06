import { jsPDF } from 'jspdf';
import type { Inventory } from './inventoryTypes';
import type { InventoryDiff } from './inventoryDiff';
import { ITEM_STATUS_LABEL } from './inventoryConfig';

/**
 * Genera el PDF del "Acta de Entrega" — documento legal que compara
 * Inventario Inicial vs Final y deja constancia del estado del inmueble
 * al momento de la entrega/devolución.
 *
 * Diferencias en rojo. Items sin cambios en gris. Items nuevos en azul.
 */
export async function generateActaEntregaPDF(
  initial: Inventory,
  finalInv: Inventory,
  diff: InventoryDiff,
  property: { address: string; owner: string; chip: string },
  getPhotoDataUrl: (photoId: string) => Promise<string | null>,
): Promise<void> {
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
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ACTA DE ENTREGA / DEVOLUCIÓN', pageW / 2, 14, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('InmoControl · Comparativa Inventario Inicial vs Final', pageW / 2, 22, { align: 'center' });
  y = 38;

  // ─── Datos del inmueble ───────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('INMUEBLE', margin, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Dirección: ${property.address}`, margin, y); y += 5;
  doc.text(`Propietario: ${property.owner}`, margin, y); y += 5;
  doc.text(`CHIP: ${property.chip}`, margin, y); y += 5;
  doc.text(`Tipo: ${initial.propertyType.toUpperCase()}`, margin, y); y += 5;
  doc.text(`Inventario Inicial: ${new Date(initial.createdAt).toLocaleDateString('es-CO')}`, margin, y); y += 5;
  doc.text(`Inventario Final: ${new Date(finalInv.createdAt).toLocaleDateString('es-CO')}`, margin, y); y += 8;

  // ─── Resumen ejecutivo ────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(diff.hasIssues ? 254 : 240, diff.hasIssues ? 243 : 253, diff.hasIssues ? 199 : 244);
  doc.rect(margin, y, pageW - 2 * margin, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(diff.hasIssues ? 146 : 5, diff.hasIssues ? 64 : 122, diff.hasIssues ? 14 : 85);
  doc.text('RESUMEN', margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`• ${diff.areas.length} áreas evaluadas · ${diff.totalItems} items`, margin + 4, y + 12);
  doc.text(`• ${diff.changedItems} con cambios · ${diff.addedItems} nuevos · ${diff.removedItems} removidos`, margin + 4, y + 17);
  y += 28;

  // ─── Detalle por área (solo las con cambios o nuevas) ─────
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('DETALLE DE DIFERENCIAS', margin, y);
  y += 8;

  for (const area of diff.areas) {
    ensureSpace(30);
    if (area.severity === 'unchanged' && diff.hasIssues) {
      // Áreas sin cambios: solo las mencionamos brevemente
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`✓ ${area.label} — sin cambios`, margin + 2, y);
      y += 5;
      continue;
    }

    // Header del área
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(area.label.toUpperCase(), margin, y);
    y += 5;

    // Tabla
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('ITEM', margin + 2, y);
    doc.text('INICIAL', margin + 90, y);
    doc.text('FINAL', margin + 120, y);
    doc.text('CAMBIO', pageW - margin, y, { align: 'right' });
    y += 1.5;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 3;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const item of area.items) {
      ensureSpace(8);
      // Si no hay cambios y el área es sin cambios, skip
      if (item.severity === 'unchanged' && area.severity === 'unchanged') continue;

      // Color de fondo según severidad
      if (item.severity === 'major') {
        doc.setFillColor(254, 226, 226);
        doc.rect(margin, y - 3.5, pageW - 2 * margin, 5.5, 'F');
      } else if (item.severity === 'minor') {
        doc.setFillColor(254, 243, 199);
        doc.rect(margin, y - 3.5, pageW - 2 * margin, 5.5, 'F');
      } else if (item.severity === 'added') {
        doc.setFillColor(219, 234, 254);
        doc.rect(margin, y - 3.5, pageW - 2 * margin, 5.5, 'F');
      }

      const itemLabel = doc.splitTextToSize(item.label, 80);
      doc.setTextColor(15, 23, 42);
      doc.text(itemLabel, margin + 2, y);
      doc.setFontSize(8);
      doc.text(item.initial ? ITEM_STATUS_LABEL[item.initial] : '—', margin + 90, y);
      doc.text(item.final ? ITEM_STATUS_LABEL[item.final] : '—', margin + 120, y);
      const changeLabel = item.severity === 'unchanged' ? '—' :
        item.severity === 'major' ? 'DAÑO' :
        item.severity === 'minor' ? 'Menor' :
        item.severity === 'added' ? 'NUEVO' : 'Removido';
      doc.setTextColor(
        item.severity === 'major' ? 185 :
        item.severity === 'added' ? 29 :
        item.severity === 'removed' ? 100 : 122,
        item.severity === 'major' ? 28 :
        item.severity === 'added' ? 78 :
        item.severity === 'removed' ? 116 : 110,
        item.severity === 'major' ? 28 :
        item.severity === 'added' ? 216 :
        item.severity === 'removed' ? 139 : 191
      );
      doc.setFont('helvetica', 'bold');
      doc.text(changeLabel, pageW - margin, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      y += Math.max(5, itemLabel.length * 1.4);
    }

    if (area.observationsDiff) {
      ensureSpace(10);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(120, 53, 15);
      if (area.observationsDiff.initial) {
        const obs1 = doc.splitTextToSize(`Obs. inicial: ${area.observationsDiff.initial}`, pageW - 2 * margin - 4);
        doc.text(obs1, margin + 2, y);
        y += obs1.length * 3.5 + 1;
      }
      if (area.observationsDiff.final) {
        const obs2 = doc.splitTextToSize(`Obs. final: ${area.observationsDiff.final}`, pageW - 2 * margin - 4);
        doc.text(obs2, margin + 2, y);
        y += obs2.length * 3.5 + 1;
      }
    }

    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  }

  // ─── Conclusiones y firmas ────────────────────────────────
  ensureSpace(70);
  doc.addPage();
  y = margin;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('CONCLUSIONES', pageW / 2, y, { align: 'center' });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const conclusion = diff.hasIssues
    ? `El inmueble presenta ${diff.changedItems} item(s) con diferencias respecto al Inventario Inicial. Las partes firmantes reconocen el estado actual descrito en este documento.`
    : 'El inmueble se devuelve en las mismas condiciones en que fue recibido, sin diferencias respecto al Inventario Inicial.';
  const conclusionLines = doc.splitTextToSize(conclusion, pageW - 2 * margin);
  doc.text(conclusionLines, margin, y);
  y += conclusionLines.length * 5 + 8;

  // Firmas (las del Inventario Final)
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('FIRMAS', pageW / 2, y, { align: 'center' });
  y += 10;

  const sigWidth = (pageW - 2 * margin - 10) / 2;
  const sigHeight = 32;
  const roles: Array<{ key: 'arrendatario' | 'agente' | 'propietario'; label: string }> = [
    { key: 'arrendatario', label: 'Arrendatario' },
    { key: 'agente', label: 'Agente inmobiliario' },
  ];
  const hasOwner = finalInv.signatures.find((s) => s.signerRole === 'propietario');
  if (hasOwner) roles.push({ key: 'propietario', label: 'Propietario' });

  for (let i = 0; i < roles.length; i += 2) {
    ensureSpace(sigHeight + 18);
    const r1 = roles[i];
    const sig1 = finalInv.signatures.find((s) => s.signerRole === r1.key);
    drawSignatureBlock(doc, margin, y, sigWidth, sigHeight, r1.label, sig1);
    if (i + 1 < roles.length) {
      const r2 = roles[i + 1];
      const sig2 = finalInv.signatures.find((s) => s.signerRole === r2.key);
      drawSignatureBlock(doc, margin + sigWidth + 10, y, sigWidth, sigHeight, r2.label, sig2);
    }
    y += sigHeight + 16;
  }

  // Footer
  const totalPages = (doc as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `InmoControl · Acta generada el ${new Date().toLocaleString('es-CO')} · Página ${i} de ${totalPages}`,
      pageW / 2, pageH - 8, { align: 'center' }
    );
  }

  const filename = `Acta_Entrega_${property.address.replace(/\s+/g, '_').slice(0, 40)}_${Date.now()}.pdf`;
  doc.save(filename);
}

function drawSignatureBlock(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  label: string,
  sig?: { signerName: string; signerIdNumber?: string; dataUrl: string; signedAt: string },
) {
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
  if (sig?.dataUrl) {
    try { doc.addImage(sig.dataUrl, 'PNG', x + 2, y + 2, w - 4, h - 4); } catch { /* ignore */ }
  } else {
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'italic');
    doc.text('Sin firma', x + w / 2, y + h / 2, { align: 'center' });
  }
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), x, y + h + 5);
  doc.setFont('helvetica', 'normal');
  if (sig) {
    doc.text(`${sig.signerName}${sig.signerIdNumber ? ' · CC: ' + sig.signerIdNumber : ''}`, x, y + h + 10);
    doc.text(`Firmado: ${new Date(sig.signedAt).toLocaleDateString('es-CO')}`, x, y + h + 15);
  } else {
    doc.text('(pendiente)', x, y + h + 10);
  }
}
