// filepath: src/features/tenants/TenantListSection.tsx
// Seccion de lista de tenants con titulo + grilla de TenantCards.
//
// fix-issue-06 (commit 2/2, oct-2026): extraida del monolito TenantsView.tsx
// para reducir lineas. Se usa 2 veces: "Activos" e "Inactivos" (con
// prop inactive=true en cada TenantCard).

import { TenantCard } from "./TenantCard";
import type { Tenant } from "./types";

interface TenantListSectionProps {
  title: string;
  tenants: Tenant[];
  getPropertyAddress: (id: string) => string;
  onView: (t: Tenant) => void;
  onEdit: (t: Tenant) => void;
  onDelete: (t: Tenant) => void;
  /** Si true, las cards se renderizan con estilo "inactivo" (opaco, sin phone). */
  inactive?: boolean;
}

export function TenantListSection({
  title,
  tenants,
  getPropertyAddress,
  onView,
  onEdit,
  onDelete,
  inactive,
}: TenantListSectionProps) {
  if (tenants.length === 0) return null;

  return (
    <div className={inactive ? "mt-6" : ""}>
      <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">
        {title}
      </h3>
      <div className="space-y-2">
        {tenants.map((t) => (
          <TenantCard
            key={t.id}
            tenant={t}
            propertyAddress={getPropertyAddress(t.propertyId)}
            inactive={inactive}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
