// filepath: src/features/billing/views/billingPanel/sections/ChargesSection.tsx
/**
 * ChargesSection — lista de cargos/descuentos (Novedades) del mes.
 * Sale de BillingPanel.tsx como parte del refactor #12.
 */
import { Plus, Tag } from "lucide-react";
import { Button, Card } from "../../../../../shared/ui";
import { formatCurrency } from "../../../../../utils/calculations";
import { toPeriod } from "../../../types";
import type { PropertyCharge } from "../../../types";

export interface ChargesSectionProps {
  charges: PropertyCharge[];
  onAdd: () => void;
}

export function ChargesSection({ charges, onAdd }: ChargesSectionProps) {
  const currentPeriod = toPeriod(new Date().toISOString());
  const monthCharges = charges.filter((c) => c.period === currentPeriod);
  const totalMonth = monthCharges.reduce((s, c) => s + c.amount, 0);
  const toOwnerCount = monthCharges.filter(
    (c) => c.chargedTo === "owner" || c.chargedTo === "both",
  ).length;
  const toTenantCount = monthCharges.filter(
    (c) => c.chargedTo === "tenant" || c.chargedTo === "both",
  ).length;

  return (
    <Card>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-lg">
              Novedades de cargos
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {charges.length}{" "}
              {charges.length === 1
                ? "novedad registrada"
                : "novedades registradas"}
              {totalMonth > 0 && ` · ${formatCurrency(totalMonth)} este mes`}
              {monthCharges.length > 0 &&
                ` · ${toOwnerCount} al propietario, ${toTenantCount} al inquilino`}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Registrar novedad
        </Button>
      </div>

      {charges.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          Sin novedades registradas. Agregá servicios públicos, mantenimiento,
          impuestos, cargos al inquilino, etc.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {charges.slice(0, 20).map((c) => {
            const tone =
              c.chargedTo === "tenant"
                ? "text-blue-600 bg-blue-50"
                : c.chargedTo === "both"
                  ? "text-purple-600 bg-purple-50"
                  : "text-red-600 bg-red-50";
            const recipient =
              c.chargedTo === "owner"
                ? "Propietario"
                : c.chargedTo === "tenant"
                  ? "Inquilino"
                  : "Ambos";
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 p-3 px-6 text-sm"
              >
                <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded shrink-0">
                  {c.period}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${tone} shrink-0`}
                >
                  {recipient}
                </span>
                <span className="flex-1 text-slate-700 truncate">
                  {c.description}
                </span>
                <span
                  className={`font-semibold tabular-nums shrink-0 ${
                    c.chargedTo === "tenant"
                      ? "text-blue-600"
                      : c.chargedTo === "both"
                        ? "text-purple-600"
                        : "text-red-600"
                  }`}
                >
                  {c.chargedTo === "owner" ? "− " : "+ "}
                  {formatCurrency(c.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
