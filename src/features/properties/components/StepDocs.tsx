import { useState } from 'react';
import { Users, FileText, Wallet, ClipboardCheck, Eye, FileSignature, RefreshCw, Car, Package, Box, User } from 'lucide-react';
import { Button, Card, Modal, Input } from '../../../shared/ui';
import type { WizardOwner, WizardUnit } from './StepBasic';

/** Llave del slot de un documento en `uploadedDocs`. */
export type DocSlotKey =
  | `cedula:${string}`
  | `rut:${string}`
  | `certificado_tradicion:main`
  | `certificado_tradicion:${string}`
  | `predial`
  | `mandato`;

/** Etiqueta humana para mostrar al usuario en cards / toasts / logs. */
function labelForKey(key: string, owners: WizardOwner[], units: WizardUnit[]): string {
  if (key === 'predial') return 'Impuesto Predial';
  if (key === 'mandato') return 'Contrato de Mandato (multi-firmado)';
  if (key === 'certificado_tradicion:main') return 'Certificado de Tradición (unidad principal)';
  if (key.startsWith('cedula:')) {
    const id = key.slice('cedula:'.length);
    const o = owners.find((x) => x.id === id);
    return o?.name ? `Cédula de ${o.name}` : 'Cédula';
  }
  if (key.startsWith('rut:')) {
    const id = key.slice('rut:'.length);
    const o = owners.find((x) => x.id === id);
    return o?.name ? `RUT de ${o.name}` : 'RUT';
  }
  if (key.startsWith('certificado_tradicion:')) {
    const id = key.slice('certificado_tradicion:'.length);
    const u = units.find((x) => x.id === id);
    return u ? `Certificado de ${u.label}` : 'Certificado de Tradición';
  }
  return key;
}

export interface StepDocsProps {
  // Estado del wizard
  owners: WizardOwner[];
  units: WizardUnit[];
  // Docs subidos (key = slotKey, value = url)
  uploadedDocs: Record<string, string | null>;
  setUploadedDocs: (next: Record<string, string | null>) => void;
  uploadingDoc: string | null;
  setUploadingDoc: (v: string | null) => void;
  currentDocLabel: string | null;
  setCurrentDocLabel: (v: string | null) => void;
  // Cédula del primer propietario (legacy compat con el modal de cédula)
  ownerIdNumber: string;
  setOwnerIdNumber: (v: string) => void;
  // Visor
  viewingDoc: { label: string; url: string } | null;
  setViewingDoc: (v: { label: string; url: string } | null) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onBack: () => void;
  onContinue: () => void;
  triggerFileInput: (label: string) => void;
}

/** Cards que se renderizan en el paso 2. Cada card tiene su slotKey, ícono
 *  y validación de "qué falta para activar la propiedad al 100%". */
function buildRequiredSlots(owners: WizardOwner[], units: WizardUnit[]): Array<{
  slotKey: string;
  group: 'owner' | 'unit' | 'property';
  ownerId?: string;
  unitId?: string;
  required: boolean;
  helpText: string;
}> {
  const slots: Array<{
    slotKey: string;
    group: 'owner' | 'unit' | 'property';
    ownerId?: string;
    unitId?: string;
    required: boolean;
    helpText: string;
  }> = [];

  // Por cada propietario: CC + RUT (RUT opcional)
  for (const o of owners) {
    if (!o.name.trim()) continue; // owners sin nombre no tienen docs
    slots.push({
      slotKey: `cedula:${o.id}`,
      group: 'owner',
      ownerId: o.id,
      required: true,
      helpText: o.idNumber ? `Cédula: ${o.idNumber}` : 'Cédula pendiente',
    });
    slots.push({
      slotKey: `rut:${o.id}`,
      group: 'owner',
      ownerId: o.id,
      required: false,
      helpText: 'RUT (opcional)',
    });
  }

  // Unidad principal: Certificado de Tradición
  slots.push({
    slotKey: 'certificado_tradicion:main',
    group: 'unit',
    required: true,
    helpText: 'Matrícula del inmueble principal',
  });

  // Cada unidad adicional: Certificado
  for (const u of units) {
    if (!u.label.trim()) continue;
    slots.push({
      slotKey: `certificado_tradicion:${u.id}`,
      group: 'unit',
      unitId: u.id,
      required: true,
      helpText: u.folioMatricula ? `Matrícula: ${u.folioMatricula}` : `Matrícula de ${u.label}`,
    });
  }

  // Predial (a nivel de propiedad)
  slots.push({
    slotKey: 'predial',
    group: 'property',
    required: false,
    helpText: 'Predial del año en curso',
  });

  // Mandato (a nivel de propiedad, multi-firmado)
  slots.push({
    slotKey: 'mandato',
    group: 'property',
    required: true,
    helpText: 'Firmado por todos los propietarios',
  });

  return slots;
}

