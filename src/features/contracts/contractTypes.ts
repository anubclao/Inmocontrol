/**
 * Tipos del dominio de Contratos.
 *
 * Un Contract es el vínculo legal entre:
 *  - Property (inmueble)
 *  - Tenant (inquilino)
 *  - Owner (propietario — derivado de la propiedad)
 *
 * Fechas importantes:
 *  - startDate / endDate: vigencia del contrato
 *  - noticeDate: fecha en que se debe avisar (típicamente 90 días antes del end)
 *  - inventoryEndRequired: si es true, se debe hacer Inventario Final al terminar
 */

export type ContractStatus =
  | 'draft'              // borrador, sin firmar
  | 'active'             // vigente
  | 'expiring'           // vigente pero cerca de vencer (≤90 días)
  | 'expired'            // ya venció
  | 'terminated';        // terminado anticipadamente

export type RenewalStrategy = 'auto' | 'manual' | 'none';

export interface Contract {
  id: string;
  propertyId: string;
  tenantId: string;
  /** Canon mensual en COP */
  rentAmount: number;
  /** Administración PH mensual (COP) */
  adminFee: number;
  /** Porcentaje de comisión que cobra la inmobiliaria (ej: 8 = 8%) */
  commissionPct: number;
  /** Porcentaje de seguro (ej: 0.5 = 0.5%) */
  insurancePct: number;
  /** Fecha de inicio (ISO) */
  startDate: string;
  /** Fecha de fin (ISO) */
  endDate: string;
  /** Fecha de preaviso (calculada, 90 días antes del end) */
  noticeDate?: string;
  status: ContractStatus;
  /** Qué pasa al vencer */
  renewalStrategy: RenewalStrategy;
  /** Si exige Inventario Final al terminar (default true) */
  inventoryEndRequired: boolean;
  /** Observaciones / cláusulas especiales */
  notes?: string;
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
  /** Metadata del PDF generado al firmar */
  contractPdfName?: string;
}

/** Derivados: cuántos días faltan para el preaviso y para el vencimiento. */
export interface ContractStatusInfo {
  status: ContractStatus;
  daysToNotice: number;
  daysToEnd: number;
  isExpiringSoon: boolean;
  isNoticeDue: boolean;
  isExpired: boolean;
  needsInventoryEnd: boolean;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Calcula el estado derivado del contrato a partir de las fechas. */
export function deriveContractStatus(contract: Contract, today = new Date()): ContractStatusInfo {
  const end = new Date(contract.endDate);
  const notice = contract.noticeDate ? new Date(contract.noticeDate) : new Date(end.getTime() - 90 * MS_PER_DAY);
  const t = today.getTime();
  const daysToEnd = Math.ceil((end.getTime() - t) / MS_PER_DAY);
  const daysToNotice = Math.ceil((notice.getTime() - t) / MS_PER_DAY);

  let status: ContractStatus;
  if (contract.status === 'terminated' || contract.status === 'draft') {
    status = contract.status;
  } else if (daysToEnd < 0) {
    status = 'expired';
  } else if (daysToEnd <= 90) {
    status = 'expiring';
  } else {
    status = 'active';
  }

  return {
    status,
    daysToNotice,
    daysToEnd,
    isExpiringSoon: daysToEnd <= 90 && daysToEnd >= 0,
    isNoticeDue: daysToNotice <= 0 && daysToEnd >= 0,
    isExpired: daysToEnd < 0,
    needsInventoryEnd: contract.inventoryEndRequired && (status === 'expiring' || status === 'expired' || status === 'terminated'),
  };
}
