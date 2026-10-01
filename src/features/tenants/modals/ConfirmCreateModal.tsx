// filepath: src/features/tenants/modals/ConfirmCreateModal.tsx
// Modal de confirmación pre-guardar del CreateTenantModal. Evita que un
// click distraído cree el inquilino + cambie el estado de la propiedad a
// "En Colocación" + cree carpeta en Drive sin que el agente revise.
//
// Antes vivía inline en TenantsView.tsx (líneas 870-960). Extraído en
// fix-issue-06.

import { Loader2 } from "lucide-react";
import { Button, Modal } from "../../../shared/ui";
import type { CreateTenantForm } from "../hooks/useCreateTenant";

export interface ConfirmCreateModalProps {
  isOpen: boolean;
  form: CreateTenantForm;
  properties: any[];
  creatingTenant: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmCreateModal({
  isOpen,
  form,
  properties,
  creatingTenant,
  onConfirm,
  onClose,
}: ConfirmCreateModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      // FIX 2026-07-22: si está creando, NO dejamos cerrar el modal con
      // click afuera o ESC. Si no, se puede cancelar a mitad del POST y
      // el server queda con el tenant creado pero la UI sin saberlo.
      onClose={() => {
        if (!creatingTenant) onClose();
      }}
      title="¿Guardar arrendatario?"
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <svg
            className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
            />
          </svg>
          <div className="text-sm">
            <p className="font-bold text-amber-900">Revisa antes de guardar</p>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Al guardar, <strong>{form.name || "este arrendatario"}</strong>{" "}
              queda activo y la propiedad{" "}
              <strong>
                {properties.find((p: any) => p.id === form.propertyId)
                  ?.address ?? ""}
              </strong>{" "}
              pasa a estado <strong>En Colocación</strong>. Se creará su carpeta
              en Google Drive.
              <br />
              <br />
              La propiedad pasará a <strong>Arrendado</strong> solo cuando
              firmes el <strong>Inventario de Colocación</strong> con el
              arrendatario (2 firmas: arrendatario + agente).
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500 space-y-1 px-1">
          <p>
            <strong className="text-slate-700">Cédula:</strong> {form.idNumber}
          </p>
          <p>
            <strong className="text-slate-700">Correo:</strong> {form.email}
          </p>
          <p>
            <strong className="text-slate-700">Celular:</strong> {form.phone}
          </p>
          <p>
            <strong className="text-slate-700">Canon:</strong> ${" "}
            {form.rent.replace(/[^0-9]/g, "") || "0"}
          </p>
          {form.adminFee && (
            <p>
              <strong className="text-slate-700">Administración:</strong> ${" "}
              {form.adminFee.replace(/[^0-9]/g, "")}
            </p>
          )}
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={creatingTenant}>
            Modificar
          </Button>
          <Button onClick={onConfirm} disabled={creatingTenant}>
            {creatingTenant ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                Guardando...
              </>
            ) : (
              "Sí, guardar"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
