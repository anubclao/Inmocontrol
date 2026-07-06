/**
 * InmoControl — Tabla de amortización con flujo de cuenta de cobro.
 * ============================================================================
 * Una fila por mes del contrato. Columnas:
 *   # | Período | Canon | Admin | Ajustes | Subtotal | Mora | Total | Estado | Acción
 *
 * La columna "Acción" implementa el flujo explícito del módulo de finanzas:
 *
 *   Mes N+1 BLOQUEADO hasta que el mes N esté PAGADO.
 *
 * Estados posibles por fila (matriz de UX):
 *   ┌─────────────────┬──────────────────┬──────────────┬─────────────────┐
 *   │ ¿Mes anterior   │ ¿Ya fue enviada? │ ¿Pagado?     │ Acción visible  │
 *   │  está pagado?   │                  │              │                 │
 *   ├─────────────────┼──────────────────┼──────────────┼─────────────────┤
 *   │ NO              │ (no aplica)      │ (no aplica)  │ 🔒 Bloqueado    │
 *   │ SÍ (o es mes 1) │ NO               │ NO           │ 📤 Enviar CC    │
 *   │ SÍ              │ SÍ (sent)        │ NO           │ 💰 Marcar pag.  │
 *   │ SÍ              │ SÍ o NO          │ SÍ (paid)    │ ✓ Pagado        │
 *   └─────────────────┴──────────────────┴──────────────┴─────────────────┘
 *
 * `onSend` se llama cuando el agente hace click en "Enviar cuenta de cobro".
 * `onPay` se llama cuando el agente hace click en "Marcar pagado" (abre el
 * PaymentModal existente, que maneja la mora según día de pago).
 */

import React from 'react';
import {
  CreditCard, CheckCircle2, AlertCircle, Clock, Lock, Send, Lock as LockIcon,
} from 'lucide-react';
import { Button, Card, cn } from '../../../shared/ui';
import type { AmortizationRow, RentInvoice } from '../types';

export interface AmortizationTableProps {
  rows: AmortizationRow[];
  /** Click en "Marcar pagado" — el padre abre el PaymentModal. */
  onPay?: (row: AmortizationRow) => void;
  /** Click en "Enviar cuenta de cobro" — el padre genera PDF + marca sent. */
  onSend?: (row: AmortizationRow) => void;
  /** Mapa `period` → invoice (null si no fue emitida). Lo pasa el BillingPanel. */
  invoiceLookup?: Record<string, RentInvoice | null>;
  loading?: boolean;
}

