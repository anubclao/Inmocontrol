import { useEffect, useRef, useState, type RefObject, type ChangeEvent } from 'react';
import { CheckCircle, Camera, Upload, Share2, Mail, MessageCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, Button, Input, Modal } from '../../../shared/ui';
import { SignaturePad, type SignaturePadRef } from '../SignaturePad';
import { compressImage } from '../imageCompress';
import { useSettingsStore } from '../../../shared/store/settingsStore';
import type { Inventory, Signature } from '../inventoryTypes';

interface SignatureStepProps {
  inventory: Inventory;
  propertyOwner?: string;
  propertyOwnerIdNumber?: string;
  tenantData?: { name: string; idNumber: string; email?: string; phone?: string } | null;
  onSaveSignatures: (signatures: Signature[]) => void;
  onGeneratePDF: () => void;
  onBack: () => void;
}

/**
 * Textos jurídicos obligatorios del inventario. La marca "{empresa}" se
 * reemplaza en runtime con el nombre configurado en Settings → Información de
 * Agencia. Mantener este bloque sincronizado con el documento legal de la
 * inmobiliaria.
 */
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

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  apartaestudio: 'apartaestudio',
  apartamento: 'apartamento',
  casa: 'casa',
  oficina: 'oficina',
  local: 'local',
  bodega: 'bodega',
};

// ─── Validaciones para Colombia ─────────────────────────────────────────
// Cédula: solo dígitos, 6-15 chars (cubre CC 6-10, CE hasta 15, NIT 9+DV).
// Teléfono: 10 dígitos, empieza con 3 (celular colombiano usado en WhatsApp).
// Email: formato estándar. Nombre: requerido, mínimo 3 chars reales.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(v: string): string | undefined {
  const t = v.trim();
  if (!t) return 'Nombre obligatorio';
  if (t.length < 3) return 'Mínimo 3 caracteres';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(t)) return 'Debe incluir letras';
  return undefined;
}

function validateIdNumber(v: string): string | undefined {
  const digits = v.replace(/\D/g, '');
  if (!digits) return 'Cédula obligatoria';
  if (digits.length < 6) return 'Mínimo 6 dígitos';
  if (digits.length > 15) return 'Máximo 15 dígitos';
  return undefined;
}

function validatePhone(v: string): string | undefined {
  const digits = v.replace(/\D/g, '');
  if (!digits) return 'Teléfono obligatorio';
  if (digits.length !== 10) return 'Debe tener 10 dígitos';
  if (!digits.startsWith('3')) return 'Celular colombiano debe empezar con 3';
  return undefined;
}

function validateEmail(v: string): string | undefined {
  const t = v.trim();
  if (!t) return 'Correo obligatorio';
  if (!RE_EMAIL.test(t)) return 'Formato de correo inválido';
  return undefined;
}

