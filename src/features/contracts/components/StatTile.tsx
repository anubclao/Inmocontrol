// filepath: src/features/contracts/components/StatTile.tsx
/**
 * StatTile — card de estadística con ícono + label + value + tone.
 * Sale de ContractsView.tsx como parte del refactor #13.
 */
import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "bad" | "neutral";

const TONE_CLS: Record<Tone, string> = {
  ok: "bg-emerald-50 border-emerald-100 text-emerald-900",
  warn: "bg-amber-50 border-amber-100 text-amber-900",
  bad: "bg-red-50 border-red-100 text-red-900",
  neutral: "bg-slate-50 border-slate-100 text-slate-900",
};

export interface StatTileProps {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: Tone;
}

export function StatTile({
  label,
  value,
  icon,
  tone = "neutral",
}: StatTileProps) {
  return (
    <div className={`p-3 rounded-lg border ${TONE_CLS[tone]}`}>
      <div className="flex items-center gap-2 opacity-70 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}
