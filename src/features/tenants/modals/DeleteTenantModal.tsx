// filepath: src/features/tenants/modals/DeleteTenantModal.tsx
// Modal de confirmación de borrado de un tenant. Se dispara desde la card
// del tenant en la lista (botón 🗑). Antes vivía inline en TenantsView.tsx
// (líneas 1880-1900). Extraído en fix-issue-06.

import { Button, Modal } from "../../../shared/ui";

export interface DeleteTenantModalProps {
  isOpen: boolean;
  tenant: { id: string; name: string } | null;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteTenantModal({
  isOpen,
  tenant,
  deleting,
  onConfirm,
  onClose,
}: DeleteTenantModalProps) {
  if (!tenant) return null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !deleting && onClose()}
      title="Eliminar arrendatario"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          ¿Eliminar a{" "}
          <span className="font-bold text-slate-900">{tenant.name}</span>? Esta
          acción borra el registro en MySQL. La carpeta de Drive del
          arrendatario NO se borra automáticamente (queda como respaldo).
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleting ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