export function SignatureStep({
  inventory,
  propertyOwner,
  propertyOwnerIdNumber,
  tenantData,
  onSaveSignatures,
  onGeneratePDF,
  onBack,
}: SignatureStepProps) {
  const tenantPad = useRef<SignaturePadRef>(null);
  const agentPad = useRef<SignaturePadRef>(null);
  const ownerPad = useRef<SignaturePadRef>(null);

  // Pre-cargar datos del agente desde Settings (perfil del usuario logueado)
  const profile = useSettingsStore((s) => s.profile);

  // Estado del wizard por firmante. El agente se prellena desde el store.
  // Arrendatario: prellenar desde tenantData o inventory
  const [tenantName, setTenantName] = useState(tenantData?.name ?? inventory.tenantName ?? '');
  const [tenantId, setTenantId] = useState(tenantData?.idNumber ?? inventory.tenantId ?? '');
  const [tenantPhone, setTenantPhone] = useState(tenantData?.phone ?? '');
  const [tenantEmail, setTenantEmail] = useState(tenantData?.email ?? '');
  const [tenantPhoto, setTenantPhoto] = useState<string | null>(null);

  // Sincronizar tenantData con el estado local cuando cambia (llega de forma asíncrona)
  useEffect(() => {
    if (tenantData) {
      if (tenantData.name) setTenantName(tenantData.name);
      if (tenantData.idNumber) setTenantId(tenantData.idNumber);
      if (tenantData.phone) setTenantPhone(tenantData.phone);
      if (tenantData.email) setTenantEmail(tenantData.email);
    }
  }, [tenantData]);

  const [agentName, setAgentName] = useState(inventory.agentName ?? profile.name);
  const [agentId, setAgentId] = useState('');
  const [agentPhone, setAgentPhone] = useState(profile.phone);
  const [agentEmail, setAgentEmail] = useState(profile.email);
  const [agentPhoto, setAgentPhoto] = useState<string | null>(profile.photoDataUrl ?? null);

  // Sincronizar agentPhoto con profile.photoDataUrl cuando el perfil carga
  // (caso: Settings carga async y useState ya inicializó con undefined).
  useEffect(() => {
    if (!agentPhoto && profile.photoDataUrl) {
      setAgentPhoto(profile.photoDataUrl);
    }
  }, [profile.photoDataUrl, agentPhoto]);

  // Propietario: prellenar desde propertyOwner
  const [ownerName, setOwnerName] = useState(propertyOwner ?? '');
  const [ownerId, setOwnerId] = useState(propertyOwnerIdNumber ?? '');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhoto, setOwnerPhoto] = useState<string | null>(null);

  const [tenantValid, setTenantValid] = useState(false);
  const [agentValid, setAgentValid] = useState(false);
  const [ownerValid, setOwnerValid] = useState(false);
  const [tenantFieldsValid, setTenantFieldsValid] = useState(false);
  const [agentFieldsValid, setAgentFieldsValid] = useState(false);

  // Aceptación de textos jurídicos (obligatoria para habilitar el botón)
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalExpanded, setLegalExpanded] = useState(false);

  // Modal de compartir PDF
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const tenantFileInput = useRef<HTMLInputElement>(null);
  const agentFileInput = useRef<HTMLInputElement>(null);
  const ownerFileInput = useRef<HTMLInputElement>(null);

  const isFinal = inventory.phase === 'final';
  // Inventario de Colocación = 2 firmas (arrendatario + agente). El propietario firma el Contrato de Mandato/Arrendamiento, no este inventario.
  // OBLIGATORIO:
  //   - Datos del firmante con formato válido (cédula/teléfono/email/nombre)
  //   - Firma dibujada
  //   - Foto del firmante cargada
  //   - Textos jurídicos aceptados
  const allValid =
    tenantFieldsValid && agentFieldsValid &&
    tenantValid && agentValid &&
    !!tenantPhoto && !!agentPhoto;
  const allNamesValid = tenantName.trim() && agentName.trim();

  // Lista de razones por las que el botón sigue disabled (para el banner).
  // Mostramos solo las que aplican al flujo actual (2 firmas en Colocación).
  const missingReasons: string[] = [];
  if (!tenantFieldsValid) missingReasons.push('Revisá los datos del arrendatario (cédula/teléfono/correo/nombre)');
  if (!agentFieldsValid) missingReasons.push('Revisá los datos del agente (cédula/teléfono/correo/nombre)');
  if (!tenantValid) missingReasons.push('Falta la firma del arrendatario');
  if (!agentValid) missingReasons.push('Falta la firma del agente');
  if (!tenantPhoto) missingReasons.push('Falta la foto del arrendatario');
  if (!agentPhoto) missingReasons.push('Falta la foto del agente');
  if (!legalAccepted) missingReasons.push('Aceptá los textos jurídicos');

  const handlePhotoUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    setter: (v: string | null) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await compressImage(file);
    setter(dataUrl);
    if (e.target) e.target.value = '';
  };

  const slugify = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const handleFinish = () => {
    const tenantDataUrl = tenantPad.current?.toDataURL();
    const agentDataUrl = agentPad.current?.toDataURL();

    if (!tenantDataUrl || !agentDataUrl) { return; }

    const now = new Date().toISOString();
    const tenantSlug = slugify(tenantName.trim() || 'arrendatario');
    const agentSlug = slugify(agentName.trim() || 'agente');

    const signatures: Signature[] = [
      {
        signerName: tenantName.trim(),
        signerRole: 'arrendatario',
        signerIdNumber: tenantId || undefined,
        signerPhone: tenantPhone || undefined,
        signerEmail: tenantEmail || undefined,
        signerPhotoDataUrl: tenantPhoto || undefined,
        signerPhotoName: tenantPhoto ? `${tenantSlug}_ARR_foto` : undefined,
        signatureName: `${tenantSlug}_ARR_firma`,
        dataUrl: tenantDataUrl,
        signedAt: now,
      },
      {
        signerName: agentName.trim(),
        signerRole: 'agente',
        signerIdNumber: agentId || undefined,
        signerPhone: agentPhone || undefined,
        signerEmail: agentEmail || undefined,
        signerPhotoDataUrl: agentPhoto || undefined,
        signerPhotoName: agentPhoto ? `${agentSlug}_AG_foto` : undefined,
        signatureName: `${agentSlug}_AG_firma`,
        dataUrl: agentDataUrl,
        signedAt: now,
      },
    ];
    onSaveSignatures(signatures);
  };

  const propertyLabel = PROPERTY_TYPE_LABEL[inventory.propertyType] ?? 'inmueble';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">Firmas del Inventario {isFinal ? 'Final' : 'Inicial'}</h3>
        <p className="text-sm text-slate-500">
          Las partes firman en conformidad con el estado del inmueble descrito y los textos jurídicos adjuntos.
        </p>
      </div>

      {/* ── Textos jurídicos con aceptación obligatoria ───────────── */}
      <Card className="p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setLegalExpanded((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <div className="text-left">
              <p className="font-bold text-slate-900">Textos Jurídicos del Inventario</p>
              <p className="text-xs text-slate-500">
                {legalAccepted
                  ? 'Aceptados. Las partes firman en conformidad con los textos.'
                  : 'Obligatorio leer y aceptar antes de firmar.'}
              </p>
            </div>
          </div>
          {legalExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>
        {legalExpanded && (
          <div className="border-t border-slate-100 p-4 max-h-96 overflow-y-auto bg-slate-50">
            <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
              {LEGAL_TEXTS.map((t) => {
                const body = t.body
                  .replaceAll('{propertyType}', propertyLabel)
                  .replaceAll('{empresa}', '{nombre de la agencia}');
                return (
                  <div key={t.title}>
                    <p className="font-bold text-slate-900 mb-1">{t.title}.</p>
                    <p>{body}</p>
                  </div>
                );
              })}
            </div>
            <label className="mt-4 flex items-start gap-2 cursor-pointer p-3 bg-white rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={legalAccepted}
                onChange={(e) => setLegalAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4"
              />
              <span className="text-sm text-slate-700">
                Declaro haber leído y aceptado los textos jurídicos anteriores. Las partes firman en conformidad.
              </span>
            </label>
          </div>
        )}
        {!legalExpanded && (
          <div className="border-t border-slate-100 p-3 bg-slate-50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={legalAccepted}
                onChange={(e) => setLegalAccepted(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-700">Acepto los textos jurídicos del inventario.</span>
            </label>
          </div>
        )}
      </Card>

      {/* ── Firmante: Arrendatario ───────────────────────────────── */}
      <SignerCard
        title="Arrendatario"
        name={tenantName} onName={setTenantName}
        idNumber={tenantId} onIdNumber={setTenantId}
        phone={tenantPhone} onPhone={setTenantPhone}
        email={tenantEmail} onEmail={setTenantEmail}
        photo={tenantPhoto} onPhoto={setTenantPhoto}
        padRef={tenantPad} onValid={setTenantValid}
        onFieldsValid={setTenantFieldsValid}
        fileInputRef={tenantFileInput}
        onUploadPhoto={(e) => handlePhotoUpload(e, setTenantPhoto)}
        uploadLabel="Subir cédula (obligatorio)"
      />

      {/* ── Firmante: Agente (representante de la agencia) ─────── */}
      <SignerCard
        title={`Agente (${profile.role || 'Representante de la agencia'})`}
        name={agentName} onName={setAgentName}
        idNumber={agentId} onIdNumber={setAgentId}
        phone={agentPhone} onPhone={setAgentPhone}
        email={agentEmail} onEmail={setAgentEmail}
        photo={agentPhoto} onPhoto={setAgentPhoto}
        padRef={agentPad} onValid={setAgentValid}
        onFieldsValid={setAgentFieldsValid}
        fileInputRef={agentFileInput}
        onUploadPhoto={(e) => handlePhotoUpload(e, setAgentPhoto)}
        subtitle="Datos del usuario logueado en la aplicación."
        uploadLabel="Subir foto (obligatorio)"
      />

      {/* Nota: Inventario de Colocación solo requiere 2 firmas
          (arrendatario + agente). La firma del propietario va en el
          Contrato de Mandato y en el Contrato de Arrendamiento, NO acá. */}

      {/* ── Banner con lo que falta para habilitar Guardar firmas ── */}
      {missingReasons.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">
            Para habilitar "Guardar firmas" te falta:
          </p>
          <ul className="text-sm text-amber-800 space-y-1 list-disc pl-5">
            {missingReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={onBack}>← Volver al inventario</Button>
        <div className="flex-1" />
        <Button
          onClick={handleFinish}
          disabled={!allValid || !allNamesValid || !legalAccepted}
          className="gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Guardar firmas
        </Button>
        {inventory.signedAt && (
          <>
            <Button onClick={onGeneratePDF} variant="outline" className="gap-2">
              <FileText className="w-4 h-4" />
              Descargar PDF
            </Button>
            <Button onClick={() => setShareModalOpen(true)} className="gap-2">
              <Share2 className="w-4 h-4" />
              Compartir PDF firmado
            </Button>
          </>
        )}
      </div>

      {/* ── Modal de compartir ──────────────────────────────────── */}
      <SharePdfModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        inventory={inventory}
        signatures={
          inventory.signatures.length > 0
            ? inventory.signatures
            : []
        }
      />
    </div>
  );
}

/** Card reutilizable por firmante. */
interface SignerCardProps {
  title: string;
  subtitle?: string;
  name: string; onName: (v: string) => void;
  idNumber: string; onIdNumber: (v: string) => void;
  phone: string; onPhone: (v: string) => void;
  email: string; onEmail: (v: string) => void;
  photo: string | null; onPhoto: (v: string | null) => void;
  padRef: RefObject<SignaturePadRef | null>;
  onValid: (v: boolean) => void;
  /** Reporta si los 4 campos (nombre/cédula/teléfono/correo) están con formato válido. */
  onFieldsValid: (v: boolean) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUploadPhoto: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Texto del botón "Subir/Cambiar" — distinto para arrendatario ("cédula") vs agente ("foto"). */
  uploadLabel?: string;
}

function SignerCard({
  title, subtitle, name, onName, idNumber, onIdNumber,
  phone, onPhone, email, onEmail, photo, onPhoto,
  padRef, onValid, onFieldsValid, fileInputRef, onUploadPhoto, uploadLabel,
}: SignerCardProps) {
  // Errores por campo. undefined = válido. Calculamos en cada render para que
  // la UI reaccione a cada cambio.
  const nameErr = validateName(name);
  const idErr = validateIdNumber(idNumber);
  const phoneErr = validatePhone(phone);
  const emailErr = validateEmail(email);
  const fieldsValid = !nameErr && !idErr && !phoneErr && !emailErr;

  // Reportar al padre (sin bucle: setState es estable cuando el valor no cambia).
  useEffect(() => {
    onFieldsValid(fieldsValid);
  }, [fieldsValid, onFieldsValid]);

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        {/* Foto */}
        <div className="flex-shrink-0">
          {photo ? (
            <div className="relative">
              <img src={photo} alt="Foto" className="w-20 h-20 rounded-full object-cover border-2 border-slate-200" />
              <button
                type="button"
                onClick={() => onPhoto(null)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                title="Quitar foto"
              >×</button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
              <Camera className="w-6 h-6" />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onUploadPhoto}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 w-full text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1"
          >
            <Upload className="w-3 h-3" /> {photo ? 'Cambiar' : uploadLabel ?? 'Subir foto'}
          </button>
          {!photo && (
            <p className="mt-1 text-[10px] text-red-500 text-center">Obligatorio</p>
          )}
        </div>

        {/* Datos + firma */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Nombre completo *" value={name} onChange={(e) => onName(e.target.value)} error={nameErr} />
            <Input label="Cédula / Documento *" value={idNumber} onChange={(e) => onIdNumber(e.target.value)} error={idErr} placeholder="Ej: 52123456" />
            <Input label="Teléfono (WhatsApp) *" value={phone} onChange={(e) => onPhone(e.target.value)} placeholder="300 123 4567" error={phoneErr} />
            <Input label="Correo electrónico *" type="email" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="correo@ejemplo.com" error={emailErr} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Firma *</p>
            <SignaturePad ref={padRef} onChange={onValid} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Modal con opciones para compartir/enviar el PDF firmado. */
interface SharePdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: Inventory;
  signatures: Signature[];
}

function SharePdfModal({ isOpen, onClose, inventory, signatures }: SharePdfModalProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBlob = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { generateInventoryPdfBlob } = await import('../inventoryPdf');
      const { inventoryDB } = await import('../inventoryDB');
      const blob = await generateInventoryPdfBlob(
        inventory,
        { address: '', owner: '', chip: '' },
        async (id) => {
          const photo = await inventoryDB.getPhoto(id);
          return (photo as any)?.dataUrl ?? null;
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
      if ((e as any).name !== 'AbortError') {
        console.error(e);
        setError('No se pudo compartir');
      }
    }
  };

  const handleEmail = (email: string) => {
    const subject = encodeURIComponent(`Inventario ${inventory.phase === 'inicial' ? 'Inicial' : 'Final'} — Inmueble`);
    const body = encodeURIComponent(
      `Cordial saludo,\n\nAdjunto encontrará el inventario firmado del inmueble.\n\nPor favor adjunte el PDF descargado.\n\nCordialmente.`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const handleWhatsApp = (phone: string) => {
    // Limpia el teléfono para wa.me (solo dígitos)
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
