import React, { useState, useRef, useEffect } from 'react';
import { generateMandatoPdf } from './mandatoPdf';
import { useSettingsStore } from '../../shared/store/settingsStore';
import { motion } from 'motion/react';
import { FileText, Image, Eye, ClipboardCheck, GitCompare, Download, FileSignature, Upload, Building2, Hash, CreditCard, Power, Trash2, Lock, ListChecks, Camera, X, ChevronLeft, ChevronRight, RefreshCw, Users, Car, Package, Box, User as UserIcon, Mail, Phone, IdCard, Percent } from 'lucide-react';
import { Button, Card, Modal } from '../../shared/ui';
import { ProcessOrderBanner } from '../../shared/ui/ProcessOrderBanner';
import { formatAddress, isValidCHIP } from '../../utils/validators';
import { createPropertyFolders, uploadFileToDrive, fileToBase64 } from '../../lib/drive/driveService';
import { useGoogleDriveStore } from '../../shared/store/googleDriveStore';
import { useAppStore } from '../../shared/store/appStore';
import { StepBasic, type WizardOwner, type WizardUnit } from './components/StepBasic';
import { StepDocs } from './components/StepDocs';
import { StepInventory } from './components/StepInventory';
import { Role } from '../auth/permissions';
import { useContractStore } from '../contracts/contractStore';
import { STORAGE_KEYS } from '../../shared/hooks/storageKeys';
import { PROPERTY_TYPES, type PropertyType } from './inventoryConfig';
import { inventoryDB } from './inventoryDB';
import type { Inventory } from './inventoryTypes';
import { InventoryDiffView } from './InventoryDiffView';
import { driveProxyUrl, driveDownloadUrl } from '../../lib/drive/driveProxy';
import type { PropertyOwner, PropertyUnit, PropertyUnitType } from '../../types';

export interface PropertiesViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  properties: any[];
  onAddProperty: (prop: any) => void;
  onUpdateProperty: (id: string, updates: any) => void;
  /** Elimina una propiedad (solo permitida si no tiene inventario). Devuelve {ok} o {error, hasInventories}. */
  onDeleteProperty: (id: string) => Promise<{ ok: true; driveCleanupStatus: string } | { ok: false; error: string; hasInventories?: boolean }>;
  role: Role | null;
}

const REQUIRED_AREAS = ['Cocina', 'Baño Principal', 'Habitación 1', 'Zona Social'];
/** slotKey del Contrato de Mandato (1 PDF multi-firmado por todos los propietarios). */
const MANDATO_KEY = 'mandato';
/** slotKey del Certificado de Tradición de la unidad principal. */
const CERT_MAIN_KEY = 'certificado_tradicion:main';
/** slotKey del Predial (1 por propiedad). */
const PREDIAL_KEY = 'predial';

/** Verifica si la propiedad tiene todos los documentos obligatorios + mandato firmado.
 *  Migración 010+: itera por cada owner y por cada unit, además de los docs a nivel
 *  de propiedad (Predial + Certificado principal + Mandato). */
function allDocsComplete(p: any): boolean {
  if (!p) return false;
  // Mandato y Predial: a nivel de propiedad
  if (!p.mandatePdfUrl) return false;
  if (!p.documents_property?.predial && !p.documents?.['Impuesto Predial']) {
    // Sin predial — opcional, no bloquea
  }
  // Certificado principal
  const hasMainCert = !!p.documents_property?.certificado_tradicion
    || !!p.documents?.['Certificado de Tradición'];
  if (!hasMainCert) return false;
  // CC por cada owner con nombre
  const owners = p.owners ?? [];
  for (const o of owners) {
    if (!o.name?.trim()) continue;
    if (!o.documents?.cedula) return false;
  }
  // Cert por cada unit con label
  const units = p.units ?? [];
  for (const u of units) {
    if (!u.label?.trim()) continue;
    if (!u.documents?.certificado_tradicion) return false;
  }
  return true;
}

/** Etiqueta humana de un slotKey para mostrar al usuario. Helper para los
 *  handlers que vienen del flujo de file upload (donde ya no tenemos el
 *  contexto de owners/units a mano). */
function slotKeyToLabel(
  slotKey: string,
  owners?: WizardOwner[] | PropertyOwner[],
  units?: WizardUnit[] | PropertyUnit[],
): string {
  if (slotKey === 'predial') return 'Impuesto Predial';
  if (slotKey === 'mandato') return 'Contrato de Mandato';
  if (slotKey === 'certificado_tradicion:main') return 'Certificado de Tradición';
  if (slotKey.startsWith('cedula:')) {
    const id = slotKey.slice('cedula:'.length);
    const o = owners?.find?.((x) => x.id === id);
    return o ? `Cédula de ${o.name}` : 'Cédula';
  }
  if (slotKey.startsWith('rut:')) {
    const id = slotKey.slice('rut:'.length);
    const o = owners?.find?.((x) => x.id === id);
    return o ? `RUT de ${o.name}` : 'RUT';
  }
  if (slotKey.startsWith('certificado_tradicion:')) {
    const id = slotKey.slice('certificado_tradicion:'.length);
    const u = units?.find?.((x) => x.id === id);
    return u ? `Certificado de ${u.label}` : 'Certificado de Tradición';
  }
  return slotKey;
}

/** Normaliza un texto para usarlo como nombre de archivo:
 *  - Quita tildes y eñes
 *  - Reemplaza espacios y caracteres no-alfanuméricos por _
 *  - Trim de _ al inicio/final
 *  - Colapsa múltiples _ en uno solo
 *  Ej: "Cédula de Tatiana Prieto" → "Cedula_de_Tatiana_Prieto" */
function normalizeFilename(input: string): string {
  return input
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quitar diacríticos
    .replace(/ñ/gi, 'n')                                  // ñ/Ñ → n
    .replace(/[^a-zA-Z0-9]+/g, '_')                       // no-alfanumérico → _
    .replace(/_+/g, '_')                                  // colapsar __
    .replace(/^_|_$/g, '');                               // trim _
}

/** Genera el nombre del archivo PDF para un slotKey, incluyendo el nombre
 *  del owner o unit asociado. Se usa al subir a Drive para que el archivo
 *  quede "bautizado" con info legible (no como "cedula_uuid.pdf").
 *  Siempre termina en .pdf. */
function slotKeyToFilename(
  slotKey: string,
  owners?: WizardOwner[] | PropertyOwner[],
  units?: WizardUnit[] | PropertyUnit[],
): string {
  // Casos directos: a nivel de propiedad (sin owner/unit).
  if (slotKey === 'predial') return 'Predial.pdf';
  if (slotKey === 'mandato') return 'Contrato_Mandato.pdf';
  if (slotKey === 'certificado_tradicion:main') return 'Certificado_Unidad_Principal.pdf';

  if (slotKey.startsWith('cedula:')) {
    const id = slotKey.slice('cedula:'.length);
    const o = owners?.find?.((x) => x.id === id);
    return o ? `Cedula_${normalizeFilename(o.name)}.pdf` : 'Cedula.pdf';
  }
  if (slotKey.startsWith('rut:')) {
    const id = slotKey.slice('rut:'.length);
    const o = owners?.find?.((x) => x.id === id);
    return o ? `RUT_${normalizeFilename(o.name)}.pdf` : 'RUT.pdf';
  }
  if (slotKey.startsWith('certificado_tradicion:')) {
    const id = slotKey.slice('certificado_tradicion:'.length);
    const u = units?.find?.((x) => x.id === id);
    return u ? `Certificado_${normalizeFilename(u.label)}.pdf` : 'Certificado_Tradicion.pdf';
  }
  return `${normalizeFilename(slotKey)}.pdf`;
}

