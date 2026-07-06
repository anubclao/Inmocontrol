/**
 * InmoControl — Contract API client
 * ============================================================================
 * Capa de abstracción para que el resto del código consuma contratos sin
 * acoplarse al storage. Antes, los contratos vivían SOLO en Zustand
 * (localStorage) y el billing fallaba con FK al intentar generar amortización.
 *
 * Estrategia:
 *   - SIEMPRE intentar hablar con MySQL (server es la fuente de verdad).
 *   - Si el server está caído o no responde, NO hacer fallback local silencioso:
 *     loggear y propagar el error. Razón: el billing usa estos contracts como FK,
 *     si "caemos" a local el billing va a fallar igual, solo que con un error
 *     más confuso. Mejor que el caller sepa que la persistencia no ocurrió.
 *
 * Endpoints:
 *   POST   /api/entities/contracts  → crea (o actualiza) UN contrato en MySQL
 *   PATCH  /api/entities/contracts/:id → actualiza campos editables
 *   GET    /api/entities/contracts/:id → lee un contrato puntual
 *   GET    /api/entities/contracts  → lista todos (usado por hydrate futuro)
 */

import type { Contract } from './contractTypes';

async function api<T>(method: string, path: string, body?: any): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(data?.error ?? `HTTP ${r.status}`);
  }
  return data as T;
}

/**
 * Crea (o actualiza si ya existe) un contrato en MySQL.
 * Devuelve la fila canónica del server (con la versión actualizada).
 *
 * Importante: si el contrato ya viene con `id` (caso del cliente lo generó
 * con crypto.randomUUID), el server respeta ese id (idempotente vía
 * ON DUPLICATE KEY UPDATE). Si no viene id, el server genera uno.
 */
export async function createContractServer(c: Contract): Promise<Contract> {
  const res = await api<{ contract: any }>('POST', '/entities/contracts', c);
  return mapServerContract(res.contract);
}

/**
 * Actualización parcial de un contrato en MySQL. Solo manda los campos
 * que cambiaron (caller decide qué patch mandar).
 */
export async function updateContractServer(
  id: string,
  patch: Partial<Contract>,
): Promise<Contract> {
  const res = await api<{ contract: any }>('PATCH', `/entities/contracts/${encodeURIComponent(id)}`, patch);
  return mapServerContract(res.contract);
}

export async function getContractServer(id: string): Promise<Contract | null> {
  try {
    const row = await api<any>('GET', `/entities/contracts/${encodeURIComponent(id)}`);
    return mapServerContract(row);
  } catch (err: any) {
    if (String(err?.message).includes('HTTP 404')) return null;
    throw err;
  }
}

export async function listContractsServer(): Promise<Contract[]> {
  const rows = await api<any[]>('GET', '/entities/contracts');
  return (rows ?? []).map(mapServerContract);
}

/**
 * Devuelve el contrato asociado a un tenant (si existe). Usado por el
 * backfill de hydrate: si el tenant no tiene contrato en MySQL, creamos
 * uno en draft automáticamente para que el billing no falle con FK.
 */
export async function getContractByTenantServer(tenantId: string): Promise<Contract | null> {
  const rows = await api<any[]>('GET', `/entities/contracts?tenantId=${encodeURIComponent(tenantId)}`);
  const list = (rows ?? []).map(mapServerContract);
  return list[0] ?? null;
}

// ─── Mapper: MySQL (snake_case) ↔ Frontend (camelCase) ────────────────
// El frontend siempre trabajó en camelCase. El server expone snake_case.
// Mapeamos acá para que el resto del código no tenga que pensarlo.

export function mapServerContract(row: any): Contract {
  if (!row) return row;
  return {
    id: row.id,
    propertyId: row.property_id ?? row.propertyId,
    tenantId: row.tenant_id ?? row.tenantId ?? null,
    rentAmount: Number(row.rent_amount ?? row.rentAmount ?? 0),
    adminFee: Number(row.admin_fee ?? row.adminFee ?? 0),
    commissionPct: Number(row.commission_pct ?? row.commissionPct ?? 8),
    insurancePct: Number(row.insurance_pct ?? row.insurancePct ?? 0),
    startDate: row.start_date ?? row.startDate,
    endDate: row.end_date ?? row.endDate,
    noticeDate: row.notice_date ?? row.noticeDate ?? null,
    status: row.status ?? 'draft',
    renewalStrategy: row.renewal_strategy ?? row.renewalStrategy ?? 'manual',
    inventoryEndRequired:
      row.inventory_end_required ?? row.inventoryEndRequired ?? true,
    notes: row.notes ?? null,
    contractPdfName:
      row.contract_pdf_url ?? row.contractPdfName ?? undefined,
    signedAt: row.signed_at ?? row.signedAt ?? undefined,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}