// filepath: src/features/billing/views/billingPanel/sections/IncreasesSection.tsx
/**
 * IncreasesSection — lista de aumentos al inquilino (IPC anual, cambios admin).
 * Sale de BillingPanel.tsx como parte del refactor #12.
 */
import { Plus, TrendingUp } from "lucide-react";
import { Button, Card } from "../../../../../shared/ui";
import type { RentIncrease } from "../../../types";

export interface IncreasesSectionProps {
  increases: RentIncrease[];
  onAdd: () => void;
}

export function IncreasesSection({ increases, onAdd }: IncreasesSectionProps) {
  return (
    <Card>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-amber-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-lg">
              Aumentos al inquilino
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {increases.length}{" "}
              {increases.length === 1
                ? "aumento registrado"
                : "aumentos registrados"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Registrar aumento
        </Button>
      </div>

      {increases.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          Sin aumentos. Usá esta sección para registrar IPC anual o cambios de
          admin.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {increases.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-3 px-6 text-sm">
              <span className="text-xs font-medium px-2 py-0.5 bg-amber-100 text-amber-700 rounded shrink-0">
                {i.type === "ipc_annual" ? `IPC ${i.amount}%` : "Admin"}
              </span>
              <span className="text-xs text-slate-500 font-mono shrink-0">
                desde {i.effectiveFrom}
              </span>
              <span className="flex-1 text-slate-700 truncate">
                {i.description}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
