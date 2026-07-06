import { useState } from 'react';
import { Users, FileText, Wallet, ClipboardCheck, Eye, FileSignature, RefreshCw } from 'lucide-react';
import { Button, Card, Input, Modal } from '../../../shared/ui';

const REQUIRED_DOCS = [
  { label: 'Cédula de Ciudadanía', icon: Users },
  { label: 'Certificado de Tradición', icon: FileText },
  { label: 'Impuesto Predial', icon: Wallet },
  { label: 'Rut Actualizado', icon: ClipboardCheck },
  { label: 'Contrato de Mandato', icon: FileSignature, isMandato: true },
] as const;

export interface StepDocsProps {
  uploadedDocs: Record<string, string | null>;
  setUploadedDocs: (next: Record<string, string | null>) => void;
  uploadingDoc: string | null;
  setUploadingDoc: (v: string | null) => void;
  currentDocLabel: string | null;
  setCurrentDocLabel: (v: string | null) => void;
  owner: string;
  ownerIdNumber: string;
  setOwnerIdNumber: (v: string) => void;
  viewingDoc: { label: string; url: string } | null;
  setViewingDoc: (v: { label: string; url: string } | null) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onBack: () => void;
  onContinue: () => void;
  triggerFileInput: (label: string) => void;
}

export function StepDocs({
  uploadedDocs, setUploadedDocs, uploadingDoc, setUploadingDoc,
  currentDocLabel, setCurrentDocLabel, owner, ownerIdNumber, setOwnerIdNumber,
  viewingDoc, setViewingDoc, showToast, onBack, onContinue, triggerFileInput,
}: StepDocsProps) {
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);
  const [confirmContinue, setConfirmContinue] = useState(false);

  return (
    <Card className="p-8">
      <h3 className="font-bold text-lg mb-2">2. Carga de Documentos Legales</h3>
      <p className="text-xs text-slate-500 mb-6">
        Sube los documentos obligatorios. El <strong>Contrato de Mandato</strong> firmado por el propietario es el que
        activa el inmueble al 100% (estado <em>Activo</em>).
      </p>

      {/* Banner del check de validación: el contrato de mandato desbloquea el 100% */}
      <div
        className={`mb-6 p-3 rounded-lg border text-xs flex items-start gap-2 ${
          uploadedDocs['Contrato de Mandato']
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        <FileSignature className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          {uploadedDocs['Contrato de Mandato'] ? (
            <>
              <strong>Mandato firmado listo.</strong> Al finalizar el registro, el inmueble quedará en estado
              <strong> Activo (100%)</strong>.
            </>
          ) : (
            <>
              <strong>Falta el Contrato de Mandato firmado.</strong> Mientras no subas el PDF firmado por el
              propietario, el inmueble quedará en estado <strong>Pendiente</strong>.
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REQUIRED_DOCS.map((doc) => {
          const isMandato = 'isMandato' in doc && doc.isMandato === true;
          const isReady = !!uploadedDocs[doc.label];
          return (
            <div
              key={doc.label}
              className={`p-4 border-2 border-dashed rounded-xl transition-all cursor-pointer group relative ${
                isMandato && isReady
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-slate-200 hover:border-blue-400'
              }`}
              onClick={() => {
                if (doc.label === 'Cédula de Ciudadanía') { setIsIdModalOpen(true); return; }
                if (uploadingDoc === doc.label) return;
                // Si ya hay doc cargado, click en el card = reemplazar (mismo comportamiento que el botón "Reemplazar")
                triggerFileInput(doc.label);
              }}
            >
              <div className="flex justify-between items-start">
                <doc.icon className={`w-6 h-6 ${uploadedDocs[doc.label] ? 'text-emerald-500' : uploadingDoc === doc.label ? 'text-blue-500 animate-pulse' : 'text-slate-400 group-hover:text-blue-500'} mb-2`} />
                {uploadedDocs[doc.label] && <ClipboardCheck className="w-4 h-4 text-emerald-500" />}
              </div>
              <p className="text-sm font-semibold text-slate-700">{doc.label}</p>
              <p className="text-xs text-slate-400 mt-1">
                {uploadingDoc === doc.label
                  ? 'Subiendo...'
                  : uploadedDocs[doc.label]
                    ? isMandato
                      ? 'PDF firmado — estado 100%'
                      : 'Documento listo'
                    : 'Click para subir PDF'}
              </p>
              {doc.label === 'Cédula de Ciudadanía' && ownerIdNumber && (
                <p className="text-xs font-bold text-blue-600 mt-1">ID: {ownerIdNumber}</p>
              )}
              {uploadedDocs[doc.label] && (
                <div className="absolute bottom-3 right-3 flex gap-1.5">
                  {/* Reemplazar: abre el picker de archivo para subir otro PDF en lugar del actual */}
                  <button
                    onClick={(e) => { e.stopPropagation(); triggerFileInput(doc.label); }}
                    title="Reemplazar PDF"
                    className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  {/* Vista previa: abre el visor con el PDF en pantalla */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setViewingDoc({ label: doc.label, url: uploadedDocs[doc.label]! }); }}
                    title="Ver PDF"
                    className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-8">
        <Button variant="outline" className="flex-1" onClick={onBack}>Atrás</Button>
        <Button className="flex-1" onClick={() => setConfirmContinue(true)}>Continuar a Inventario</Button>
      </div>

      {/* ── Confirmación antes de pasar al inventario ──
          Punto de no retorno para los documentos: una vez en el inventario el
          usuario ya no puede modificar/eliminar/reemplazar PDFs desde aquí. */}
      <Modal isOpen={confirmContinue} onClose={() => setConfirmContinue(false)} title="¿Continuar al Inventario?">
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            <p className="font-semibold mb-1">Una vez en el inventario no podrá modificar los documentos desde aquí.</p>
            <p className="text-xs text-amber-800">
              Si más adelante detecta un error en algún PDF, tendrá que entrar al <strong>Detalle del Inmueble</strong>
              {' '}y reemplazar el documento manualmente.
            </p>
          </div>
          <p className="text-sm text-slate-600">
            ¿Está seguro que desea continuar al paso de <strong>Inventario de Captación</strong>?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmContinue(false)}>
              Revisar documentos
            </Button>
            <Button className="flex-1" onClick={() => { setConfirmContinue(false); onContinue(); }}>
              Sí, continuar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isIdModalOpen} onClose={() => setIsIdModalOpen(false)} title="Número de Cédula de Ciudadanía">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Ingrese el número de identificación del propietario.</p>
          <Input label="Número de Cédula" placeholder="Ej: 1.023.456.789" value={ownerIdNumber} onChange={(e) => setOwnerIdNumber(e.target.value)} />
          <Button className="w-full mt-6" onClick={() => {
            if (!ownerIdNumber) { showToast('Debe ingresar el número de cédula', 'error'); return; }
            setIsIdModalOpen(false);
            if (!uploadedDocs['Cédula de Ciudadanía']) {
              triggerFileInput('Cédula de Ciudadanía');
            }
          }}>Guardar y Continuar</Button>
        </div>
      </Modal>
    </Card>
  );
}
