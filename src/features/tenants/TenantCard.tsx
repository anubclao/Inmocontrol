// filepath: src/features/tenants/TenantCard.tsx
// Card individual de un tenant (usada para Activos e Inactivos).
//
// fix-issue-06 (commit 2/2, oct-2026): extraida del monolito TenantsView.tsx
// (387 lineas → <250). El componente se reutiliza para Activos (sin opacity)
// y para Inactivos (opacity-60, sin phone, sin rent highlight). Sin cambio
// funcional: mismo JSX, mismas clases, mismos handlers.

import { Edit, Eye, Trash2, User } from "lucide-react";
import { Card } from "../../shared/ui";
import { formatCurrency } from "../../utils/calculations";
import type { Tenant } from "./types";

interface TenantCardProps {
  tenant: Tenant;
  propertyAddress: string;
  inactive?: boolean;
  onView: (t: Tenant) => void;
  onEdit: (t: Tenant) => void;
  onDelete: (t: Tenant) => void;
}

export function TenantCard({
  tenant: t,
  propertyAddress,
  inactive,
  onView,
  onEdit,
  onDelete,
}: TenantCardProps) {
  return (
    <Card key={t.id} className={`p-4${inactive ? " opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 ${
              inactive ? "bg-slate-100" : "bg-emerald-100"
            } rounded-full flex items-center justify-center shrink-0`}
          >
            <User
              className={`w-5 h-5 ${
                inactive ? "text-slate-400" : "text-emerald-600"
              }`}
            />
          </div>
          <div className="min-w-0">
            <p
              className={`font-semibold ${
                inactive ? "text-slate-500" : "text-slate-900"
              } truncate`}
            >
              {t.name}
            </p>
            <div
              className={`flex items-center gap-3 text-xs ${
                inactive ? "text-slate-400" : "text-slate-500"
              }`}
            >
              <span>{t.idNumber}</span>
              {t.email && <span>{t.email}</span>}
              {!inactive && t.phone && <span>{t.phone}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <p
              className={`text-xs font-medium ${
                inactive ? "text-slate-400" : "text-slate-900"
              }`}
            >
              {propertyAddress}
            </p>
            <p
              className={`text-xs ${
                inactive ? "text-slate-400" : "font-bold text-emerald-600"
              }`}
            >
              {formatCurrency(t.rent || 0)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              title="Ver detalle"
              onClick={() => onView(t)}
              data-testid={`tenant-view-${t.id}`}
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => onEdit(t)}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              title="Editar"
              data-testid={`tenant-edit-${t.id}`}
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(t)}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title="Eliminar"
              data-testid={`tenant-delete-${t.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
