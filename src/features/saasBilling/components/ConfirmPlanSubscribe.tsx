// filepath: src/features/saasBilling/components/ConfirmPlanSubscribe.tsx
/**
 * ConfirmPlanSubscribe — modal de confirmación al subscribirse a un plan.
 * Muestra desglose de precio (subtotal + IVA + total) y selector de método
 * de pago. Sale de SaasBillingView.tsx como parte del refactor #16.
 */
import { useState } from "react";
import { Button } from "../../../shared/ui";
import { calcIva, formatCop, type Plan } from "../types";

export interface ConfirmPlanSubscribeProps {
  plan: Plan;
  paymentMethods: {
    id: string;
    isDefault: boolean;
    brand?: string;
    last4?: string;
    type: string;
  }[];
  onConfirm: (paymentMethodId?: string) => void;
  onCancel: () => void;
}

function getPmOptionLabel(pm: {
  type: string;
  brand?: string;
  last4?: string;
  isDefault: boolean;
}): string {
  if (pm.type === "card") {
    return `${(pm.brand ?? "card").toUpperCase()} •••• ${pm.last4 ?? ""}${
      pm.isDefault ? " (Default)" : ""
    }`;
  }
  return `${pm.type.toUpperCase()}${pm.isDefault ? " (Default)" : ""}`;
}

export function ConfirmPlanSubscribe({
  plan,
  paymentMethods,
  onConfirm,
  onCancel,
}: ConfirmPlanSubscribeProps) {
  const defaultPm =
    paymentMethods.find((pm) => pm.isDefault) ?? paymentMethods[0];
  const [selectedPm, setSelectedPm] = useState<string | undefined>(
    defaultPm?.id,
  );
  const iva = calcIva(plan.priceCop);
  const total = plan.priceCop + iva;
  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Plan {plan.name}</span>
          <span className="text-sm font-bold text-slate-900">
            {formatCop(plan.priceCop)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-500">IVA 19%</span>
          <span className="text-xs text-slate-700">{formatCop(iva)}</span>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
          <span className="text-sm font-bold text-slate-900">
            Total mensual
          </span>
          <span className="text-lg font-bold text-blue-600">
            {formatCop(total)}
          </span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
          Método de pago
        </label>
        {paymentMethods.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
            No tenés métodos de pago. Agregá uno antes de subscribirte a un plan
            pago. Para planes Free no es necesario.
          </p>
        ) : (
          <select
            value={selectedPm}
            onChange={(e) => setSelectedPm(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
          >
            {paymentMethods.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {getPmOptionLabel(pm)}
              </option>
            ))}
          </select>
        )}
        <p className="text-[11px] text-slate-400 mt-1">
          MOCK: no se hace cargo real. Cuando se enchufe Wompi/MercadoPago, este
          botón dispara el checkout del PSP.
        </p>
      </div>

      <div className="pt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() => onConfirm(selectedPm)}
          disabled={plan.priceCop > 0 && !selectedPm}
        >
          Confirmar y pagar
        </Button>
      </div>
    </div>
  );
}
