import { useState } from "react";
import {
  Users,
  FileText,
  Wallet,
  ClipboardCheck,
  FileSignature,
  RefreshCw,
  Car,
  Package,
  Box,
  User,
  AlertTriangle,
  Plus,
  X,
  CloudUpload,
  CloudOff,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button, Card, Modal, Input } from "../../../shared/ui";
import type { WizardOwner, WizardUnit } from "./StepBasic";

/**
 * Estado real de un archivo en un slot del wizard.
 * - 'drive'   → el archivo está en Google Drive (URL https://drive.google.com/...)
 * - 'local'   → solo en el navegador (blob: URL) — se subirá a Drive al finalizar el wizard
 * - 'pending' → slot vacío o archivo en tránsito (no aplica cuando hay archivos)
 */
export type DocStorageState = "drive" | "local" | "pending";

/** Determina el estado real de un archivo a partir de su URL.
 *  - blob: → local (aún no se subió a Drive)
 *  - https://*.googleusercontent.com o https://drive.google.com/ → en Drive
 *  - cualquier otra cosa → local (asumimos fallback) */
export function getDocStorageState(url: string): DocStorageState {
  if (!url) return "pending";
  if (url.startsWith("blob:")) return "local";
  // FIX #18: testear solo el path (sin query params como ?usp=drivesdk).
  // Antes la regex testeaba desde el inicio hasta el final del string,
  // fallando si Drive agregaba query params.
  const pathOnly = url.split("?")[0];
  if (/^https:\/\/(drive|docs)\.google\.com\//.test(pathOnly)) return "drive";
  if (/^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(pathOnly))
    return "drive";
  return "local";
}

/** Llave del slot de un documento en `uploadedDocs`. */
export type DocSlotKey =
  | `cedula:${string}`
  | `rut:${string}`
  | `certificado_tradicion:main`
  | `certificado_tradicion:${string}`
  | `predial`
  | `mandato`;

/** Cada slot ahora puede tener N archivos subidos (no solo 1).
 *  Antes: `Record<slotKey, string | null>` — limitaba a 1 PDF por slot.
 *  Ahora: `Record<slotKey, string[]>` — el agente puede subir varias hojas
 *  de vida de un propietario, varios RUTs, etc. */
export type UploadedDocsMap = Record<string, string[]>;

/** Etiqueta humana para mostrar al usuario en cards / toasts / logs. */
function labelForKey(
  key: string,
  owners: WizardOwner[],
  units: WizardUnit[],
): string {
  if (key === "predial") return "Impuesto Predial";
  if (key === "mandato") return "Contrato de Mandato (multi-firmado)";
  if (key === "certificado_tradicion:main")
    return "Certificado de Tradición (unidad principal)";
  if (key.startsWith("cedula:")) {
    const id = key.slice("cedula:".length);
    const o = owners.find((x) => x.id === id);
    return o?.name ? `Cédula de ${o.name}` : "Cédula";
  }
  if (key.startsWith("rut:")) {
    const id = key.slice("rut:".length);
    const o = owners.find((x) => x.id === id);
    return o?.name ? `RUT de ${o.name}` : "RUT";
  }
  if (key.startsWith("certificado_tradicion:")) {
    const id = key.slice("certificado_tradicion:".length);
    const u = units.find((x) => x.id === id);
    return u ? `Certificado de ${u.label}` : "Certificado de Tradición";
  }
  return key;
}

export interface StepDocsProps {
  // Estado del wizard
  owners: WizardOwner[];
  units: WizardUnit[];
  /** Mapa de documentos subidos. Clave = slotKey, valor = array de URLs/Blob URLs.
   *  Vacío `[]` = no hay archivos; `["blob:..."]` o `["https://..."]` = N archivos. */
  uploadedDocs: UploadedDocsMap;
  setUploadedDocs: (next: UploadedDocsMap) => void;
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
  showToast: (msg: string, type?: "success" | "error") => void;
  onBack: () => void;
  onContinue: () => void;
  /** Dispara el file picker. El padre maneja la subida (Drive o blob local)
   *  y vuelve a llamar a `setUploadedDocs` con el array actualizado. */
  triggerFileInput: (label: string) => void;
  /** Persiste el estado del paso 2 (documentos) sin avanzar al inventario.
   *  El padre ya hace autosave; este botón da feedback explícito al agente. */
  onSaveDraft: () => void;
  /** Slot al que el padre acaba de subir un PDF exitosamente. Cuando cambia a
   *  un valor no-null, abrimos el modal "¿Querés subir otro documento?".
   *  El padre lo limpia (set null) cuando el modal se cierra. */
  lastUploadedSlot: string | null;
  setLastUploadedSlot: (v: string | null) => void;
}

/** Helper: cantidad de archivos en un slot (0 si el slot no existe o está vacío). */
function countInSlot(map: UploadedDocsMap, slotKey: string): number {
  const arr = map[slotKey];
  return Array.isArray(arr) ? arr.length : 0;
}

/** Cards que se renderizan en el paso 2. Cada card tiene su slotKey, ícono
 *  y validación de "qué falta para activar la propiedad al 100%". */
function buildRequiredSlots(
  owners: WizardOwner[],
  units: WizardUnit[],
): Array<{
  slotKey: string;
  group: "owner" | "unit" | "property";
  ownerId?: string;
  unitId?: string;
  required: boolean;
  helpText: string;
}> {
  const slots: Array<{
    slotKey: string;
    group: "owner" | "unit" | "property";
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
      group: "owner",
      ownerId: o.id,
      required: true,
      helpText: o.idNumber ? `Cédula: ${o.idNumber}` : "Cédula pendiente",
    });
    slots.push({
      slotKey: `rut:${o.id}`,
      group: "owner",
      ownerId: o.id,
      required: false,
      helpText: "RUT (opcional)",
    });
  }

  // Unidad principal: Certificado de Tradición
  slots.push({
    slotKey: "certificado_tradicion:main",
    group: "unit",
    required: true,
    helpText: "Matrícula del inmueble principal",
  });

  // Cada unidad adicional: Certificado
  for (const u of units) {
    if (!u.label.trim()) continue;
    slots.push({
      slotKey: `certificado_tradicion:${u.id}`,
      group: "unit",
      unitId: u.id,
      required: true,
      helpText: u.folioMatricula
        ? `Matrícula: ${u.folioMatricula}`
        : `Matrícula de ${u.label}`,
    });
  }

  // Predial (a nivel de propiedad)
  slots.push({
    slotKey: "predial",
    group: "property",
    required: false,
    helpText: "Predial del año en curso",
  });

  // Mandato (a nivel de propiedad, multi-firmado)
  slots.push({
    slotKey: "mandato",
    group: "property",
    required: true,
    helpText: "Firmado por todos los propietarios",
  });

  return slots;
}

