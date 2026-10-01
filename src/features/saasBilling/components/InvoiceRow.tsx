// filepath: src/features/saasBilling/components/InvoiceRow.tsx
/**
 * InvoiceRow — fila de factura con status + total + botón "Pagar" si open.
 * Sale de SaasBillingView.tsx como parte del refactor #16.
 */
import { Button, cn } from "../../../shared/ui";
import { formatCop } from "../types";

export interface InvoiceRowProps {
  inv: {
    id: string;
    invoiceNumber: string;
    periodStart: string;
    periodEnd: string;
    totalCop: number;
    ivaCop: number;
    subtotalCop: number;
    status: string;
    issuedAt: string;
    paidAt?: string;
  };
  onPay: () => void;
}

export function InvoiceRow({ inv, onPay }: InvoiceRowProps) {
  const isOpen = inv.status === "open";
  return (
    <li className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 transition-colors gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-semibold text-slate-900">
            {inv.invoiceNumber}
          </span>
          <span
            className={cn(
              "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full",
              inv.status === "paid"
                ? "bg-emerald-100 text-emerald-700"
                : inv.status === "open"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-200 text-slate-600",
            )}
          >
            {inv.status}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Periodo{" "}
          {new Date(inv.periodStart).toLocaleDateString("es-CO")} →{" "}
          {new Date(inv.periodEnd).toLocaleDateString("es-CO")}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-slate-900">
          {formatCop(inv.totalCop)}
        </p>
        <p className="text-[10px] text-slate-400">IVA {formatCop(inv.ivaCop)}</p>
      </div>
      {isOpen && (
        <Button size="sm" onClick={onPay} className="shrink-0">
          Pagar
        </Button>
      )}
    </li>
  );
}