export function StepDocs({
  owners, units,
  uploadedDocs, setUploadedDocs,
  uploadingDoc, setUploadingDoc,
  currentDocLabel, setCurrentDocLabel,
  ownerIdNumber, setOwnerIdNumber,
  viewingDoc, setViewingDoc,
  showToast, onBack, onContinue, triggerFileInput,
}: StepDocsProps) {
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);
  const [confirmContinue, setConfirmContinue] = useState(false);

  const slots = buildRequiredSlots(owners, units);
  const isMandatoReady = !!uploadedDocs['mandato'];
  // Para activar: todos los slots "required" deben estar subidos
  const missingRequired = slots.filter((s) => s.required && !uploadedDocs[s.slotKey]);

  // Agrupar slots por sección visual
  const ownerSlots = slots.filter((s) => s.group === 'owner');
  const unitSlots = slots.filter((s) => s.group === 'unit');
  const propertySlots = slots.filter((s) => s.group === 'property');

  // Helper: ícono según slotKey
  function iconForKey(key: string, group: string, unitId?: string) {
    if (key === 'predial') return Wallet;
    if (key === 'mandato') return FileSignature;
    if (key.startsWith('cedula:') || key.startsWith('rut:')) return Users;
    if (key.startsWith('certificado_tradicion:')) {
      if (group === 'unit' && unitId) {
        const u = units.find((x) => x.id === unitId);
        if (u?.type === 'parking') return Car;
        if (u?.type === 'storage') return Package;
        if (u?.type === 'other') return Box;
      }
      return FileText;
    }
    return FileText;
  }

  return (
    <Card className="p-8">
      <h3 className="font-bold text-lg mb-2">2. Carga de Documentos Legales</h3>
      <p className="text-xs text-slate-500 mb-6">
        Subí los documentos por propietario y por unidad. El <strong>Contrato de Mandato</strong> firmado por
        todos los propietarios es el que activa el inmueble al 100% (estado <em>Activo</em>).
      </p>

      {/* Banner del check de validación: el contrato de mandato desbloquea el 100% */}
      <div
        className={`mb-6 p-3 rounded-lg border text-xs flex items-start gap-2 ${
          isMandatoReady
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        <FileSignature className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          {isMandatoReady ? (
            <>
              <strong>Mandato firmado listo.</strong> Al finalizar el registro, el inmueble quedará en estado
              <strong> Activo (100%)</strong>.
            </>
          ) : (
            <>
              <strong>Falta el Contrato de Mandato firmado por todos los propietarios.</strong> Mientras no subas
              el PDF, el inmueble quedará en estado <strong>Pendiente</strong>.
            </>
          )}
        </div>
      </div>

      {/* ── Sección: Propietarios ── */}
      {ownerSlots.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Documentos por Propietario ({ownerSlots.length / 2} propietario{ownerSlots.length / 2 === 1 ? '' : 's'})
            </p>
          </div>
          <div className="space-y-3">
            {owners.filter((o) => o.name.trim()).map((o) => {
              const cedulaKey = `cedula:${o.id}`;
              const rutKey = `rut:${o.id}`;
              return (
                <div key={o.id} className="p-3 bg-slate-50/50 border border-slate-200 rounded-lg">
                  <p className="text-xs font-bold text-slate-700 mb-2">
                    {o.name}{' '}
                    {o.ownershipPct && (
                      <span className="text-[10px] text-blue-600 font-normal">({o.ownershipPct}%)</span>
                    )}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { slotKey: cedulaKey, label: 'Cédula', icon: Users, required: true },
                      { slotKey: rutKey, label: 'RUT', icon: ClipboardCheck, required: false },
                    ].map(({ slotKey, label, icon: Icon, required }) => {
                      const url = uploadedDocs[slotKey];
                      return (
                        <DocCard
                          key={slotKey}
                          docKey={slotKey}
                          label={`${label} de ${o.name}`}
                          Icon={Icon}
                          isReady={!!url}
                          required={required}
                          isMandato={false}
                          uploading={uploadingDoc === slotKey}
                          onPick={() => {
                            if (slotKey === cedulaKey && !ownerIdNumber && !o.idNumber) {
                              // heredamos el idNumber del owner si está
                              if (o.idNumber) setOwnerIdNumber(o.idNumber);
                            }
                            triggerFileInput(slotKey);
                          }}
                          onView={() => url && setViewingDoc({ label: labelForKey(slotKey, owners, units), url })}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sección: Certificados de Tradición ── */}
      {unitSlots.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Certificados de Tradición ({unitSlots.length} unidad{unitSlots.length === 1 ? '' : 'es'})
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unitSlots.map((s) => {
              const url = uploadedDocs[s.slotKey];
              const Icon = iconForKey(s.slotKey, s.group, s.unitId);
              return (
                <DocCard
                  key={s.slotKey}
                  docKey={s.slotKey}
                  label={labelForKey(s.slotKey, owners, units)}
                  Icon={Icon}
                  isReady={!!url}
                  required={s.required}
                  isMandato={false}
                  helpText={s.helpText}
                  uploading={uploadingDoc === s.slotKey}
                  onPick={() => triggerFileInput(s.slotKey)}
                  onView={() => url && setViewingDoc({ label: labelForKey(s.slotKey, owners, units), url })}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sección: Documentos de la propiedad ── */}
      {propertySlots.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FileSignature className="w-4 h-4 text-slate-500" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Documentos de la Propiedad
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {propertySlots.map((s) => {
              const url = uploadedDocs[s.slotKey];
              const Icon = iconForKey(s.slotKey, s.group, s.unitId);
              const isMandato = s.slotKey === 'mandato';
              return (
                <DocCard
                  key={s.slotKey}
                  docKey={s.slotKey}
                  label={labelForKey(s.slotKey, owners, units)}
                  Icon={Icon}
                  isReady={!!url}
                  required={s.required}
                  isMandato={isMandato}
                  helpText={s.helpText}
                  uploading={uploadingDoc === s.slotKey}
                  onPick={() => triggerFileInput(s.slotKey)}
                  onView={() => url && setViewingDoc({ label: labelForKey(s.slotKey, owners, units), url })}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Acciones ── */}
      <div className="flex gap-4 mt-8">
        <Button variant="outline" className="flex-1" onClick={onBack}>Atrás</Button>
        <Button
          className="flex-1"
          onClick={() => setConfirmContinue(true)}
          disabled={missingRequired.length > 0}
        >
          {missingRequired.length > 0
            ? `Faltan ${missingRequired.length} doc(s) requerido(s)`
            : 'Continuar a Inventario'}
        </Button>
      </div>

      {/* Modal de confirmación antes de pasar al inventario */}
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
          }}>Guardar y Continuar</Button>
        </div>
      </Modal>
    </Card>
  );
}

/** ── DocCard: tarjeta individual de un documento. Se usa en todas las
 *  secciones (owner / unit / property). Mantiene el estilo del componente
 *  original. ── */
// En React+TS 5, pasar `key={...}` en JSX agrega implícitamente la prop
// `key` al type de las props del componente. La marcamos como opcional y
// la ignoramos (React la consume a nivel de reconciliación, no llega al
// componente).
interface DocCardProps {
  key?: string | number;
  docKey: string;
  label: string;
  Icon: typeof Users;
  isReady: boolean;
  required: boolean;
  isMandato: boolean;
  helpText?: string;
  uploading: boolean;
  onPick: () => void;
  onView: () => void;
}
function DocCard(props: DocCardProps) {
  const { key: _key, docKey, label, Icon, isReady, required, isMandato, helpText, uploading, onPick, onView } = props;
  return (
    <div
      className={`p-4 border-2 border-dashed rounded-xl transition-all cursor-pointer group relative ${
        isMandato && isReady
          ? 'border-emerald-300 bg-emerald-50/30'
          : 'border-slate-200 hover:border-blue-400'
      }`}
      onClick={() => {
        if (uploading) return;
        onPick();
      }}
      data-testid={`doc-card-${docKey}`}
    >
      <div className="flex justify-between items-start">
        <Icon className={`w-6 h-6 ${isReady ? 'text-emerald-500' : uploading ? 'text-blue-500 animate-pulse' : 'text-slate-400 group-hover:text-blue-500'} mb-2`} />
        {isReady && <ClipboardCheck className="w-4 h-4 text-emerald-500" />}
      </div>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      {helpText && <p className="text-[10px] text-slate-500 mt-0.5">{helpText}</p>}
      <p className="text-xs text-slate-400 mt-1">
        {uploading
          ? 'Subiendo...'
          : isReady
            ? isMandato
              ? 'PDF firmado — estado 100%'
              : 'Documento listo'
            : required
              ? 'Click para subir PDF (requerido)'
              : 'Click para subir PDF (opcional)'}
      </p>
      {isReady && (
        <div className="absolute bottom-3 right-3 flex gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onPick(); }}
            title="Reemplazar PDF"
            className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onView(); }}
            title="Ver PDF"
            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// (Input se importa arriba del archivo)
