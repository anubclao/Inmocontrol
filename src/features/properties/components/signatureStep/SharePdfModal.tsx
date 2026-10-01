// filepath: src/features/properties/components/signatureStep/SharePdfModal.tsx
import { useState } from 'react';
import { Share2, Mail, MessageCircle, FileText } from 'lucide-react';
import { Button, Modal } from '../../../../shared/ui';
import type { Inventory, Signature } from '../../inventoryTypes';

export interface SharePdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: Inventory;
  signatures: Signature[];
}

/**
 * Modal con opciones para compartir/enviar el PDF firmado del inventario.
 * 3 opciones:
 *   1) Web Share API (recomendada, si el browser soporta files)
 *   2) Descarga manual del PDF
 *   3) Links directos a email/WhatsApp de cada firmante
 */
export function SharePdfModal({ isOpen, onClose, inventory, signatures }: SharePdfModalProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBlob = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { generateInventoryPdfBlob } = await import('../../inventoryPdf');
      const { inventoryDB } = await import('../../inventoryDB');
      const blob = await generateInventoryPdfBlob(
        inventory,
        { address: '', owner: '', chip: '' },
        async (id) => {
          const photo = await inventoryDB.getPhoto(id);
          return (photo as { dataUrl?: string } | undefined)?.dataUrl ?? null;
        },
      );
      setPdfBlob(blob);
    } catch (e) {
      console.error(e);
      setError('No se pudo generar el PDF');
    } finally {
      setGenerating(false);
    }
  };

  // Cuando abre el modal, generamos el PDF en memoria
  if (isOpen && !pdfBlob && !generating && !error) {
    void generateBlob();
  }

  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare;
  const recipients = signatures.map((s) => ({
    name: s.signerName,
    role: s.signerRole,
    phone: s.signerPhone,
    email: s.signerEmail,
  }));

  const filename = `Inventario_${inventory.phase}_${Date.now()}.pdf`;

  const handleNativeShare = async () => {
    if (!pdfBlob) return;
    if (!navigator.canShare) {
      setError('Tu navegador no soporta compartir archivos. Usa las opciones de email/WhatsApp abajo.');
      return;
    }
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    if (!navigator.canShare({ files: [file] })) {
      setError('Tu navegador no soporta compartir PDFs. Usa las opciones de email/WhatsApp abajo.');
      return;
    }
    try {
      await navigator.share({
        title: `Inventario ${inventory.phase === 'inicial' ? 'Inicial' : 'Final'}`,
        text: 'Inventario firmado del inmueble',
        files: [file],
      });
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') {
        console.error(e);
        setError('No se pudo compartir');
      }
    }
  };

  const handleEmail = (email: string) => {
    const subject = encodeURIComponent(`Inventario ${inventory.phase === 'inicial' ? 'Inicial' : 'Final'} — Inmueble`);
    const body = encodeURIComponent(
      'Cordial saludo,\n\nAdjunto encontrará el inventario firmado del inmueble.\n\nPor favor adjunte el PDF descargado.\n\nCordialmente.',
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const handleWhatsApp = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const text = encodeURIComponent(
      'Cordial saludo. Adjunto el inventario firmado del inmueble. Por favor confirme de recibido.',
    );
    window.open(`https://wa.me/${digits}?text=${text}`, '_blank');
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); setPdfBlob(null); setError(null); }} title="Compartir PDF firmado">
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        {/* Opción 1: Web Share API */}
        {canShareFiles && pdfBlob && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-bold text-blue-900 mb-1">Opción recomendada</p>
            <p className="text-xs text-blue-700 mb-3">
              Comparte el PDF con un solo tap vía WhatsApp, email, o cualquier app instalada.
            </p>
            <Button onClick={handleNativeShare} className="w-full gap-2">
              <Share2 className="w-4 h-4" /> Compartir ahora
            </Button>
          </div>
        )}

        {generating && (
          <div className="p-3 text-center text-sm text-slate-500">Generando PDF…</div>
        )}

        {/* Opción 2: descarga manual */}
        {pdfBlob && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-sm font-bold text-slate-900 mb-2">O descarga y envía manualmente</p>
            <a
              href={URL.createObjectURL(pdfBlob)}
              download={filename}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileText className="w-4 h-4" /> Descargar {filename}
            </a>
          </div>
        )}

        {/* Opción 3: enviar a cada firmante */}
        {recipients.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Enviar a firmantes ({recipients.length})
            </p>
            <div className="space-y-2">
              {recipients.map((r, i) => (
                <div key={i} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{r.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{r.role}</p>
                    {r.email && <p className="text-[11px] text-slate-400 truncate">{r.email}</p>}
                    {r.phone && <p className="text-[11px] text-slate-400 truncate">{r.phone}</p>}
                  </div>
                  {r.email && (
                    <button
                      type="button"
                      onClick={() => handleEmail(r.email!)}
                      className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                      title={`Email a ${r.email}`}
                    >
                      <Mail className="w-4 h-4 text-slate-700" />
                    </button>
                  )}
                  {r.phone && (
                    <button
                      type="button"
                      onClick={() => handleWhatsApp(r.phone!)}
                      className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                      title={`WhatsApp a ${r.phone}`}
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-700" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Email/WhatsApp abren con un mensaje prellenado — adjunta el PDF manualmente desde tu app.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
