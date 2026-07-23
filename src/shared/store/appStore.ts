import { create } from 'zustand';
import type { Property, Tenant } from '../../types';
import type { FinancialRecord } from './types';
import { useContractStore } from '../../features/contracts/contractStore';
import { mapServerContract } from '../../features/contracts/contractApi';
import { useBillingStore } from '../../features/billing/billingStore';

/**
 * Store global de InmoControl.
 *
 * Migración: los datos ahora viven en MySQL (vía backend Express).
 * El store solo mantiene el state en memoria para la UI y dispara
 * llamadas a la API en cada acción. El backend es la fuente de verdad.
 */
interface AppState {
  properties: Property[];
  tenants: Tenant[];
  financialRecords: FinancialRecord[];

  loading: boolean;
  error: string | null;

  // Bootstrap: cargar todo desde MySQL
  hydrate: () => Promise<void>;

  // Properties
  addProperty: (p: Partial<Property> & { id?: string }) => Promise<Property | null>;
  updateProperty: (id: string, patch: Partial<Property>) => Promise<void>;
  removeProperty: (id: string) => Promise<{ ok: true; driveCleanupStatus: string } | { ok: false; error: string; hasInventories?: boolean }>;

  // Tenants
  addTenant: (t: Partial<Tenant> & { id?: string }) => Promise<Tenant | null>;
  /** Devuelve `true` si el PATCH al server respondió OK, `false` si falló.
   *  Antes era `Promise<void>` con catch silencioso — eso producía un "toast
   *  mentiroso" en el modal de edición de tenants (toast de éxito aunque el
   *  server hubiera devuelto 500). Ahora el caller puede mostrar feedback real. */
  updateTenant: (id: string, patch: Partial<Tenant>) => Promise<boolean>;
  removeTenant: (id: string) => Promise<void>;

  // Financial
  addFinancialRecord: (r: Partial<FinancialRecord> & { id?: string }) => Promise<FinancialRecord | null>;
  updateFinancialRecord: (id: string, patch: Partial<FinancialRecord>) => Promise<void>;
  removeFinancialRecord: (id: string) => Promise<void>;

  reset: () => void;
}

const initialState = {
  properties: [],
  tenants: [],
  financialRecords: [],
  loading: false,
  error: null,
};

const apiCall = async <T = any>(method: string, path: string, body?: any): Promise<T> => {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
};

