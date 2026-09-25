import React, { useState, useRef, useEffect } from "react";
import { generateMandatoPdf } from "./mandatoPdf";
// Commit 1 refactor #5: hook que encapsula el step del wizard.
import { useWizardState } from "./hooks/useWizardState";
import { useSettingsStore } from "../../shared/store/settingsStore";
import { motion } from "motion/react";
import {
  FileText,
  Image,
  Eye,
  ClipboardCheck,
  GitCompare,
  Download,
  FileSignature,
  Upload,
  Building2,
  Hash,
  CreditCard,
  Power,
  Trash2,
  Lock,
  ListChecks,
  Camera,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  // FIX #19: removidos Users, UserIcon, Mail, IdCard, Percent (no usados)
  Car,
  Package,
  Box,
  Phone,
  CheckCircle2,
  CloudOff,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Button, Card, Modal } from "../../shared/ui";
import { ProcessOrderBanner } from "../../shared/ui/ProcessOrderBanner";
import {
  // FIX #10: formatAddress removido (no usado, se usa previewAddressFormat si hace falta)
  isValidCHIP,
  isValidEmail,
  isValidColombianPhone,
} from "../../utils/validators";
import {
  // FIX #19: createPropertyFolders removido (no usado)
  uploadFileToDrive,
  fileToBase64,
} from "../../lib/drive/driveService";
import { useGoogleDriveStore } from "../../shared/store/googleDriveStore";
import { useAppStore } from "../../shared/store/appStore";
import {
  StepBasic,
  type WizardOwner,
  type WizardUnit,
} from "./components/StepBasic";
import { StepDocs, type UploadedDocsMap } from "./components/StepDocs";
import { StepInventory } from "./components/StepInventory";
// Commit 1 refactor #5b: modal de resumen del wizard extraído.
import { FinalizeSummaryModal } from "./components/FinalizeSummaryModal";
// Commit 4 refactor #5b: confirm de descarte extraído (orden: chico primero).
import { DiscardDraftModal } from "./components/DiscardDraftModal";
// Commit 5 refactor #5b: visor de documento extraído.
import { DocViewerModal } from "./components/DocViewerModal";
// Commit 3 refactor #5b: galería de fotos del inventario extraída.
import { PhotoGalleryModal } from "./components/PhotoGalleryModal";
// Commit 2 refactor #5b: modal de detalle del inmueble extraído.
import { PropertyDetailModal } from "./components/PropertyDetailModal";
// helpers puros salieron al módulo ./utils/allDocsComplete (Commit 2 #5b).
// Commit 3 refactor #5: slotKeyHelpers extraído del monolito.
import { slotKeyToLabel, slotKeyToFilename } from "./utils/slotKeyHelpers";
// Commit 2 refactor #5b: allDocsComplete extraído del monolito.
import { allDocsComplete } from "./utils/allDocsComplete";
// Commit 4 refactor #5: finalizeSummary tipo + constructor puro extraídos.
import {
  buildFinalizeSummary,
  type FinalizeSummary,
} from "./utils/finalizeSummary";
import { revokeIfBlob, createBlobUrl } from "../../shared/lib/blob";
import { Role } from "../auth/permissions";
import { useContractStore } from "../contracts/contractStore";
import { STORAGE_KEYS } from "../../shared/hooks/storageKeys";
import { PROPERTY_TYPES, type PropertyType } from "./inventoryConfig";
import { inventoryDB, normalizePhotosArray } from "./inventoryDB";
import type { Inventory } from "./inventoryTypes";
import { InventoryDiffView } from "./InventoryDiffView";
import { driveProxyUrl, driveDownloadUrl } from "../../lib/drive/driveProxy";
import type {
  PropertyOwner,
  PropertyUnit,
  // FIX #19: PropertyUnitType removido (no usado)
} from "../../types";

export interface PropertiesViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
  properties: any[];
  onAddProperty: (prop: any) => void;
  onUpdateProperty: (id: string, updates: any) => void;
  /** Elimina una propiedad (solo permitida si no tiene inventario). Devuelve {ok} o {error, hasInventories}. */
  onDeleteProperty: (
    id: string,
  ) => Promise<
    | { ok: true; driveCleanupStatus: string }
    | { ok: false; error: string; hasInventories?: boolean }
  >;
  role: Role | null;
}

const REQUIRED_AREAS = [
  "Cocina",
  "Baño Principal",
  "Habitación 1",
  "Zona Social",
];
/** slotKey del Contrato de Mandato (1 PDF multi-firmado por todos los propietarios). */
const MANDATO_KEY = "mandato";
/** slotKey del Certificado de Tradición de la unidad principal. */
const CERT_MAIN_KEY = "certificado_tradicion:main";
/** slotKey del Predial (1 por propiedad). */
const PREDIAL_KEY = "predial";

// allDocsComplete + slotKeyToLabel + slotKeyToFilename se importan de utils/ (Commits refactor #5 + #5b).

// slotKeyToLabel y slotKeyToFilename se importan de ./utils/slotKeyHelpers (Commit 3 refactor #5).

