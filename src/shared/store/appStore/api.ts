// filepath: src/shared/store/appStore/api.ts
// apiCall helper con timeout + initialState del store.

import { fetchWithTimeout } from "../../lib/fetchWithTimeout";

/**
 * `apiCall` con timeout configurable (BUG-019).
 * Default 15s — si un endpoint se cuelga (Drive, MySQL saturado, red caída),
 * la promise se aborta vía AbortController y rechaza con TimeoutError.
 * Antes (sin timeout): un solo endpoint colgado dejaba la app con spinner
 * infinito para siempre, porque Promise.all espera a TODAS las promises.
 */
export const DEFAULT_API_TIMEOUT_MS = 15_000;
export const apiCall = async <T = any>(
  method: string,
  path: string,
  body?: any,
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): Promise<T> => {
  const res = await fetchWithTimeout(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
    timeoutMs,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
};

/** Mapper de Property del server (snake_case) al shape del frontend (camelCase).
 *  Común a hydrate, fetchProperties y addProperty — vive acá para reuso. */
export function mapServerProperty(p: any): any {
  return {
    id: p.id,
    address: p.address,
    chip: p.chip,
    folio: p.folio,
    owner: p.owner_name,
    ownerName: p.owner_name,
    ownerId: "",
    ownerIdNumber: p.owner_id_number,
    ownerPhone: p.owner_phone,
    ownerEmail: p.owner_email,
    status:
      p.status === "available"
        ? "Pendiente"
        : p.status === "rented"
          ? "Arrendado"
          : p.status === "maintenance"
            ? "Inactivo"
            : p.status,
    propertyType: p.property_type,
    driveFolderId: p.drive_folder_id,
    driveFolderPath: p.drive_folder_path,
    inventoryPdfUrl: p.inventory_pdf_url,
    inventoryCaptacionPdfUrl:
      p.inventario_captacion_pdf_url ?? p.inventory_captacion_pdf_url ?? null,
    inventoryColocacionPdfUrl:
      p.inventario_colocacion_pdf_url ?? p.inventory_colocacion_pdf_url ?? null,
    mandatePdfUrl: p.mandate_pdf_url,
    mandateSignedAt: p.mandate_signed_at,
    createdAt: p.created_at,
    inventoryCount: p.inventory_count ?? 0,
    documents: p.documents ?? {},
    owners: p.owners ?? [],
    units: p.units ?? [],
  };
}

/** Mapper de Tenant del server (snake_case) al shape del frontend. */
export function mapServerTenant(t: any): any {
  return {
    id: t.id,
    propertyId: t.property_id,
    name: t.name,
    idNumber: t.document_id,
    email: t.email,
    phone: t.phone,
    rent: Number(t.rent) || 0,
    adminFee: Number(t.admin_fee) || 0,
    leaseStartDate: t.lease_start_date,
    status: t.status,
    tenantDriveFolderId: t.tenant_drive_folder_id,
    driveFolderPath: t.drive_folder_path,
  };
}

export const initialState = {
  properties: [],
  tenants: [],
  financialRecords: [],
  loading: false,
  error: null,
  hydrationPartial: false,
  lastPropertiesFetchedAt: null,
  propertiesListStale: false,
  lastCreatedPropertyId: null,
};