export const useAppStore = create<AppState>()((set, get) => ({
  ...initialState,

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const [propsRes, tenantsRes, finRes, contractsRes, amortRes] = await Promise.all([
        apiCall('GET', '/api/properties'),
        apiCall('GET', '/api/tenants'),
        apiCall('GET', '/api/financial-records'),
        // Cargamos contratos desde MySQL para que Zustand refleje el estado
        // canónico del server. Sin esto, contratos viejos huérfanos en
        // localStorage seguían apareciendo aunque MySQL estuviera limpio.
        apiCall('GET', '/api/entities/contracts'),
        // Amortización desde MySQL: usamos la lista TOTAL del org para
        // sincronizar el cache local. Cualquier entrada que apunte a un
        // contratoId que ya no exista en MySQL se descarta.
        apiCall('GET', '/api/billing/amortization'),
      ]);

      // Mapear campos del backend (snake_case) al frontend (camelCase)
      const properties = (propsRes.properties ?? []).map((p: any) => ({
        id: p.id,
        address: p.address,
        chip: p.chip,
        folio: p.folio,
        owner: p.owner_name,
        ownerName: p.owner_name,
        ownerIdNumber: p.owner_id_number,
        ownerPhone: p.owner_phone,
        ownerEmail: p.owner_email,
        // FIX: server puede devolver 'available'/'rented'/'maintenance' pero la UI
        // espera 'Pendiente'/'Activo'/'Arrendado'/'Inactivo'. Mapeamos en el mapper.
        status: p.status === 'available' ? 'Pendiente'
              : p.status === 'rented' ? 'Arrendado'
              : p.status === 'maintenance' ? 'Inactivo'
              : p.status,
        propertyType: p.property_type,
        driveFolderId: p.drive_folder_id,
        driveFolderPath: p.drive_folder_path,
        inventoryPdfUrl: p.inventory_pdf_url,
        inventoryCaptacionPdfUrl: p.inventario_captacion_pdf_url ?? p.inventory_captacion_pdf_url ?? null,
        inventoryColocacionPdfUrl: p.inventario_colocacion_pdf_url ?? p.inventory_colocacion_pdf_url ?? null,
        mandatePdfUrl: p.mandato_pdf_url,
        mandateSignedAt: p.mandato_signed_at,
        createdAt: p.created_at,
        inventoryCount: p.inventory_count ?? 0,
        // FIX CRÍTICO: documents era ignorado por el mapper → la card mostraba
        // "Lo que falta: todos" aunque los docs estuvieran en property_documents.
        documents: p.documents ?? {},
        // Migración 010+ — N propietarios y N unidades adicionales
        owners: p.owners ?? [],
        units: p.units ?? [],
      }));

      const tenants = (tenantsRes.tenants ?? []).map((t: any) => ({
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
      }));

      set({
        properties,
        tenants,
        financialRecords: finRes.records ?? [],
        loading: false,
      });

      // ── Sincronizar contratos desde MySQL ─────────────────────────────
      // Antes del fix, los contratos vivían solo en Zustand (localStorage)
      // y eso permitía que contratos huérfanos/basura quedaran visibles
      // aunque MySQL no los tuviera. Ahora la fuente de verdad es MySQL.
      // Si la respuesta falla, dejamos Zustand como está para no romper
      // la app en modo offline.
      let serverContractIds = new Set<string>();
      try {
        const serverContracts = (contractsRes ?? []).map(mapServerContract);
        useContractStore.setState({ contracts: serverContracts });
        serverContractIds = new Set(serverContracts.map((c: any) => c.id));
      } catch (contractsErr: any) {
        console.warn(
          '[store] No se pudieron sincronizar contratos desde MySQL:',
          contractsErr?.message ?? contractsErr,
        );
      }

      // ── Sincronizar amortización desde MySQL ──────────────────────────
      // Mismo principio: si MySQL está vacío, el cache local de amortización
      // es basura (caso típico: admin borró contratos con el script de
      // limpieza y el cache de Zustand sigue mostrando filas fantasma).
      //
      // Estrategia:
      //   1) Si MySQL no devuelve contratos → reset completo del billing
      //      cache (amortización, recibos, descuentos, aumentos, políticas).
      //      Esto refleja fielmente el estado "limpio" del server.
      //   2) Si MySQL devuelve contratos → agrupar la amortización del
      //      server por contractId y reemplazar el cache local. Cualquier
      //      entrada local que apunte a un contractId que NO está en MySQL
      //      se descarta.
      try {
        const serverAmortRows: any[] = amortRes?.rows ?? [];
        const localBilling = useBillingStore.getState();

        if (serverContractIds.size === 0) {
          // Caso limpieza total: MySQL no tiene contratos → no debería haber
          // amortización, recibos, ni nada de billing cacheado.
          if (Object.keys(localBilling.amortization).length > 0
              || Object.keys(localBilling.invoices).length > 0
              || Object.keys(localBilling.billingPolicies).length > 0) {
            console.warn(
              '[hydrate] MySQL sin contratos pero cache local tiene billing. Limpiando.',
            );
            useBillingStore.setState({
              amortization: {},
              invoices: {},
              discounts: {},
              increases: {},
              billingPolicies: {},
            });
          }
        } else {
          // Caso normal: agrupar amortización del server por contractId.
          const grouped: Record<string, any[]> = {};
          for (const row of serverAmortRows) {
            if (!row.contractId) continue;
            if (!grouped[row.contractId]) grouped[row.contractId] = [];
            grouped[row.contractId].push(row);
          }
          // Solo conservamos entradas cuyo contractId está en MySQL.
          const cleaned: Record<string, any[]> = {};
          for (const [cid, rows] of Object.entries(grouped)) {
            if (serverContractIds.has(cid)) {
              cleaned[cid] = rows;
            }
          }
          const droppedCount = Object.keys(localBilling.amortization).length
            - Object.keys(cleaned).length;
          if (droppedCount > 0) {
            console.info(
              `[hydrate] Amortización sincronizada: ${Object.keys(cleaned).length} contratos con datos, ` +
              `${droppedCount} contrato(s) huérfano(s) descartados del cache local.`,
            );
          }
          useBillingStore.setState({ amortization: cleaned });
        }
      } catch (billingErr: any) {
        console.warn(
          '[hydrate] No se pudo sincronizar amortización desde MySQL:',
          billingErr?.message ?? billingErr,
        );
      }
    } catch (err: any) {
      console.error('[store] hydrate failed:', err);
      set({ error: err.message, loading: false });
    }
  },

  // ── Properties ──────────────────────────────────────────────────────
  addProperty: async (p) => {
    // FIX: si la propiedad YA fue creada en el server (viene con `id` del response),
    // NO la posteamos de nuevo — solo actualizamos el state local. Antes esto causaba
    // un POST duplicado a /api/properties sin localId → server trataba como INSERT
    // y creaba otra carpeta en Drive para la misma propiedad.
    if (p.id) {
      const local: Property = {
        id: p.id,
        address: p.address ?? '',
        chip: p.chip ?? '',
        folio: p.folio ?? '',
        ownerId: p.ownerId ?? '',
        owner: p.owner ?? p.ownerName ?? '',
        ownerName: p.owner ?? p.ownerName ?? '',
        ownerIdNumber: p.ownerIdNumber ?? '',
        status: p.status ?? 'Activo',
        propertyType: p.propertyType,
        driveFolderId: p.driveFolderId ?? null,
        driveFolderPath: p.driveFolderPath ?? null,
        inventoryPdfUrl: p.inventoryPdfUrl ?? null,
        mandatePdfUrl: p.mandatePdfUrl ?? null,
        mandateSignedAt: p.mandateSignedAt ?? null,
        createdAt: new Date().toISOString(),
        ...p,
      } as Property;
      set((s) => ({ properties: [...s.properties, local] }));
      return local;
    }
    // Sin id: sí crear remotamente (caso de un futuro "quick add" sin wizard)
    try {
      const data = await apiCall('POST', '/api/properties', p);
      const created: Property = {
        id: data.propertyId,
        address: p.address ?? '',
        chip: p.chip ?? '',
        folio: p.folio ?? '',
        ownerId: p.ownerId ?? '',
        owner: p.owner ?? p.ownerName ?? '',
        ownerName: p.owner ?? p.ownerName ?? '',
        ownerIdNumber: p.ownerIdNumber ?? '',
        status: p.status ?? 'Activo',
        propertyType: p.propertyType,
        driveFolderId: data.driveFolderId ?? p.driveFolderId ?? null,
        driveFolderPath: data.driveFolderPath ?? null,
        inventoryPdfUrl: p.inventoryPdfUrl ?? null,
        mandatePdfUrl: p.mandatePdfUrl ?? null,
        mandateSignedAt: p.mandateSignedAt ?? null,
        createdAt: new Date().toISOString(),
        ...p,
      } as Property;
      set((s) => ({ properties: [...s.properties, created] }));
      return created;
    } catch (err: any) {
      console.error('[store] addProperty failed:', err);
      set({ error: err.message });
      return null;
    }
  },

  updateProperty: async (id, patch) => {
    try {
      await apiCall('PATCH', `/api/properties/${id}`, patch);
      set((s) => ({
        properties: s.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
    } catch (err: any) {
      console.error('[store] updateProperty failed:', err);
      set({ error: err.message });
    }
  },

  removeProperty: async (id): Promise<{ ok: true; driveCleanupStatus: string } | { ok: false; error: string; hasInventories?: boolean }> => {
    try {
      const data = await apiCall<{ success: boolean; driveCleanupStatus?: string; error?: string; hasInventories?: boolean }>(
        'DELETE',
        `/api/properties/${id}`,
      );
      if (!data.success) {
        return { ok: false, error: data.error ?? 'Error desconocido' };
      }
      set((s) => ({ properties: s.properties.filter((p) => p.id !== id) }));
      return { ok: true, driveCleanupStatus: data.driveCleanupStatus ?? 'skipped' };
    } catch (err: any) {
      console.error('[store] removeProperty failed:', err);
      const msg = err?.message ?? 'Error eliminando propiedad';
      // Para distinguir el 409 (con inventario) del resto
      const hasInv = msg.includes('inventario');
      return { ok: false, error: msg, hasInventories: hasInv };
    }
  },

  // ── Tenants ─────────────────────────────────────────────────────────
  addTenant: async (t) => {
    try {
      const data = await apiCall('POST', '/api/tenants', t);
      const created: Tenant = {
        id: data.tenantId,
        name: t.name ?? '',
        idNumber: t.idNumber ?? '',
        email: t.email,
        phone: t.phone,
        propertyId: t.propertyId ?? '',
        rent: t.rent ?? 0,
        adminFee: t.adminFee ?? 0,
        status: 'Activo',
        leaseStartDate: t.leaseStartDate ?? new Date().toISOString().slice(0, 10),
        tenantDriveFolderId: data.tenantDriveFolderId ?? t.tenantDriveFolderId ?? null,
        ...t,
      } as Tenant;
      set((s) => ({ tenants: [...s.tenants, created] }));

      // IMPORTANTE: NO creamos contrato acá. El orden legal del proceso es:
      //   1) Propiedad creada (wizard 3 pasos + mandato firmado → "Activo")
      //   2) Tenant creado (propiedad → "En Colocación")
      //   3) Cédula del tenant subida a Drive
      //   4) Inventario de Colocación firmado por arrendatario + agente
      //   5) → Recién AHORA se crea el contrato (en TenantsView.onComplete
      //      del StepInventory, junto con el flip de status → "Arrendado")
      //   6) Recién con contrato activo se puede habilitar billing/recibos.
      //
      // Crear contrato antes del paso 4 era ilegal/operativo: el contrato
      // existía sin que el arrendatario hubiera firmado el inventario de
      // colocación, y el billing podía cobrar cánones de un arrendamiento
      // que legalmente aún no estaba cerrado.

      return created;
    } catch (err: any) {
      console.error('[store] addTenant failed:', err);
      set({ error: err.message });
      return null;
    }
  },

  updateTenant: async (id, patch) => {
    try {
      await apiCall('PATCH', `/api/tenants/${id}`, patch);
      set((s) => ({
        tenants: s.tenants.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
      return true;
    } catch (err: any) {
      console.error('[store] updateTenant failed:', err);
      return false;
    }
  },

  removeTenant: async (id) => {
    try {
      await apiCall('DELETE', `/api/tenants/${id}`);
      set((s) => ({ tenants: s.tenants.filter((t) => t.id !== id) }));
    } catch (err: any) {
      console.error('[store] removeTenant failed:', err);
    }
  },

  // ── Financial ───────────────────────────────────────────────────────
  addFinancialRecord: async (r) => {
    try {
      const data = await apiCall('POST', '/api/financial-records', r);
      const created: FinancialRecord = {
        id: data.recordId,
        ...r,
      } as FinancialRecord;
      set((s) => ({ financialRecords: [...s.financialRecords, created] }));
      return created;
    } catch (err: any) {
      console.error('[store] addFinancialRecord failed:', err);
      set({ error: err.message });
      return null;
    }
  },

  updateFinancialRecord: async (id, patch) => {
    try {
      await apiCall('PATCH', `/api/financial-records/${id}`, patch);
      set((s) => ({
        financialRecords: s.financialRecords.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }));
    } catch (err: any) {
      console.error('[store] updateFinancialRecord failed:', err);
    }
  },

  removeFinancialRecord: async (id) => {
    try {
      await apiCall('DELETE', `/api/financial-records/${id}`);
      set((s) => ({ financialRecords: s.financialRecords.filter((r) => r.id !== id) }));
    } catch (err: any) {
      console.error('[store] removeFinancialRecord failed:', err);
    }
  },

  reset: () => set(initialState),
}));

/** Selectores finos. */
export const selectProperties = (s: AppState) => s.properties;
export const selectTenants = (s: AppState) => s.tenants;
export const selectFinancialRecords = (s: AppState) => s.financialRecords;

/** Constante exportada por si en el futuro queremos migrar entre stores. */
export { STORAGE_KEYS } from '../hooks/storageKeys';