export function PropertiesView({
  showToast,
  properties,
  onAddProperty,
  onUpdateProperty,
  onDeleteProperty,
}: PropertiesViewProps) {
  const [address, setAddress] = useState("");
  const [chip, setChip] = useState("");
  const [folio, setFolio] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("apartamento");
  /** N propietarios del wizard. Migración 010+. */
  const [wizardOwners, setWizardOwners] = useState<WizardOwner[]>([
    {
      id: `wizard-owner-${Date.now()}-1`,
      name: "",
      idNumber: "",
      phone: "",
      email: "",
      ownershipPct: "",
    },
  ]);
  /** N unidades adicionales del wizard (garaje, depósito, etc.). */
  const [wizardUnits, setWizardUnits] = useState<WizardUnit[]>([]);
  /** Cédula del primer propietario (reflejada en el campo legacy de `ownerIdNumber`).
   *  Mantenemos por compat con el modal de cédula que se abre al clickear CC. */
  const [ownerIdNumber, setOwnerIdNumber] = useState("");
  /** Si false → se muestra la lista de inmuebles. Si true → se muestra el wizard de captación. */
  const [showWizard, setShowWizard] = useState(false);
  // Commit 1 refactor #5: step del wizard encapsulado en hook.
  const { step, setStep } = useWizardState(1);
  /** Docs subidos en el wizard. key = slotKey (ej: "cedula:<ownerId>", "predial", "mandato").
   *  Ahora cada slot acepta N archivos (no solo 1): un propietario puede tener
   *  varias hojas de cédula, varios RUTs, etc. */
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocsMap>({});
  /** Files en memoria del wizard de captación. Se suben a Drive en handleFinalize.
   *  Ahora es Record<slotKey, File[]> para soportar múltiples PDFs por slot. */
  const [wizardFiles, setWizardFiles] = useState<Record<string, File[]>>({});
  /** Slot al que el agente acaba de subir un PDF exitosamente. Se usa para
   *  disparar el modal "¿Querés subir otro documento?" en el paso 2. */
  const [lastUploadedSlot, setLastUploadedSlot] = useState<string | null>(null);
  /** Inventario de captación capturado por el wizard. NO se postea a MySQL durante
   *  el wizard (porque la propiedad aún no existe y el FK explota). En su lugar,
   *  se persiste en IndexedDB con id `wizard-X:inicial` y se re-keyea + postea a
   *  MySQL dentro de handleFinalize, una vez que propertyDbId ya está disponible. */
  const [wizardInventory, setWizardInventory] = useState<Inventory | null>(
    null,
  );
  // ID temporal del wizard de captación. Lo guardamos en state para reusar el
  // mismo id al reabrir el wizard (así la autosave del inventario en IndexedDB
  // se reconecta). Se renombra a un UUID real en handleFinalize.
  const [wizardPropertyId, setWizardPropertyId] = useState<string>(
    `wizard-${Date.now()}`,
  );
  // Migración a Option B: al pasar del step 1 al step 2 (o al click en "Guardar
  // avance"), pre-creamos la propiedad en MySQL para que las uploads a Drive en
  // step 2 sean en tiempo real. Estos IDs se llenan cuando se hace el POST.
  // - wizardPropertyDbId: UUID real retornado por el server
  // - wizardDriveFolderId/Path: idem para la carpeta en Drive
  // Si son null, todavía no se persistió (estado inicial del wizard).
  const [wizardPropertyDbId, setWizardPropertyDbId] = useState<string | null>(
    null,
  );
  const [wizardDriveFolderId, setWizardDriveFolderId] = useState<string | null>(
    null,
  );
  const [wizardDriveFolderPath, setWizardDriveFolderPath] = useState<
    string | null
  >(null);
  const [viewingDoc, setViewingDoc] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [viewingProperty, setViewingProperty] = useState<any>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [currentDocLabel, setCurrentDocLabel] = useState<string | null>(null);
  const [inventoryModalProperty, setInventoryModalProperty] = useState<
    any | null
  >(null);
  const [inventoryPhase, setInventoryPhase] = useState<
    "inicial" | "final" | null
  >(null);
  const [baseInventory, setBaseInventory] = useState<Inventory | null>(null);
  const [comparingProperty, setComparingProperty] = useState<any | null>(null);
  /** Modal: confirmar descarte del draft del wizard. TRUE = mostrar el modal. */
  const [confirmDiscardDraft, setConfirmDiscardDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Pista: qué propiedad del detalle estamos actualizando con el mandato firmado. */
  const [uploadingMandatoPropertyId, setUploadingMandatoPropertyId] = useState<
    string | null
  >(null);
  const mandatoFileInputRef = useRef<HTMLInputElement>(null);
  /** Pista: qué propiedad del detalle estamos actualizando con un doc legal. */
  const [uploadingDocPropertyId, setUploadingDocPropertyId] = useState<
    string | null
  >(null);
  /** Propiedad pendiente de confirmación para eliminar (solo si NO tiene inventario). */
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);

  /**
   * Resumen estructurado que se muestra en el modal al finalizar el wizard.
   * Tipo + constructor puro viven en `./utils/finalizeSummary.ts` (Commit 4).
   * Este useState solo persiste el resultado para que el modal lo renderice.
   */
  const [finalizeSummary, setFinalizeSummary] =
    useState<null | FinalizeSummary>(null);

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
      phase: "inicial" | "final";
    }>;
  }>(null);
  const [photoGalleryLoading, setPhotoGalleryLoading] = useState(false);
  // Commit 3 #5b: lightboxIndex ahora vive dentro de PhotoGalleryModal.

  /** Confirma el borrado de una propiedad sin inventario. */
  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      const result = await onDeleteProperty(pendingDelete.id);
      if (result.ok === true) {
        const driveNote =
          result.driveCleanupStatus === "deleted"
            ? " (carpeta Drive vaciada)"
            : result.driveCleanupStatus === "skipped"
              ? " (la carpeta Drive tenía archivos, queda como histórico)"
              : "";
        showToast(`"${pendingDelete.address}" eliminado${driveNote}`);
        // Si el detail modal está abierto sobre esta misma propiedad, cerrarlo
        setViewingProperty((curr: any) =>
          curr?.id === pendingDelete.id ? null : curr,
        );
      } else {
        // TS narrow: result.ok === false
        showToast(result.error ?? "Error eliminando", "error");
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

  // ── SPEC fix_wizard_docs_persistence.md — AC-3.1 ─────────────────
  // Al montar el componente PropertiesView, refetcheamos SIEMPRE la lista
  // de properties para que la cache stale de Zustand no haga que falten
  // propiedades recién creadas en otro flujo (wizard, archive/restore, etc).
  // El store decide si es un noop (datos frescos < 60s sin invalidación)
  // o un refetch real, según el flag `propertiesListStale`.
  const fetchProperties = useAppStore((s) => s.fetchProperties);
  useEffect(() => {
    void fetchProperties();
  }, [fetchProperties]);

  // ── SPEC AC-3.3 — Highlight de "recién creada" ────────────────────
  // Cuando el wizard termina OK (handleFinalize setea `lastCreatedPropertyId`),
  // la card correspondiente muestra un borde azul durante 3 segundos.
  const lastCreatedPropertyId = useAppStore((s) => s.lastCreatedPropertyId);
  const [highlightedPropertyId, setHighlightedPropertyId] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (!lastCreatedPropertyId) return;
    setHighlightedPropertyId(lastCreatedPropertyId);
    const t = setTimeout(() => {
      setHighlightedPropertyId(null);
    }, 3000);
    return () => clearTimeout(t);
  }, [lastCreatedPropertyId]);

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
  // BUG FIX: cuando el user reabre el wizard después de un F5, el autosave
  // corría UNA VEZ con el state inicial vacío antes de que la hidratación
  // pudiera restaurar, pisando el draft viejo. La solución es skipear la
  // PRIMERA ejecución del autosave post-apertura, dándole tiempo a la
  // hidratación a restaurar. Cualquier cambio de estado posterior (sea de
  // la hidratación o del user) triggerea el autosave con la data correcta.
  //
  // Orden clave: este useEffect se declara ANTES del autosave, así cuando
  // showWizard cambia a true, setea el flag skipNextAutosave ANTES de que
  // el autosave chequee.
  const skipNextAutosave = useRef(false);
  useEffect(() => {
    if (showWizard) {
      // El wizard se acaba de abrir. Marcamos el flag para que el autosave
      // se salte la primera ejecución (donde el state todavía es el inicial
      // vacío). La hidratación usa ese tick para restaurar el state desde
      // localStorage, y luego el autosave empieza a guardar.
      skipNextAutosave.current = true;
    } else {
      skipNextAutosave.current = false;
    }
  }, [showWizard]);
  useEffect(() => {
    if (!showWizard) return;
    if (skipNextAutosave.current) {
      // Skip la primera ejecución post-apertura. Cualquier state change
      // posterior (hidratación, user input) triggerea este useEffect de
      // nuevo, esta vez con el flag en false → guarda normalmente.
      skipNextAutosave.current = false;
      return;
    }
    // Debounce: 600ms. Cada keystroke cancela el write anterior y agenda
    // uno nuevo. Si el user tipea "Calle 93", solo se hace 1 write al
    // final en lugar de 7. Si navega entre steps o sube archivos, también
    // cae acá. localStorage.setItem es síncrono y rápido, pero evitar
    // 200 writes/seguro no hace daño.
    const timeoutId = setTimeout(() => {
      try {
        // serializamos solo los campos serializables (sin Files ni blob URLs)
        const draft = {
          wizardPropertyId, // CRÍTICO: reusar el mismo id al reabrir para que
          // StepInventory re-hidrate el inventario desde IndexedDB
          // Option B: si la propiedad ya está persistida en MySQL, guardamos
          // el UUID real para que al re-abrir el wizard sepamos que NO hay
          // que volver a crearla. También guardamos el driveFolderPath para
          // mostrarlo en el banner de step 2 si quiere re-abrir.
          wizardPropertyDbId,
          wizardDriveFolderId,
          wizardDriveFolderPath,
          address,
          chip,
          folio,
          propertyType,
          step,
          wizardOwners,
          wizardUnits,
          // uploadedDocs: solo guardamos las keys que tienen al menos 1 archivo
          // (las URLs blob no sirven post-refresh — el user tendrá que re-subir
          // si no subió a Drive). El value es el conteo, no la URL.
          uploadedDocsKeys: Object.fromEntries(
            Object.entries(uploadedDocs).map(([k, v]) => {
              const arr = Array.isArray(v) ? v : [];
              return [k, arr.length > 0 ? `${arr.length}-files` : null];
            }),
          ),
          ownerIdNumber,
          savedAt: Date.now(),
        };
        localStorage.setItem(
          STORAGE_KEYS.wizardPropertyDraft,
          JSON.stringify(draft),
        );
      } catch (err) {
        console.warn("[wizard-draft] no se pudo guardar:", err);
      }
    }, 600);
    // Cleanup: si el effect se vuelve a ejecutar antes de los 600ms
    // (otro cambio de state), cancelamos el write anterior.
    return () => clearTimeout(timeoutId);
  }, [
    showWizard,
    wizardPropertyId,
    wizardPropertyDbId,
    wizardDriveFolderId,
    wizardDriveFolderPath,
    address,
    chip,
    folio,
    propertyType,
    step,
    wizardOwners,
    wizardUnits,
    uploadedDocs,
    ownerIdNumber,
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
        // Option B: estos campos pueden estar en el draft si la propiedad ya
        // fue persistida en MySQL antes de cerrar el browser.
        wizardPropertyDbId?: string | null;
        wizardDriveFolderId?: string | null;
        wizardDriveFolderPath?: string | null;
        address?: string;
        chip?: string;
        folio?: string;
        propertyType?: PropertyType;
        step?: number;
        wizardOwners?: WizardOwner[];
        wizardUnits?: WizardUnit[];
        ownerIdNumber?: string;
        uploadedDocsKeys?: Record<string, string | null>; // valor = `${n}-files` o null
        savedAt?: number;
      };
      // TTL: descartar drafts de más de 30 días. Evita que un draft olvidado
      // de hace 3 meses aparezca cuando el user clickea "+ Agregar Propiedad".
      // Si el draft no tiene savedAt (versión vieja), lo aceptamos por compat.
      if (draft.savedAt) {
        const ageMs = Date.now() - draft.savedAt;
        const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
        if (ageMs > MAX_AGE_MS) {
          console.log(
            `[wizard-draft] descartado por TTL: ${Math.round(ageMs / (24 * 60 * 60 * 1000))} días de antigüedad`,
          );
          try {
            localStorage.removeItem(STORAGE_KEYS.wizardPropertyDraft);
          } catch {
            /* silent */
          }
          return;
        }
      }
      // Solo restauramos si hay algo significativo (al menos dirección o un owner)
      const hasContent =
        (draft.address && draft.address.length > 0) ||
        (draft.wizardOwners &&
          draft.wizardOwners.some((o) => o.name.trim().length > 0));
      if (!hasContent) return;
      // CRÍTICO: reusar el mismo wizardPropertyId para que la autosave del
      // inventario en IndexedDB (key = `${wizardPropertyId}:inicial`) se
      // reconecte al reabrir el wizard. Si generamos uno nuevo, el inventario
      // queda huérfano.
      if (draft.wizardPropertyId) setWizardPropertyId(draft.wizardPropertyId);
      // Option B: restaurar el UUID real y los IDs de Drive si la propiedad
      // ya estaba persistida. Si el server no reconoce este id (caso edge
      // donde se borró manualmente), el siguiente ensurePropertyPersisted
      // creará una propiedad nueva sin drama.
      if (draft.wizardPropertyDbId)
        setWizardPropertyDbId(draft.wizardPropertyDbId);
      if (draft.wizardDriveFolderId)
        setWizardDriveFolderId(draft.wizardDriveFolderId);
      if (draft.wizardDriveFolderPath)
        setWizardDriveFolderPath(draft.wizardDriveFolderPath);
      if (draft.address) setAddress(draft.address);
      if (draft.chip) setChip(draft.chip);
      if (draft.folio) setFolio(draft.folio);
      if (draft.propertyType) setPropertyType(draft.propertyType);
      if (draft.ownerIdNumber) setOwnerIdNumber(draft.ownerIdNumber);
      if (draft.wizardOwners && draft.wizardOwners.length > 0)
        setWizardOwners(draft.wizardOwners);
      if (draft.wizardUnits && draft.wizardUnits.length > 0)
        setWizardUnits(draft.wizardUnits);
      // Step 1 siempre (los steps 2 y 3 tienen state que no podemos restaurar
      // — los archivos subidos tienen blob URLs que expiran; el inventario
      // está en IndexedDB y se carga solo al re-abrir)
      setStep(1);
      // uploadedDocs: no restauramos los blob URLs (expiran al refresh), pero
      // sí marcamos qué slots ya tenían algo para que la UI muestre el slot
      // como "pendiente de re-subir" en vez de vacío.
      if (draft.uploadedDocsKeys) {
        const next: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(draft.uploadedDocsKeys)) {
          // 'v' puede ser null (slots sin archivos en el draft original);
          // solo guardamos los slots con al menos 1 archivo.
          if (v !== null) {
            next[k] = [v]; // 'has-file' envuelto en array (semántica N archivos por slot)
          }
        }
        setUploadedDocs(next);
      }
      showToast(
        "Tenías un draft sin terminar — restaurado al paso 1. Los archivos se re-suben desde el paso 2.",
        "success",
      );
    } catch (err) {
      console.warn("[wizard-draft] no se pudo restaurar:", err);
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
          inventoryCaptacionPdfUrl:
            fresh.inventario_captacion_pdf_url ??
            fresh.inventory_captacion_pdf_url ??
            null,
          inventoryColocacionPdfUrl:
            fresh.inventario_colocacion_pdf_url ??
            fresh.inventory_colocacion_pdf_url ??
            null,
          inventoryCount: fresh.inventory_count ?? 0,
        };
        setViewingProperty((prev: any) =>
          prev?.id === p.id ? { ...prev, ...mapped } : prev,
        );
        // También sincronizar Zustand para que el thumbnail de la card se actualice
        useAppStore.setState((s: any) => ({
          properties: s.properties.map((x: any) =>
            x.id === p.id ? { ...x, ...mapped } : x,
          ),
        }));
      }
    } catch (err) {
      console.warn("[openDetailFresh]", err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (inventoryModalProperty && inventoryPhase === "final") {
      (async () => {
        const inv = await inventoryDB.getInventory(
          `${inventoryModalProperty.id}:inicial`,
        );
        if (cancelled) return;
        setBaseInventory(inv);
      })();
    } else {
      setBaseInventory(null);
    }
    return () => {
      cancelled = true;
    };
  }, [inventoryModalProperty, inventoryPhase]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentDocLabel) return;

    // --- Validación común ---
    if (file.type !== "application/pdf") {
      showToast("Solo se permiten archivos PDF", "error");
      return;
    }
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      showToast(
        "El archivo es demasiado grande. El límite es de 5MB.",
        "error",
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
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
          const result = await uploadFileToDrive(
            propId,
            driveFolderId,
            "Propietario",
            `Contrato_de_Mandato.pdf`,
            base64,
          );
          if (!result.webViewLink) {
            showToast(`Error al subir: ${result.error}`, "error");
            setUploadingDoc(null);
            setCurrentDocLabel(null);
            setUploadingMandatoPropertyId(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
          }
          mandateUrl = result.webViewLink;
        } else {
          // BUG-021: sin Drive, el archivo queda como blob URL local. Si ya
          // había un mandato previo, revocar el blob viejo antes de crear
          // el nuevo — si no, el viejo queda en RAM hasta cerrar la pestaña.
          revokeIfBlob(prop?.mandatePdfUrl);
          mandateUrl = createBlobUrl(file);
        }

        const now = new Date().toISOString();
        const nextStatus =
          prop?.status === "Pendiente" ? "Activo" : prop?.status;

        try {
          const res = await fetch("/api/properties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
          console.error("[mandato upload] backend persist:", err);
          showToast(
            `Mandato subido, pero no se pudo guardar en servidor: ${err.message}`,
            "error",
          );
        }

        const updates: any = {
          mandatePdfUrl: mandateUrl,
          mandateSignedAt: now,
        };
        if (nextStatus !== prop?.status) updates.status = nextStatus;
        onUpdateProperty(propId, updates);
        setViewingProperty((prev: any) =>
          prev ? { ...prev, ...updates } : prev,
        );
        if (nextStatus === "Activo")
          showToast(
            `Contrato de Mandato firmado. ¡Propiedad activada!`,
            "success",
          );
        else showToast(`Contrato de Mandato subido correctamente`, "success");
      } catch (err) {
        console.error("[mandato upload]", err);
        showToast("Error al procesar el archivo", "error");
      }
      setUploadingDoc(null);
      setCurrentDocLabel(null);
      setUploadingMandatoPropertyId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
          const result = await uploadFileToDrive(
            propId,
            driveFolderId,
            "Propietario",
            fileName,
            base64,
          );
          if (result.webViewLink) {
            docUrl = result.webViewLink;
          } else {
            showToast(`Error al subir: ${result.error}`, "error");
          }
        } else {
          // BUG-021: revocar el blob viejo del mismo slot antes de crear
          // el nuevo. Sin esto, si el agente re-sube el mismo documento,
          // el blob anterior queda en RAM (puede acumular 10+ MB si son
          // PDFs de 5MB c/u, y solo se libera al cerrar la pestaña).
          const oldUrl = prop?.documents?.[slotKey];
          revokeIfBlob(oldUrl);
          docUrl = createBlobUrl(file);
          showToast(
            `Documento guardado localmente (Drive desconectado)`,
            "success",
          );
        }

        if (docUrl) {
          const updatedDocs = { ...(prop?.documents ?? {}), [slotKey]: docUrl };
          onUpdateProperty(propId, { documents: updatedDocs });
          setViewingProperty((prev: any) =>
            prev ? { ...prev, documents: updatedDocs } : prev,
          );
          if (driveFolderId) showToast(`Documento subido a Drive`, "success");

          // FIX AC-15 (jul-2026): solo persistir al server si la URL es válida
          // (Drive). Si es `blob:` (Drive desconectado), NO guardamos en MySQL
          // — la card mostrará badge honesto y el agente tendrá que re-subir
          // cuando Drive esté OK. Persistir blob URLs crea filas zombie que
          // muestran "Ver" verde pero el PDF viewer dice "moved, edited, or
          // deleted" porque el blob URL murió al refrescar.
          const isPersistibleUrl =
            docUrl.startsWith("https://") &&
            !docUrl.startsWith("blob:") &&
            !docUrl.startsWith("data:");
          if (isPersistibleUrl) {
            try {
              const res = await fetch("/api/properties", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
              console.error("[doc upload] backend persist:", err);
            }
          } else {
            console.warn(
              `[doc upload] docUrl local (${docUrl.slice(0, 30)}...) NO persistido. Reconectá Drive y re-subí desde el Detalle.`,
            );
            if (!driveFolderId) {
              showToast(
                `Documento guardado solo localmente (Drive no conectado). Reconectá Drive y reintentá la subida.`,
                "error",
              );
            }
          }
        }
      } catch (err) {
        console.error("[Doc upload] Error:", err);
        showToast("Error al procesar el archivo", "error");
      }
      setUploadingDoc(null);
      setCurrentDocLabel(null);
      setUploadingDocPropertyId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // --- Caso C: subida desde el wizard de captación (slotKey, soporta N archivos) ---
    // Migración a Option B: si la propiedad ya está persistida (wizardPropertyDbId
    // set), subimos el PDF a Drive EN TIEMPO REAL. Si no, caemos al fallback de
    // blob URL + wizardFiles (igual que antes).
    if (!showWizard) return;
    setUploadingDoc(currentDocLabel);
    const slotKey = currentDocLabel;

    // Asegurarnos de que la propiedad esté persistida. Si no, la creamos acá mismo.
    // Esto cubre el caso: usuario va directo al step 2 sin pasar por "Continuar".
    const persisted = await ensurePropertyPersisted();
    if (!persisted) {
      setUploadingDoc(null);
      setCurrentDocLabel(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // ── Si Drive está conectado → subir AHORA (real-time) ──
    if (persisted.driveFolderId) {
      try {
        const fileName = slotKeyToFilename(slotKey, wizardOwners, wizardUnits);
        const base64 = await fileToBase64(file);
        const result = await uploadFileToDrive(
          persisted.propertyDbId,
          persisted.driveFolderId,
          "Propietario",
          fileName,
          base64,
        );
        const prevArr = uploadedDocs[slotKey] ?? [];
        if (result.webViewLink) {
          // Reemplazamos la URL del archivo en uploadedDocs por la de Drive.
          // Guardamos también en wizardFiles por compat con handleFinalize
          // (que lee wizardFiles para re-keyear al UUID real del server).
          setWizardFiles({
            ...wizardFiles,
            [slotKey]: [...(wizardFiles[slotKey] ?? []), file],
          });
          setUploadedDocs({
            ...uploadedDocs,
            [slotKey]: [...prevArr, result.webViewLink],
          });
          showToast(`✓ ${fileName} subido a Drive`, "success");
        } else {
          // Falla de Drive → fallback a blob URL + wizardFiles
          // BUG-021: createBlobUrl (alias) + revoke en cleanup del wizard.
          const blobUrl = createBlobUrl(file);
          setWizardFiles({
            ...wizardFiles,
            [slotKey]: [...(wizardFiles[slotKey] ?? []), file],
          });
          setUploadedDocs({
            ...uploadedDocs,
            [slotKey]: [...prevArr, blobUrl],
          });
          showToast(
            `Error al subir a Drive (${result.error}); guardado localmente. Reintentá al finalizar.`,
            "error",
          );
        }
      } catch (err: any) {
        console.error("[wizard doc upload] error:", err);
        // BUG-021: idem, blob revocado en cleanup del wizard.
        const blobUrl = createBlobUrl(file);
        setWizardFiles({
          ...wizardFiles,
          [slotKey]: [...(wizardFiles[slotKey] ?? []), file],
        });
        setUploadedDocs({
          ...uploadedDocs,
          [slotKey]: [...(blobUrl ? [blobUrl] : [])],
        });
        showToast("Error al subir a Drive; guardado localmente", "error");
      }
    } else {
      // Drive no conectado → fallback a blob URL + wizardFiles
      // BUG-021: idem, blob revocado en cleanup del wizard.
      const blobUrl = createBlobUrl(file);
      const prevArr = uploadedDocs[slotKey] ?? [];
      setWizardFiles({
        ...wizardFiles,
        [slotKey]: [...(wizardFiles[slotKey] ?? []), file],
      });
      setUploadedDocs({ ...uploadedDocs, [slotKey]: [...prevArr, blobUrl] });
      showToast(
        `Documento guardado localmente (Drive no conectado). Se subirá cuando conectes tu Drive.`,
        "error",
      );
    }

    setUploadingDoc(null);
    setCurrentDocLabel(null);
    // Disparar el modal "¿Querés subir otro?" en StepDocs.
    setLastUploadedSlot(slotKey);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        "Google Drive desconectado — el PDF del mandato se guardará solo en este navegador. " +
          "Reconectá tu cuenta desde Configuración → Integraciones para guardarlo en la nube.",
        "error",
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
        "error",
      );
      return;
    }
    setCurrentDocLabel(slotKey);
    setUploadingDocPropertyId(propertyId);
    detailDocInputRef.current?.click();
  };

  /** Helper semántico: subir CC o RUT de un propietario específico. */
  const triggerOwnerDocUpload = (
    propertyId: string,
    ownerId: string,
    docType: "cedula" | "rut",
  ) => {
    const slotKey = `${docType}:${ownerId}`;
    triggerDetailDocUpload(propertyId, slotKey);
  };
  /** Helper semántico: subir Certificado de Tradición de una unidad adicional. */
  const triggerUnitDocUpload = (propertyId: string, unitId: string) => {
    triggerDetailDocUpload(propertyId, `certificado_tradicion:${unitId}`);
  };
  /** Helper semántico: subir Predial o Certificado de la unidad principal
   *  (documentos a nivel de propiedad, sin owner/unit específico). */
  const triggerPropertyDocUpload = (
    propertyId: string,
    slotKey: "predial" | "certificado_tradicion:main",
  ) => {
    triggerDetailDocUpload(propertyId, slotKey);
  };

  /**
   * Migración a Option B: pre-crea la propiedad en MySQL cuando el usuario
   * pasa del step 1 al step 2 (o hace click en "Guardar avance"). Esto
   * habilita uploads a Drive en TIEMPO REAL durante el step 2.
   *
   * - Si la propiedad YA está persistida (`wizardPropertyDbId` set), devuelve
   *   los IDs existentes sin hacer un POST nuevo.
   * - Si no, valida los campos mínimos del step 1 (address, chip, folio,
   *   al menos 1 owner) y hace POST /api/properties con status='Pendiente'.
   *   Guarda los IDs retornados en state.
   * - Devuelve `{ propertyDbId, driveFolderId, driveFolderPath }` o `null`
   *   si falló la validación o el POST.
   */
  const ensurePropertyPersisted = async (): Promise<{
    propertyDbId: string;
    driveFolderId: string | null;
    driveFolderPath: string | null;
  } | null> => {
    // Ya persistida → devolver cache
    if (wizardPropertyDbId) {
      return {
        propertyDbId: wizardPropertyDbId,
        driveFolderId: wizardDriveFolderId,
        driveFolderPath: wizardDriveFolderPath,
      };
    }
    // Validación de campos básicos (mismas reglas que handleFinalize)
    // FIX #23: trim para que string vacío ("") no pase el truthy-check.
    if (!address?.trim() || !chip?.trim() || !folio?.trim()) {
      showToast("Por favor complete dirección, CHIP y folio", "error");
      return null;
    }
    const validOwners = wizardOwners.filter((o) => o.name.trim().length > 0);
    if (validOwners.length === 0) {
      showToast("Agregá al menos un propietario con nombre", "error");
      return null;
    }
    // Validar suma de % de participación (si hay)
    const definedPcts = wizardOwners
      .map((o) => Number(o.ownershipPct))
      .filter((n) => !isNaN(n) && n > 0);
    if (definedPcts.length > 0) {
      const sum = definedPcts.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        showToast(
          `Los % de participación suman ${sum.toFixed(2)}% — deberían sumar 100%`,
          "error",
        );
        return null;
      }
    }
    // FIX 2026-08-05: validar formato de email y teléfono también acá.
    // "Guardar avance" llama a esta función directamente (se salta la
    // validación de StepBasic.validate()), así que si no validamos acá,
    // un email "anubclao@gmail" (sin TLD) llega al server y queda
    // persistido en MySQL. Los campos vacíos siguen siendo válidos.
    for (const o of validOwners) {
      if (o.phone.trim() && !isValidColombianPhone(o.phone)) {
        showToast(
          `Teléfono "${o.phone}" no tiene formato de celular colombiano (10 dígitos, empieza con 3). Ej: 3001234567`,
          "error",
        );
        return null;
      }
      if (o.email.trim() && !isValidEmail(o.email)) {
        showToast(
          `Email "${o.email}" no tiene formato válido. Ej: usuario@dominio.com`,
          "error",
        );
        return null;
      }
    }

    // POST al backend
    const firstOwner = validOwners[0];
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: wizardPropertyId,
          address,
          chip,
          folio,
          ownerName: firstOwner.name,
          ownerIdNumber: firstOwner.idNumber,
          // FIX 2026-07-22: enviar también ownerPhone/ownerEmail al top level
          // para que las columnas legacy de la tabla `properties` se
          // pueblen. Sin esto, las legacy columns quedaban NULL aunque
          // el server SÍ guardaba el phone/email en la tabla nueva
          // `property_owners`. El server hace INSERT con los campos
          // top-level y después hace INSERT en property_owners desde la
          // array `owners` — los dos deben quedar sincronizados.
          ownerPhone: firstOwner.phone || null,
          ownerEmail: firstOwner.email || null,
          propertyType,
          status: "Pendiente", // antes de tener mandato, queda Pendiente
          owners: validOwners.map((o, i) => ({
            id: o.id,
            name: o.name,
            idNumber: o.idNumber || null,
            phone: o.phone || null,
            email: o.email || null,
            ownershipPct: o.ownershipPct ? Number(o.ownershipPct) : null,
            position: i + 1,
          })),
          units: wizardUnits
            .filter((u) => u.label.trim())
            .map((u, i) => ({
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
      if (!res.ok) {
        showToast(
          "Error guardando en servidor: " + (data.error ?? "unknown"),
          "error",
        );
        return null;
      }
      const newId = data.propertyId as string;
      setWizardPropertyDbId(newId);
      setWizardDriveFolderId(data.driveFolderId ?? null);
      setWizardDriveFolderPath(data.driveFolderPath ?? null);
      console.log(
        "[ensurePropertyPersisted] OK — propertyId:",
        newId,
        "drive:",
        data.driveFolderPath,
      );
      return {
        propertyDbId: newId,
        driveFolderId: data.driveFolderId ?? null,
        driveFolderPath: data.driveFolderPath ?? null,
      };
    } catch (err: any) {
      console.error("[ensurePropertyPersisted] error:", err);
      showToast("Error de conexión al guardar propiedad", "error");
      return null;
    }
  };

  const handleFinalize = async (capturedInventory?: Inventory) => {
    console.log(
      "[finalize] ▶ START — address:",
      address,
      "chip:",
      chip,
      "folio:",
      folio,
      "owners:",
      wizardOwners.filter((o) => o.name.trim()).length,
      "units:",
      wizardUnits.filter((u) => u.label.trim()).length,
    );
    // ── Validación de campos básicos ──
    // FIX #23: trim para que string vacío no pase el truthy-check.
    if (!address?.trim() || !chip?.trim() || !folio?.trim()) {
      showToast("Por favor complete dirección, CHIP y folio", "error");
      return;
    }
    const validOwners = wizardOwners.filter((o) => o.name.trim().length > 0);
    if (validOwners.length === 0) {
      showToast("Agregá al menos un propietario con nombre", "error");
      return;
    }
    // Validar suma de % de participación
    const definedPcts = wizardOwners
      .map((o) => Number(o.ownershipPct))
      .filter((n) => !isNaN(n) && n > 0);
    if (definedPcts.length > 0) {
      const sum = definedPcts.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        showToast(
          `Los % de participación suman ${sum.toFixed(2)}% — deberían sumar 100%`,
          "error",
        );
        return;
      }
    }

    // ── Validar docs requeridos (migración 010+, soporta N archivos por slot) ──
    // Docs son opcionales: no bloqueamos el finalize si faltan, solo los listamos
    // en `missingDocs` para que el modal de confirmación los muestre.
    // uploadedDocs es UploadedDocsMap = Record<string, string[]> (semántica
    // N archivos por slot, migración 010+), pero los slots legacy pueden
    // contener un string suelto. Aceptamos ambos.
    const hasFile = (slot: string | string[] | undefined) =>
      Array.isArray(slot)
        ? slot.length > 0
        : typeof slot === "string" && slot.length > 0;
    const missingDocs: string[] = [];
    // También trackeamos los slotKeys faltantes para el summary modal post-finalize.
    const missingSlotKeys: string[] = [];
    for (const o of validOwners) {
      if (!hasFile(uploadedDocs[`cedula:${o.id}`])) {
        missingDocs.push(`Cédula de ${o.name}`);
        missingSlotKeys.push(`cedula:${o.id}`);
      }
    }
    if (!hasFile(uploadedDocs["certificado_tradicion:main"])) {
      missingDocs.push("Certificado de Tradición (unidad principal)");
      missingSlotKeys.push("certificado_tradicion:main");
    }
    for (const u of wizardUnits) {
      if (!u.label.trim()) continue;
      if (!hasFile(uploadedDocs[`certificado_tradicion:${u.id}`])) {
        missingDocs.push(`Certificado de ${u.label}`);
        missingSlotKeys.push(`certificado_tradicion:${u.id}`);
      }
    }
    if (!hasFile(uploadedDocs[MANDATO_KEY])) {
      missingDocs.push("Contrato de Mandato");
      missingSlotKeys.push(MANDATO_KEY);
    }
    // No bloqueamos el finalize si faltan docs: el agente los puede subir
    // después desde el Detalle del Inmueble. La propiedad quedará "Pendiente"
    // hasta que suba el Mandato. Solo loggeamos para visibilidad.
    if (missingDocs.length > 0) {
      console.log(
        "[finalize] Continúa con documentos pendientes:",
        missingDocs,
      );
    }

    // FIX BUG-2026-08-05: reset del flag global al inicio de cada wizard.
    // Si el wizard anterior falló silenciosamente y el user reabrió la app,
    // este flag puede venir true. Lo limpiamos acá para empezar limpio.
    window.__inmocontrol_docsPersistFailed = false;

    // Refactor: garantizar SIEMPRE que el wizard cierre al terminar, incluso si algo
    // tira excepción intermedia. try/finally así el usuario no queda atrapado en step 3.
    try {
      // Si nos pasaron el inventario desde StepInventory, lo usamos. Si no, caemos al state.
      // Esto evita el bug de closure stale donde wizardInventory era null al leerlo desde
      // un handler pasado como prop (onComplete={handleFinalize}).

      // ── 1. Asegurar que la propiedad ya está persistida (Option B) ──
      // En el flujo normal, ensurePropertyPersisted ya corrió en la transición
      // step 1→2. Pero por si llegamos a finalize sin pasar por ahí (ej: el
      // usuario cerró el browser, lo reabrió con draft, y fue directo a step 3),
      // aseguramos el POST acá también.
      let propertyDbId: string | null = wizardPropertyDbId;
      let driveFolderId: string | null = wizardDriveFolderId;
      let driveFolderPath: string | null = wizardDriveFolderPath;
      if (!propertyDbId) {
        console.warn(
          "[finalize] wizardPropertyDbId no estaba seteado, llamando ensurePropertyPersisted...",
        );
        const ensured = await ensurePropertyPersisted();
        if (!ensured) {
          showToast("No se pudo persistir la propiedad", "error");
          return;
        }
        propertyDbId = ensured.propertyDbId;
        driveFolderId = ensured.driveFolderId;
        driveFolderPath = ensured.driveFolderPath;
      }
      const firstOwner = validOwners[0];

      // ── Re-keyear owners/units: el server devolvió UUIDs reales (distintos
      //    a los slotKeys del wizard). Hacemos GET para mapear wizard-XXX → UUID.
      let realOwners: Array<{ id: string; name: string }> = [];
      let realUnits: Array<{ id: string; label: string; type: string }> = [];
      try {
        const r = await fetch(`/api/properties/${propertyDbId}`);
        if (r.ok) {
          const fresh = await r.json();
          realOwners = (fresh.owners ?? []).map((o: any) => ({
            id: o.id,
            name: o.name,
          }));
          realUnits = (fresh.units ?? []).map((u: any) => ({
            id: u.id,
            label: u.label,
            type: u.type,
          }));
        } else {
          console.warn(
            `[finalize] GET /api/properties/${propertyDbId} devolvió ${r.status} — ownerIdMap quedará vacío y los slotKeys con wizard-* serán rechazados por el server`,
          );
        }
      } catch (err) {
        console.warn("[finalize] no se pudieron leer los UUIDs reales:", err);
      }
      // DIAG: si realOwners viene vacío, el slotKey realSlotKey devuelve el wizard-id
      // y el server rechaza silenciosamente el INSERT en property_documents.
      // Estos logs son seguros en prod (no tocan datos, solo console).
      if (realOwners.length === 0 && validOwners.length > 0) {
        console.warn(
          `[finalize] ⚠ realOwners está vacío pero hay ${validOwners.length} owners válidos. ` +
            `Esto va a hacer que el server rechace los INSERT a property_documents porque ` +
            `los slotKeys tendrán ids "wizard-*". Esperado 1 POST GET al server para refrescar.`,
        );
      } else {
        console.log(
          `[finalize] realOwners=${realOwners.length}, realUnits=${realUnits.length}, validOwners=${validOwners.length}`,
        );
      }
      const ownerIdMap = new Map<string, string>();
      validOwners.forEach((wOwner, i) => {
        const real = realOwners[i];
        if (real) ownerIdMap.set(wOwner.id, real.id);
      });
      const unitIdMap = new Map<string, string>();
      wizardUnits
        .filter((u) => u.label.trim())
        .forEach((wUnit, i) => {
          const real = realUnits[i];
          if (real) unitIdMap.set(wUnit.id, real.id);
        });
      /** Convierte un slotKey del wizard (con ids temp) al slotKey con UUIDs reales. */
      const realSlotKey = (slotKey: string): string => {
        if (slotKey.startsWith("cedula:")) {
          const wid = slotKey.slice("cedula:".length);
          const rid = ownerIdMap.get(wid);
          return rid ? `cedula:${rid}` : slotKey;
        }
        if (slotKey.startsWith("rut:")) {
          const wid = slotKey.slice("rut:".length);
          const rid = ownerIdMap.get(wid);
          return rid ? `rut:${rid}` : slotKey;
        }
        if (slotKey.startsWith("certificado_tradicion:")) {
          const wid = slotKey.slice("certificado_tradicion:".length);
          if (wid === "main") return slotKey;
          const rid = unitIdMap.get(wid);
          return rid ? `certificado_tradicion:${rid}` : slotKey;
        }
        return slotKey; // predial, mandato
      };

      // 2. Subir los PDFs a Drive (carpeta Propietario/).
      //    Construimos `finalDocuments` con slotKeys ya en formato REAL (UUIDs).
      //    AHORA cada slot puede tener N archivos: guardamos solo el primero
      //    como "principal" (compat con la DB) y los demás en un array `extra`.
      //    El backend acepta `documents` como JSON: string (1 archivo, legacy) o
      //    { primary, extras[] } (N archivos, nuevo).
      //
      //    Migración a Option B: con el upload en tiempo real durante step 2,
      //    la mayoría de los archivos YA están en Drive al llegar a finalize
      //    (uploadedDocs[wizardSlotKey][i] empieza con https://). Solo subimos
      //    los que quedaron locales (blob:) por error de Drive o por flujo
      //    heredado (wizard abierto antes de este cambio).
      const finalDocuments: Record<
        string,
        string | { primary: string; extras: string[] }
      > = {};
      const driveConnected = !!driveFolderId;
      const uploadedToDrive: string[] = [];
      const uploadedLocalOnly: string[] = [];
      const failedUploads: string[] = [];

      // FIX AC-15 (jul-2026): la fuente de verdad pasa a ser `uploadedDocs` (que
      // SÍ persiste en localStorage) en vez de `wizardFiles` (que NO se puede
      // serializar y se pierde al refrescar el browser). Si un slot tiene URL de
      // Drive, la reusamos. Si tiene blob URL y el `File` aún está en `wizardFiles`
      // (sesión actual), re-subimos. Si tiene blob URL pero NO hay File (refresh
      // previo), lo logueamos y seguimos — el user re-sube desde el Detalle.
      for (const [wizardSlotKey, driveUrls] of Object.entries(uploadedDocs)) {
        if (!Array.isArray(driveUrls) || driveUrls.length === 0) continue;
        const realKey = realSlotKey(wizardSlotKey);
        // Nombre "bautizado" en Drive: si hay varios archivos, les ponemos sufijo _1, _2, etc.
        const baseFileName = slotKeyToFilename(
          realKey,
          validOwners,
          wizardUnits,
        );
        const stripExt = baseFileName.replace(/\.pdf$/i, "");
        const uploadedUrls: string[] = [];
        // Files en memoria (pueden no existir si hubo refresh). Se usan solo para
        // re-subir archivos que quedaron como blob: local.
        const filesInMemory = wizardFiles[wizardSlotKey] ?? [];
        for (let i = 0; i < driveUrls.length; i++) {
          const existingUrl = driveUrls[i] ?? "";
          const fileName =
            driveUrls.length === 1 ? baseFileName : `${stripExt}_${i + 1}.pdf`;
          // ── ¿Es URL de Drive válida? (Option B ya subió en tiempo real) ──
          if (
            existingUrl &&
            /^https:\/\/(drive|docs)\.google\.com\//.test(existingUrl)
          ) {
            // Ya en Drive → reusamos la URL sin re-subir
            uploadedUrls.push(existingUrl);
            uploadedToDrive.push(realKey);
            continue;
          }
          if (
            existingUrl &&
            /^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(existingUrl)
          ) {
            uploadedUrls.push(existingUrl);
            uploadedToDrive.push(realKey);
            continue;
          }
          // ── Es blob: o vacío. Necesitamos el File para re-subir. ──
          const file = filesInMemory[i];
          if (!file) {
            // No tenemos el File en memoria (refresh del browser entre el upload
            // y el finalize). NO podemos re-subir. FIX AC-15: tampoco persistimos
            // el blob URL — la fila de property_documents queda sin crear.
            console.warn(
              `[finalize] ${realKey}[${i}]: URL local sin File en memoria — se saltea. El agente debe re-subir desde el Detalle del Inmueble.`,
            );
            continue;
          }
          // ── No está en Drive → subir ahora ──
          if (driveConnected && driveFolderId) {
            try {
              const base64 = await fileToBase64(file);
              const result = await uploadFileToDrive(
                propertyDbId,
                driveFolderId,
                "Propietario",
                fileName,
                base64,
              );
              if (result.webViewLink) {
                uploadedUrls.push(result.webViewLink);
                uploadedToDrive.push(realKey);
              } else {
                // FIX AC-15: NO persistir blob URL. La dejamos en uploadedLocalOnly
                // para el modal de resumen, pero NO la mandamos a finalDocuments.
                uploadedLocalOnly.push(realKey);
                console.warn(
                  `[finalize] ${realKey}[${i}]: Drive upload failed (${result.error}) → local blob, NO persistido`,
                );
              }
            } catch (err: any) {
              uploadedLocalOnly.push(realKey);
              failedUploads.push(`${realKey}[${i}]: ${err.message}`);
              console.warn(
                `[finalize] ${realKey}[${i}]: upload error ${err.message} — NO persistido`,
              );
            }
          } else {
            uploadedLocalOnly.push(realKey);
          }
        }
        // Compat: si hay 1 solo archivo, guardamos la URL plana (legacy). Si hay
        // varios, guardamos el objeto { primary, extras }.
        if (uploadedUrls.length === 1) {
          finalDocuments[realKey] = uploadedUrls[0];
        } else if (uploadedUrls.length > 1) {
          finalDocuments[realKey] = {
            primary: uploadedUrls[0],
            extras: uploadedUrls.slice(1),
          };
        }
      }

      const mandateUrl = finalDocuments[MANDATO_KEY] ?? null;
      const mandateSubido = !!mandateUrl;
      const mandateSignedAt = mandateSubido ? new Date().toISOString() : null;
      const status = mandateSubido ? "Activo" : "Pendiente";

      // 3. Persistir URLs reales + mandate + owners/units en MySQL (segundo POST = UPSERT)
      // DIAG: loggear qué keys de documents se están enviando y si tienen URLs de Drive.
      const finalDocsSummary = Object.entries(finalDocuments).map(([k, v]) => {
        const url = typeof v === "string" ? v : v?.primary;
        const isDrive = url && /^https:\/\/.*\.google\.com\//.test(url);
        return `${k}=${isDrive ? "DRIVE" : "LOCAL"}${v && typeof v === "object" ? `(+${v.extras?.length ?? 0} extras)` : ""}`;
      });
      console.log(
        `[finalize] POST /api/properties documents: ${JSON.stringify(finalDocsSummary)}`,
      );
      try {
        const res = await fetch("/api/properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            localId: propertyDbId,
            mandatePdfUrl: mandateUrl,
            mandateSignedAt: mandateSignedAt,
            documents: finalDocuments,
            status,
            // FIX 2026-07-22: enviar también ownerPhone/ownerEmail al top level
            // (mismo motivo que en ensurePropertyPersisted — las legacy columns
            // de la tabla `properties` se actualizan con COALESCE).
            ownerName: firstOwner.name,
            ownerIdNumber: firstOwner.idNumber || null,
            ownerPhone: firstOwner.phone || null,
            ownerEmail: firstOwner.email || null,
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
            units: wizardUnits
              .filter((u) => u.label.trim())
              .map((u, i) => ({
                id: realUnits[i]?.id,
                type: u.type,
                label: u.label,
                folioMatricula: u.folioMatricula || null,
                areaM2: u.areaM2 ? Number(u.areaM2) : null,
                position: i + 1,
              })),
          }),
        });
        console.log("[finalize] POST #2 (UPSERT) status:", res.status);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const postResp = await res.json().catch(() => null);
        const postDocs =
          postResp?.documents_legacy ?? postResp?.documents ?? {};
        const postDocsCount = Object.keys(postDocs).length;
        console.log(
          `[finalize] POST #2 OK — documents persistidos en MySQL: ${postDocsCount} keys.`,
        );
        if (postDocsCount === 0 && finalDocsSummary.length > 0) {
          // FIX BUG-2026-08-05: el server respondió 200 pero ningún doc se persistió.
          // Eso significa que el server rechazó TODOS los INSERTs (probable: slotKeys
          // con wizard-* o URL no-Drive). Marcamos un flag para que el flujo siguiente
          // muestre un error explícito en vez del "toast mentiroso" de éxito.
          window.__inmocontrol_docsPersistFailed = true;
          console.warn(
            "[finalize] ⚠ El server respondió 200 pero documents_legacy está VACÍO. " +
              "Los INSERT a property_documents fallaron silenciosamente. " +
              "Mirar logs del server (hPanel → Logs) para ver el [docs] rechazando wizard-*.",
          );
        }
      } catch (err: any) {
        // FIX BUG-2026-08-05: NO tragar el error. Mostrar un modal de error con
        // instrucciones claras. Antes este catch era silencioso y el wizard
        // cerraba con toast de éxito aunque los docs no se hubieran guardado.
        console.error("[finalize] backend persist URLs:", err);
        window.__inmocontrol_docsPersistFailed = true;
        // No throw — el catch ya loguea y el flag se consulta más abajo.
        // Pero mostramos un toast claro al agente.
        showToast(
          `Propiedad guardada, pero falló al persistir documentos: ${err.message}. Los archivos quedaron solo en Drive. Reintentá desde el Detalle del Inmueble.`,
          "error",
        );
      }

      // 3.5. Re-keyear el inventario de IndexedDB y postearlo a MySQL con UUID real.
      //      Antes esto se hacía en onInventoryFinalized con el wizard-X → FK fallaba.
      //      Ahora diferimos hasta tener propertyDbId válido.
      const inventoryToPersist = capturedInventory ?? wizardInventory;
      let inventoryUploadedToDrive = false; // para el summary modal post-finalize
      if (inventoryToPersist) {
        try {
          const oldId = inventoryToPersist.id; // `${wizardPropertyId}:inicial`
          const newId = `${propertyDbId}:inicial`; // `${realUuid}:inicial`
          const rekeyed: Inventory = {
            ...inventoryToPersist,
            id: newId,
            propertyId: propertyDbId!,
          };
          await inventoryDB.saveInventory(rekeyed); // crea con nueva key
          await inventoryDB.deleteInventory(oldId); // borra la vieja (incluye fotos)

          // POST a MySQL (la FK ahora sí se cumple)
          // IMPORTANTE: antes de serializar, eliminamos `videoDataUrl` de cada
          // ItemMedia — el archivo de video completo puede pesar 10-50MB y
          // rompería la columna JSON de MySQL. El video COMPLETO se queda en
          // IndexedDB (key: <inventoryId>:<mediaId>) y se puede re-leer desde
          // ahí cuando haga falta subirlo a Drive. Solo mandamos a MySQL el
          // thumbnail + metadata, suficiente para renderizar el PDF.
          const areasStripped = rekeyed.areas.map((a) => ({
            ...a,
            items: Object.fromEntries(
              Object.entries(a.items).map(([k, v]) => [
                k,
                {
                  ...v,
                  media: (v.media ?? []).map((m) => {
                    if (m.type === "video") {
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const { videoDataUrl, ...rest } = m;
                      return rest;
                    }
                    return m;
                  }),
                },
              ]),
            ),
          }));
          const r1 = await fetch("/api/inventories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: rekeyed.id,
              propertyId: rekeyed.propertyId,
              phase: "inicial",
              propertyType: rekeyed.propertyType,
              counters: rekeyed.counters,
              areas: areasStripped,
              photos: rekeyed.photos,
              signatures: rekeyed.signatures,
              customAreas: rekeyed.customAreas,
            }),
          });
          if (!r1.ok) {
            const err = await r1.json().catch(() => ({}));
            console.warn(
              "[finalize] inventory MySQL persist:",
              err.error ?? r1.status,
            );
          } else {
            console.log(
              "[finalize] inventario guardado en MySQL con UUID real",
            );
          }

          // Subir PDF a Drive (Inventarios/) — best-effort, no bloquea.
          if (driveConnected && driveFolderId) {
            try {
              const { generateInventoryPdfBlob } =
                await import("./inventoryPdf");
              const blob = await generateInventoryPdfBlob(
                rekeyed,
                wizardProperty,
                async (id: string) => {
                  const photo = await inventoryDB.getPhoto(id);
                  return (photo as any)?.dataUrl ?? null;
                },
              );
              const reader = new FileReader();
              const base64 = await new Promise<string>((resolve) => {
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              const r2 = await fetch("/api/inventories/upload-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  propertyId: propertyDbId,
                  phase: "inicial",
                  base64Data: base64,
                  inventoryDate: new Date().toISOString().slice(0, 10),
                }),
              });
              if (r2.ok) {
                console.log("[finalize] PDF inventario → Drive");
                inventoryUploadedToDrive = true;
              } else
                console.warn(
                  "[finalize] PDF inventario → Drive falló:",
                  r2.status,
                );
            } catch (e: any) {
              console.warn("[finalize] PDF inventario error:", e.message);
            }

            // Subir fotos individuales a Drive (carpeta `Inventario captacion/`).
            // ANTES: las fotos solo vivían en IndexedDB → si el usuario limpiaba caché
            // o abría otro navegador, las perdía. AHORA: cada foto se sube a Drive
            // con nombre `{areaSlug}_{NN}.jpg` y queda como fuente de verdad.
            // best-effort: si falla alguna, no bloqueamos el wizard.
            try {
              const photoUploads: Array<{ name: string; base64Data: string }> =
                [];
              for (const photoMeta of rekeyed.photos ?? []) {
                let dataUrl: string | null = null;
                try {
                  const stored = await inventoryDB.getPhoto(photoMeta.id);
                  dataUrl = stored?.dataUrl ?? null;
                } catch {
                  /* ignore */
                }
                // FIX: fallback al dataUrl embebido si el store `photos` está vacío
                // (wizard históricos que solo guardaron el array inline).
                if (!dataUrl && (photoMeta as any).dataUrl) {
                  dataUrl = (photoMeta as any).dataUrl;
                }
                if (!dataUrl) continue;
                // Nombre = areaSlug_NN (la convención del AGENTS.md)
                const areaSlug = String(photoMeta.areaId ?? "")
                  .replace(/[^a-z0-9]+/gi, "_")
                  .toLowerCase();
                const name = `${areaSlug}_${String(photoMeta.id).split(":").pop() ?? "00"}.jpg`;
                photoUploads.push({ name, base64Data: dataUrl });
              }
              if (photoUploads.length > 0) {
                console.log(
                  `[finalize] Subiendo ${photoUploads.length} fotos a Drive...`,
                );
                const rPhotos = await fetch("/api/inventories/upload-photos", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    propertyId: propertyDbId,
                    phase: "inicial",
                    photos: photoUploads,
                  }),
                });
                if (rPhotos.ok) {
                  const result = await rPhotos.json();
                  console.log(
                    `[finalize] ${result.uploaded?.length ?? 0} fotos → Drive/${result.folderName}/`,
                  );
                  if (result.failed?.length > 0) {
                    console.warn(
                      `[finalize] ${result.failed.length} fotos fallaron:`,
                      result.failed,
                    );
                  }
                } else {
                  console.warn(
                    "[finalize] upload-photos → HTTP",
                    rPhotos.status,
                  );
                }
              }
            } catch (e: any) {
              console.warn("[finalize] upload photos error:", e.message);
            }
          }
        } catch (err: any) {
          console.error("[finalize] inventory persist:", err);
        }
      }

      // 4. Guardar en el store local (Zustand) para la UI inmediata
      // IMPORTANTE: pasar `id: propertyDbId` para que addProperty NO haga otro POST
      // (la fila ya existe en MySQL desde el paso 1). Sin esto, antes creaba un
      // INSERT duplicado → otra carpeta en Drive con el mismo nombre.
      console.log(
        "[finalize] llamando onAddProperty con id:",
        propertyDbId,
        "address:",
        address,
      );
      onAddProperty({
        id: propertyDbId,
        address,
        chip,
        folio,
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
        units: wizardUnits
          .filter((u) => u.label.trim())
          .map((u, i) => ({
            id: realUnits[i]?.id ?? u.id,
            type: u.type,
            label: u.label,
            folioMatricula: u.folioMatricula || null,
            areaM2: u.areaM2 ? Number(u.areaM2) : null,
            position: i + 1,
            documents: {
              certificado_tradicion:
                finalDocuments[realSlotKey(`certificado_tradicion:${u.id}`)] ??
                null,
            },
          })),
        documents_property: {
          predial: finalDocuments["predial"] ?? null,
          certificado_tradicion:
            finalDocuments["certificado_tradicion:main"] ?? null,
        },
      });

      // 5. Toast breve + modal de resumen. El toast avisa que hay resumen; el modal
      //    queda visible hasta que el usuario lo cierra y lista explícitamente
      //    qué quedó en Drive, qué quedó local, qué falta y si hubo errores.
      const totalDocs = Object.keys(finalDocuments).length;
      const realOwnersCount = validOwners.length;
      const realUnitsCount = wizardUnits.filter((u) => u.label.trim()).length;
      const allDriveOk =
        uploadedToDrive.length === totalDocs && uploadedLocalOnly.length === 0;
      // FIX BUG-2026-08-05: el POST #2 puede haber devuelto 200 sin persistir ningún
      // doc (server rechaza wizard-* o URLs no-Drive). El flag se setea dentro del
      // catch y dentro del if(postDocsCount===0). Si está activo, NO mostramos el
      // toast verde de "todo bien" — el agente tiene que saber que algo falló.
      const persistFailed = window.__inmocontrol_docsPersistFailed === true;
      const shortToast = persistFailed
        ? `✗ Propiedad creada pero los documentos NO se guardaron. Reintentá desde el Detalle.`
        : allDriveOk
          ? `✓ ¡Propiedad creada! Todo en Drive. Resumen abajo.`
          : `⚠ Propiedad creada con ${uploadedLocalOnly.length + missingSlotKeys.length} pendiente(s). Resumen abajo.`;
      showToast(
        shortToast,
        persistFailed ? "error" : allDriveOk ? "success" : "error",
      );

      // Guardamos el summary en el state — el modal se renderiza en el JSX abajo.
      // Commit 4 refactor #5: el constructor es una función pura testeable.
      setFinalizeSummary(
        buildFinalizeSummary({
          address,
          driveFolderId,
          driveFolderPath,
          driveConnected,
          uploadedToDrive,
          uploadedLocalOnly,
          missingSlotKeys,
          failedUploads,
          inventoryUploadedToDrive,
          totalDocs,
          persistFailed,
        }),
      );

      // SPEC fix_wizard_docs_persistence.md — AC-3.2 + AC-3.3
      // 1. Invalidamos la lista de properties para que el próximo mount
      //    de PropertiesView (cuando el user vuelve del wizard) refetchee
      //    y la propiedad nueva aparezca sin F5.
      // 2. Seteamos `lastCreatedPropertyId` para disparar el highlight
      //    azul de 3s en la card correspondiente.
      // Se hace acá (no en el `finally`) porque si la creación falló, no
      // queremos "celebrar" una propiedad que no existe.
      try {
        useAppStore.getState().invalidatePropertiesList();
        if (propertyDbId) {
          useAppStore.getState().setLastCreatedPropertyId(propertyDbId);
        }
      } catch (e) {
        // No crítico — log y seguir.
        console.warn("[finalize] invalidate/highlight setup:", e);
      }
    } finally {
      // Garantía: el wizard SIEMPRE cierra, incluso si una excepción escapó los
      // try/catch internos (ej. onAddProperty tirando, o un fallo de React en
      // el render siguiente). Sin esto el usuario queda atrapado en step 3.
      setStep(1);
      setShowWizard(false);
      setAddress("");
      setChip("");
      setFolio("");
      setOwnerIdNumber("");
      setPropertyType("apartamento");
      setWizardOwners([
        {
          id: `wizard-owner-${Date.now()}-1`,
          name: "",
          idNumber: "",
          phone: "",
          email: "",
          ownershipPct: "",
        },
      ]);
      setWizardUnits([]);
      // Liberamos los blob URLs del wizard antes de vaciar el state (memory leak fix)
      // Liberar TODOS los blob URLs del wizard antes de vaciar el state (memory leak fix).
      // uploadedDocs es ahora Record<slotKey, string[]> — hay que iterar cada array.
      Object.values(uploadedDocs).forEach((arr) => {
        if (Array.isArray(arr))
          arr.forEach((u) => {
            // BUG-021: helper central.
            revokeIfBlob(u);
          });
      });
      setUploadedDocs({});
      setWizardFiles({});
      setWizardInventory(null);
      setLastUploadedSlot(null);
      // Option B: limpiar también los IDs de persistencia (la propiedad
      // ya está creada en MySQL, NO hay que re-crearla al próximo wizard)
      setWizardPropertyDbId(null);
      setWizardDriveFolderId(null);
      setWizardDriveFolderPath(null);
      // Limpiar el draft del wizard en localStorage (el flujo terminó OK)
      try {
        localStorage.removeItem(STORAGE_KEYS.wizardPropertyDraft);
      } catch {
        /* silent */
      }
    }
  };

  /**
   * Descartar el draft actual del wizard. Llamado desde el modal de confirmación.
   * Vacía todo el state del wizard y borra el localStorage. Equivale a
   * "abrir el wizard desde cero, sin restaurar nada".
   *
   * Migración a Option B: si la propiedad YA fue persistida en MySQL
   * (wizardPropertyDbId set), la borramos también para no dejar huérfanas.
   * El endpoint DELETE /api/properties/:id también limpia la carpeta en Drive
   * si está vacía, y rechaza con 409 si ya tiene inventarios.
   */
  const discardDraft = async () => {
    setConfirmDiscardDraft(false);
    // Si hay propertyDbId, intentar borrarla del server (best-effort)
    if (wizardPropertyDbId) {
      try {
        const res = await fetch(`/api/properties/${wizardPropertyDbId}`, {
          method: "DELETE",
        });
        if (res.status === 409) {
          // Ya tiene inventarios (raro en discard de draft, pero posible) →
          // igual limpiamos el wizard local. El agente la verá en la lista de
          // propiedades y puede seguir editando.
          console.warn(
            "[discardDraft] server rechazó DELETE (409): ya tiene inventarios",
          );
        } else if (!res.ok) {
          console.warn("[discardDraft] server DELETE no OK:", res.status);
        } else {
          console.log(
            "[discardDraft] propiedad borrada del server:",
            wizardPropertyDbId,
          );
        }
      } catch (err) {
        console.warn("[discardDraft] error llamando DELETE:", err);
      }
    }
    setStep(1);
    setShowWizard(false);
    setAddress("");
    setChip("");
    setFolio("");
    setOwnerIdNumber("");
    setPropertyType("apartamento");
    setWizardOwners([
      {
        id: `wizard-owner-${Date.now()}-1`,
        name: "",
        idNumber: "",
        phone: "",
        email: "",
        ownershipPct: "",
      },
    ]);
    setWizardUnits([]);
    // Liberar blob URLs antes de vaciar (memory leak fix)
    Object.values(uploadedDocs).forEach((arr) => {
      if (Array.isArray(arr))
        arr.forEach((u) => {
          // BUG-021: helper central.
          revokeIfBlob(u);
        });
    });
    setUploadedDocs({});
    setWizardFiles({});
    setWizardInventory(null);
    // Generar un wizardPropertyId nuevo (el anterior ya estaba en localStorage)
    setWizardPropertyId(`wizard-${Date.now()}`);
    // Limpiar también los IDs de la persistencia (Option B)
    setWizardPropertyDbId(null);
    setWizardDriveFolderId(null);
    setWizardDriveFolderPath(null);
    // Borrar de localStorage
    try {
      localStorage.removeItem(STORAGE_KEYS.wizardPropertyDraft);
    } catch {
      /* silent */
    }
    showToast("Borrador descartado. Empezás de cero.", "success");
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
        console.warn("[refresh detail] server returned", res.status);
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
        status:
          fresh.status === "available"
            ? "Pendiente"
            : fresh.status === "rented"
              ? "Arrendado"
              : fresh.status === "maintenance"
                ? "Inactivo"
                : fresh.status,
        inventoryPdfUrl: fresh.inventory_pdf_url ?? null,
        inventoryCaptacionPdfUrl:
          fresh.inventory_captacion_pdf_url ??
          fresh.inventory_captacion_pdf_url ??
          null,
        inventoryColocacionPdfUrl:
          fresh.inventario_colocacion_pdf_url ??
          fresh.inventory_colocacion_pdf_url ??
          null,
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
          properties: s.properties.map((p: any) =>
            p.id === propertyId ? { ...p, ...patch } : p,
          ),
        }));
      }
      // Sincronizar el modal inmediatamente (no esperar al re-render del store)
      setViewingProperty((prev: any) =>
        prev?.id === propertyId ? { ...prev, ...patch } : prev,
      );
    } catch (err) {
      console.warn("[refresh detail]", err);
    } finally {
      setDetailRefreshing(false);
    }
  };

  /** Abre la galería de fotos del inventario de captación. Carga las fotos desde
   *  IndexedDB primero; si no encuentra (por reset-data.js o cambio de browser),
   *  cae al inventario remoto en MySQL. Las fotos en MySQL están como JSON
   *  con `dataUrl` base64 en `inventories.photos[]`, así que no se pierden. */
  const openPhotoGallery = async (
    property: any,
    phase: "inicial" | "final" = "inicial",
  ) => {
    if (!property?.id) return;
    setPhotoGalleryLoading(true);
    try {
      let inventory = await inventoryDB.getInventory(`${property.id}:${phase}`);
      // FIX (jul-2026): disparar el fallback a MySQL no solo cuando NO hay
      // row en IndexedDB, sino también cuando la row existe pero `photos` está
      // vacío. Esto cubre el caso de IndexedDB stale (self-heal previo convirtió
      // un Record a `[]`, o limpieza de caché del navegador dejó huérfano el
      // `photos` store mientras MySQL sí tiene las 13 fotos con dataUrl).
      const localPhotos = inventory
        ? normalizePhotosArray(inventory.photos)
        : [];
      const shouldFetchFromMysql = !inventory || localPhotos.length === 0;
      if (shouldFetchFromMysql) {
        // Fallback: traer de MySQL
        try {
          const res = await fetch(
            `/api/inventories?propertyId=${encodeURIComponent(property.id)}`,
          );
          if (res.ok) {
            const data = await res.json();
            const remote = (data.inventories ?? []).find(
              (i: any) => i.phase === phase,
            );
            if (remote) {
              const remotePhotos = normalizePhotosArray(remote.photos);
              if (remotePhotos.length > 0) {
                console.log(
                  `[gallery] Re-hidratando ${remotePhotos.length} fotos desde MySQL → IndexedDB`,
                );
              }
              inventory = {
                id: remote.id,
                propertyId: remote.property_id,
                phase: remote.phase,
                propertyType: remote.property_type,
                counters: remote.counters ?? {},
                areas: remote.areas ?? [],
                // FIX (jul-2026): `remote.photos` puede llegar como Record/Object
                // desde MySQL si la data se guardó mal. Normalizamos al array.
                photos: remotePhotos,
                signatures: remote.signatures ?? [],
                customAreas: remote.custom_areas ?? [],
                signedAt: remote.signed_at,
                createdAt: remote.created_at,
                updatedAt: remote.updated_at,
              };
              // Re-poblar IndexedDB: inventario + cada foto en su store
              await inventoryDB.saveInventory(inventory!);
              for (const p of inventory!.photos ?? []) {
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
          console.warn("[gallery] fallback MySQL fetch failed:", err);
        }
      }
      if (!inventory) {
        showToast(
          `Aún no hay inventario de ${phase === "inicial" ? "captación" : "colocación"} para esta propiedad`,
          "error",
        );
        setPhotoGalleryLoading(false);
        return;
      }
      // FIX (jul-2026): `inventory.photos` puede llegar como Record/Object
      // desde IndexedDB o MySQL (data legacy). `?? []` no protege contra
      // objetos, solo contra null/undefined. `normalizePhotosArray()`
      // convierte cualquier forma (array | record | null) a array.
      // Si detectamos forma objeto, re-save en IndexedDB para self-heal —
      // así la próxima lectura ya no tiene que normalizar.
      const rawPhotos = inventory.photos;
      const photoList = normalizePhotosArray(rawPhotos);
      if (
        rawPhotos &&
        typeof rawPhotos === "object" &&
        !Array.isArray(rawPhotos)
      ) {
        const shape =
          photoList.length === 0
            ? "array vacío (id set sin metadata)"
            : "array con metadata";
        console.warn(
          `[gallery] inventory.photos era Record/Object — normalizado a ${shape}. Self-heal save.`,
        );
        void inventoryDB.saveInventory({ ...inventory, photos: photoList });
      }
      const allPhotoIds = photoList.map((p: any) => p.id);
      const photos: Array<{
        id: string;
        areaId: string;
        areaLabel: string;
        dataUrl: string;
        phase: "inicial" | "final";
      }> = [];
      for (const photoMeta of photoList) {
        // FIX: el store `photos` de IndexedDB puede estar vacío (el wizard
        // histórico solo guardaba el array inline en inventory.photos[]).
        // Si `getPhoto` falla, caemos al dataUrl embebido en el inventory.
        let dataUrl: string | null = null;
        try {
          const stored = await inventoryDB.getPhoto(photoMeta.id);
          dataUrl = stored?.dataUrl ?? null;
        } catch {
          /* ignore */
        }
        if (!dataUrl && (photoMeta as any).dataUrl) {
          dataUrl = (photoMeta as any).dataUrl;
        }
        if (dataUrl) {
          const area = (inventory.areas ?? []).find(
            (a: any) => a.id === photoMeta.areaId,
          );
          photos.push({
            id: photoMeta.id,
            areaId: photoMeta.areaId,
            areaLabel: area?.label ?? "Sin área",
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
    } catch (err: any) {
      console.error("[gallery] load photos:", err);
      showToast("Error cargando fotos del inventario", "error");
    } finally {
      setPhotoGalleryLoading(false);
    }
  };

  /**
   * Re-hidrata IndexedDB desde MySQL cuando la galería local está vacía
   * (caso típico: limpieza de caché, IndexedDB stale post-self-heal). Se
   * mantiene en el shell porque orquesta `openPhotoGallery` para reabrir
   * la galería con las fotos recuperadas.
   * Commit 3 #5b: el botón ahora vive en `PhotoGalleryModal` pero la
   * lógica sigue acá (intenta no romper state acoplado).
   */
  const handleRecoverGalleryFromServer = async () => {
    if (!photoGallery?.propertyId) return;
    setPhotoGalleryLoading(true);
    try {
      const res = await fetch(
        `/api/inventories?propertyId=${encodeURIComponent(photoGallery.propertyId)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const remote = (data.inventories ?? []).find(
        (i: any) => i.phase === "inicial" || i.phase === "final",
      );
      if (!remote) {
        showToast("No se encontró inventario en el servidor", "error");
        return;
      }
      const remotePhotos = normalizePhotosArray(remote.photos);
      if (remotePhotos.length === 0) {
        showToast(
          "El servidor tampoco tiene fotos para este inventario",
          "error",
        );
        return;
      }
      // Re-hidratar IndexedDB
      const inv = {
        id: remote.id,
        propertyId: remote.property_id,
        phase: remote.phase,
        propertyType: remote.property_type,
        counters: remote.counters ?? {},
        areas: remote.areas ?? [],
        photos: remotePhotos,
        signatures: remote.signatures ?? [],
        customAreas: remote.custom_areas ?? [],
        signedAt: remote.signed_at,
        createdAt: remote.created_at,
        updatedAt: remote.updated_at,
      };
      await inventoryDB.saveInventory(inv as any);
      for (const p of remotePhotos) {
        if ((p as any)?.dataUrl) {
          await inventoryDB.savePhoto({
            id: (p as any).id,
            inventoryId: remote.id,
            dataUrl: (p as any).dataUrl,
            areaId: (p as any).areaId,
            fileName: (p as any).fileName,
            takenAt: (p as any).takenAt,
          });
        }
      }
      showToast(
        `✓ ${remotePhotos.length} fotos recuperadas del servidor`,
        "success",
      );
      // Cerrar y reabrir la galería para que se muestren
      setPhotoGallery(null);
      void openPhotoGallery(
        {
          id: photoGallery.propertyId,
          address: photoGallery.address,
        },
        remote.phase as "inicial" | "final",
      );
    } catch (err: any) {
      console.error("[gallery] manual re-hydrate failed:", err);
      showToast(`Error recuperando fotos: ${err?.message ?? err}`, "error");
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
        if (url.startsWith("blob:") || url.startsWith("/api/")) {
          const a = document.createElement("a");
          a.href = url;
          a.download = `Mandato_${property.address ?? "propiedad"}.pdf`;
          a.target = "_blank";
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
            documentId: o.idNumber ?? "",
            phone: o.phone ?? undefined,
            email: o.email ?? undefined,
            ownershipPct: o.ownershipPct ?? null,
          }));
        }
        return [
          { name: property.owner, documentId: property.ownerIdNumber ?? "" },
        ];
      })();
      await generateMandatoPdf({
        property: {
          address: property.address,
          owner: property.owner,
          chip: property.chip,
          ownerIdNumber: property.ownerIdNumber,
        },
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
      showToast("Error al descargar el contrato de mandato", "error");
    }
  };

  /** Avanza del paso 2 al paso 3. Los documentos son OPCIONALES — el agente
   *  puede continuar con pendientes (la propiedad quedará en "Pendiente"
   *  hasta que suba el Mandato). El modal de confirmación en StepDocs ya
   *  muestra la lista de pendientes para que el agente los vea antes de
   *  avanzar. Esta función solo se asegura de que NO se bloquee el flujo
   *  por falta de docs. */
  const validateStep2 = () => {
    // Validación de campos básicos del paso 1: aunque estén en otro step,
    // no tiene sentido avanzar al inventario si no tenemos ni dirección.
    // FIX #23: trim para que string vacío no pase el truthy-check.
    if (!address?.trim() || !chip?.trim() || !folio?.trim()) {
      showToast("Volvé al paso 1 y completá dirección, CHIP y folio", "error");
      return;
    }
    setStep(3);
  };

  // Cuando entramos al paso 3 con un propertyId temporal (en wizard de captación),
  // usamos un id sintético (state arriba). Cuando ya es una propiedad existente
  // (en modal), usamos su id real.
  const wizardProperty = {
    address,
    chip,
    owner: wizardOwners[0]?.name ?? "",
    ownerIdNumber: wizardOwners[0]?.idNumber ?? "",
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf"
        onChange={handleFileChange}
      />
      <input
        type="file"
        ref={mandatoFileInputRef}
        className="hidden"
        accept=".pdf"
        onChange={handleFileChange}
      />
      <input
        type="file"
        ref={detailDocInputRef}
        className="hidden"
        accept=".pdf"
        onChange={handleFileChange}
      />

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
            <h2 className="text-2xl font-bold text-slate-900">
              Gestión de Inmuebles
            </h2>
            <p className="text-slate-500 text-sm">
              {showWizard
                ? "Fase 1: Captación y Registro de Mandato"
                : `${properties.length} inmueble${properties.length !== 1 ? "s" : ""} registrado${properties.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {!showWizard ? (
            <Button
              onClick={() => {
                // Liberar blob URLs del wizard anterior antes de empezar uno nuevo (memory leak fix)
                Object.values(uploadedDocs).forEach((arr) => {
                  if (Array.isArray(arr))
                    arr.forEach((u) => {
                      // BUG-021: helper central.
                      revokeIfBlob(u);
                    });
                });
                setShowWizard(true);
                setStep(1);
                setAddress("");
                setChip("");
                setFolio("");
                setOwnerIdNumber("");
                setPropertyType("apartamento");
                setWizardOwners([
                  {
                    id: `wizard-owner-${Date.now()}-1`,
                    name: "",
                    idNumber: "",
                    phone: "",
                    email: "",
                    ownershipPct: "",
                  },
                ]);
                setWizardUnits([]);
                setUploadedDocs({});
                setLastUploadedSlot(null);
                // Si hay draft en localStorage, el useEffect de hidratación lo
                // restaura al paso 1 (los archivos se re-suben desde el paso 2).
                try {
                  if (localStorage.getItem(STORAGE_KEYS.wizardPropertyDraft))
                    setRestoreDraftOnOpen(true);
                } catch {
                  /* silent */
                }
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
            {/* Barra de pasos + botón "Descartar draft" */}
            <div className="flex items-center gap-2">
              {(["Datos", "Documentos", "Inventario"] as const).map(
                (label, i) => (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div
                      className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                        step > i + 1
                          ? "bg-blue-600 text-white"
                          : step === i + 1
                            ? "bg-blue-600 text-white ring-4 ring-blue-100"
                            : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {step > i + 1 ? "✓" : i + 1}
                    </div>
                    <span
                      className={`text-xs font-semibold ${step === i + 1 ? "text-blue-700" : "text-slate-400"}`}
                    >
                      {label}
                    </span>
                    {i < 2 && (
                      <div
                        className={`flex-1 h-0.5 rounded-full ${step > i + 1 ? "bg-blue-600" : "bg-slate-200"}`}
                      />
                    )}
                  </div>
                ),
              )}
              {/* Botón "Descartar borrador" — abre modal de confirmación */}
              <button
                type="button"
                onClick={() => setConfirmDiscardDraft(true)}
                className="text-xs text-slate-500 hover:text-red-600 font-semibold underline ml-2 flex-shrink-0"
                title="Borrar el borrador actual (no se puede deshacer)"
              >
                Descartar borrador
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* ── Formulario del paso activo ── */}
              <div className="lg:col-span-2 space-y-6">
                {step === 1 && (
                  <Card className="p-8">
                    <StepBasic
                      address={address}
                      setAddress={setAddress}
                      chip={chip}
                      setChip={setChip}
                      folio={folio}
                      setFolio={setFolio}
                      propertyType={propertyType}
                      setPropertyType={setPropertyType}
                      owners={wizardOwners}
                      setOwners={setWizardOwners}
                      units={wizardUnits}
                      setUnits={setWizardUnits}
                      showToast={showToast}
                      onContinue={async () => {
                        // Option B: persistir la propiedad en MySQL antes de
                        // avanzar al step 2 (necesitamos el propertyDbId real
                        // para que las uploads a Drive en step 2 sean en
                        // tiempo real). Si falla, no avanzamos.
                        const result = await ensurePropertyPersisted();
                        if (result) setStep(2);
                      }}
                      onSaveDraft={async () => {
                        // Option B: "Guardar avance" ahora SÍ persiste al server.
                        // Devolvemos el toast honesto confirmando que quedó
                        // guardado en MySQL (en estado Pendiente).
                        const result = await ensurePropertyPersisted();
                        if (result) {
                          showToast(
                            "✓ Avance guardado en el servidor (MySQL). Estado: Pendiente hasta subir el Mandato.",
                            "success",
                          );
                        }
                      }}
                    />
                  </Card>
                )}
                {step === 2 && (
                  <StepDocs
                    owners={wizardOwners}
                    units={wizardUnits}
                    uploadedDocs={uploadedDocs}
                    setUploadedDocs={setUploadedDocs}
                    uploadingDoc={uploadingDoc}
                    setUploadingDoc={setUploadingDoc}
                    currentDocLabel={currentDocLabel}
                    setCurrentDocLabel={setCurrentDocLabel}
                    ownerIdNumber={ownerIdNumber}
                    setOwnerIdNumber={setOwnerIdNumber}
                    viewingDoc={viewingDoc}
                    setViewingDoc={setViewingDoc}
                    showToast={showToast}
                    onBack={() => setStep(1)}
                    onContinue={validateStep2}
                    triggerFileInput={triggerFileInput}
                    onSaveDraft={() => {
                      /* el autosave ya persiste; el toast lo da el botón */
                    }}
                    // Conectamos el slot del último upload exitoso para abrir el modal
                    // "¿Querés subir otro documento?" en StepDocs.
                    lastUploadedSlot={lastUploadedSlot}
                    setLastUploadedSlot={setLastUploadedSlot}
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
                        console.log(
                          "[inventory] Capturado en wizard, diferido a handleFinalize",
                        );
                        setWizardInventory(inv);
                      }}
                    />
                  </Card>
                )}
              </div>

              {/* ── Resumen de captación ── */}
              <Card className="p-6 h-fit">
                <h4 className="font-bold text-sm uppercase text-slate-400 mb-4">
                  Resumen de Captación
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Tipo</span>
                    <span className="font-medium">
                      {PROPERTY_TYPES.find((t) => t.id === propertyType)
                        ?.label ?? propertyType}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Dirección</span>
                    <span className="font-medium text-right">
                      {address || "---"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">CHIP</span>
                    <span className="font-medium">{chip || "---"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Propietarios</span>
                    <span className="font-medium text-right">
                      {wizardOwners.filter((o) => o.name.trim()).length}
                      {wizardUnits.filter((u) => u.label.trim()).length > 0 && (
                        <span className="text-slate-400 text-[10px] block">
                          + {wizardUnits.filter((u) => u.label.trim()).length}{" "}
                          unidad(es) adic.
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
                    {Array.isArray(uploadedDocs[MANDATO_KEY]) &&
                    uploadedDocs[MANDATO_KEY]!.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        FIRMADO
                      </span>
                    ) : (
                      <span className="text-amber-600 font-bold">
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </>
        ) : /* ══ MODO LISTA DE INMUEBLES ════════════════════════════════════ */
        properties.length === 0 ? (
          <Card className="p-16 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-500 mb-2">
              No hay inmuebles registrados
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              Comienza agregando tu primera propiedad con el botón de arriba.
            </p>
            <Button
              onClick={() => {
                setShowWizard(true);
                setStep(1);
                setPropertyType("apartamento");
                setAddress("");
                setChip("");
                setFolio("");
                setOwnerIdNumber("");
                setWizardOwners([
                  {
                    id: `wizard-owner-${Date.now()}-1`,
                    name: "",
                    idNumber: "",
                    phone: "",
                    email: "",
                    ownershipPct: "",
                  },
                ]);
                setWizardUnits([]);
                setUploadedDocs({});
                // Si hay draft, restaurarlo
                try {
                  if (localStorage.getItem(STORAGE_KEYS.wizardPropertyDraft))
                    setRestoreDraftOnOpen(true);
                } catch {
                  /* silent */
                }
              }}
              className="gap-2"
            >
              + Agregar Primera Propiedad
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {properties.map((p) => {
              const statusColor =
                p.status === "Activo"
                  ? "emerald"
                  : p.status === "Pendiente"
                    ? "amber"
                    : p.status === "Arrendado"
                      ? "blue"
                      : "slate";
              const statusBg: Record<string, string> = {
                emerald: "bg-emerald-50 border-emerald-200",
                amber: "bg-amber-50 border-amber-200",
                blue: "bg-blue-50 border-blue-200",
                slate: "bg-slate-50 border-slate-200",
              };
              const statusText: Record<string, string> = {
                emerald: "text-emerald-700",
                amber: "text-amber-700",
                blue: "text-blue-700",
                slate: "text-slate-700",
              };
              /** Activar requiere mandato firmado — regla de negocio inmutable. */
              const canActivate = !!p.mandatePdfUrl;
              const isInactive = p.status !== "Activo";
              return (
                <div
                  key={p.id}
                  onClick={() => void openDetailFresh(p)}
                  className={`rounded-xl border ${statusBg[statusColor]} hover:shadow-md transition-shadow cursor-pointer ${
                    highlightedPropertyId === p.id
                      ? "ring-2 ring-blue-500 ring-offset-2 shadow-lg"
                      : ""
                  }`}
                  data-testid="property-card"
                  data-property-id={p.id}
                  data-highlighted={
                    highlightedPropertyId === p.id ? "true" : undefined
                  }
                >
                  <Card className={`p-4 ${statusBg[statusColor]}`}>
                    {/* Header: dirección + estado */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {p.address}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {p.owner}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 text-[9px] font-bold uppercase px-2 py-1 rounded-full border ${statusBg[statusColor]} ${statusText[statusColor]}`}
                      >
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
                          {p.inventoryCount}{" "}
                          {p.inventoryCount === 1
                            ? "inventario"
                            : "inventarios"}
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex gap-2 pt-2 border-t border-slate-200">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void openDetailFresh(p);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (p.status === "Activo") {
                            // Inactivar siempre está permitido
                            onUpdateProperty(p.id, { status: "Inactivo" });
                            showToast("Inmueble marcado como Inactivo");
                          } else if (canActivate) {
                            onUpdateProperty(p.id, { status: "Activo" });
                            showToast("Inmueble Activado");
                          } else {
                            // Sin mandato firmado → no se puede activar
                            showToast(
                              "No se puede activar: sube primero el contrato de mandato firmado",
                              "error",
                            );
                          }
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border ${
                          p.status === "Activo"
                            ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            : canActivate
                              ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                              : "bg-amber-50 border-amber-200 text-amber-600 cursor-not-allowed opacity-75"
                        }`}
                        title={
                          !canActivate && isInactive
                            ? "Requiere contrato de mandato firmado para activar"
                            : ""
                        }
                      >
                        <Power className="w-3.5 h-3.5" />
                        {p.status === "Activo"
                          ? "Inactivar"
                          : isInactive && !canActivate
                            ? "Sin mandato"
                            : "Activar"}
                      </button>
                      {/* Eliminar: solo si NO tiene inventario (los inventarios son trazabilidad legal).
                          Si tiene inventario, mostramos un candado explicativo para que el usuario
                          entienda por qué no se puede borrar (en lugar de ocultar el botón sin más). */}
                      {(p.inventoryCount ?? 0) === 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(p);
                          }}
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
        )}
      </motion.div>

      {/* ── Modal de confirmación para eliminar inmueble ── */}
      <Modal
        isOpen={!!pendingDelete}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title="¿Eliminar inmueble?"
      >
        {pendingDelete && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <p className="font-semibold">
                  Esta acción NO se puede deshacer.
                </p>
                <p className="mt-1 text-red-800">
                  Vas a eliminar <strong>{pendingDelete.address}</strong> del
                  sistema.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-700">
              <p>
                <strong>Se eliminará de la Base de Datos:</strong>
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                <li>El registro del inmueble y del propietario</li>
                <li>
                  Cualquier documento legal (cédula, certificado, predial, rut)
                  que se haya subido
                </li>
              </ul>
              <p className="mt-3">
                <strong>En Google Drive:</strong>
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                <li>
                  Si la carpeta Drive está vacía, se manda a la papelera
                  automáticamente
                </li>
                <li>
                  Si tiene archivos subidos (mandato, predial, etc.),{" "}
                  <em>la carpeta queda en Drive</em> como histórico — podés
                  borrarla manual desde tu Drive
                </li>
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
                {deleting ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: resumen post-finalize del wizard ──
          Commit 1 #5b: extraído a `components/FinalizeSummaryModal.tsx`. */}
      <FinalizeSummaryModal
        isOpen={!!finalizeSummary}
        summary={finalizeSummary}
        wizardOwners={wizardOwners}
        wizardUnits={wizardUnits}
        onClose={() => {
          setFinalizeSummary(null);
          // FIX BUG-2026-08-05: limpiar el flag global al cerrar el modal.
          // Si no, el siguiente wizard hereda el estado "persistFailed".
          window.__inmocontrol_docsPersistFailed = false;
        }}
      />

      {/* ── Modal Detalle del Inmueble — Commit 2 #5b extraído. ── */}
      <PropertyDetailModal
        isOpen={!!viewingProperty}
        viewingProperty={viewingProperty}
        onClose={() => setViewingProperty(null)}
        onLocalUpdate={setViewingProperty}
        onUpdateProperty={onUpdateProperty}
        showToast={showToast}
        onViewDoc={(label, url) => setViewingDoc({ label, url })}
        triggerDetailDocUpload={triggerDetailDocUpload}
        triggerUnitDocUpload={triggerUnitDocUpload}
        triggerPropertyDocUpload={triggerPropertyDocUpload}
        triggerMandatoUpload={triggerMandatoUpload}
        handleDownloadMandato={handleDownloadMandato}
        onOpenInventory={(p, phase) => {
          setInventoryModalProperty(p);
          setInventoryPhase(phase);
        }}
        openPhotoGallery={openPhotoGallery}
        photoGalleryLoading={photoGalleryLoading}
        onCompareInventories={(p) => setComparingProperty(p)}
        detailRefreshing={detailRefreshing}
        contracts={contracts}
      />


      {/* ── Modal: confirmar descarte del draft del wizard ── Commit 4 #5b. ── */}
      <DiscardDraftModal
        isOpen={confirmDiscardDraft}
        hasPersistedProperty={!!wizardPropertyDbId}
        onConfirm={discardDraft}
        onCancel={() => setConfirmDiscardDraft(false)}
      />

      {/* ── Modal visor de documento ── Commit 5 #5b extraído. ── */}
      <DocViewerModal
        isOpen={!!viewingDoc}
        label={viewingDoc?.label ?? ""}
        url={viewingDoc?.url ?? null}
        onClose={() => {
          // BUG-021: helper central.
          revokeIfBlob(viewingDoc?.url);
          setViewingDoc(null);
        }}
      />

      {/* Modal grande para Inventario Inicial/Final */}
      <Modal
        isOpen={!!inventoryModalProperty}
        onClose={() => {
          setInventoryModalProperty(null);
          setInventoryPhase(null);
        }}
        title={`Inventario ${inventoryPhase === "final" ? "Final" : "Inicial"} — ${inventoryModalProperty?.address ?? ""}`}
        size="xl"
      >
        {inventoryModalProperty && inventoryPhase && (
          <StepInventory
            showToast={showToast}
            propertyId={inventoryModalProperty.id}
            propertyType={inventoryModalProperty.propertyType ?? "apartamento"}
            property={{
              address: inventoryModalProperty.address,
              owner: inventoryModalProperty.owner,
              chip: inventoryModalProperty.chip,
              ownerIdNumber: inventoryModalProperty.ownerIdNumber,
            }}
            phase={inventoryPhase}
            baseInventory={baseInventory}
            onBack={() => {
              setInventoryModalProperty(null);
              setInventoryPhase(null);
            }}
            onComplete={() => {
              setInventoryModalProperty(null);
              setInventoryPhase(null);
            }}
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
          Click en miniatura → lightbox a pantalla completa con navegación.
          Commit 3 #5b: extraído a `components/PhotoGalleryModal.tsx`. */}
      <PhotoGalleryModal
        isOpen={!!photoGallery}
        propertyId={photoGallery?.propertyId ?? null}
        address={photoGallery?.address ?? ""}
        photos={photoGallery?.photos ?? []}
        loading={photoGalleryLoading}
        onClose={() => setPhotoGallery(null)}
        onRecoverFromServer={handleRecoverGalleryFromServer}
      />
    </>
  );
}

// KeyboardHandler eliminado en Commit 3 refactor #5b (la navegación por
// teclado del lightbox ahora vive dentro de `PhotoGalleryModal`).
