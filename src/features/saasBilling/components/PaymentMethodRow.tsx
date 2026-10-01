// filepath: src/features/saasBilling/components/PaymentMethodRow.tsx
/**
 * PaymentMethodRow — fila de método de pago con acciones (default / eliminar).
 * Sale de SaasBillingView.tsx como parte del refactor #16.
 */
import { CreditCard, Edit3, ShieldCheck, Star, Trash2 } from "lucide-react";
import { Button, cn } from "../../../shared/ui";

export interface PaymentMethodRowProps {
  pm: {
    id: string;
    type: string;
    brand?: string;
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
    holderName?: string;
    isDefault: boolean;
  };
  onSetDefault: () => void;
  onRemove: () => void;
}

function getPmLabel(pm: PaymentMethodRowProps["pm"]): string {
  if (pm.type === "card") {
    return `${(pm.brand ?? "card").toUpperCase()} •••• ${pm.last4 ?? "????"}`;
  }
  if (pm.type === "pse") return "PSE";
  if (pm.type === "nequi") return "Nequi";
  return "Bancolombia";
}

export function PaymentMethodRow({
  pm,
  onSetDefault,
  onRemove,
}: PaymentMethodRowProps) {
  const label = getPmLabel(pm);
  const sub =
    pm.type === "card" && pm.expiryMonth && pm.expiryYear
      ? `Vence ${String(pm.expiryMonth).padStart(2, "0")}/${pm.expiryYear}${
          pm.holderName ? ` · ${pm.holderName}` : ""
        }`
      : null;

  return (
    <li className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "p-2 rounded-lg shrink-0",
            pm.type === "card"
              ? "bg-blue-50 text-blue-600"
              : "bg-emerald-50 text-emerald-600",
          )}
        >
          {pm.type === "card" ? (
            <CreditCard className="w-4 h-4" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              {label}
            </span>
            {pm.isDefault && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5" /> Default
              </span>
            )}
          </div>
          {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!pm.isDefault && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSetDefault}
            className="text-blue-600 hover:text-blue-700"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          className="text-slate-400 hover:text-red-600"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </li>
  );
}
