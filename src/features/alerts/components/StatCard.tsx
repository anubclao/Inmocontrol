// filepath: src/features/alerts/components/StatCard.tsx
/**
 * StatCard — card de estadística con ícono + label + value.
 * Usado en el header del Centro de Notificaciones (4 cards: pendientes, hoy, canales, reglas).
 *
 * Sale de AlertsView.tsx como parte del refactor #11.
 */
import type { LucideIcon } from "lucide-react";
import { Card, cn } from "../../../shared/ui";

type Accent = "amber" | "slate" | "emerald" | "blue" | "violet";

const ACCENT_CLS: Record<Accent, string> = {
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-slate-100 text-slate-500",
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
};

export interface StatCardProps {
  label: string;
  value: number | string;
  accent: Accent;
  icon: LucideIcon;
}

export function StatCard({ label, value, accent, icon: Icon }: StatCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={cn("p-1.5 rounded-lg", ACCENT_CLS[accent])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
    </Card>
  );
}
