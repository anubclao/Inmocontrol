// filepath: src/features/properties/components/StepDocs/types.ts
// Types compartidos por StepDocs, DocCard, y useDocCards.
//
// fix-issue-07 (FASE 4 Karpathy, oct-2026): centraliza los types del
// segundo paso del wizard de propiedades. Antes estaban inline en
// StepDocs.tsx (814 lineas); ahora viven aca para que el shell, el
// sub-componente y el hook los compartan sin duplicar.
//
// Regla: NO importar componentes/funciones de otros archivos de InmoControl
// en types.ts. Solo types y types. Para componentes usar StepDocs.tsx o DocCard.tsx.

import type { WizardOwner, WizardUnit } from "../StepBasic";

/**
 * Estado real de un archivo en un slot del wizard.
 * - 'drive'   → el archivo está en Google Drive (URL https://drive.google.com/...)
 * - 'local'   → solo en el navegador (blob: URL) — se subirá a Drive al finalizar el wizard
 * - 'pending' → slot vacío o archivo en tránsito (no aplica cuando hay archivos)
 */
export type DocStorageState = "drive" | "local" | "pending";

/** Llave del slot de un documento en `uploadedDocs`. */
export type DocSlotKey =
  | `cedula:${string}`
  | `rut:${string}`
  | `certificado_tradicion:main`
  | `certificado_tradicion:${string}`
  | `predial`
  | `mandato`;

/**
 * Cada slot ahora puede tener N archivos subidos (no solo 1).
 * Antes: `Record<slotKey, string | null>` — limitaba a 1 PDF por slot.
 * Ahora: `Record<slotKey, string[]>` — el agente puede subir varias hojas
 * de vida de un propietario, varios RUTs, etc.
 */
export type UploadedDocsMap = Record<string, string[]>;

/** Grupo al que pertenece un slot. */
export type DocSlotGroup = "owner" | "unit" | "property";

/** Shape de un slot que renderiza una card. */
export interface RequiredSlot {
  slotKey: string;
  group: DocSlotGroup;
  ownerId?: string;
  unitId?: string;
  required: boolean;
  helpText: string;
}

/** Props del componente principal `StepDocs`. */
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

/** Props del sub-componente `DocCard`. */
export interface DocCardProps {
  // React pasa `key` automáticamente en JSX; lo aceptamos como opcional para
  // que TS no se queje. (El componente no la usa — es solo para reconciliación.)
  key?: string | number;
  docKey: string;
  label: string;
  Icon: typeof import("lucide-react").Users;
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