export function PropertiesView({ showToast, properties, onAddProperty, onUpdateProperty, onDeleteProperty }: PropertiesViewProps) {
  const [address, setAddress] = useState('');
  const [chip, setChip] = useState('');
  const [folio, setFolio] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartamento');
  /** N propietarios del wizard. Migración 010+. */
  const [wizardOwners, setWizardOwners] = useState<WizardOwner[]>([
    { id: `wizard-owner-${Date.now()}-1`, name: '', idNumber: '', phone: '', email: '', ownershipPct: '' },
  ]);
  /** N unidades adicionales del wizard (garaje, depósito, etc.). */
  const [wizardUnits, setWizardUnits] = useState<WizardUnit[]>([]);
  /** Cédula del primer propietario (reflejada en el campo legacy de `ownerIdNumber`).
   *  Mantenemos por compat con el modal de cédula que se abre al clickear CC. */
  const [ownerIdNumber, setOwnerIdNumber] = useState('');
  /** Si false → se muestra la lista de inmuebles. Si true → se muestra el wizard de captación. */
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  /** Docs subidos en el wizard. key = slotKey (ej: "cedula:<ownerId>", "predial", "mandato"). */
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string | null>>({});
  /** Files en memoria del wizard de captación. Se suben a Drive en handleFinalize. */
  const [wizardFiles, setWizardFiles] = useState<Record<string, File | null>>({});
  /** Inventario de captación capturado por el wizard. NO se postea a MySQL durante
   *  el wizard (porque la propiedad aún no existe y el FK explota). En su lugar,
   *  se persiste en IndexedDB con id `wizard-X:inicial` y se re-keyea + postea a
   *  MySQL dentro de handleFinalize, una vez que propertyDbId ya está disponible. */
  const [wizardInventory, setWizardInventory] = useState<Inventory | null>(null);
  // ID temporal del wizard de captación. Lo guardamos en state para reusar el
  // mismo id al reabrir el wizard (así la autosave del inventario en IndexedDB
  // se reconecta). Se renombra a un UUID real en handleFinalize.
  const [wizardPropertyId, setWizardPropertyId] = useState<string>(`wizard-${Date.now()}`);
  const [viewingDoc, setViewingDoc] = useState<{ label: string; url: string } | null>(null);
  const [viewingProperty, setViewingProperty] = useState<any>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [currentDocLabel, setCurrentDocLabel] = useState<string | null>(null);
  const [inventoryModalProperty, setInventoryModalProperty] = useState<any | null>(null);
  const [inventoryPhase, setInventoryPhase] = useState<'inicial' | 'final' | null>(null);
  const [baseInventory, setBaseInventory] = useState<Inventory | null>(null);
  const [comparingProperty, setComparingProperty] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Pista: qué propiedad del detalle estamos actualizando con el mandato firmado. */
  const [uploadingMandatoPropertyId, setUploadingMandatoPropertyId] = useState<string | null>(null);
  const mandatoFileInputRef = useRef<HTMLInputElement>(null);
  /** Pista: qué propiedad del detalle estamos actualizando con un doc legal. */
  const [uploadingDocPropertyId, setUploadingDocPropertyId] = useState<string | null>(null);
  /** Propiedad pendiente de confirmación para eliminar (solo si NO tiene inventario). */
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);

  // Galería de fotos del inventario: modal para visualizar las imágenes almacenadas
  // en IndexedDB agrupadas por área. Cada foto se ve en tamaño completo con lightbox.
  const [photoGallery, setPhotoGallery] = useState<null | {
    propertyId: string;
    address: string;
    photos: Array<{
      id: string;
      areaId: string;
      areaLabel: string;
      dataUrl: string;
      phase: 'inicial' | 'final';
    }>;
  }>(null);
  const [photoGalleryLoading, setPhotoGalleryLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  /** Confirma el borrado de una propiedad sin inventario. */
  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      const result = await onDeleteProperty(pendingDelete.id);
      if (result.ok === true) {
        const driveNote =
          result.driveCleanupStatus === 'deleted'
            ? ' (carpeta Drive vaciada)'
            : result.driveCleanupStatus === 'skipped'
              ? ' (la carpeta Drive tenía archivos, queda como histórico)'
              : '';
        showToast(`"${pendingDelete.address}" eliminado${driveNote}`);
        // Si el detail modal está abierto sobre esta misma propiedad, cerrarlo
        setViewingProperty((curr: any) => (curr?.id === pendingDelete.id ? null : curr));
      } else {
        // TS narrow: result.ok === false
        showToast(result.error ?? 'Error eliminando', 'error');
      }
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };
  /** Ref para el input de docs legales del detalle */
  const detailDocInputRef = useRef<HTMLInputElement>(null);
  /** Contratos del store — se computan una vez por render */
  const contracts = useContractStore((s) => s.contracts);

  // Carga el Inicial cuando se va a abrir el Final
  // Cada vez que se abre el modal de detalle, re-fetch la propiedad del server
  // para que SIEMPRE muestre el estado real de MySQL (no el Zustand state stale).
  // Sin esto, si el agente subió el mandato o un documento en otra parte, el modal
  // muestra datos viejos. Con esto, los datos son siempre frescos.
  useEffect(() => {
    if (viewingProperty?.id) {
      void refreshPropertyDetail(viewingProperty.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingProperty?.id]);

  // ── Autosave del wizard de captación ─────────────────────────────
  // Cada vez que el user modifica algo del wizard (dirección, chip, owners,
  // units, slotKey con doc ya subido), persistimos el state en localStorage
  // para sobrevivir un refresh o cierre accidental. Los archivos en sí NO
  // se guardan aquí (los blob URLs expiran al cerrar el tab); se asume que
  // si Drive está conectado, los archivos ya están subidos. Sin Drive, el
  // draft preserva los inputs del form y los slotKeys pendientes para que
  // el user solo tenga que re-subir los archivos.
  //
  // Se activa SOLO cuando el wizard está abierto (showWizard=true) para no
  // escribir cada 200ms cuando el componente está en modo lista.
  //
  // BUG FIX: en el ciclo de useEffects, el autosave corría ANTES que la
  // hidratación (están en orden de declaración). Eso pisaba el draft viejo
  // con el state inicial vacío cada vez que el user re-abría el wizard
  // después de un F5. La solución es el `wizardHydrationDone` ref: el
  // autosave se salta hasta que `useEffect` de hidratación haya tenido
  // chance de restaurar. Un microtask marca el ref como listo después
  // del primer render post-apertura.
  const wizardHydrationDone = useRef(false);
  useEffect(() => {
    if (showWizard) {
      // Después de este render, la hidratación (definida más abajo) ya
      // corrió y restauró el state. Marcamos el ref para que el autosave
      // empiece a escribir el state restaurado, NO el inicial vacío.
      queueMicrotask(() => { wizardHydrationDone.current = true; });
    } else {
      wizardHydrationDone.current = false;
    }
  }, [showWizard]);
  useEffect(() => {
    if (!showWizard) return;
    if (!wizardHydrationDone.current) return; // esperar a que hidrate
    try {
      // serializamos solo los campos serializables (sin Files ni blob URLs)
      const draft = {
        wizardPropertyId, // CRÍTICO: reusar el mismo id al reabrir para que
                          // StepInventory re-hidrate el inventario desde IndexedDB
        address, chip, folio, propertyType, step,
        wizardOwners,
        wizardUnits,
        // uploadedDocs: solo guardamos las keys que tienen algo (las URLs blob
        // no sirven post-refresh — el user tendrá que re-subir si no subió a Drive)
        uploadedDocsKeys: Object.fromEntries(
          Object.entries(uploadedDocs).map(([k, v]) => [k, v ? 'has-file' : null]),
        ),
        ownerIdNumber,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEYS.wizardPropertyDraft, JSON.stringify(draft));
    } catch (err) {
      console.warn('[wizard-draft] no se pudo guardar:', err);
    }
  }, [
    showWizard, wizardPropertyId, address, chip, folio, propertyType, step,
    wizardOwners, wizardUnits, uploadedDocs, ownerIdNumber,
  ]);

  // Hidratar el draft SOLO cuando el user abre explícitamente el wizard.
  // El "+ Agregar Propiedad" / "+ Agregar Primera Propiedad" setean un
  // flag que detectamos aquí. Si no hay flag, no tocamos el state (así no
  // pisamos un wizard en curso al re-render).
  const [restoreDraftOnOpen, setRestoreDraftOnOpen] = useState(false);
  useEffect(() => {
    if (!showWizard || !restoreDraftOnOpen) return;
    setRestoreDraftOnOpen(false);
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.wizardPropertyDraft);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        wizardPropertyId?: string;
        address?: string; chip?: string; folio?: string;
        propertyType?: PropertyType; step?: number;
        wizardOwners?: WizardOwner[]; wizardUnits?: WizardUnit[];
        ownerIdNumber?: string;
        uploadedDocsKeys?: Record<string, string | null>;
      };
      // Solo restauramos si hay algo significativo (al menos dirección o un owner)
      const hasContent = (draft.address && draft.address.length > 0)
        || (draft.wizardOwners && draft.wizardOwners.some((o) => o.name.trim().length > 0));
      if (!hasContent) return;
      // CRÍTICO: reusar el mismo wizardPropertyId para que la autosave del
      // inventario en IndexedDB (key = `${wizardPropertyId}:inicial`) se
      // reconecte al reabrir el wizard. Si generamos uno nuevo, el inventario
      // queda huérfano.
      if (draft.wizardPropertyId) setWizardPropertyId(draft.wizardPropertyId);
      if (draft.address) setAddress(draft.address);
      if (draft.chip) setChip(draft.chip);
      if (draft.folio) setFolio(draft.folio);
      if (draft.propertyType) setPropertyType(draft.propertyType);
      if (draft.ownerIdNumber) setOwnerIdNumber(draft.ownerIdNumber);
      if (draft.wizardOwners && draft.wizardOwners.length > 0) setWizardOwners(draft.wizardOwners);
      if (draft.wizardUnits && draft.wizardUnits.length > 0) setWizardUnits(draft.wizardUnits);
      // Step 1 siempre (los steps 2 y 3 tienen state que no podemos restaurar
      // — los archivos subidos tienen blob URLs que expiran; el inventario
      // está en IndexedDB y se carga solo al re-abrir)
      setStep(1);
      // uploadedDocs: no restauramos los blob URLs (expiran al refresh), pero
      // sí marcamos qué slots ya tenían algo para que la UI muestre el slot
      // como "pendiente de re-subir" en vez de vacío.
      if (draft.uploadedDocsKeys) {
        const next: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(draft.uploadedDocsKeys)) {
          next[k] = v; // 'has-file' como string (no URL — el user re-sube)
        }
        setUploadedDocs(next);
      }
      showToast('Tenías un draft sin terminar — restaurado al paso 1. Los archivos se re-suben desde el paso 2.', 'success');
    } catch (err) {
      console.warn('[wizard-draft] no se pudo restaurar:', err);
    }
  }, [showWizard, restoreDraftOnOpen]);

  /**
   * FIX: el click handler ahora también hace un GET directo para popular
   * `viewingProperty` con datos frescos del server ANTES del primer render
   * del modal. Antes, el modal abría con el `p` de Zustand (potencialmente
   * stale si hydrate() no había terminado o si los datos cambiaron cross-session).
   * El useEffect refresca DESPUÉS del primer render → flicker visible
   * (PENDIENTE → FIRMADO). Con esto, abrimos directo con datos frescos.
   */
  const openDetailFresh = async (p: any) => {
    setViewingProperty(p); // render optimista con Zustand data
    try {
      const r = await fetch(`/api/properties/${p.id}`);
      if (r.ok) {
        const fresh = await r.json();
        // Mapear snake_case → camelCase
        const mapped = {
          mandatePdfUrl: fresh.mandato_pdf_url ?? null,
          mandateSignedAt: fresh.mandato_signed_at ?? null,
          documents: fresh.documents ?? {},
          status: fresh.status ?? p.status,
          inventoryPdfUrl: fresh.inventory_pdf_url ?? null,
          inventoryCaptacionPdfUrl: fresh.inventario_captacion_pdf_url ?? fresh.inventory_captacion_pdf_url ?? null,
          inventoryColocacionPdfUrl: fresh.inventario_colocacion_pdf_url ?? fresh.inventory_colocacion_pdf_url ?? null,
          inventoryCount: fresh.inventory_count ?? 0,
        };
        setViewingProperty((prev: any) => prev?.id === p.id ? { ...prev, ...mapped } : prev);
        // También sincronizar Zustand para que el thumbnail de la card se actualice
        useAppStore.setState((s: any) => ({
          properties: s.properties.map((x: any) => x.id === p.id ? { ...x, ...mapped } : x),
        }));
      }
    } catch (err) {
      console.warn('[openDetailFresh]', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (inventoryModalProperty && inventoryPhase === 'final') {
      (async () => {
        const inv = await inventoryDB.getInventory(`${inventoryModalProperty.id}:inicial`);
        if (cancelled) return;
        setBaseInventory(inv);
      })();
    } else {
      setBaseInventory(null);
    }
    return () => { cancelled = true; };
  }, [inventoryModalProperty, inventoryPhase]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentDocLabel) return;

    // --- Validación común ---
    if (file.type !== 'application/pdf') {
      showToast('Solo se permiten archivos PDF', 'error');
      return;
    }
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      showToast('El archivo es demasiado grande. El límite es de 5MB.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // --- Caso A: subida de MANDATO desde el modal de detalle (propiedad existente) ---
    if (uploadingMandatoPropertyId) {
      const propId = uploadingMandatoPropertyId;
      setUploadingDoc(MANDATO_KEY);
      showToast(`Subiendo Contrato de Mandato...`);
      try {
        const prop = properties.find((p: any) => p.id === propId);
        const driveFolderId = prop?.driveFolderId;
        let mandateUrl: string;

        if (driveFolderId) {
          const base64 = await fileToBase64(file);
          const result = await uploadFileToDrive(propId, driveFolderId, 'Propietario', `Contrato_de_Mandato.pdf`, base64);
          if (!result.webViewLink) {
            showToast(`Error al subir: ${result.error}`, 'error');
            setUploadingDoc(null); setCurrentDocLabel(null); setUploadingMandatoPropertyId(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          mandateUrl = result.webViewLink;
        } else {
          // Sin Drive: el archivo queda solo en este navegador (blob URL).
          mandateUrl = URL.createObjectURL(file);
        }

        const now = new Date().toISOString();
        const nextStatus = prop?.status === 'Pendiente' ? 'Activo' : prop?.status;

        try {
          const res = await fetch('/api/properties', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              localId: propId,
              mandatePdfUrl: mandateUrl,
              mandateSignedAt: now,
              status: nextStatus,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? `HTTP ${res.status}`);
          }
        } catch (err: any) {
          console.error('[mandato upload] backend persist:', err);
          showToast(`Mandato subido, pero no se pudo guardar en servidor: ${err.message}`, 'error');
        }

        const updates: any = { mandatePdfUrl: mandateUrl, mandateSignedAt: now };
        if (nextStatus !== prop?.status) updates.status = nextStatus;
        onUpdateProperty(propId, updates);
        setViewingProperty((prev: any) => prev ? { ...prev, ...updates } : prev);
        if (nextStatus === 'Activo') showToast(`Contrato de Mandato firmado. ¡Propiedad activada!`, 'success');
        else showToast(`Contrato de Mandato subido correctamente`, 'success');
      } catch (err) {
        console.error('[mandato upload]', err);
        showToast('Error al procesar el archivo', 'error');
      }
      setUploadingDoc(null);
      setCurrentDocLabel(null);
      setUploadingMandatoPropertyId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // --- Caso B: subida de DOCUMENTO LEGAL desde el modal de detalle ---
    if (uploadingDocPropertyId) {
      const propId = uploadingDocPropertyId;
      const slotKey = currentDocLabel; // puede ser slotKey nuevo o label legacy
      setUploadingDoc(slotKey);
      showToast(`Subiendo documento...`);
      let docUrl: string | null = null;
      try {
        const base64 = await fileToBase64(file);
        const prop = properties.find((p: any) => p.id === propId);
        const driveFolderId = prop?.driveFolderId;

        if (driveFolderId) {
          // Nombre del archivo: legible, basado en el slotKey y los owners/units.
          // Ej: "cedula:<ownerId>" → "Cedula_Tatiana_Prieto.pdf"
          const fileName = slotKeyToFilename(
            slotKey,
            viewingProperty?.owners,
            viewingProperty?.units,
          );
          const result = await uploadFileToDrive(propId, driveFolderId, 'Propietario', fileName, base64);
          if (result.webViewLink) {
            docUrl = result.webViewLink;
          } else {
            showToast(`Error al subir: ${result.error}`, 'error');
          }
        } else {
          docUrl = URL.createObjectURL(file);
          showToast(`Documento guardado localmente (Drive desconectado)`, 'success');
        }

        if (docUrl) {
          const updatedDocs = { ...(prop?.documents ?? {}), [slotKey]: docUrl };
          onUpdateProperty(propId, { documents: updatedDocs });
          setViewingProperty((prev: any) => prev ? { ...prev, documents: updatedDocs } : prev);
          if (driveFolderId) showToast(`Documento subido a Drive`, 'success');

          try {
            const res = await fetch('/api/properties', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                localId: propId,
                documents: { [slotKey]: docUrl },
              }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error ?? `HTTP ${res.status}`);
            }
          } catch (err: any) {
            console.error('[doc upload] backend persist:', err);
          }
        }
      } catch (err) {
        console.error('[Doc upload] Error:', err);
        showToast('Error al procesar el archivo', 'error');
      }
      setUploadingDoc(null);
      setCurrentDocLabel(null);
      setUploadingDocPropertyId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // --- Caso C: subida desde el wizard de captación (slotKey) ---
    if (!showWizard) return;
    setUploadingDoc(currentDocLabel);
    const blobUrl = URL.createObjectURL(file);
    const prev = uploadedDocs[currentDocLabel];
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    setWizardFiles({ ...wizardFiles, [currentDocLabel]: file });
    setUploadedDocs({ ...uploadedDocs, [currentDocLabel]: blobUrl });
    showToast(`Documento listo (se subirá a Drive al finalizar el registro)`, 'success');
    setUploadingDoc(null);
    setCurrentDocLabel(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileInput = (label: string) => {
    setCurrentDocLabel(label);
    fileInputRef.current?.click();
  };

  /** Dispara la subida del PDF firmado del mandato para una propiedad existente (modal de detalle). */
  const triggerMandatoUpload = (propertyId: string) => {
    // Si la propiedad tiene carpeta en Drive pero Drive está desconectado,
    // el PDF se guardaría solo local y el usuario debe saberlo.
    const prop = properties.find((p: any) => p.id === propertyId);
    const driveConnected = useGoogleDriveStore.getState().connected;
    if (prop?.driveFolderId && !driveConnected) {
      showToast(
        'Google Drive desconectado — el PDF del mandato se guardará solo en este navegador. ' +
        'Reconectá tu cuenta desde Configuración → Integraciones para guardarlo en la nube.',
        'error',
      );
    }
    setCurrentDocLabel(MANDATO_KEY);
    setUploadingMandatoPropertyId(propertyId);
    mandatoFileInputRef.current?.click();
  };

  /** Dispara la subida de un documento legal desde el modal de detalle.
   *  Acepta un `slotKey` completo (ej: "cedula:<ownerId>", "predial",
   *  "certificado_tradicion:<unitId>") o un label legible legacy. El backend
   *  parsea el slotKey y vincula al owner/unit correcto. */
  const triggerDetailDocUpload = (propertyId: string, slotKey: string) => {
    // Si la propiedad tiene carpeta en Drive pero Drive está desconectado,
    // bloqueamos y explicamos por qué: subir "local" perdería el archivo al cambiar de equipo
    // y la copia ya no sincronizaría con Drive al reconectar.
    const prop = properties.find((p: any) => p.id === propertyId);
    const driveConnected = useGoogleDriveStore.getState().connected;
    if (prop?.driveFolderId && !driveConnected) {
      showToast(
        `Google Drive desconectado — no se puede subir el documento a la nube. ` +
        `Reconectá tu cuenta desde Configuración → Integraciones y reintentá.`,
        'error',
      );
      return;
    }
    setCurrentDocLabel(slotKey);
    setUploadingDocPropertyId(propertyId);
    detailDocInputRef.current?.click();
  };

  /** Helper semántico: subir CC o RUT de un propietario específico. */
  const triggerOwnerDocUpload = (propertyId: string, ownerId: string, docType: 'cedula' | 'rut') => {
    const slotKey = `${docType}:${ownerId}`;
    triggerDetailDocUpload(propertyId, slotKey);
  };
  /** Helper semántico: subir Certificado de Tradición de una unidad adicional. */
  const triggerUnitDocUpload = (propertyId: string, unitId: string) => {
    triggerDetailDocUpload(propertyId, `certificado_tradicion:${unitId}`);
  };
  /** Helper semántico: subir Predial o Certificado de la unidad principal
   *  (documentos a nivel de propiedad, sin owner/unit específico). */
  const triggerPropertyDocUpload = (propertyId: string, slotKey: 'predial' | 'certificado_tradicion:main') => {
    triggerDetailDocUpload(propertyId, slotKey);
  };

  const handleFinalize = async (capturedInventory?: Inventory) => {
    console.log('[finalize] ▶ START — address:', address, 'chip:', chip, 'folio:', folio,
      'owners:', wizardOwners.filter((o) => o.name.trim()).length,
      'units:', wizardUnits.filter((u) => u.label.trim()).length);
    // ── Validación de campos básicos ──
    if (!address || !chip || !folio) {
      showToast('Por favor complete dirección, CHIP y folio', 'error');
      return;
    }
    const validOwners = wizardOwners.filter((o) => o.name.trim().length > 0);
    if (validOwners.length === 0) {
      showToast('Agregá al menos un propietario con nombre', 'error');
      return;
    }
    // Validar suma de % de participación
    const definedPcts = wizardOwners
      .map((o) => Number(o.ownershipPct))
      .filter((n) => !isNaN(n) && n > 0);
    if (definedPcts.length > 0) {
      const sum = definedPcts.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        showToast(`Los % de participación suman ${sum.toFixed(2)}% — deberían sumar 100%`, 'error');
        return;
      }
    }

    // ── Validar docs requeridos (migración 010+) ──
    const missingDocs: string[] = [];
    for (const o of validOwners) {
      if (!uploadedDocs[`cedula:${o.id}`]) {
        missingDocs.push(`Cédula de ${o.name}`);
      }
    }
    if (!uploadedDocs['certificado_tradicion:main']) {
      missingDocs.push('Certificado de Tradición (unidad principal)');
    }
    for (const u of wizardUnits) {
      if (!u.label.trim()) continue;
      if (!uploadedDocs[`certificado_tradicion:${u.id}`]) {
        missingDocs.push(`Certificado de ${u.label}`);
      }
    }
    if (!uploadedDocs[MANDATO_KEY]) {
      missingDocs.push('Contrato de Mandato');
    }
    if (missingDocs.length > 0) {
      showToast(`Faltan documentos obligatorios: ${missingDocs.join(', ')}`, 'error');
      return;
    }

    // Refactor: garantizar SIEMPRE que el wizard cierre al terminar, incluso si algo
    // tira excepción intermedia. try/finally así el usuario no queda atrapado en step 3.
    try {
    // Si nos pasaron el inventario desde StepInventory, lo usamos. Si no, caemos al state.
    // Esto evita el bug de closure stale donde wizardInventory era null al leerlo desde
    // un handler pasado como prop (onComplete={handleFinalize}).
    // 1. Crear la propiedad en MySQL + Drive (carpeta vacía por ahora)
    let driveFolderPath: string | null = null;
    let driveFolderId: string | null = null;
    let propertyDbId: string | null = null;
    const firstOwner = validOwners[0];
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localId: wizardPropertyId,
          address, chip, folio,
          ownerName: firstOwner.name,
          ownerIdNumber: firstOwner.idNumber,
          propertyType,
          // Migración 010+
          owners: validOwners.map((o, i) => ({
            id: o.id, // slotKey temporal; el server lo reemplaza por UUID
            name: o.name,
            idNumber: o.idNumber || null,
            phone: o.phone || null,
            email: o.email || null,
            ownershipPct: o.ownershipPct ? Number(o.ownershipPct) : null,
            position: i + 1,
          })),
          units: wizardUnits.filter((u) => u.label.trim()).map((u, i) => ({
            id: u.id,
            type: u.type,
            label: u.label,
            folioMatricula: u.folioMatricula || null,
            areaM2: u.areaM2 ? Number(u.areaM2) : null,
            position: i + 1,
          })),
        }),
      });
      const data = await res.json();
      console.log('[finalize] POST #1 OK — propertyId:', data.propertyId, 'driveFolderId:', data.driveFolderId);
      if (!res.ok) {
        showToast('Error guardando en servidor: ' + (data.error ?? 'unknown'), 'error');
        return;
      }
      driveFolderPath = data.driveFolderPath ?? null;
      driveFolderId = data.driveFolderId ?? null;
      propertyDbId = data.propertyId ?? null;
    } catch (err: any) {
      console.error('Error guardando propiedad en backend:', err);
      showToast('Error de conexión al guardar propiedad', 'error');
      return; // sin servidor no podemos persistir Drive URLs
    }

    if (!propertyDbId) {
      showToast('El servidor no devolvió ID de la propiedad', 'error');
      return;
    }

    // ── Re-keyear owners/units: el server devolvió UUIDs reales (distintos
    //    a los slotKeys del wizard). Hacemos GET para mapear wizard-XXX → UUID.
    let realOwners: Array<{ id: string; name: string }> = [];
    let realUnits: Array<{ id: string; label: string; type: string }> = [];
    try {
      const r = await fetch(`/api/properties/${propertyDbId}`);
      if (r.ok) {
        const fresh = await r.json();
        realOwners = (fresh.owners ?? []).map((o: any) => ({ id: o.id, name: o.name }));
        realUnits = (fresh.units ?? []).map((u: any) => ({ id: u.id, label: u.label, type: u.type }));
      }
    } catch (err) {
      console.warn('[finalize] no se pudieron leer los UUIDs reales:', err);
    }
    const ownerIdMap = new Map<string, string>();
    validOwners.forEach((wOwner, i) => {
      const real = realOwners[i];
      if (real) ownerIdMap.set(wOwner.id, real.id);
    });
    const unitIdMap = new Map<string, string>();
    wizardUnits.filter((u) => u.label.trim()).forEach((wUnit, i) => {
      const real = realUnits[i];
      if (real) unitIdMap.set(wUnit.id, real.id);
    });
    /** Convierte un slotKey del wizard (con ids temp) al slotKey con UUIDs reales. */
    const realSlotKey = (slotKey: string): string => {
      if (slotKey.startsWith('cedula:')) {
        const wid = slotKey.slice('cedula:'.length);
        const rid = ownerIdMap.get(wid);
        return rid ? `cedula:${rid}` : slotKey;
      }
      if (slotKey.startsWith('rut:')) {
        const wid = slotKey.slice('rut:'.length);
        const rid = ownerIdMap.get(wid);
        return rid ? `rut:${rid}` : slotKey;
      }
      if (slotKey.startsWith('certificado_tradicion:')) {
        const wid = slotKey.slice('certificado_tradicion:'.length);
        if (wid === 'main') return slotKey;
        const rid = unitIdMap.get(wid);
        return rid ? `certificado_tradicion:${rid}` : slotKey;
      }
      return slotKey; // predial, mandato
    };

    // 2. Subir los PDFs a Drive (carpeta Propietario/).
    //    Construimos `finalDocuments` con slotKeys ya en formato REAL (UUIDs).
    const finalDocuments: Record<string, string> = {};
    const driveConnected = !!driveFolderId;
    const uploadedToDrive: string[] = [];
    const uploadedLocalOnly: string[] = [];
    const failedUploads: string[] = [];

    for (const [wizardSlotKey, file] of Object.entries(wizardFiles)) {
      if (!file) continue;
      const realKey = realSlotKey(wizardSlotKey);
      // Nombre "bautizado" en Drive, no algo tipo "cedula_uuid.pdf"
      const fileName = slotKeyToFilename(realKey, validOwners, wizardUnits);
      if (driveConnected && driveFolderId) {
        try {
          const base64 = await fileToBase64(file as File);
          const result = await uploadFileToDrive(propertyDbId, driveFolderId, 'Propietario', fileName, base64);
          if (result.webViewLink) {
            finalDocuments[realKey] = result.webViewLink;
            uploadedToDrive.push(realKey);
          } else {
            finalDocuments[realKey] = URL.createObjectURL(file as File);
            uploadedLocalOnly.push(realKey);
            console.warn(`[finalize] ${realKey}: Drive upload failed (${result.error}) → local blob fallback`);
          }
        } catch (err: any) {
          finalDocuments[realKey] = URL.createObjectURL(file as File);
          uploadedLocalOnly.push(realKey);
          failedUploads.push(`${realKey}: ${err.message}`);
        }
      } else {
        finalDocuments[realKey] = URL.createObjectURL(file as File);
        uploadedLocalOnly.push(realKey);
      }
    }

    const mandateUrl = finalDocuments[MANDATO_KEY] ?? null;
    const mandateSubido = !!mandateUrl;
    const mandateSignedAt = mandateSubido ? new Date().toISOString() : null;
    const status = mandateSubido ? 'Activo' : 'Pendiente';

    // 3. Persistir URLs reales + mandate + owners/units en MySQL (segundo POST = UPSERT)
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localId: propertyDbId,
          mandatePdfUrl: mandateUrl,
          mandateSignedAt: mandateSignedAt,
          documents: finalDocuments,
          status,
          // Re-mandar owners/units con UUIDs reales (por si el server los
          // re-keyeó distinto en el primer POST — debería ser estable, pero
          // mandarlos de nuevo garantiza consistencia).
          owners: validOwners.map((o, i) => ({
            id: realOwners[i]?.id,
            name: o.name,
            idNumber: o.idNumber || null,
            phone: o.phone || null,
            email: o.email || null,
            ownershipPct: o.ownershipPct ? Number(o.ownershipPct) : null,
            position: i + 1,
          })),
          units: wizardUnits.filter((u) => u.label.trim()).map((u, i) => ({
            id: realUnits[i]?.id,
            type: u.type,
            label: u.label,
            folioMatricula: u.folioMatricula || null,
            areaM2: u.areaM2 ? Number(u.areaM2) : null,
            position: i + 1,
          })),
        }),
      });
      console.log('[finalize] POST #2 (UPSERT) status:', res.status);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      console.log('[finalize] POST #2 OK — mandate, documents, owners, units persistidos en MySQL');
    } catch (err: any) {
      console.error('[finalize] backend persist URLs:', err);
      showToast(`Propiedad guardada, pero falló al persistir URLs en servidor: ${err.message}`, 'error');
    }

    // 3.5. Re-keyear el inventario de IndexedDB y postearlo a MySQL con UUID real.
    //      Antes esto se hacía en onInventoryFinalized con el wizard-X → FK fallaba.
    //      Ahora diferimos hasta tener propertyDbId válido.
    const inventoryToPersist = capturedInventory ?? wizardInventory;
    if (inventoryToPersist) {
      try {
        const oldId = inventoryToPersist.id;                                // `${wizardPropertyId}:inicial`
        const newId = `${propertyDbId}:inicial`;                           // `${realUuid}:inicial`
        const rekeyed: Inventory = {
          ...inventoryToPersist,
          id: newId,
          propertyId: propertyDbId!,
        };
        await inventoryDB.saveInventory(rekeyed);                          // crea con nueva key
        await inventoryDB.deleteInventory(oldId);                          // borra la vieja (incluye fotos)

        // POST a MySQL (la FK ahora sí se cumple)
        const r1 = await fetch('/api/inventories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: rekeyed.id,
            propertyId: rekeyed.propertyId,
            phase: 'inicial',
            propertyType: rekeyed.propertyType,
            counters: rekeyed.counters,
            areas: rekeyed.areas,
            photos: rekeyed.photos,
            signatures: rekeyed.signatures,
            customAreas: rekeyed.customAreas,
          }),
        });
        if (!r1.ok) {
          const err = await r1.json().catch(() => ({}));
          console.warn('[finalize] inventory MySQL persist:', err.error ?? r1.status);
        } else {
          console.log('[finalize] inventario guardado en MySQL con UUID real');
        }

        // Subir PDF a Drive (Inventarios/) — best-effort, no bloquea.
        if (driveConnected && driveFolderId) {
          try {
            const { generateInventoryPdfBlob } = await import('./inventoryPdf');
            const blob = await generateInventoryPdfBlob(rekeyed, wizardProperty, async (id: string) => {
              const photo = await inventoryDB.getPhoto(id);
              return (photo as any)?.dataUrl ?? null;
            });
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            const r2 = await fetch('/api/inventories/upload-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                propertyId: propertyDbId,
                phase: 'inicial',
                base64Data: base64,
                inventoryDate: new Date().toISOString().slice(0, 10),
              }),
            });
            if (r2.ok) console.log('[finalize] PDF inventario → Drive');
            else console.warn('[finalize] PDF inventario → Drive falló:', r2.status);
          } catch (e: any) {
            console.warn('[finalize] PDF inventario error:', e.message);
          }

          // Subir fotos individuales a Drive (carpeta `Inventario captacion/`).
          // ANTES: las fotos solo vivían en IndexedDB → si el usuario limpiaba caché
          // o abría otro navegador, las perdía. AHORA: cada foto se sube a Drive
          // con nombre `{areaSlug}_{NN}.jpg` y queda como fuente de verdad.
          // best-effort: si falla alguna, no bloqueamos el wizard.
          try {
            const photoUploads: Array<{ name: string; base64Data: string }> = [];
            for (const photoMeta of (rekeyed.photos ?? [])) {
              let dataUrl: string | null = null;
              try {
                const stored = await inventoryDB.getPhoto(photoMeta.id);
                dataUrl = stored?.dataUrl ?? null;
              } catch { /* ignore */ }
              // FIX: fallback al dataUrl embebido si el store `photos` está vacío
              // (wizard históricos que solo guardaron el array inline).
              if (!dataUrl && (photoMeta as any).dataUrl) {
                dataUrl = (photoMeta as any).dataUrl;
              }
              if (!dataUrl) continue;
              // Nombre = areaSlug_NN (la convención del AGENTS.md)
              const areaSlug = String(photoMeta.areaId ?? '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
              const name = `${areaSlug}_${String(photoMeta.id).split(':').pop() ?? '00'}.jpg`;
              photoUploads.push({ name, base64Data: dataUrl });
            }
            if (photoUploads.length > 0) {
              console.log(`[finalize] Subiendo ${photoUploads.length} fotos a Drive...`);
              const rPhotos = await fetch('/api/inventories/upload-photos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  propertyId: propertyDbId,
                  phase: 'inicial',
                  photos: photoUploads,
                }),
              });
              if (rPhotos.ok) {
                const result = await rPhotos.json();
                console.log(`[finalize] ${result.uploaded?.length ?? 0} fotos → Drive/${result.folderName}/`);
                if (result.failed?.length > 0) {
                  console.warn(`[finalize] ${result.failed.length} fotos fallaron:`, result.failed);
                }
              } else {
                console.warn('[finalize] upload-photos → HTTP', rPhotos.status);
              }
            }
          } catch (e: any) {
            console.warn('[finalize] upload photos error:', e.message);
          }
        }
      } catch (err: any) {
        console.error('[finalize] inventory persist:', err);
      }
    }

    // 4. Guardar en el store local (Zustand) para la UI inmediata
    // IMPORTANTE: pasar `id: propertyDbId` para que addProperty NO haga otro POST
    // (la fila ya existe en MySQL desde el paso 1). Sin esto, antes creaba un
    // INSERT duplicado → otra carpeta en Drive con el mismo nombre.
    console.log('[finalize] llamando onAddProperty con id:', propertyDbId, 'address:', address);
    onAddProperty({
      id: propertyDbId,
      address, chip, folio,
      owner: firstOwner.name,
      ownerName: firstOwner.name,
      ownerIdNumber: firstOwner.idNumber,
      propertyType,
      status,
      documents: finalDocuments,
      mandatePdfUrl: mandateUrl,
      mandateSignedAt,
      driveFolderId,
      driveFolderPath,
      // Migración 010+ — pasamos los owners/units con UUIDs reales al store
      owners: validOwners.map((o, i) => ({
        id: realOwners[i]?.id ?? o.id,
        name: o.name,
        idNumber: o.idNumber || null,
        phone: o.phone || null,
        email: o.email || null,
        ownershipPct: o.ownershipPct ? Number(o.ownershipPct) : null,
        position: i + 1,
        documents: {
          cedula: finalDocuments[realSlotKey(`cedula:${o.id}`)] ?? null,
          rut: finalDocuments[realSlotKey(`rut:${o.id}`)] ?? null,
        },
      })),
      units: wizardUnits.filter((u) => u.label.trim()).map((u, i) => ({
        id: realUnits[i]?.id ?? u.id,
        type: u.type,
        label: u.label,
        folioMatricula: u.folioMatricula || null,
        areaM2: u.areaM2 ? Number(u.areaM2) : null,
        position: i + 1,
        documents: {
          certificado_tradicion: finalDocuments[realSlotKey(`certificado_tradicion:${u.id}`)] ?? null,
        },
      })),
      documents_property: {
        predial: finalDocuments['predial'] ?? null,
        certificado_tradicion: finalDocuments['certificado_tradicion:main'] ?? null,
      },
    });

    // 5. Toast honesto: decir qué se subió a Drive y qué quedó solo local
    const folderName = driveFolderPath ?? `InmoControl/${address}`;
    const totalDocs = Object.keys(finalDocuments).length;
    const realOwnersCount = validOwners.length;
    const realUnitsCount = wizardUnits.filter((u) => u.label.trim()).length;
    let body =
      `✓ ¡Propiedad creada!\n\n` +
      `📁 Drive:\n` +
      `Mi unidad / ${folderName}/\n` +
      `• Propietario/ (${uploadedToDrive.length}/${totalDocs} docs)\n` +
      `• Inventarios/\n` +
      `\nPropietarios: ${realOwnersCount}` +
      (realUnitsCount > 0 ? ` · Unidades adicionales: ${realUnitsCount}` : '');

    if (uploadedToDrive.length > 0) {
      body += `\n\nSubidos a Drive:\n• ${uploadedToDrive.map((k) => slotKeyToLabel(k, wizardOwners, wizardUnits)).join('\n• ')}`;
    }
    if (uploadedLocalOnly.length > 0) {
      const motivo = driveConnected
        ? 'falló la subida a Drive (reintentá desde el detalle)'
        : 'Drive no estaba conectado';
      body += `\n\nGuardados solo en este navegador (${motivo}):\n• ${uploadedLocalOnly.map((k) => slotKeyToLabel(k, wizardOwners, wizardUnits)).join('\n• ')}`;
    }
    if (failedUploads.length > 0) {
      body += `\n\nErrores:\n• ${failedUploads.join('\n• ')}`;
    }

    showToast(body, uploadedToDrive.length === totalDocs ? 'success' : 'error');
    } finally {
      // Garantía: el wizard SIEMPRE cierra, incluso si una excepción escapó los
      // try/catch internos (ej. onAddProperty tirando, o un fallo de React en
      // el render siguiente). Sin esto el usuario queda atrapado en step 3.
      setStep(1);
      setShowWizard(false);
      setAddress(''); setChip(''); setFolio(''); setOwnerIdNumber('');
      setPropertyType('apartamento');
      setWizardOwners([{ id: `wizard-owner-${Date.now()}-1`, name: '', idNumber: '', phone: '', email: '', ownershipPct: '' }]);
      setWizardUnits([]);
      // Liberamos los blob URLs del wizard antes de vaciar el state (memory leak fix)
      (Object.values(uploadedDocs) as Array<string | null>).forEach((u) => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
      setUploadedDocs({});
      setWizardFiles({});
      setWizardInventory(null);
      // Limpiar el draft del wizard en localStorage (el flujo terminó OK)
      try { localStorage.removeItem(STORAGE_KEYS.wizardPropertyDraft); } catch { /* silent */ }
    }
  };

  /** Re-fetches la propiedad desde el server para asegurar que el modal muestra
   *  SIEMPRE los datos más recientes (mandatoPdfUrl, documents, status, etc.).
   *  Sin esto, si el Zustand state quedó stale (ej. tras agregar docs desde otro
   *  flujo), el modal mostraría "Mandato pendiente" aunque ya esté firmado.
   *
   *  IMPORTANTE: solo actualiza el state local del modal y del Zustand store.
   *  NO dispara PATCH al server — el server es la fuente de verdad, no queremos
   *  un round-trip innecesario que podría fallar (PATCH sólo permite un set
   *  limitado de campos; si mandamos fields no permitidos el server puede
   *  fallar y abortar la actualización del local state). */
  const refreshPropertyDetail = async (propertyId: string) => {
    setDetailRefreshing(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}`);
      if (!res.ok) {
        console.warn('[refresh detail] server returned', res.status);
        return;
      }
      const fresh = await res.json();
      const patch: Record<string, any> = {
        mandatePdfUrl: fresh.mandato_pdf_url ?? fresh.mandate_pdf_url ?? null,
        mandateSignedAt: fresh.mandate_signed_at ?? null,
        // El backend devuelve `documents` (a nivel de propiedad) y `documents_legacy`
        // (compat con el frontend viejo que lee keys legibles). Usamos documents_legacy
        // para que `viewingProperty.documents['Cédula de Ciudadanía']` siga funcionando
        // en la UI del detalle sin tener que cambiar todas las referencias.
        documents: fresh.documents_legacy ?? fresh.documents ?? {},
        status: fresh.status === 'available' ? 'Pendiente'
              : fresh.status === 'rented' ? 'Arrendado'
              : fresh.status === 'maintenance' ? 'Inactivo'
              : fresh.status,
        inventoryPdfUrl: fresh.inventory_pdf_url ?? null,
        inventoryCaptacionPdfUrl: fresh.inventory_captacion_pdf_url ?? fresh.inventory_captacion_pdf_url ?? null,
        inventoryColocacionPdfUrl: fresh.inventario_colocacion_pdf_url ?? fresh.inventory_colocacion_pdf_url ?? null,
        inventoryCount: fresh.inventory_count ?? 0,
        // Migración 010+ — N propietarios y N unidades con sus docs anidados
        owners: fresh.owners ?? [],
        units: fresh.units ?? [],
        documents_property: fresh.documents ?? {},
      };
      // FIX: actualizar Zustand state local SIN pasar por PATCH. Si updateProperty
      // dispara un PATCH que falla (por campos no permitidos o formato de fecha),
      // el catch del store aborta la actualización del state local → el modal
      // queda con datos viejos. Para un read-only refresh esto es suficiente.
      const state = useAppStore.getState?.() ?? null;
      if (state) {
        useAppStore.setState((s: any) => ({
          properties: s.properties.map((p: any) => p.id === propertyId ? { ...p, ...patch } : p),
        }));
      }
      // Sincronizar el modal inmediatamente (no esperar al re-render del store)
      setViewingProperty((prev: any) => prev?.id === propertyId ? { ...prev, ...patch } : prev);
    } catch (err) {
      console.warn('[refresh detail]', err);
    } finally {
      setDetailRefreshing(false);
    }
  };

  /** Abre la galería de fotos del inventario de captación. Carga las fotos desde
   *  IndexedDB primero; si no encuentra (por reset-data.js o cambio de browser),
   *  cae al inventario remoto en MySQL. Las fotos en MySQL están como JSON
   *  con `dataUrl` base64 en `inventories.photos[]`, así que no se pierden. */
  const openPhotoGallery = async (property: any, phase: 'inicial' | 'final' = 'inicial') => {
    if (!property?.id) return;
    setPhotoGalleryLoading(true);
    try {
      let inventory = await inventoryDB.getInventory(`${property.id}:${phase}`);
      if (!inventory) {
        // Fallback: traer de MySQL
        try {
          const res = await fetch(`/api/inventories?propertyId=${encodeURIComponent(property.id)}`);
          if (res.ok) {
            const data = await res.json();
            const remote = (data.inventories ?? []).find((i: any) => i.phase === phase);
            if (remote) {
              inventory = {
                id: remote.id,
                propertyId: remote.property_id,
                phase: remote.phase,
                propertyType: remote.property_type,
                counters: remote.counters ?? {},
                areas: remote.areas ?? [],
                photos: remote.photos ?? [],
                signatures: remote.signatures ?? [],
                customAreas: remote.custom_areas ?? [],
                signedAt: remote.signed_at,
                createdAt: remote.created_at,
                updatedAt: remote.updated_at,
              };
              // Re-poblar IndexedDB: inventario + cada foto en su store
              await inventoryDB.saveInventory(inventory!);
              for (const p of (inventory!.photos ?? [])) {
                if (p?.dataUrl) {
                  await inventoryDB.savePhoto({
                    id: p.id,
                    inventoryId: inventory!.id,
                    dataUrl: p.dataUrl,
                    areaId: p.areaId,
                    fileName: p.fileName,
                    takenAt: p.takenAt,
                  });
                }
              }
            }
          }
        } catch (err) {
          console.warn('[gallery] fallback MySQL fetch failed:', err);
        }
      }
      if (!inventory) {
        showToast(`Aún no hay inventario de ${phase === 'inicial' ? 'captación' : 'colocación'} para esta propiedad`, 'error');
        setPhotoGalleryLoading(false);
        return;
      }
      const allPhotoIds = (inventory.photos ?? []).map((p: any) => p.id);
      const photos: Array<{
        id: string;
        areaId: string;
        areaLabel: string;
        dataUrl: string;
        phase: 'inicial' | 'final';
      }> = [];
      for (const photoMeta of (inventory.photos ?? [])) {
        // FIX: el store `photos` de IndexedDB puede estar vacío (el wizard
        // histórico solo guardaba el array inline en inventory.photos[]).
        // Si `getPhoto` falla, caemos al dataUrl embebido en el inventory.
        let dataUrl: string | null = null;
        try {
          const stored = await inventoryDB.getPhoto(photoMeta.id);
          dataUrl = stored?.dataUrl ?? null;
        } catch { /* ignore */ }
        if (!dataUrl && (photoMeta as any).dataUrl) {
          dataUrl = (photoMeta as any).dataUrl;
        }
        if (dataUrl) {
          const area = (inventory.areas ?? []).find((a: any) => a.id === photoMeta.areaId);
          photos.push({
            id: photoMeta.id,
            areaId: photoMeta.areaId,
            areaLabel: area?.label ?? 'Sin área',
            dataUrl,
            phase,
          });
        }
      }
      setPhotoGallery({
        propertyId: property.id,
        address: property.address,
        photos,
      });
      setLightboxIndex(null);
    } catch (err: any) {
      console.error('[gallery] load photos:', err);
      showToast('Error cargando fotos del inventario', 'error');
    } finally {
      setPhotoGalleryLoading(false);
    }
  };

  /** Descarga el PDF del Contrato de Mandato desde Drive (el firmado, no regenera).
   *  Si el PDF solo está local (blob:), regenera el contrato on-the-fly. */
  const handleDownloadMandato = async (property: any) => {
    try {
      if (property.mandatePdfUrl) {
        const url = driveDownloadUrl(property.mandatePdfUrl);
        // Para blob: el browser maneja la descarga directa. Para proxy, abrimos en nueva tab.
        if (url.startsWith('blob:') || url.startsWith('/api/')) {
          const a = document.createElement('a');
          a.href = url;
          a.download = `Mandato_${property.address ?? 'propiedad'}.pdf`;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        }
      }
      // Fallback: regenerar el PDF (caso legado sin mandatoPdfUrl persistido)
      const settings = useSettingsStore.getState();
      // Migración 010+: si la propiedad tiene N propietarios, los pasamos todos.
      // Si no tiene (legacy, 1 solo), caemos a property.owner/ownerIdNumber.
      const fallbackOwners = (() => {
        if (property.owners && property.owners.length > 0) {
          return property.owners.map((o: any) => ({
            name: o.name,
            documentId: o.idNumber ?? '',
            phone: o.phone ?? undefined,
            email: o.email ?? undefined,
            ownershipPct: o.ownershipPct ?? null,
          }));
        }
        return [{ name: property.owner, documentId: property.ownerIdNumber ?? '' }];
      })();
      await generateMandatoPdf({
        property: { address: property.address, owner: property.owner, chip: property.chip, ownerIdNumber: property.ownerIdNumber },
        owners: fallbackOwners,
        agency: {
          name: settings.agency.name,
          nit: settings.agency.nit,
          representative: settings.agency.representative,
          address: settings.agency.address,
        },
        commissionPct: 8,
        startDate: new Date().toISOString().slice(0, 10),
        durationMonths: 12,
      });
    } catch (err) {
      console.error(err);
      showToast('Error al descargar el contrato de mandato', 'error');
    }
  };

  /** Valida que los slots requeridos estén subidos y avanza al inventario.
   *  En realidad, StepDocs ya hace su propia validación y deshabilita el botón
   *  Continuar si faltan docs. Esta función queda como red de seguridad. */
  const validateStep2 = () => {
    const validOwners = wizardOwners.filter((o) => o.name.trim().length > 0);
    const missingDocs: string[] = [];
    for (const o of validOwners) {
      if (!uploadedDocs[`cedula:${o.id}`]) missingDocs.push(`Cédula de ${o.name}`);
    }
    if (!uploadedDocs['certificado_tradicion:main']) {
      missingDocs.push('Certificado de Tradición');
    }
    for (const u of wizardUnits) {
      if (!u.label.trim()) continue;
      if (!uploadedDocs[`certificado_tradicion:${u.id}`]) {
        missingDocs.push(`Certificado de ${u.label}`);
      }
    }
    if (!uploadedDocs[MANDATO_KEY]) missingDocs.push('Contrato de Mandato');
    if (missingDocs.length > 0) {
      showToast(`Faltan documentos: ${missingDocs.join(', ')}`, 'error');
      return;
    }
    setStep(3);
  };

  // Cuando entramos al paso 3 con un propertyId temporal (en wizard de captación),
  // usamos un id sintético (state arriba). Cuando ya es una propiedad existente
  // (en modal), usamos su id real.
  const wizardProperty = { address, chip, owner: wizardOwners[0]?.name ?? '', ownerIdNumber: wizardOwners[0]?.idNumber ?? '' };

  return (
    <>
      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleFileChange} />
      <input type="file" ref={mandatoFileInputRef} className="hidden" accept=".pdf" onChange={handleFileChange} />
      <input type="file" ref={detailDocInputRef} className="hidden" accept=".pdf" onChange={handleFileChange} />

<motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 1, x: -20 }}
        className="space-y-6"
      >
        {/* ── Banner de orientación: dónde estamos en el orden del proceso ── */}
        <ProcessOrderBanner
          currentStep="properties"
          title="Paso 1: Captar el inmueble y dejarlo Activo"
          description="Acá se hace el wizard de 3 pasos (datos básicos → 5 docs legales del propietario → inventario de captación). La propiedad pasa a Activo cuando el propietario firma el Contrato de Mandato. Recién con la propiedad Activa se le puede asignar un arrendatario."
        />

        {/* ── Header: título + botón Agregar / volver ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Gestión de Inmuebles</h2>
            <p className="text-slate-500 text-sm">
              {showWizard ? 'Fase 1: Captación y Registro de Mandato' : `${properties.length} inmueble${properties.length !== 1 ? 's' : ''} registrado${properties.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {!showWizard ? (
            <Button
              onClick={() => {
                // Liberar blob URLs del wizard anterior antes de empezar uno nuevo (memory leak fix)
                (Object.values(uploadedDocs) as Array<string | null>).forEach((u) => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
                setShowWizard(true); setStep(1);
                setAddress(''); setChip(''); setFolio(''); setOwnerIdNumber('');
                setPropertyType('apartamento');
                setWizardOwners([{ id: `wizard-owner-${Date.now()}-1`, name: '', idNumber: '', phone: '', email: '', ownershipPct: '' }]);
                setWizardUnits([]);
                setUploadedDocs({});
                // Si hay draft en localStorage, el useEffect de hidratación lo
                // restaura al paso 1 (los archivos se re-suben desde el paso 2).
                try { if (localStorage.getItem(STORAGE_KEYS.wizardPropertyDraft)) setRestoreDraftOnOpen(true); } catch { /* silent */ }
              }}
              className="gap-2"
            >
              <span className="text-lg leading-none">+</span>
              Agregar Propiedad
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                // FIX: al cancelar el wizard, NO limpiamos el draft. Así si el
                // user cierra el browser por error, refresca, o vuelve mañana,
                // el progreso sigue ahí. El draft solo se borra cuando el
                // wizard termina OK (handleFinalize) o si el user descarta
                // explícitamente (próximo: botón "Descartar draft").
                setShowWizard(false);
                setStep(1);
              }}
            >
              ← Ver Inmuebles (guardar borrador)
            </Button>
          )}
        </div>

        {showWizard ? (
          /* ══ MODO WIZARD DE CAPTACIÓN ══════════════════════════════════ */
          <>
            {/* Barra de pasos */}
            <div className="flex items-center gap-2">
              {(['Datos', 'Documentos', 'Inventario'] as const).map((label, i) => (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                    step > i + 1 ? 'bg-blue-600 text-white' : step === i + 1 ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {step > i + 1 ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-semibold ${step === i + 1 ? 'text-blue-700' : 'text-slate-400'}`}>{label}</span>
                  {i < 2 && <div className={`flex-1 h-0.5 rounded-full ${step > i + 1 ? 'bg-blue-600' : 'bg-slate-200'}`} />}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* ── Formulario del paso activo ── */}
              <div className="lg:col-span-2 space-y-6">
                {step === 1 && (
                  <Card className="p-8">
                    <StepBasic
                      address={address} setAddress={setAddress}
                      chip={chip} setChip={setChip}
                      folio={folio} setFolio={setFolio}
                      propertyType={propertyType} setPropertyType={setPropertyType}
                      owners={wizardOwners} setOwners={setWizardOwners}
                      units={wizardUnits} setUnits={setWizardUnits}
                      showToast={showToast}
                      onContinue={() => setStep(2)}
                    />
                  </Card>
                )}
                {step === 2 && (
                  <StepDocs
                    owners={wizardOwners}
                    units={wizardUnits}
                    uploadedDocs={uploadedDocs} setUploadedDocs={setUploadedDocs}
                    uploadingDoc={uploadingDoc} setUploadingDoc={setUploadingDoc}
                    currentDocLabel={currentDocLabel} setCurrentDocLabel={setCurrentDocLabel}
                    ownerIdNumber={ownerIdNumber} setOwnerIdNumber={setOwnerIdNumber}
                    viewingDoc={viewingDoc} setViewingDoc={setViewingDoc}
                    showToast={showToast}
                    onBack={() => setStep(1)}
                    onContinue={validateStep2}
                    triggerFileInput={triggerFileInput}
                  />
                )}
                {step === 3 && (
                  <Card className="p-0">
                    <StepInventory
                      showToast={showToast}
                      propertyId={wizardPropertyId}
                      property={wizardProperty}
                      propertyType={propertyType}
                      phase="inicial"
                      hideSignatures
                      onBack={() => setStep(2)}
                      onComplete={handleFinalize}
                      onInventoryFinalized={async (inv) => {
                        // NO posteamos a MySQL ni subimos PDF aquí: la propiedad aún no
                        // existe en MySQL (su id es `wizard-X`) y la FK constraint de
                        // inventories.property_id explota. Solo guardamos el inventario
                        // en estado — handleFinalize se encarga de re-keyearlo a
                        // `${propertyDbId}:inicial` y postearlo con el UUID real.
                        console.log('[inventory] Capturado en wizard, diferido a handleFinalize');
                        setWizardInventory(inv);
                      }}
                    />
                  </Card>
                )}
              </div>

              {/* ── Resumen de captación ── */}
              <Card className="p-6 h-fit">
                <h4 className="font-bold text-sm uppercase text-slate-400 mb-4">Resumen de Captación</h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Tipo</span>
                    <span className="font-medium">{PROPERTY_TYPES.find(t => t.id === propertyType)?.label ?? propertyType}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Dirección</span>
                    <span className="font-medium text-right">{address || '---'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">CHIP</span>
                    <span className="font-medium">{chip || '---'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Propietarios</span>
                    <span className="font-medium text-right">
                      {wizardOwners.filter((o) => o.name.trim()).length}
                      {wizardUnits.filter((u) => u.label.trim()).length > 0 && (
                        <span className="text-slate-400 text-[10px] block">
                          + {wizardUnits.filter((u) => u.label.trim()).length} unidad(es) adic.
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Paso</span>
                    <span className="text-blue-700 font-bold">{step} de 3</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                    <span className="text-slate-500">Mandato</span>
                    {uploadedDocs[MANDATO_KEY] ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        FIRMADO
                      </span>
                    ) : (
                      <span className="text-amber-600 font-bold">Pendiente</span>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </>
        ) : (
          /* ══ MODO LISTA DE INMUEBLES ════════════════════════════════════ */
          properties.length === 0 ? (
            <Card className="p-16 text-center">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-500 mb-2">No hay inmuebles registrados</h3>
              <p className="text-sm text-slate-400 mb-6">Comienza agregando tu primera propiedad con el botón de arriba.</p>
              <Button onClick={() => {
                setShowWizard(true); setStep(1); setPropertyType('apartamento');
                setAddress(''); setChip(''); setFolio(''); setOwnerIdNumber('');
                setWizardOwners([{ id: `wizard-owner-${Date.now()}-1`, name: '', idNumber: '', phone: '', email: '', ownershipPct: '' }]);
                setWizardUnits([]);
                setUploadedDocs({});
                // Si hay draft, restaurarlo
                try { if (localStorage.getItem(STORAGE_KEYS.wizardPropertyDraft)) setRestoreDraftOnOpen(true); } catch { /* silent */ }
              }} className="gap-2">
                + Agregar Primera Propiedad
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {properties.map((p) => {
                const statusColor = p.status === 'Activo' ? 'emerald'
                  : p.status === 'Pendiente' ? 'amber'
                  : p.status === 'Arrendado' ? 'blue'
                  : 'slate';
                const statusBg: Record<string, string> = {
                  emerald: 'bg-emerald-50 border-emerald-200',
                  amber: 'bg-amber-50 border-amber-200',
                  blue: 'bg-blue-50 border-blue-200',
                  slate: 'bg-slate-50 border-slate-200',
                };
                const statusText: Record<string, string> = {
                  emerald: 'text-emerald-700',
                  amber: 'text-amber-700',
                  blue: 'text-blue-700',
                  slate: 'text-slate-700',
                };
                /** Activar requiere mandato firmado — regla de negocio inmutable. */
                const canActivate = !!p.mandatePdfUrl;
                const isInactive = p.status !== 'Activo';
                return (
                  <div
                    key={p.id}
                    onClick={() => void openDetailFresh(p)}
                    className={`rounded-xl border ${statusBg[statusColor]} hover:shadow-md transition-shadow cursor-pointer`}
                  >
                    <Card className={`p-4 ${statusBg[statusColor]}`}>
                    {/* Header: dirección + estado */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{p.address}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{p.owner}</p>
                      </div>
                      <span className={`flex-shrink-0 text-[9px] font-bold uppercase px-2 py-1 rounded-full border ${statusBg[statusColor]} ${statusText[statusColor]}`}>
                        {p.status}
                      </span>
                    </div>

                    {/* Meta */}
                    <div className="space-y-1 mb-3">
                      {p.chip && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <Hash className="w-3 h-3" />
                          <span className="truncate">{p.chip}</span>
                        </div>
                      )}
                      {p.ownerIdNumber && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <CreditCard className="w-3 h-3" />
                          <span>{p.ownerIdNumber}</span>
                        </div>
                      )}
                      {p.mandatePdfUrl ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold">
                          <FileSignature className="w-3 h-3" />
                          Mandato firmado
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 font-semibold">
                          <FileSignature className="w-3 h-3" />
                          Mandato pendiente
                        </div>
                      )}
                      {/* Badge de inventario: explícito para que se vea que la propiedad ya tiene data */}
                      {(p.inventoryCount ?? 0) > 0 && (
                        <div
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-0.5 rounded-full bg-blue-50 border border-blue-200 text-[10px] font-bold text-blue-700"
                          title={`${p.inventoryCount} inventario(s) registrado(s). No se puede eliminar.`}
                          data-testid={`inventory-count-${p.id}`}
                        >
                          <ListChecks className="w-3 h-3" />
                          {p.inventoryCount} {p.inventoryCount === 1 ? 'inventario' : 'inventarios'}
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex gap-2 pt-2 border-t border-slate-200">
                      <button
                        onClick={(e) => { e.stopPropagation(); void openDetailFresh(p); }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (p.status === 'Activo') {
                            // Inactivar siempre está permitido
                            onUpdateProperty(p.id, { status: 'Inactivo' });
                            showToast('Inmueble marcado como Inactivo');
                          } else if (canActivate) {
                            onUpdateProperty(p.id, { status: 'Activo' });
                            showToast('Inmueble Activado');
                          } else {
                            // Sin mandato firmado → no se puede activar
                            showToast('No se puede activar: sube primero el contrato de mandato firmado', 'error');
                          }
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border ${
                          p.status === 'Activo'
                            ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            : canActivate
                              ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                              : 'bg-amber-50 border-amber-200 text-amber-600 cursor-not-allowed opacity-75'
                        }`}
                        title={!canActivate && isInactive ? 'Requiere contrato de mandato firmado para activar' : ''}
                      >
                        <Power className="w-3.5 h-3.5" />
                        {p.status === 'Activo' ? 'Inactivar' : isInactive && !canActivate ? 'Sin mandato' : 'Activar'}
                      </button>
                      {/* Eliminar: solo si NO tiene inventario (los inventarios son trazabilidad legal).
                          Si tiene inventario, mostramos un candado explicativo para que el usuario
                          entienda por qué no se puede borrar (en lugar de ocultar el botón sin más). */}
                      {(p.inventoryCount ?? 0) === 0 ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingDelete(p); }}
                          className="flex items-center justify-center px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border bg-white border-red-200 text-red-600 hover:bg-red-50"
                          title="Eliminar inmueble (solo permitido si no tiene inventario)"
                          aria-label={`Eliminar ${p.address}`}
                          data-testid={`delete-property-${p.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div
                          className="flex items-center justify-center px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                          title="Propiedad con inventario — no se puede eliminar (trazabilidad legal). Para retirarla del mercado, márquela como Inactiva."
                          aria-label={`${p.address} no se puede eliminar porque tiene inventario`}
                          data-testid={`property-locked-${p.id}`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </Card>
                  </div>
                );
              })}
            </div>
          )
        )}
      </motion.div>

      {/* ── Modal de confirmación para eliminar inmueble ── */}
      <Modal
        isOpen={!!pendingDelete}
        onClose={() => { if (!deleting) setPendingDelete(null); }}
        title="¿Eliminar inmueble?"
      >
        {pendingDelete && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <p className="font-semibold">Esta acción NO se puede deshacer.</p>
                <p className="mt-1 text-red-800">
                  Vas a eliminar <strong>{pendingDelete.address}</strong> del sistema.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-700">
              <p><strong>Se eliminará de la Base de Datos:</strong></p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                <li>El registro del inmueble y del propietario</li>
                <li>Cualquier documento legal (cédula, certificado, predial, rut) que se haya subido</li>
              </ul>
              <p className="mt-3"><strong>En Google Drive:</strong></p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                <li>Si la carpeta Drive está vacía, se manda a la papelera automáticamente</li>
                <li>Si tiene archivos subidos (mandato, predial, etc.), <em>la carpeta queda en Drive</em> como histórico — podés borrarla manual desde tu Drive</li>
              </ul>
            </div>

            <div className="flex gap-2 pt-2 justify-end">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                data-testid="confirm-delete-property"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Detalle del Inmueble — montado ANTES del viewer para que
          el viewer (siguiente) quede ENCIMA en el stacking order. */}
      <Modal isOpen={!!viewingProperty} onClose={() => setViewingProperty(null)} title="Detalle del Inmueble">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Dirección</p>
              <p className="text-sm font-semibold">{viewingProperty?.address}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">CHIP</p>
              <p className="text-sm font-semibold">{viewingProperty?.chip}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Creado</p>
              <p className="text-sm font-semibold">{viewingProperty?.createdAt ? new Date(viewingProperty.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                Propietarios ({viewingProperty?.owners?.length ?? 1})
              </p>
              <p className="text-sm font-semibold truncate">
                {(viewingProperty?.owners ?? []).map((o: any) => o.name).join(', ') || viewingProperty?.owner || '—'}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Estado del Inmueble</p>
              <div className="flex flex-wrap gap-2">
                {(['Pendiente', 'Activo', 'Arrendado', 'Inactivo'] as const).map((status) => {
                  const isCurrent = viewingProperty?.status === status;
                  let disabled = false;
                  let reason = '';
                  const docsComplete = allDocsComplete(viewingProperty);
                  const hasActiveContract = contracts.some((c: any) => c.propertyId === viewingProperty?.id && c.status === 'active');

                  if (!isCurrent) {
                    if (status === 'Activo') {
                      if (!docsComplete) { disabled = true; reason = 'Faltan documentos o mandato'; }
                    } else if (status === 'Arrendado') {
                      if (!docsComplete) { disabled = true; reason = 'Docs incompletos'; }
                      else if (!hasActiveContract) { disabled = true; reason = 'Sin contrato activo'; }
                    }
                  }

                  const colors = status === 'Activo' ? { on: 'bg-emerald-500 text-white border-emerald-500', off: 'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400' }
                    : status === 'Pendiente' ? { on: 'bg-amber-500 text-white border-amber-500', off: 'bg-white text-amber-600 border-amber-200 hover:border-amber-400' }
                    : status === 'Arrendado' ? { on: 'bg-blue-500 text-white border-blue-500', off: 'bg-white text-blue-600 border-blue-200 hover:border-blue-400' }
                    : { on: 'bg-slate-500 text-white border-slate-500', off: 'bg-white text-slate-500 border-slate-200 hover:border-slate-400' };

                  return (
                    <button
                      key={status}
                      disabled={disabled}
                      onClick={() => {
                        onUpdateProperty(viewingProperty.id, { status });
                        setViewingProperty({ ...viewingProperty, status });
                        showToast(`Estado actualizado a ${status}`);
                      }}
                      title={disabled ? reason : ''}
                      className={`text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase transition-all border ${isCurrent ? colors.on : colors.off} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} shadow-sm`}
                    >{status}</button>
                  );
                })}
              </div>
              {!allDocsComplete(viewingProperty) && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-[9px] font-bold text-amber-700 uppercase mb-1">Lo que falta</p>
                  <ul className="space-y-0.5">
                    {!viewingProperty?.mandatePdfUrl && (
                      <li className="text-[9px] text-amber-600 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />Contrato de Mandato
                      </li>
                    )}
                    {(viewingProperty?.owners ?? []).filter((o: any) => o.name && !o.documents?.cedula).map((o: any) => (
                      <li key={o.id} className="text-[9px] text-amber-600 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />Cédula de {o.name}
                      </li>
                    ))}
                    {!viewingProperty?.documents_property?.certificado_tradicion && !viewingProperty?.documents?.['Certificado de Tradición'] && (
                      <li className="text-[9px] text-amber-600 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />Certificado de Tradición (unidad principal)
                      </li>
                    )}
                    {(viewingProperty?.units ?? []).filter((u: any) => u.label && !u.documents?.certificado_tradicion).map((u: any) => (
                      <li key={u.id} className="text-[9px] text-amber-600 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />Certificado de {u.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* ── Propietarios (migración 010+) ── */}
          {(viewingProperty?.owners?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2 flex-1">
                  Propietarios ({viewingProperty.owners.length})
                </p>
                {detailRefreshing && <span className="text-[10px] text-blue-500 animate-pulse">Actualizando…</span>}
              </div>
              <div className="space-y-2">
                {viewingProperty.owners.map((o: any, idx: number) => (
                  <div key={o.id} className="p-3 bg-slate-50/50 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </div>
                      <p className="text-xs font-bold text-slate-800 flex-1">{o.name}</p>
                      {o.ownershipPct != null && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                          {o.ownershipPct}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { slotKey: `cedula:${o.id}`, label: 'Cédula', url: o.documents?.cedula },
                        { slotKey: `rut:${o.id}`, label: 'RUT', url: o.documents?.rut },
                      ].map(({ slotKey, label, url }) => (
                        url ? (
                          <button
                            key={slotKey}
                            onClick={() => setViewingDoc({ label: `${label} de ${o.name}`, url })}
                            className="flex items-center gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded text-left hover:bg-emerald-100"
                          >
                            <FileText className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            <span className="text-[10px] font-medium text-slate-800 truncate flex-1">{label}</span>
                            <span className="text-[9px] font-bold text-emerald-700">Ver</span>
                          </button>
                        ) : (
                          <button
                            key={slotKey}
                            onClick={() => triggerDetailDocUpload(viewingProperty.id, slotKey)}
                            className="flex items-center gap-1.5 p-2 bg-white rounded border border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-left"
                          >
                            <Upload className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-[10px] font-medium text-slate-500 truncate flex-1">{label}</span>
                            <span className="text-[9px] font-bold text-blue-600">Subir</span>
                          </button>
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Unidades adicionales (migración 010+) ── */}
          {(viewingProperty?.units?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
                Unidades Adicionales ({viewingProperty.units.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {viewingProperty.units.map((u: any) => {
                  const certUrl = u.documents?.certificado_tradicion;
                  const Icon = u.type === 'parking' ? Car : u.type === 'storage' ? Package : Box;
                  return (
                    <div key={u.id} className="p-3 bg-slate-50/50 border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className="w-3.5 h-3.5 text-blue-600" />
                        <p className="text-xs font-bold text-slate-800 flex-1 truncate">{u.label}</p>
                      </div>
                      {u.folioMatricula && (
                        <p className="text-[9px] text-slate-500 mb-1.5">Matrícula: {u.folioMatricula}</p>
                      )}
                      {certUrl ? (
                        <button
                          onClick={() => setViewingDoc({ label: `Certificado de ${u.label}`, url: certUrl })}
                          className="w-full flex items-center gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded text-left hover:bg-emerald-100"
                        >
                          <FileText className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                          <span className="text-[10px] font-medium text-slate-800 truncate flex-1">Certificado de Tradición</span>
                          <span className="text-[9px] font-bold text-emerald-700">Ver</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => triggerUnitDocUpload(viewingProperty.id, u.id)}
                          className="w-full flex items-center gap-1.5 p-2 bg-white rounded border border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-left"
                        >
                          <Upload className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-[10px] font-medium text-slate-500 truncate flex-1">Certificado de Tradición</span>
                          <span className="text-[9px] font-bold text-blue-600">Subir</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Documentos a nivel de propiedad (Predial + Certificado principal) ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
              Documentos de la Propiedad
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(() => {
                const items = [
                  { slotKey: 'predial', label: 'Impuesto Predial', url: viewingProperty?.documents_property?.predial ?? viewingProperty?.documents?.['Impuesto Predial'] },
                  { slotKey: 'certificado_tradicion:main', label: 'Certificado de Tradición', url: viewingProperty?.documents_property?.certificado_tradicion ?? viewingProperty?.documents?.['Certificado de Tradición'] },
                ];
                return items.map((item) => {
                  if (item.url) {
                    return (
                      <button
                        key={item.slotKey}
                        onClick={() => setViewingDoc({ label: item.label, url: item.url! })}
                        className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 hover:border-emerald-400 transition-colors text-left group"
                        data-testid={`view-doc-${item.slotKey}`}
                      >
                        <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-xs font-medium text-slate-800 truncate flex-1">{item.label}</span>
                        <span className="text-[10px] font-bold text-emerald-700 group-hover:underline">Ver</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={item.slotKey}
                      onClick={() => triggerPropertyDocUpload(viewingProperty.id, item.slotKey as 'predial' | 'certificado_tradicion:main')}
                      className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                    >
                      <Upload className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-[11px] font-medium text-slate-500 truncate flex-1">{item.label}</span>
                      <span className="text-[10px] font-bold text-blue-600">Subir</span>
                    </button>
                  );
                });
              })()}
              {/* NOTA: Contrato de Mandato se muestra SOLO en la sección "Contratos" abajo. */}
            </div>
          </div>

          {/* Contratos */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">Contratos</p>
            <div className="grid grid-cols-1 gap-2">
              <div className="w-full p-3 border border-blue-200 bg-blue-50/40 rounded-lg flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-900">Contrato de Mandato</p>
                    {viewingProperty?.mandatePdfUrl ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <ClipboardCheck className="w-3 h-3" /> Firmado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        Pendiente
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {viewingProperty?.mandateSignedAt
                      ? `Firmado el ${new Date(viewingProperty.mandateSignedAt).toLocaleDateString('es-CO')}`
                      : 'No se subió durante la creación de la propiedad'}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {viewingProperty?.mandatePdfUrl ? (
                    // PDF firmado subido: Ver + Descargar + Reemplazar (si quedó mal)
                    <>
                      <button
                        onClick={() => setViewingDoc({ label: 'Contrato de Mandato', url: viewingProperty.mandatePdfUrl! })}
                        className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
                        title="Ver PDF firmado"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-600" />
                      </button>
                      <button
                        onClick={() => handleDownloadMandato(viewingProperty)}
                        className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
                        title="Descargar PDF"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                      </button>
                      <button
                        onClick={() => triggerMandatoUpload(viewingProperty.id)}
                        className="p-1.5 bg-white border border-amber-200 rounded-md hover:bg-amber-50"
                        title="Reemplazar PDF (si quedó mal)"
                        data-testid="replace-mandato"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                      </button>
                    </>
                  ) : (
                    // FIX WORKFLOW: NO ofrecer subir mandato desde el detalle.
                    // El contrato de mandato se sube SOLO durante la creación
                    // de la propiedad (wizard). Si llegamos acá sin mandatoPdfUrl
                    // significa que el wizard no terminó o se omitió — la propiedad
                    // no está completa y NO se puede arreglar desde el detalle.
                    // Mostrar solo mensaje informativo, sin acción.
                    <div className="text-[10px] text-slate-400 italic text-right max-w-[140px] leading-tight">
                      Subir solo durante la creación
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Acciones de Inventario */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">Inventarios</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => { setInventoryModalProperty(viewingProperty); setInventoryPhase('inicial'); }}
              >
                <ClipboardCheck className="w-4 h-4" />
                Inicial
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => { setInventoryModalProperty(viewingProperty); setInventoryPhase('final'); }}
              >
                <ClipboardCheck className="w-4 h-4" />
                Final
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void openPhotoGallery(viewingProperty, 'inicial')}
                disabled={photoGalleryLoading}
                data-testid={`view-photos-inicial-${viewingProperty?.id}`}
              >
                <Camera className="w-4 h-4" />
                {photoGalleryLoading ? 'Cargando…' : 'Fotos captación'}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void openPhotoGallery(viewingProperty, 'final')}
                disabled={photoGalleryLoading}
                data-testid={`view-photos-final-${viewingProperty?.id}`}
              >
                <Camera className="w-4 h-4" />
                Fotos colocación
              </Button>
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => setComparingProperty(viewingProperty)}
            >
              <GitCompare className="w-4 h-4" />
              Comparar Inicial vs Final
            </Button>

            {/* PDFs del inventario subidos a Drive — links directos */}
            {(viewingProperty?.inventoryPdfUrl || viewingProperty?.inventory_captacion_pdf_url) && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">PDFs en Drive</p>
                {viewingProperty?.inventory_captacion_pdf_url && (
                  <a
                    href={driveDownloadUrl(viewingProperty.inventory_captacion_pdf_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                    data-testid={`pdf-captacion-${viewingProperty.id}`}
                  >
                    <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-emerald-900 truncate">PDF Inventario de Captación</span>
                    <Download className="w-3 h-3 text-emerald-600 ml-auto flex-shrink-0" />
                  </a>
                )}
                {viewingProperty?.inventory_colocacion_pdf_url && (
                  <a
                    href={driveDownloadUrl(viewingProperty.inventory_colocacion_pdf_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    data-testid={`pdf-colocacion-${viewingProperty.id}`}
                  >
                    <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-blue-900 truncate">PDF Inventario de Colocación</span>
                    <Download className="w-3 h-3 text-blue-600 ml-auto flex-shrink-0" />
                  </a>
                )}
                {viewingProperty?.inventoryPdfUrl && !viewingProperty?.inventory_captacion_pdf_url && (
                  <a
                    href={driveDownloadUrl(viewingProperty.inventoryPdfUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-emerald-900 truncate">PDF Inventario</span>
                    <Download className="w-3 h-3 text-emerald-600 ml-auto flex-shrink-0" />
                  </a>
                )}
              </div>
            )}

            <p className="text-[10px] text-slate-500">
              El Inicial se hace al captar la propiedad. El Final se hace al entregar/devolver el inmueble. La comparativa genera el Acta de Entrega.
            </p>
          </div>

          {viewingProperty?.inventoryPhotos && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">Inventario Fotográfico (legacy)</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(viewingProperty.inventoryPhotos).map(([area, urls]: [string, any]) => (
                  <div key={area} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <Image className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-medium">{area} ({urls.length})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button className="w-full mt-4" onClick={() => setViewingProperty(null)}>Cerrar</Button>
        </div>
      </Modal>

      {/* ── Modal visor de documento ──
          Montado DESPUÉS del Detalle del Inmueble para que aparezca ENCIMA
          del detalle cuando el usuario hace click en "Ver". Al cerrar el
          viewer, el detalle sigue abierto detrás — no hay que reabrirlo. */}
      <Modal isOpen={!!viewingDoc} onClose={() => { if (viewingDoc?.url?.startsWith('blob:')) URL.revokeObjectURL(viewingDoc.url); setViewingDoc(null); }} title={`Visualizando: ${viewingDoc?.label}`}>
        <div className="w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
          {!viewingDoc?.url ? (
            <div className="h-[40vh] flex items-center justify-center text-slate-400 text-sm">No hay documento para mostrar</div>
          ) : viewingDoc.url.startsWith('blob:') ? (
            <iframe src={viewingDoc.url} title={viewingDoc.label} className="w-full h-[70vh]" />
          ) : (
            // FIX Drive "Necesitas acceso": en vez de cargar directamente
            // https://drive.google.com/file/d/X/view (que muestra login si la
            // sesión de Google del browser ≠ la del OAuth de la app),
            // pasamos por /api/drive/file que usa el token guardado en MySQL
            // para servir el archivo. El browser lo trata como contenido propio.
            <iframe src={driveProxyUrl(viewingDoc.url)} title={viewingDoc.label} className="w-full h-[70vh]" />
          )}
        </div>
        <Button className="w-full mt-4" onClick={() => { if (viewingDoc?.url?.startsWith('blob:')) URL.revokeObjectURL(viewingDoc.url); setViewingDoc(null); }}>Cerrar</Button>
      </Modal>

      {/* Modal grande para Inventario Inicial/Final */}
      <Modal
        isOpen={!!inventoryModalProperty}
        onClose={() => { setInventoryModalProperty(null); setInventoryPhase(null); }}
        title={`Inventario ${inventoryPhase === 'final' ? 'Final' : 'Inicial'} — ${inventoryModalProperty?.address ?? ''}`}
        size="xl"
      >
        {inventoryModalProperty && inventoryPhase && (
          <StepInventory
            showToast={showToast}
            propertyId={inventoryModalProperty.id}
            propertyType={inventoryModalProperty.propertyType ?? 'apartamento'}
            property={{
              address: inventoryModalProperty.address,
              owner: inventoryModalProperty.owner,
              chip: inventoryModalProperty.chip,
              ownerIdNumber: inventoryModalProperty.ownerIdNumber,
            }}
            phase={inventoryPhase}
            baseInventory={baseInventory}
            onBack={() => { setInventoryModalProperty(null); setInventoryPhase(null); }}
            onComplete={() => { setInventoryModalProperty(null); setInventoryPhase(null); }}
          />
        )}
      </Modal>

      {/* Modal de comparativa Inicial vs Final */}
      {comparingProperty && (
        <InventoryDiffView
          propertyId={comparingProperty.id}
          property={{
            address: comparingProperty.address,
            owner: comparingProperty.owner,
            chip: comparingProperty.chip,
          }}
          showToast={showToast}
          onClose={() => setComparingProperty(null)}
        />
      )}

      {/* ── Galería de fotos del inventario ──────────────────────────
          Carga fotos desde IndexedDB (donde se guardan hoy) agrupadas por área.
          Click en miniatura → lightbox a pantalla completa con navegación. */}
      <Modal
        isOpen={!!photoGallery}
        onClose={() => { setPhotoGallery(null); setLightboxIndex(null); }}
        title={`📷 Fotos del Inventario — ${photoGallery?.address ?? ''}`}
        size="xl"
      >
        {photoGallery && (
          <div className="space-y-5">
            {photoGallery.photos.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <Camera className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No hay fotos guardadas para este inventario.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Las fotos se guardan en el navegador (IndexedDB). Si limpiaste la caché del navegador,
                  podés volver a tomarlas desde el botón "Inicial" / "Final".
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    <strong>{photoGallery.photos.length}</strong> fotos en total — click para ver en grande.
                  </p>
                  <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                    Almacenamiento local del navegador
                  </p>
                </div>
                {/* Agrupar fotos por área */}
                {Object.entries(
                  (photoGallery.photos as any[]).reduce<Record<string, any[]>>((acc, p) => {
                    (acc[p.areaLabel] ??= []).push(p);
                    return acc;
                  }, {} as Record<string, any[]>),
                ).map(([areaLabel, photos]: [string, any[]]) => (
                  <div key={areaLabel} className="space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                      <p className="text-xs font-bold text-slate-700 uppercase">{areaLabel}</p>
                      <span className="text-[10px] text-slate-400">{photos.length} foto{photos.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {photos.map((photo, i) => {
                        const globalIndex = photoGallery.photos.findIndex((p) => p.id === photo.id);
                        return (
                          <button
                            key={photo.id}
                            onClick={() => setLightboxIndex(globalIndex)}
                            className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all group bg-slate-100"
                            title={`${areaLabel} — foto ${i + 1}`}
                          >
                            <img
                              src={photo.dataUrl}
                              alt={`${areaLabel} ${i + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              loading="lazy"
                            />
                            <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                              {i + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
            <Button variant="outline" className="w-full" onClick={() => { setPhotoGallery(null); setLightboxIndex(null); }}>
              Cerrar
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Lightbox para ver foto a tamaño completo ───────────────── */}
      {lightboxIndex !== null && photoGallery && photoGallery.photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="w-6 h-6" />
          </button>
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              title="Anterior (←)"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
          )}
          {lightboxIndex < photoGallery.photos.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              title="Siguiente (→)"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          )}
          <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={photoGallery.photos[lightboxIndex].dataUrl}
              alt={photoGallery.photos[lightboxIndex].areaLabel}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="mt-3 px-4 py-2 bg-white/10 rounded-lg text-white text-sm">
              <strong>{photoGallery.photos[lightboxIndex].areaLabel}</strong>
              {' · '}
              foto {lightboxIndex + 1} de {photoGallery.photos.length}
            </div>
          </div>
          {/* Navegación con teclado */}
        </div>
      )}
      {/* Listener de teclado para flechas/Esc en el lightbox */}
      {lightboxIndex !== null && (
        <KeyboardHandler
          onPrev={() => setLightboxIndex((i) => (i !== null && i > 0) ? i - 1 : i)}
          onNext={() => setLightboxIndex((i) => (i !== null && photoGallery && i < photoGallery.photos.length - 1) ? i + 1 : i)}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

/** Listener global de teclado para el lightbox (Esc cierra, ←/→ navega). */
function KeyboardHandler({ onPrev, onNext, onClose }: { onPrev: () => void; onNext: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext, onClose]);
  return null;
}
