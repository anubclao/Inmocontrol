// filepath: src/features/contracts/components/Row.tsx
/**
 * Row — fila de label/value para el modal de detalle de contrato.
 * Sale de ContractsView.tsx como parte del refactor #13.
 */

export interface RowProps {
  label: string;
  value: unknown;
  highlight?: boolean;
}

export function Row({ label, value, highlight }: RowProps) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2">
      <span className="text-slate-500 text-xs font-bold uppercase">
        {label}
      </span>
      <span
        className={`text-sm ${highlight ? "text-amber-700 font-bold" : "text-slate-900"}`}
      >
        {String(value)}
      </span>
    </div>
  );
}
