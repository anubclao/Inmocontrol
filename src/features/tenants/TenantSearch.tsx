// filepath: src/features/tenants/TenantSearch.tsx
// Input de busqueda por nombre / cedula / correo / telefono.
//
// fix-issue-06 (commit 2/2, oct-2026): extraida del monolito TenantsView.tsx.
// Sin cambio funcional.

import { Search } from "lucide-react";

interface TenantSearchProps {
  value: string;
  onChange: (v: string) => void;
}

export function TenantSearch({ value, onChange }: TenantSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type="text"
        placeholder="Buscar por nombre, cédula o correo..."
        className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="tenant-search"
      />
    </div>
  );
}
