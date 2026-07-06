/**
 * Deriva alertas a partir del estado real de la app.
 *
 * Esta función es PURA: no toca stores, no hace fetch. La llama el `alertsStore`
 * cada vez que cambian los datos relevantes (contratos, facturas, propiedades).
 *
 * Categorías cubiertas en Fase 1:
 *  - `mora`         → factura con status='overdue' o dueDate < hoy y no pagada
 *  - `vencimiento`  → contrato con daysToEnd entre 0 y 90
 *  - `preaviso`     → contrato con daysToNotice ≤ 0 y vigente
 *  - `documento`    → propiedad con status activo pero sin mandato firmado
 *
 * Las que vendrán en Fase 2 (cuando haya modelo de datos):
 *  - `novedad`      → reporte de mantenimiento/reparación
 *  - `pago`         → recordatorio de pago próximo a vencer
 */

import type { Contract } from '../contracts/contractTypes';
import { deriveContractStatus } from '../contracts/contractTypes';
import type { RentInvoice } from '../billing/types';
import type { Property, Tenant } from '../../types';
import {
  ALERT_SEVERITY_WEIGHT,
  type Alert,
} from './types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysSince(iso: string, today: Date): number {
  return Math.floor((today.getTime() - new Date(iso).getTime()) / MS_PER_DAY);
}

/** Normaliza el status de Property a un set comparable (soporta legacy + nuevo). */
function isPropertyActiveForAlerts(p: Property): boolean {
  // Schema nuevo (constraint en MySQL): 'Pendiente' | 'Activo' | 'En Colocación' | 'Arrendado' | 'Inactivo'
  // Schema legacy en `src/types/index.ts`: 'available' | 'rented' | 'maintenance'
  const active = new Set(['Activo', 'En Colocación', 'Arrendado', 'rented', 'available']);
  return active.has(p.status);
}

export interface DeriveAlertsInput {
  contracts: Contract[];
  invoices: RentInvoice[];
  properties: Property[];
  tenants: Tenant[];
  today?: Date;
}

export function deriveAlerts(input: DeriveAlertsInput): Alert[] {
  const today = input.today ?? new Date();
  const alerts: Alert[] = [];

  // Helpers de búsqueda (O(n²) está bien para el tamaño actual de una sola agencia).
  const propById = new Map(input.properties.map((p) => [p.id, p]));
  const tenantById = new Map(input.tenants.map((t) => [t.id, t]));
  const contractById = new Map(input.contracts.map((c) => [c.id, c]));

  // ── 1. Mora ─────────────────────────────────────────────────────
  for (const inv of input.invoices) {
    if (inv.status === 'paid') continue;
    const overdueByStatus = inv.status === 'overdue';
    const overdueByDate = inv.dueDate ? daysSince(inv.dueDate, today) > 0 : false;
    if (!overdueByStatus && !overdueByDate) continue;

    const days = inv.dueDate ? daysSince(inv.dueDate, today) : 0;
    const contract = contractById.get(inv.contractId);
    const tenant = contract ? tenantById.get(contract.tenantId) : tenantById.get((inv as any).tenantId);
    const property = propById.get(inv.propertyId) ?? (contract ? propById.get(contract.propertyId) : undefined);
    const tenantName = tenant?.name ?? 'Inquilino';
    const address = property?.address ?? 'propiedad';

    alerts.push({
      id: `mora-${inv.id}`,
      severity: days > 30 ? 'critical' : days > 10 ? 'warning' : 'info',
      category: 'mora',
      title: `Mora en ${address}`,
      description: `${tenantName} · factura ${inv.period} · ${days} día(s) vencida(s)`,
      entity: {
        propertyId: property?.id,
        tenantId: tenant?.id,
        contractId: contract?.id,
        invoiceId: inv.id,
      },
      meta: { daysOverdue: days, period: inv.period, amount: inv.subtotal },
      detectedAt: today.toISOString(),
    });
  }

  // ── 2. Vencimiento de contrato ──────────────────────────────────
  for (const contract of input.contracts) {
    const info = deriveContractStatus(contract, today);
    if (!info.isExpiringSoon) continue;
    if (info.isExpired) continue; // los vencidos ya se cubren con mora o se manejan aparte

    const tenant = tenantById.get(contract.tenantId);
    const property = propById.get(contract.propertyId);
    const address = property?.address ?? 'propiedad';
    const tenantName = tenant?.name ?? 'inquilino';

    alerts.push({
      id: `venc-${contract.id}`,
      severity: info.daysToEnd <= 30 ? 'critical' : info.daysToEnd <= 60 ? 'warning' : 'info',
      category: 'vencimiento',
      title: `Contrato vence en ${info.daysToEnd} día(s)`,
      description: `${address} · ${tenantName}`,
      entity: {
        propertyId: contract.propertyId,
        tenantId: contract.tenantId,
        contractId: contract.id,
      },
      meta: { daysToEnd: info.daysToEnd },
      detectedAt: today.toISOString(),
    });
  }

  // ── 3. Preaviso de no renovación ─────────────────────────────────
  for (const contract of input.contracts) {
    const info = deriveContractStatus(contract, today);
    if (!info.isNoticeDue) continue;
    if (info.isExpired) continue;

    const tenant = tenantById.get(contract.tenantId);
    const property = propById.get(contract.propertyId);
    const address = property?.address ?? 'propiedad';
    const tenantName = tenant?.name ?? 'inquilino';

    alerts.push({
      id: `preaviso-${contract.id}`,
      severity: 'warning',
      category: 'preaviso',
      title: `Preaviso de no renovación vencido`,
      description: `${address} · ${tenantName} · notificar hace ${Math.abs(info.daysToNotice)} día(s)`,
      entity: {
        propertyId: contract.propertyId,
        tenantId: contract.tenantId,
        contractId: contract.id,
      },
      meta: { daysToNotice: info.daysToNotice },
      detectedAt: today.toISOString(),
    });
  }

  // ── 4. Documento faltante (mandato) ─────────────────────────────
  for (const property of input.properties) {
    if (!isPropertyActiveForAlerts(property)) continue;
    if (property.mandatePdfUrl) continue;

    alerts.push({
      id: `doc-mandato-${property.id}`,
      severity: 'warning',
      category: 'documento',
      title: `Mandato sin firmar`,
      description: `${property.address} · el inmueble no puede pasar a "Activo" sin mandato`,
      entity: { propertyId: property.id },
      meta: {},
      detectedAt: today.toISOString(),
    });
  }

  // ── Ordenar: severidad desc, luego días vencidos / días al evento desc ──
  return alerts.sort((a, b) => {
    const sev = ALERT_SEVERITY_WEIGHT[b.severity] - ALERT_SEVERITY_WEIGHT[a.severity];
    if (sev !== 0) return sev;
    const da = a.meta?.daysOverdue ?? a.meta?.daysToEnd ?? 0;
    const db = b.meta?.daysOverdue ?? b.meta?.daysToEnd ?? 0;
    return db - da;
  });
}
