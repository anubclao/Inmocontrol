// filepath: src/features/tenants/modals/EditTenantModal.tsx
// Modal de edición de un tenant. El usuario puede modificar nombre, cédula,
// celular, correo, canon, administración y estado. FIX Karpathy (jul-2026):
// el adminFee ahora también se edita acá (antes solo al crear).
//
// Antes vivía inline en TenantsView.tsx (líneas 962-1140). Extraído en
// fix-issue-06.

import { useEffect, useState } from "react";
import { Button, Input, Modal } from "../../../shared/ui";
import { formatIdNumber, formatTenantName } from "../../../utils/validators";
import type { Tenant } from "../types";

/** Forma local del tenant en el form de edición. A diferencia de `Tenant`,
 *  `rent` y `adminFee` son `string | number` para aceptar el value del
 *  Input (que es string) sin necesidad de parsear a cada keystroke. Al
 *  guardar, los saneamos a number en el handler. */
type EditingTenant = Omit<Tenant, "rent" | "adminFee"> & {
  rent: string | number;
  adminFee?: string | number;
};

export interface EditTenantModalProps {
  isOpen: boolean;
  tenant: Tenant | null;
  onSave: (id: string, updates: any) => Promise<boolean>;
  onClose: () => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export function EditTenantModal({
  isOpen,
  tenant,
  onSave,
  onClose,
  showToast,
}: EditTenantModalProps) {
  // Copia local del tenant que se va modificando. Se sincroniza con el
  // prop cuando cambia el tenant abierto, para que abrir otro tenant
  // no muestre datos del anterior.
  const [editingTenant, setEditingTenant] = useState<EditingTenant | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenant) {
      setEditingTenant({ ...tenant });
    } else {
      setEditingTenant(null);
    }
  }, [tenant]);

  if (!editingTenant) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      title="Editar Arrendatario"
    >
      <div className="space-y-4">
        <Input
          label="Nombre Completo"
          value={editingTenant.name}
          onChange={(e) =>
            setEditingTenant({
              ...editingTenant,
              name: formatTenantName(e.target.value),
            })
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Cédula / NIT"
            value={editingTenant.idNumber}
            onChange={(e) =>
              setEditingTenant({
                ...editingTenant,
                idNumber: formatIdNumber(e.target.value),
              })
            }
          />
          <Input
            label="Celular"
            value={editingTenant.phone || ""}
            onChange={(e) =>
              setEditingTenant({
                ...editingTenant,
                phone: e.target.value,
              })
            }
          />
        </div>
        <Input
          label="Correo Electrónico"
          type="email"
          value={editingTenant.email || ""}
          onChange={(e) =>
            setEditingTenant({
              ...editingTenant,
              email: e.target.value.toLowerCase(),
            })
          }
        />
        <Input
          label="Canon Mensual"
          value={editingTenant.rent}
          onChange={(e) =>
            setEditingTenant({ ...editingTenant, rent: e.target.value })
          }
        />
        <Input
          label="Cuota Administración (COP)"
          placeholder="$ 0"
          // FIX Karpathy (jul-2026): campo agregado al modal de edición.
          // Antes el adminFee solo se podía setear al CREAR el tenant.
          // Ahora aparece siempre (algunas propiedades tienen admin, otras
          // no) y se pre-rellena con el valor actual. Opcional.
          value={
            editingTenant.adminFee != null ? String(editingTenant.adminFee) : ""
          }
          onChange={(e) =>
            setEditingTenant({ ...editingTenant, adminFee: e.target.value })
          }
        />
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">
            Estado
          </label>
          <select
            className="w-full h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
            value={editingTenant.status}
            onChange={(e) =>
              setEditingTenant({
                ...editingTenant,
                status: e.target.value as Tenant["status"],
              })
            }
          >
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
        </div>
        <div className="pt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              setSaving(true);
              // FIX Karpathy (jul-2026): antes era fire-and-forget con toast
              // mentiroso. Ahora esperamos el resultado real del store y
              // mostramos el toast correcto según éxito/error.
              // Limpiamos adminFee igual que el modal de Crear: solo números,
              // default 0 si está vacío.
              const adminFeeClean =
                parseFloat(
                  String(editingTenant.adminFee ?? "").replace(/[^0-9]/g, ""),
                ) || 0;
              const ok = await onSave(editingTenant.id, {
                name: editingTenant.name,
                idNumber: editingTenant.idNumber,
                email: editingTenant.email,
                phone: editingTenant.phone,
                rent: editingTenant.rent,
                adminFee: adminFeeClean,
                status: editingTenant.status,
              });
              if (ok) {
                showToast(
                  `✓ Cambios guardados: ${editingTenant.name}`,
                  "success",
                );
                onClose();
              } else {
                showToast(
                  "Error al guardar cambios. Reintentá en unos segundos.",
                  "error",
                );
              }
              setSaving(false);
            }}
          >
            Guardar Cambios
          </Button>
        </div>
      </div>
    </Modal>
  );
}
