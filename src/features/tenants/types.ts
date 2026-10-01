// filepath: src/features/tenants/types.ts
// Tipos centrales del módulo de Arrendatarios.
// Antes vivían inline en TenantsView.tsx (1910 líneas); este refactor
// (fix-issue-06) los extrae para que los modales/hooks los importen
// sin generar ciclos ni duplicación.

import type { Role } from "../auth/permissions";

/** Folders de Drive donde se suben los documentos del tenant.
 *  Antes: union inline en TenantsView.tsx. Ahora centralizado. */
export type DriveFolder = "Cedula" | "Contrato" | "Recibos";

/** Estado del Acta de Entrega en Drive. `null` = no se generó todavía. */
export type ActaStatus = { fileId?: string; webViewLink?: string } | null;

/** Estado de upload de un folder del tenant. Soporta N archivos por folder
 *  (antes: solo 1). Cada upload agrega un item a `files[]` en vez de pisar. */
export interface UploadFolderStatus {
  uploading?: boolean;
  files: Array<{
    name: string;
    link?: string;
    webViewLink?: string;
    fileId?: string;
  }>;
}

/** Estado de upload por folder del tenant. */
export type UploadStatusMap = Record<DriveFolder, UploadFolderStatus>;

/** Modelo de un Arrendatario tal como se persiste en MySQL y se renderiza
 *  en la UI. NOTA: `documents` (array de URLs) y `tenantDriveFolderId` se
 *  exponen como opcionales porque no todos los tenants tienen Drive
 *  configurado o documentos subidos. */
export interface Tenant {
  id: string;
  name: string;
  idNumber: string;
  email?: string;
  phone?: string;
  propertyId: string;
  rent: number;
  adminFee?: number;
  status: "Activo" | "Inactivo";
  leaseStartDate: string;
  documents?: string[];
  tenantDriveFolderId?: string | null;
}

/** Props que TenantsView recibe desde App.tsx.
 *  Importante: la firma NO puede cambiar (App.tsx:230 las pasa igual). */
export interface TenantsViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
  tenants: Tenant[];
  properties: any[];
  onAddTenant: (tenant: any) => void;
  /** Devuelve `true` si el PATCH OK, `false` si falló. El modal de edición
   *  usa el return para mostrar el toast correcto. */
  onUpdateTenant: (id: string, updates: any) => Promise<boolean>;
  onDeleteTenant: (id: string) => Promise<void>;
  onUpdateProperty: (id: string, updates: any) => Promise<boolean>;
  role: Role | null;
}
