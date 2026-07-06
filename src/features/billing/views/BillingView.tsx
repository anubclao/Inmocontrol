/**
 * InmoControl — Vista principal de Billing.
 *
 * Lista todas las propiedades. Cada fila muestra:
 *   - Dirección + chip
 *   - Estado de billing: tiene política? tiene amortización? monto del mes actual?
 *
 * Click en una propiedad → abre BillingPanel en modo detalle.
 * Si la lista está vacía, sugiere ir a Propiedades.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Receipt, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Card, Button, cn } from '../../../shared/ui';
import { ProcessOrderBanner } from '../../../shared/ui/ProcessOrderBanner';
import { BillingPanel } from './BillingPanel';
import { getBillingPolicy, listActions } from '../api';
import type { Contract, AmortizationRow } from '../types';
import type { Property } from '../../../types';
import { useBillingStore } from '../billingStore';
import { formatCurrency } from '../../../utils/calculations';

export interface BillingViewProps {
  properties: Property[];
  contracts: Contract[];
  /**
   * Tenants de la org — se pasa al BillingPanel para resolver el "DEBE A"
   * cuando se genera el PDF de cuenta de cobro.
   */
  tenants?: Array<{ id: string; name: string; idNumber: string; email?: string; phone?: string; propertyId: string; status: string }>;
  userName: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export function BillingView({ properties, contracts, tenants = [], userName, showToast }: BillingViewProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Record<string, boolean>>({});
  const [loadingList, setLoadingList] = useState(true);
  const localAmortization = useBillingStore((s) => s.amortization);

  // Cargar qué propiedades tienen policy
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      const map: Record<string, boolean> = {};
      await Promise.all(properties.map(async (p) => {
        try {
          const pol = await getBillingPolicy(p.id);
          map[p.id] = pol !== null;
        } catch {
          map[p.id] = false;
        }
      }));
      if (!cancelled) {
        setPolicies(map);
        setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, [properties.length]);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) ?? null,
    [selectedPropertyId, properties]
  );

  // Si hay propiedad seleccionada, mostrar el panel
  if (selectedProperty) {
    return (
      <BillingPanel
        property={selectedProperty}
        contracts={contracts}
        tenants={tenants}
        userName={userName}
        onBack={() => setSelectedPropertyId(null)}
        showToast={showToast}
      />
    );
  }

  // Si no hay propiedades
  if (!loadingList && properties.length === 0) {
    return (
      <EmptyState />
    );
  }

  // Agrupar: primero propiedades rentadas (con contratos activos)
  const sortedProps = [...properties].sort((a, b) => {
    const aHasContract = contracts.some((c) => c.propertyId === a.id);
    const bHasContract = contracts.some((c) => c.propertyId === b.id);
    if (aHasContract !== bHasContract) return aHasContract ? -1 : 1;
    return a.address.localeCompare(b.address);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Receipt className="w-6 h-6 text-blue-600" />
          Billing
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Parametrizá políticas, generá amortización y registrá pagos por propiedad.
        </p>
      </div>

      {/* ── Banner de orientación: este paso requiere Contrato activo ── */}
      <ProcessOrderBanner
        currentStep="billing"
        title="Paso 4: Facturar al inquilino"
        description="Acá se parametrizan las políticas de billing (canon, administración, mora, IPC) y se genera la tabla de amortización mensual. SOLO funciona cuando la propiedad tiene un Contrato activo (que se crea automáticamente al firmar el Inventario de Colocación). Si la propiedad está en estado Pendiente, Activo o En Colocación, este módulo está bloqueado."
      />

      <Card>
        {loadingList ? (
          <div className="p-8 flex items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando estado de billing…
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedProps.map((p) => (
              <PropertyBillingRow
                key={p.id}
                property={p}
                hasPolicy={!!policies[p.id]}
                contracts={contracts.filter((c) => c.propertyId === p.id)}
                amortizationRows={flattenAmortization(localAmortization, p.id)}
                onClick={() => { setSelectedPropertyId(p.id); }}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function flattenAmortization(
  byContract: Record<string, AmortizationRow[]>,
  propertyId: string
): AmortizationRow[] {
  return Object.values(byContract)
    .flat()
    .filter((r) => r.propertyId === propertyId);
}

function PropertyBillingRow(props: {
  property: Property;
  hasPolicy: boolean;
  contracts: Contract[];
  amortizationRows: AmortizationRow[];
  onClick: () => void;
  // React 19 incluye `key` en los props del componente (no solo del JSX wrapper).
  key?: string;
}) {
  const { property, hasPolicy, contracts, amortizationRows, onClick } = props;
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  const currentRow = amortizationRows.find((r) => r.periodStart.startsWith(currentPeriod));
  const paidCount = amortizationRows.filter((r) => r.status === 'paid').length;
  const totalRows = amortizationRows.length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center gap-4 group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900 truncate">{property.address}</span>
          {property.chip && (
            <span className="text-xs text-slate-400 font-mono">CHIP {property.chip}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
          <span>{contracts.length} {contracts.length === 1 ? 'contrato' : 'contratos'}</span>
          <span>·</span>
          {totalRows > 0 ? (
            <span>{paidCount}/{totalRows} meses pagados</span>
          ) : (
            <span>Sin amortización</span>
          )}
        </div>
      </div>

      {/* Status pills */}
      <div className="hidden md:flex items-center gap-2">
        <StatusPill ok={hasPolicy} okLabel="Política OK" noLabel="Sin política" />
        {currentRow && (
          <span className="text-sm font-semibold text-slate-700 tabular-nums">
            {formatCurrency(currentRow.total)}
          </span>
        )}
      </div>

      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
    </button>
  );
}

function StatusPill({ ok, okLabel, noLabel }: { ok: boolean; okLabel: string; noLabel: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
    )}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {ok ? okLabel : noLabel}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Receipt className="w-6 h-6 text-blue-600" />
          Billing
        </h1>
      </div>
      <Card className="p-12 text-center">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="font-bold text-slate-900">No hay propiedades todavía</h3>
        <p className="text-sm text-slate-500 mt-1">
          Andá a la pestaña Propiedades para crear la primera.
        </p>
      </Card>
    </div>
  );
}