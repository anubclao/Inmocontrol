/**
 * InmoControl — Modal para registrar el pago de un mes.
 *
 * Muestra los 3 valores posibles (early/mid/late) según el día seleccionado.
 * El usuario elige en qué día del mes pagó el inquilino, y el modal recalcula
 * la mora en vivo. Al confirmar, llama onConfirm(day, total).
 */

import React, { useState, useMemo } from "react";
import { Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, Modal, cn } from "../../../shared/ui";
import { calculateLateFee } from "../calculations";
import type { AmortizationRow, BillingPolicy } from "../types";

const COP = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

export interface PaymentModalProps {
  row: AmortizationRow | null;
  policy: BillingPolicy;
  onClose: () => void;
  onConfirm: (paidOnDayOfMonth: number, totalPaid: number) => Promise<boolean>;
}

export function PaymentModal({
  row,
  policy,
  onClose,
  onConfirm,
}: PaymentModalProps) {
  const [day, setDay] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);

  // Reset day when opening with a new row
  React.useEffect(() => {
    if (row) setDay(Math.min(policy.graceDay, 5));
  }, [row, policy.graceDay]);

  const lateFee = useMemo(() => {
    if (!row) return null;
    return calculateLateFee({
      subtotal: row.subtotal,
      paidOnDayOfMonth: day,
      graceDay: policy.graceDay,
      lateFeeMidPct: policy.lateFeeMidPct,
      lateFeeLatePct: policy.lateFeeLatePct,
    });
  }, [row, day, policy]);

  if (!row || !lateFee) return null;

  const totalAPagar = row.subtotal + lateFee.amount;
  const isOnTime = lateFee.pct === 0;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const ok = await onConfirm(day, totalAPagar);
      if (ok) {
        onClose();
      }
      // si !ok, modal queda abierto con día y monto pre-llenados
    } finally {
      setSubmitting(false); // rehabilita el botón siempre
    }
  };

  return (
    <Modal
      isOpen={!!row}
      onClose={onClose}
      title={`Registrar pago — ${row.periodStart.slice(0, 7)}`}
      size="md"
    >
      <div className="space-y-5">
        {/* Resumen del mes */}
        <div className="bg-slate-50 rounded-lg p-4 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Canon</span>
            <span className="tabular-nums">{COP(row.baseRent)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Administración</span>
            <span className="tabular-nums">{COP(row.baseAdmin)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Ajustes</span>
            <span className="tabular-nums">
              {COP(row.adminAdjustment + row.ipcAdjustment)}
            </span>
          </div>
          <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-slate-900">
            <span>Subtotal</span>
            <span className="tabular-nums">{COP(row.subtotal)}</span>
          </div>
        </div>

        {/* Selector de día */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            ¿Qué día del mes pagó el inquilino?
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[1, 5, 10, 15, 20, 25, 28].map((d) => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={cn(
                  "px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                  day === d
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
                )}
              >
                Día {d}
              </button>
            ))}
          </div>
        </div>

        {/* Resultado del cálculo */}
        <div
          className={cn(
            "rounded-lg p-4 border-2",
            isOnTime
              ? "bg-emerald-50 border-emerald-200"
              : "bg-red-50 border-red-200",
          )}
        >
          {isOnTime ? (
            <div className="flex items-center gap-2 text-emerald-700 mb-2">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-semibold">
                ¡Sin mora! Pagó dentro del día de gracia.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-semibold">
                Mora del {lateFee.pct}% por pago después del día{" "}
                {policy.graceDay}.
              </span>
            </div>
          )}
          <div className="flex items-end justify-between">
            <span className="text-xs text-slate-500">Total a pagar</span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {COP(totalAPagar)}
            </span>
          </div>
          {lateFee.amount > 0 && (
            <div className="flex justify-between text-xs text-red-700 mt-1">
              <span>Subtotal</span>
              <span className="tabular-nums">{COP(row.subtotal)}</span>
            </div>
          )}
          {lateFee.amount > 0 && (
            <div className="flex justify-between text-xs text-red-700">
              <span>+ Mora ({lateFee.pct}%)</span>
              <span className="tabular-nums">{COP(lateFee.amount)}</span>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Guardando…" : `Confirmar pago · ${COP(totalAPagar)}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