export function StepDocs({
  owners,
  units,
  uploadedDocs,
  setUploadedDocs,
  uploadingDoc,
  setUploadingDoc,
  currentDocLabel,
  setCurrentDocLabel,
  ownerIdNumber,
  setOwnerIdNumber,
  viewingDoc,
  setViewingDoc,
  showToast,
  onBack,
  onContinue,
  triggerFileInput,
  onSaveDraft,
  lastUploadedSlot,
  setLastUploadedSlot,
}: StepDocsProps) {
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);
  const [confirmContinue, setConfirmContinue] = useState(false);

  const slots = buildRequiredSlots(owners, units);
  const isMandatoReady = countInSlot(uploadedDocs, "mandato") > 0;
  // Para activar: todos los slots "required" deben tener al menos 1 archivo.
  const missingRequired = slots.filter(
    (s) => s.required && countInSlot(uploadedDocs, s.slotKey) === 0,
  );

  // Agrupar slots por sección visual
  const ownerSlots = slots.filter((s) => s.group === "owner");
  const unitSlots = slots.filter((s) => s.group === "unit");
  const propertySlots = slots.filter((s) => s.group === "property");

  // Helper: ícono según slotKey
  function iconForKey(key: string, group: string, unitId?: string) {
    if (key === "predial") return Wallet;
    if (key === "mandato") return FileSignature;
    if (key.startsWith("cedula:") || key.startsWith("rut:")) return Users;
    if (key.startsWith("certificado_tradicion:")) {
      if (group === "unit" && unitId) {
        const u = units.find((x) => x.id === unitId);
        if (u?.type === "parking") return Car;
        if (u?.type === "storage") return Package;
        if (u?.type === "other") return Box;
      }
      return FileText;
    }
    return FileText;
  }

  /** Quita un PDF específico del array de un slot. */
  const removeFileFromSlot = (slotKey: string, index: number) => {
    const current = uploadedDocs[slotKey] ?? [];
    const next = current.filter((_, i) => i !== index);
    setUploadedDocs({ ...uploadedDocs, [slotKey]: next });
    showToast(`Archivo quitado de ${labelForKey(slotKey, owners, units)}`);
  };

  return (
    <Card className="p-8">
      <h3 className="font-bold text-lg mb-2">2. Carga de Documentos Legales</h3>
      <p className="text-xs text-slate-500 mb-6">
        Subí los documentos por propietario y por unidad.{" "}
        <strong>Todos los documentos son opcionales</strong>: podés subir los
        que tengas a mano ahora y completar los que falten después desde el
        Detalle del Inmueble. El <strong>Contrato de Mandato</strong> firmado
        por todos los propietarios es el que activa el inmueble al 100% (estado{" "}
        <em>Activo</em>).
      </p>

      {/* Banner del check de validación: el contrato de mandato desbloquea el 100% */}
      <div
        className={`mb-6 p-3 rounded-lg border text-xs flex items-start gap-2 ${
          isMandatoReady
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}
      >
        <FileSignature className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          {isMandatoReady ? (
            <>
              <strong>Mandato firmado listo.</strong> Al finalizar el registro,
              el inmueble quedará en estado
              <strong> Activo (100%)</strong>.
            </>
          ) : (
            <>
              <strong>
                Falta el Contrato de Mandato firmado por todos los propietarios.
              </strong>{" "}
              Mientras no subas el PDF, el inmueble quedará en estado{" "}
              <strong>Pendiente</strong>.
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
              Documentos por Propietario ({ownerSlots.length / 2} propietario
              {ownerSlots.length / 2 === 1 ? "" : "s"})
            </p>
          </div>
          <div className="space-y-3">
            {owners
              .filter((o) => o.name.trim())
              .map((o) => {
                const cedulaKey = `cedula:${o.id}`;
                const rutKey = `rut:${o.id}`;
                return (
                  <div
                    key={o.id}
                    className="p-3 bg-slate-50/50 border border-slate-200 rounded-lg"
                  >
                    <p className="text-xs font-bold text-slate-700 mb-2">
                      {o.name}{" "}
                      {o.ownershipPct && (
                        <span className="text-[10px] text-blue-600 font-normal">
                          ({o.ownershipPct}%)
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        {
                          slotKey: cedulaKey,
                          label: "Cédula",
                          icon: Users,
                          required: true,
                        },
                        {
                          slotKey: rutKey,
                          label: "RUT",
                          icon: ClipboardCheck,
                          required: false,
                        },
                      ].map(({ slotKey, label, icon: Icon, required }) => (
                        <DocCard
                          key={slotKey}
                          docKey={slotKey}
                          label={`${label} de ${o.name}`}
                          Icon={Icon}
                          files={uploadedDocs[slotKey] ?? []}
                          required={required}
                          isMandato={false}
                          uploading={uploadingDoc === slotKey}
                          onPick={() => {
                            if (
                              slotKey === cedulaKey &&
                              !ownerIdNumber &&
                              !o.idNumber
                            ) {
                              // heredamos el idNumber del owner si está
                              if (o.idNumber) setOwnerIdNumber(o.idNumber);
                            }
                            triggerFileInput(slotKey);
                          }}
                          onAddAnother={() => triggerFileInput(slotKey)}
                          onRemove={(i) => removeFileFromSlot(slotKey, i)}
                          onView={(url) =>
                            setViewingDoc({
                              label: labelForKey(slotKey, owners, units),
                              url,
                            })
                          }
                        />
                      ))}
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
              Certificados de Tradición ({unitSlots.length} unidad
              {unitSlots.length === 1 ? "" : "es"})
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unitSlots.map((s) => (
              <DocCard
                key={s.slotKey}
                docKey={s.slotKey}
                label={labelForKey(s.slotKey, owners, units)}
                Icon={iconForKey(s.slotKey, s.group, s.unitId)}
                files={uploadedDocs[s.slotKey] ?? []}
                required={s.required}
                isMandato={false}
                helpText={s.helpText}
                uploading={uploadingDoc === s.slotKey}
                onPick={() => triggerFileInput(s.slotKey)}
                onAddAnother={() => triggerFileInput(s.slotKey)}
                onRemove={(i) => removeFileFromSlot(s.slotKey, i)}
                onView={(url) =>
                  setViewingDoc({
                    label: labelForKey(s.slotKey, owners, units),
                    url,
                  })
                }
              />
            ))}
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
              const Icon = iconForKey(s.slotKey, s.group, s.unitId);
              const isMandato = s.slotKey === "mandato";
              return (
                <DocCard
                  key={s.slotKey}
                  docKey={s.slotKey}
                  label={labelForKey(s.slotKey, owners, units)}
                  Icon={Icon}
                  files={uploadedDocs[s.slotKey] ?? []}
                  required={s.required}
                  isMandato={isMandato}
                  helpText={s.helpText}
                  uploading={uploadingDoc === s.slotKey}
                  onPick={() => triggerFileInput(s.slotKey)}
                  onAddAnother={() => triggerFileInput(s.slotKey)}
                  onRemove={(i) => removeFileFromSlot(s.slotKey, i)}
                  onView={(url) =>
                    setViewingDoc({
                      label: labelForKey(s.slotKey, owners, units),
                      url,
                    })
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Acciones ── */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Atrás
        </Button>
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => {
            // El padre (PropertiesView) muestra el toast honesto tras
            // ensurePropertyPersisted(). NO disparamos un toast mentiroso
            // acá (sería un segundo toast contradictorio — fix de bug
            // reportado el 2026-08-05).
            onSaveDraft();
          }}
        >
          💾 Guardar avance (este equipo)
        </Button>
        <Button className="flex-1" onClick={() => setConfirmContinue(true)}>
          {missingRequired.length > 0
            ? `Continuar con ${missingRequired.length} pendiente(s)`
            : "Continuar a Inventario"}
        </Button>
      </div>

      {/* Modal de confirmación antes de pasar al inventario.
          Migración 011+: si faltan documentos requeridos, muestra la lista
          explícita + un checkbox de "Entiendo los pendientes" para que el
          user no se cuele por error. */}
      <Modal
        isOpen={confirmContinue}
        onClose={() => setConfirmContinue(false)}
        title="¿Continuar al Inventario?"
      >
        <div className="space-y-4">
          {missingRequired.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Vas a finalizar con {missingRequired.length} documento(s)
                pendiente(s)
              </p>
              <ul className="text-xs space-y-1 list-disc pl-5">
                {missingRequired.map((m) => (
                  <li key={m.slotKey}>
                    {labelForKey(m.slotKey, owners, units)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-800">
                La propiedad quedará en estado <strong>Pendiente</strong> y los
                docs faltantes se podrán subir después desde el{" "}
                <strong>Detalle del Inmueble</strong>.
              </p>
            </div>
          )}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
            <p>
              Una vez en el inventario no podrá modificar los documentos desde
              aquí.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Si después detecta un error en algún PDF, puede entrar al Detalle
              del Inmueble y reemplazarlo manualmente.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmContinue(false)}
            >
              {missingRequired.length > 0
                ? "Subir los pendientes"
                : "Revisar documentos"}
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setConfirmContinue(false);
                onContinue();
              }}
            >
              {missingRequired.length > 0
                ? `Sí, continuar con ${missingRequired.length} pendiente(s)`
                : "Sí, continuar"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isIdModalOpen}
        onClose={() => setIsIdModalOpen(false)}
        title="Número de Cédula de Ciudadanía"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Ingrese el número de identificación del propietario.
          </p>
          <Input
            label="Número de Cédula"
            placeholder="Ej: 1.023.456.789"
            value={ownerIdNumber}
            onChange={(e) => setOwnerIdNumber(e.target.value)}
          />
          <Button
            className="w-full mt-6"
            onClick={() => {
              if (!ownerIdNumber) {
                showToast("Debe ingresar el número de cédula", "error");
                return;
              }
              setIsIdModalOpen(false);
            }}
          >
            Guardar y Continuar
          </Button>
        </div>
      </Modal>

      {/* ── Modal: "¿Querés subir otro documento de este tipo?" ──
          Se dispara justo después de que el padre terminó de subir un PDF
          a un slot. Le da al agente la opción de encadenar varias hojas
          (ej: 2 PDFs de cédula) sin tener que volver a buscar el slot. */}
      <Modal
        isOpen={!!lastUploadedSlot}
        onClose={() => setLastUploadedSlot(null)}
        title="¿Querés subir otro documento?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {lastUploadedSlot && (
              <>
                Subiste <strong>1 archivo</strong> a{" "}
                <strong>{labelForKey(lastUploadedSlot, owners, units)}</strong>.
              </>
            )}
          </p>
          <p className="text-xs text-slate-500">
            Si este documento tiene varias hojas (ej: cara y respaldo de la
            cédula, o varias páginas del RUT), podés subir más archivos del
            mismo tipo acá mismo. Cuando termines, presioná{" "}
            <strong>"No, ya está"</strong> para volver a la lista.
          </p>
          {lastUploadedSlot && (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
              <strong>Archivos subidos hasta ahora:</strong>{" "}
              {countInSlot(uploadedDocs, lastUploadedSlot)}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLastUploadedSlot(null)}
            >
              No, ya está
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => {
                if (lastUploadedSlot) {
                  triggerFileInput(lastUploadedSlot);
                }
                setLastUploadedSlot(null);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Sí, subir otro
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

/** ── DocCard: tarjeta individual de un documento. Soporta N archivos por
 *  slot. Muestra la cantidad de PDFs subidos, la lista con botón ver/quitar,
 *  y dos CTAs: "Subir/Reemplazar" (abre el file picker) y "Agregar otro"
 *  (lo mismo, para encadenar varias hojas). ── */
interface DocCardProps {
  // React pasa `key` automáticamente en JSX; lo aceptamos como opcional para
  // que TS no se queje. (El componente no la usa — es solo para reconciliación.)
  key?: string | number;
  docKey: string;
  label: string;
  Icon: typeof Users;
  /** Lista de URLs/Blob URLs de los archivos subidos para este slot. */
  files: string[];
  required: boolean;
  isMandato: boolean;
  helpText?: string;
  uploading: boolean;
  onPick: () => void;
  onAddAnother: () => void;
  onRemove: (index: number) => void;
  onView: (url: string) => void;
}
function DocCard(props: DocCardProps) {
  const {
    docKey,
    label,
    Icon,
    files,
    required,
    isMandato,
    helpText,
    uploading,
    onPick,
    onAddAnother,
    onRemove,
    onView,
  } = props;
  const hasFiles = files.length > 0;
  // Estado del almacenamiento: derivado de la URL real de cada archivo.
  // Si TODOS están en Drive → 'drive'. Si al menos uno es local → 'local'.
  const allDrive =
    hasFiles && files.every((u) => getDocStorageState(u) === "drive");
  const anyLocal =
    hasFiles && files.some((u) => getDocStorageState(u) === "local");
  const storageState: DocStorageState | null = !hasFiles
    ? null
    : allDrive
      ? "drive"
      : anyLocal
        ? "local"
        : "pending";

  return (
    <div
      className={`p-4 border-2 border-dashed rounded-xl transition-all group relative ${
        isMandato && storageState === "drive"
          ? "border-emerald-300 bg-emerald-50/30"
          : storageState === "drive"
            ? "border-emerald-200 bg-emerald-50/20"
            : storageState === "local"
              ? "border-amber-200 bg-amber-50/20"
              : "border-slate-200 hover:border-blue-400"
      }`}
      data-testid={`doc-card-${docKey}`}
    >
      <div className="flex justify-between items-start">
        <Icon
          className={`w-6 h-6 ${storageState === "drive" ? "text-emerald-500" : uploading ? "text-blue-500 animate-pulse" : storageState === "local" ? "text-amber-500" : "text-slate-400 group-hover:text-blue-500"} mb-2`}
        />
        {storageState === "drive" && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex items-center gap-1"
            title="Archivo ya está en Google Drive"
          >
            <CheckCircle2 className="w-3 h-3" />
            En Drive
          </span>
        )}
        {storageState === "local" && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1"
            title="Archivo solo en este navegador — se subirá a Drive al finalizar el wizard"
          >
            <CloudUpload className="w-3 h-3" />
            Pendiente → Drive
          </span>
        )}
        {!storageState && hasFiles && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
            {files.length} {files.length === 1 ? "archivo" : "archivos"}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      {helpText && (
        <p className="text-[10px] text-slate-500 mt-0.5">{helpText}</p>
      )}
      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
        {uploading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Subiendo a Drive...
          </>
        ) : storageState === "drive" ? (
          isMandato ? (
            "PDF firmado — propiedad al 100%"
          ) : (
            "Documento en Google Drive"
          )
        ) : storageState === "local" ? (
          isMandato ? (
            "Firmado, falta subir a Drive al finalizar"
          ) : (
            "Listo localmente. Se sube a Drive al finalizar el wizard"
          )
        ) : required ? (
          <>
            <CloudOff className="w-3 h-3" />
            Pendiente (opcional, no bloquea)
          </>
        ) : (
          "Click para subir PDF (opcional)"
        )}
      </p>

      {/* ── Lista de archivos subidos ── */}
      {hasFiles && (
        <ul className="mt-3 space-y-1">
          {files.map((url, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 text-[11px] bg-white/80 border border-slate-200 rounded px-2 py-1"
            >
              <button
                type="button"
                onClick={() => onView(url)}
                className="flex items-center gap-1.5 text-blue-600 hover:underline truncate flex-1 text-left"
                title="Ver PDF"
              >
                <FileText className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">Archivo {i + 1}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-red-500 hover:text-red-700 p-0.5"
                title="Quitar este archivo"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── Acciones: subir/reemplazar + agregar otro ── */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="flex-1 min-w-[110px] px-2.5 py-1.5 text-[11px] font-bold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1 disabled:opacity-50"
        >
          {hasFiles ? (
            <>
              <RefreshCw className="w-3 h-3" />
              Reemplazar
            </>
          ) : (
            <>
              <FileText className="w-3 h-3" />
              Subir PDF
            </>
          )}
        </button>
        {hasFiles && (
          <button
            type="button"
            onClick={onAddAnother}
            disabled={uploading}
            className="flex-1 min-w-[110px] px-2.5 py-1.5 text-[11px] font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            Agregar otro
          </button>
        )}
      </div>

      {/* Botón "Ver" del primer archivo (atajo rápido, legacy compat) — ocultado
          porque el nuevo badge de estado de Drive ocupa el top-right. El ojo
          sigue disponible por archivo en la lista de arriba. */}
    </div>
  );
}

// (Input se importa arriba del archivo)