const STATUS_STYLES: Record<AmortizationRow['status'], { label: string; class: string; Icon: any }> = {
  pending:  { label: 'Pendiente', class: 'bg-slate-100 text-slate-700',    Icon: Clock },
  partial:  { label: 'Parcial',   class: 'bg-amber-100 text-amber-700',    Icon: AlertCircle },
  paid:     { label: 'Pagado',    class: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  overdue:  { label: 'Vencido',   class: 'bg-red-100 text-red-700',        Icon: AlertCircle },
};

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

/**
 * Determina si la fila en `rowIndex` está habilitada para operar:
 * - Mes 1 (índice 0) SIEMPRE está habilitado.
 * - Mes N+1 solo se habilita si el mes N está `paid`.
 *
 * Esta lógica es la base del "se habilita el siguiente mes al marcar pagado"
 * que pidió el usuario.
 */
function isRowEnabled(rows: AmortizationRow[], rowIndex: number): boolean {
  if (rowIndex === 0) return true;
  const prev = rows[rowIndex - 1];
  return prev?.status === 'paid';
}

export function AmortizationTable({
  rows, onPay, onSend, invoiceLookup, loading,
}: AmortizationTableProps) {
  if (loading) {
    return (
      <Card className="p-8 text-center text-sm text-slate-500">
        Generando amortización…
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-slate-500">
          Aún no hay amortización generada. Guardá la política y hacé click en
          <span className="font-semibold text-slate-700"> "Generar amortización"</span>.
        </p>
      </Card>
    );
  }

  const totalGeneral = rows.reduce((s, r) => s + r.total, 0);
  const totalPaid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.total, 0);
  const totalSent = rows.filter((r) => {
    const inv = invoiceLookup?.[r.periodStart.slice(0, 7)];
    return inv?.sentAt != null && r.status !== 'paid';
  }).length;

  return (
    <Card>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-slate-900 text-lg">Tabla de amortización</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {rows.length} {rows.length === 1 ? 'mes' : 'meses'} · Pagado: {COP(totalPaid)} de {COP(totalGeneral)}
            {totalSent > 0 && ` · ${totalSent} enviado${totalSent === 1 ? '' : 's'} sin pagar`}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-3 py-3 w-12">#</th>
              <th className="px-3 py-3">Período</th>
              <th className="px-3 py-3 text-right">Canon</th>
              <th className="px-3 py-3 text-right">Admin</th>
              <th className="px-3 py-3 text-right">Ajustes</th>
              <th className="px-3 py-3 text-right">Subtotal</th>
              <th className="px-3 py-3 text-right">Mora</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => {
              const { label, class: statusClass, Icon } = STATUS_STYLES[row.status];
              const totalAdjustments = row.adminAdjustment + row.ipcAdjustment;
              const enabled = isRowEnabled(rows, idx);
              const period = row.periodStart.slice(0, 7);
              const inv = invoiceLookup?.[period] ?? null;
              const isPaid = row.status === 'paid';
              const isSent = !!inv?.sentAt && !isPaid;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'transition-colors',
                    !enabled ? 'bg-slate-50/40 opacity-60' : 'hover:bg-slate-50/50',
                  )}
                  data-testid={`amort-row-${row.monthNumber}`}
                >
                  <td className="px-3 py-3 text-slate-500 font-mono text-xs">
                    {String(row.monthNumber).padStart(2, '0')}
                  </td>
                  <td className="px-3 py-3 text-slate-700 font-medium whitespace-nowrap">
                    {period}
                    {inv?.invoiceNumber && (
                      <span className="ml-2 text-[10px] font-mono text-slate-400">
                        {inv.invoiceNumber}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {COP(row.baseRent)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {COP(row.baseAdmin)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                    {totalAdjustments > 0 ? `+ ${COP(totalAdjustments)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {COP(row.subtotal)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {row.lateFeeAmount > 0 ? (
                      <span className="text-red-600">
                        + {COP(row.lateFeeAmount)}
                        <span className="text-xs ml-1">({row.appliedLateFeePct}%)</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-900">
                    {COP(row.total)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                      statusClass,
                    )}>
                      <Icon className="w-3 h-3" />
                      {label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <ActionCell
                      row={row}
                      enabled={enabled}
                      isPaid={isPaid}
                      isSent={isSent}
                      onSend={onSend}
                      onPay={onPay}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ActionCell({
  row, enabled, isPaid, isSent, onSend, onPay,
}: {
  row: AmortizationRow;
  enabled: boolean;
  isPaid: boolean;
  isSent: boolean;
  onSend?: (row: AmortizationRow) => void;
  onPay?: (row: AmortizationRow) => void;
}) {
  // Caso 1: Mes pagado — solo label verde
  if (isPaid) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Pagado
      </span>
    );
  }

  // Caso 2: Mes bloqueado (anterior no pagado)
  if (!enabled) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 bg-slate-100 rounded-md"
        title="Pagá el mes anterior para habilitar este mes"
      >
        <Lock className="w-3.5 h-3.5" />
        Bloqueado
      </span>
    );
  }

  // Caso 3: Cuenta enviada, esperando pago
  if (isSent) {
    return (
      <Button
        size="sm"
        onClick={() => onPay?.(row)}
        className="!px-2 !py-1 text-xs bg-emerald-600 hover:bg-emerald-700"
        title="Marcar el pago de este mes (registra el día y aplica mora si corresponde)"
      >
        <CreditCard className="w-3 h-3 mr-1" />
        Marcar pagado
      </Button>
    );
  }

  // Caso 4 (default): Habilitado, no enviado — botón "Enviar cuenta de cobro"
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onSend?.(row)}
      className="!px-2 !py-1 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
      title="Generar y descargar el PDF de cuenta de cobro para enviar al inquilino"
      data-testid={`send-invoice-${row.monthNumber}`}
    >
      <Send className="w-3 h-3 mr-1" />
      Enviar CC
    </Button>
  );
}