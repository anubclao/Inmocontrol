/**
 * InmoControl — Estado de cuenta del propietario (vista).
 *
 * Muestra para un período específico (YYYY-MM):
 *   - Ingresos brutos (suma de cánones+admin pagados en el mes)
 *   - Lista de descuentos aplicados
 *   - Neto a pagar al propietario
 *
 * Usa el endpoint /api/billing/account-statement que ya hace el cálculo server-side.
 * Permite navegar entre meses (← →).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, Loader2 } from 'lucide-react';
import { Button, Card, cn } from '../../../shared/ui';
import { getAccountStatement } from '../api';
import { addMonth, toPeriod } from '../types';
import { formatCurrency } from '../../../utils/calculations';
import type { AccountStatement, PropertyDiscount } from '../types';

const TYPE_LABELS: Record<PropertyDiscount['type'], string> = {
  public_services: 'Servicios públicos',
  maintenance: 'Mantenimiento',
  repair: 'Reparación',
  tax: 'Impuestos',
  insurance: 'Póliza',
  commission: 'Comisión',
  parking: 'Parqueo',
  other: 'Otro',
};

export interface AccountStatementViewProps {
  propertyId: string;
  initialPeriod?: string; // 'YYYY-MM'
}

export function AccountStatementView({ propertyId, initialPeriod }: AccountStatementViewProps) {
  const [period, setPeriod] = useState<string>(initialPeriod ?? toPeriod(new Date().toISOString()));
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getAccountStatement(propertyId, period);
      setStatement(s);
    } catch {
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId, period]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      {/* Header con nav de período */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Estado de cuenta del propietario</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Resumen del período {period}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setPeriod(addMonth(period, -1))}
            className="p-1.5 hover:bg-white rounded-md transition-colors"
            title="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="px-3 text-sm font-semibold text-slate-700 tabular-nums">
            {period}
          </span>
          <button
            onClick={() => setPeriod(addMonth(period, 1))}
            className="p-1.5 hover:bg-white rounded-md transition-colors"
            title="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Calculando…
        </div>
      ) : !statement ? (
        <div className="p-12 text-center text-sm text-slate-500">
          No hay datos para este período.
        </div>
      ) : (
        <div className="p-6 space-y-4">
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard
              label="Ingresos brutos"
              value={statement.grossIncome}
              Icon={TrendingUp}
              tone="positive"
            />
            <SummaryCard
              label="Descuentos aplicados"
              value={statement.totalDiscounts}
              Icon={TrendingDown}
              tone="negative"
            />
            <SummaryCard
              label="Neto a transferir"
              value={statement.netIncome}
              Icon={Wallet}
              tone="neutral"
              highlight
            />
          </div>

          {/* Detalle de descuentos */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Detalle de descuentos del período
            </h4>
            {statement.discounts.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-3">
                Sin descuentos registrados en este período.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                {statement.discounts.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 p-3 bg-white">
                    <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                      {TYPE_LABELS[d.type]}
                    </span>
                    <span className="flex-1 text-sm text-slate-700 truncate">{d.description}</span>
                    <span className="text-sm font-semibold text-red-600 tabular-nums">
                      − {formatCurrency(d.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryCard({
  label, value, Icon, tone, highlight,
}: {
  label: string;
  value: number;
  Icon: any;
  tone: 'positive' | 'negative' | 'neutral';
  highlight?: boolean;
}) {
  const toneClass = {
    positive: 'text-emerald-600',
    negative: 'text-red-600',
    neutral: 'text-blue-600',
  }[tone];

  return (
    <div className={cn(
      'p-4 rounded-xl border',
      highlight
        ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'
        : 'bg-white border-slate-200'
    )}>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <Icon className={cn('w-4 h-4', toneClass)} />
        {label}
      </div>
      <div className={cn(
        'mt-2 text-2xl font-bold tabular-nums',
        highlight ? 'text-blue-900' : 'text-slate-900'
      )}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}