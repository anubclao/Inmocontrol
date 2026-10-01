// filepath: src/features/saasBilling/components/PlanCard.tsx
/**
 * PlanCard — card de un plan en el catálogo.
 * Sale de SaasBillingView.tsx como parte del refactor #16.
 */
import { Check } from "lucide-react";
import { Button, cn } from "../../../shared/ui";
import { calcIva, formatCop, type Plan } from "../types";

export interface PlanCardProps {
  plan: Plan;
  current: boolean;
  onSelect: () => void;
}

export function PlanCard({ plan, current, onSelect }: PlanCardProps) {
  const isFree = plan.priceCop === 0;
  return (
    <div
      className={cn(
        "p-5 rounded-2xl border-2 transition-all flex flex-col",
        current
          ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="font-bold text-lg text-slate-900">{plan.name}</h4>
          {plan.description && (
            <p className="text-xs text-slate-500 mt-0.5">{plan.description}</p>
          )}
        </div>
        {current && (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-600 text-white shrink-0">
            Actual
          </span>
        )}
      </div>
      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-900">
            {isFree ? "Gratis" : formatCop(plan.priceCop)}
          </span>
          {!isFree && <span className="text-xs text-slate-500">/mes</span>}
        </div>
        {!isFree && (
          <p className="text-[11px] text-slate-400 mt-0.5">
            + IVA {formatCop(calcIva(plan.priceCop))} · Total{" "}
            {formatCop(plan.priceCop + calcIva(plan.priceCop))}
          </p>
        )}
      </div>
      <ul className="space-y-1.5 mb-5 flex-1">
        {plan.features.map((feat, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-xs text-slate-700"
          >
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <span>{feat}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={onSelect}
        disabled={current}
        variant={current ? "outline" : "primary"}
        className="w-full"
      >
        {current
          ? "Plan actual"
          : isFree
            ? "Elegir Free"
            : `Cambiar a ${plan.name}`}
      </Button>
    </div>
  );
}
