// filepath: src/features/tenants/TenantStats.tsx
// 3 cards de stats (Activos / Inactivos / Total) que se muestran arriba
// de la lista de tenants.
//
// fix-issue-06 (commit 2/2, oct-2026): extraida del monolito TenantsView.tsx
// para reducir lineas. Sin cambio funcional.

import { Card } from "../../shared/ui";

interface TenantStatsProps {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

export function TenantStats({
  activeCount,
  inactiveCount,
  totalCount,
}: TenantStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="p-4 text-center">
        <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
        <p className="text-xs text-slate-500 uppercase font-bold">Activos</p>
      </Card>
      <Card className="p-4 text-center">
        <p className="text-2xl font-bold text-slate-400">{inactiveCount}</p>
        <p className="text-xs text-slate-500 uppercase font-bold">Inactivos</p>
      </Card>
      <Card className="p-4 text-center">
        <p className="text-2xl font-bold text-blue-600">{totalCount}</p>
        <p className="text-xs text-slate-500 uppercase font-bold">Total</p>
      </Card>
    </div>
  );
}
