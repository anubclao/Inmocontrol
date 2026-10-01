// filepath: src/features/tenants/modals/ViewTenantModal.tsx
// Modal de solo lectura que muestra el detalle completo de un tenant.
//
// fix-issue-06 (commit 2/2, oct-2026): el boton "Ver detalle" estaba
// disabled con title "proximamente - commit 2". Este modal lo activa.
// Muestra: nombre, cedula, email, telefono, direccion de la propiedad
// (resuelta desde properties[]) y canon.

import { User, X, Mail, Phone, MapPin, DollarSign, Hash } from "lucide-react";
import { Button, Modal } from "../../../shared/ui";
import { formatCurrency } from "../../../utils/calculations";
import type { Tenant } from "../types";

interface ViewTenantModalProps {
  isOpen: boolean;
  tenant: Tenant | null;
  propertyAddress: string;
  onClose: () => void;
}

export function ViewTenantModal({
  isOpen,
  tenant,
  propertyAddress,
  onClose,
}: ViewTenantModalProps) {
  if (!tenant) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalle del Arrendatario"
      size="md"
    >
      <div className="space-y-4">
        {/* Header con avatar + nombre */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 truncate">
              {tenant.name}
            </h3>
            <p className="text-xs text-slate-500">
              {tenant.status === "Activo" ? (
                <span className="text-emerald-600 font-semibold">● Activo</span>
              ) : (
                <span className="text-slate-400 font-semibold">● Inactivo</span>
              )}
            </p>
          </div>
        </div>

        {/* Grid de campos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field icon={Hash} label="Cédula" value={tenant.idNumber} />
          {tenant.email && (
            <Field icon={Mail} label="Email" value={tenant.email} />
          )}
          {tenant.phone && (
            <Field icon={Phone} label="Teléfono" value={tenant.phone} />
          )}
          <Field
            icon={MapPin}
            label="Propiedad"
            value={propertyAddress}
            muted={!propertyAddress || propertyAddress === "—"}
          />
          <Field
            icon={DollarSign}
            label="Canon mensual"
            value={formatCurrency(tenant.rent || 0)}
          />
        </div>

        {/* Acciones */}
        <div className="flex justify-end pt-3 border-t border-slate-200">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-1" />
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface FieldProps {
  icon: typeof User;
  label: string;
  value: string;
  muted?: boolean;
  mono?: boolean;
}

function Field({ icon: Icon, label, value, muted, mono }: FieldProps) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {label}
        </p>
        <p
          className={`text-sm ${mono ? "font-mono text-xs" : ""} ${
            muted ? "text-slate-400" : "text-slate-900"
          } break-words`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
