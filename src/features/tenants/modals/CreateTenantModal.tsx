// filepath: src/features/tenants/modals/CreateTenantModal.tsx
// Modal de creación de un nuevo tenant. Tiene el form con todos los inputs
// (nombre, cédula, email, celular, inmueble, canon, admin) y renderiza
// internamente el ConfirmCreateModal para el sub-paso de revisión.
//
// Antes vivía inline en TenantsView.tsx (líneas 730-960). Extraído en
// fix-issue-06. Toda la lógica (state, validación, POST) vive en
// useCreateTenant — este componente es presentacional.

import { Button, Input, Modal } from "../../../shared/ui";
import { formatTenantName } from "../../../utils/validators";
import type { UseCreateTenantResult } from "../hooks/useCreateTenant";
import { ConfirmCreateModal } from "./ConfirmCreateModal";

export interface CreateTenantModalProps {
  properties: any[];
  isPropertyAvailable: (p: any) => boolean;
  showToast: (msg: string, type?: "success" | "error") => void;
  ctl: UseCreateTenantResult;
}

export function CreateTenantModal({
  properties,
  isPropertyAvailable,
  showToast,
  ctl,
}: CreateTenantModalProps) {
  const {
    form,
    formErrors,
    setForm,
    setFormErrors,
    isCreateModalOpen,
    handleAskCreate,
    handleConfirmAndCreate,
    handleIdNumberChange,
    handleCloseCreate,
    propertyIdsWithActiveTenant,
    formatColombianPhone,
    confirmCreateOpen,
    setConfirmCreateOpen,
    creatingTenant,
  } = ctl;

  const availableProperties = properties.filter(
    (p: any) => p.status !== "Arrendado" && p.status !== "En Colocación",
  );

  // Helper: actualiza un campo del form y limpia su error si lo tenía.
  // Reduce el boilerplate de 6+ onChange handlers a 1 línea cada uno.
  const updateField = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((er) => ({ ...er, [field]: "" }));
    }
  };

  return (
    <>
      <Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreate}
        title="Nuevo Arrendatario"
      >
        <div className="space-y-4">
          <Input
            label="Nombre Completo"
            placeholder="Ej: Tatiana Prieto Ruiz"
            value={form.name}
            onChange={(e) =>
              updateField("name", formatTenantName(e.target.value))
            }
            error={formErrors.name}
          />
          <Input
            label="Cédula / NIT"
            placeholder="1.023.456.789"
            value={form.idNumber}
            onChange={handleIdNumberChange}
            error={formErrors.idNumber}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Correo Electrónico"
              placeholder="tatianap@correo.com"
              type="email"
              value={form.email}
              onChange={(e) =>
                updateField("email", e.target.value.toLowerCase())
              }
              error={formErrors.email}
            />
            <Input
              label="Celular"
              placeholder="300 123 4567"
              value={form.phone}
              maxLength={12}
              inputMode="numeric"
              onChange={(e) =>
                updateField("phone", formatColombianPhone(e.target.value))
              }
              error={formErrors.phone}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase">
              Inmueble
            </label>
            <select
              className={`w-full h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none ${formErrors.propertyId ? "border-red-400 bg-red-50" : ""}`}
              value={form.propertyId}
              onChange={(e) => {
                updateField("propertyId", e.target.value);
                // Auto-fill canon si la propiedad tiene uno por defecto
                const prop = properties.find(
                  (p: any) => p.id === e.target.value,
                );
                if (prop?.rentAmount)
                  updateField("rent", prop.rentAmount.toString());
              }}
            >
              <option value="">Seleccionar inmueble...</option>
              {properties.map((p: any) => {
                const available = isPropertyAvailable(p);
                const reason = !available
                  ? p.status === "Arrendado"
                    ? " · ya arrendado"
                    : p.status === "En Colocación"
                      ? " · en colocación"
                      : propertyIdsWithActiveTenant.has(p.id)
                        ? " · ya tiene arrendatario activo"
                        : " · no disponible"
                  : "";
                return (
                  <option key={p.id} value={p.id} disabled={!available}>
                    {p.address}
                    {reason}
                  </option>
                );
              })}
            </select>
            {formErrors.propertyId && (
              <p className="text-xs text-red-500 mt-1">
                {formErrors.propertyId}
              </p>
            )}
            {availableProperties.length === 0 &&
              propertyIdsWithActiveTenant.size === 0 && (
                <p className="text-xs text-amber-500 mt-1">
                  No hay inmuebles disponibles para arrendar
                </p>
              )}
            {propertyIdsWithActiveTenant.size > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                Los inmuebles marcados con "ya tiene arrendatario activo" no se
                pueden asignar de nuevo. Finaliza el contrato actual primero.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Canon Mensual (COP)"
              placeholder="$ 1.696.037"
              value={form.rent}
              onChange={(e) => updateField("rent", e.target.value)}
              error={formErrors.rent}
            />
            <Input
              label="Cuota Administración (COP)"
              placeholder="$ 0"
              value={form.adminFee}
              onChange={(e) => updateField("adminFee", e.target.value)}
              error={formErrors.adminFee}
            />
          </div>
          <div className="pt-4 flex flex-col sm:flex-row justify-end gap-3">
            <Button variant="outline" onClick={handleCloseCreate}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                showToast(
                  '✓ Datos del arrendatario listos (botón "Crear" los guarda)',
                  "success",
                )
              }
              className="gap-2"
            >
              💾 Guardar borrador
            </Button>
            <Button onClick={handleAskCreate}>Crear Arrendatario</Button>
          </div>
        </div>
      </Modal>

      <ConfirmCreateModal
        isOpen={confirmCreateOpen}
        form={form}
        properties={properties}
        creatingTenant={creatingTenant}
        onConfirm={handleConfirmAndCreate}
        onClose={() => setConfirmCreateOpen(false)}
      />
    </>
  );
}
