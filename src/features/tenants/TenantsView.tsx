// filepath: src/features/tenants/TenantsView.tsx
// Vista principal del módulo de Arrendatarios. Contiene:
//   - Lista de tenants (header, search, stats, cards)
//   - 5 modales extraídos en fix-issue-06 (commit 1): Create, ConfirmCreate,
//     Edit, Delete, UploadAnother
//
// Los siguientes siguen inline por ahora (commit 2 de fix-issue-06 los
// extrae): ViewDetail modal + useTenantDrive + PlacementInventoryOverlay +
// BillingWizard launcher + Acta modal mount.

import { useState } from "react";
import { motion } from "motion/react";
import { Edit, Eye, Plus, Search, User, Trash2 } from "lucide-react";
import { Button, Card } from "../../shared/ui";
import { ProcessOrderBanner } from "../../shared/ui/ProcessOrderBanner";
import { formatCurrency } from "../../utils/calculations";
import { useCreateTenant } from "./hooks/useCreateTenant";
import { CreateTenantModal } from "./modals/CreateTenantModal";
import { DeleteTenantModal } from "./modals/DeleteTenantModal";
import { EditTenantModal } from "./modals/EditTenantModal";
import { UploadAnotherDocModal } from "./modals/UploadAnotherDocModal";
import type { TenantsViewProps, Tenant } from "./types";

export function TenantsView({
  showToast,
  tenants,
  properties,
  onAddTenant,
  onUpdateTenant,
  onDeleteTenant,
  onUpdateProperty,
}: TenantsViewProps) {
  // Hook de create (form state + validate + POST + property flip)
  const ctl = useCreateTenant({
    properties,
    tenants,
    onAddTenant,
    onUpdateProperty,
    showToast,
  });

  // State compartido entre modales
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleConfirmDeleteTenant = async () => {
    if (!tenantToDelete) return;
    setDeletingTenant(true);
    try {
      const deletedPropertyId = tenantToDelete.propertyId;
      await onDeleteTenant(tenantToDelete.id);

      // Si era el último tenant activo de esa propiedad, reseteamos el status
      // del property para que vuelva a estar disponible para arrendar.
      const remainingActiveForProp = tenants.filter(
        (x) =>
          x.id !== tenantToDelete.id &&
          x.propertyId === deletedPropertyId &&
          x.status === "Activo",
      );
      if (remainingActiveForProp.length === 0 && deletedPropertyId) {
        onUpdateProperty(deletedPropertyId, { status: "Pendiente" });
      }

      showToast(`Arrendatario ${tenantToDelete.name} eliminado`, "success");
      setTenantToDelete(null);
    } catch (e: any) {
      showToast(e?.message ?? "No se pudo eliminar el arrendatario", "error");
    } finally {
      setDeletingTenant(false);
    }
  };

  // Filtros + computed values
  const filteredTenants = tenants.filter((t: Tenant) => {
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.idNumber.includes(q) ||
      (t.email && t.email.toLowerCase().includes(q)) ||
      (t.phone && t.phone.includes(q))
    );
  });

  // Only show available properties (not rented AND not in placement process).
  // "En Colocación" = ya tiene arrendatario pero el inventario de colocación
  // aún no está firmado, así que tampoco debe poder asignársele otro inquilino.
  const availableProperties = properties.filter(
    (p: any) => p.status !== "Arrendado" && p.status !== "En Colocación",
  );

  // Defensa adicional contra duplicados: aunque el status del property diga
  // "Pendiente"/"Activo" pero ya exista un tenant Activo apuntando a este
  // propertyId (caso de bug histórico o edición manual del status), también
  // lo bloqueamos acá.
  const propertyIdsWithActiveTenant = new Set(
    tenants
      .filter((t) => t.status === "Activo" && t.propertyId)
      .map((t) => t.propertyId),
  );
  const isPropertyAvailable = (p: any) =>
    availableProperties.some((x: any) => x.id === p.id) &&
    !propertyIdsWithActiveTenant.has(p.id);

  const getPropertyAddress = (propertyId: string) => {
    const p = properties.find((x: any) => x.id === propertyId);
    return p ? p.address : "—";
  };

  const activeTenants = filteredTenants.filter(
    (t: Tenant) => t.status === "Activo",
  );
  const inactiveTenants = filteredTenants.filter(
    (t: Tenant) => t.status === "Inactivo",
  );

  return (
    <>
      {/* ── Create modal (form + confirmación) ── */}
      <CreateTenantModal
        properties={properties}
        isPropertyAvailable={isPropertyAvailable}
        showToast={showToast}
        ctl={ctl}
      />

      {/* ── Edit modal ── */}
      <EditTenantModal
        isOpen={!!editingTenant}
        tenant={editingTenant}
        onSave={onUpdateTenant}
        onClose={() => setEditingTenant(null)}
        showToast={showToast}
      />

      {/* ── Delete modal ── */}
      <DeleteTenantModal
        isOpen={!!tenantToDelete}
        tenant={
          tenantToDelete
            ? { id: tenantToDelete.id, name: tenantToDelete.name }
            : null
        }
        deleting={deletingTenant}
        onConfirm={handleConfirmDeleteTenant}
        onClose={() => !deletingTenant && setTenantToDelete(null)}
      />

      {/* ── UploadAnother modal (placeholder para commit 2) ── */}
      <UploadAnotherDocModal
        isOpen={false}
        folder={null}
        fileCount={0}
        onUploadAnother={() => {}}
        onClose={() => {}}
      />

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-6"
      >
        {/* Banner de orientación */}
        <ProcessOrderBanner
          currentStep="tenants"
          title="Pasos 2 y 3: Asignar arrendatario y cerrar el flujo"
          description="Acá se registra al arrendatario (la propiedad pasa a En Colocación), se sube la cédula a Drive, y se firma el Inventario de Colocación (arrendatario + agente). Recién cuando el inventario está firmado se crea el Contrato y la propiedad pasa a Arrendado. NO se crea contrato al asignar el tenant."
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Módulo de Arrendatarios
            </h2>
            <p className="text-slate-500 text-sm">
              {tenants.length} arrendatario{tenants.length !== 1 ? "s" : ""}{" "}
              registrado{tenants.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            onClick={() => ctl.setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Arrendatario
          </Button>
        </div>

        {/* Search */}
        {tenants.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o correo..."
              className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Stats */}
        {tenants.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">
                {activeTenants.length}
              </p>
              <p className="text-xs text-slate-500 uppercase font-bold">
                Activos
              </p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-400">
                {inactiveTenants.length}
              </p>
              <p className="text-xs text-slate-500 uppercase font-bold">
                Inactivos
              </p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">
                {tenants.length}
              </p>
              <p className="text-xs text-slate-500 uppercase font-bold">
                Total
              </p>
            </Card>
          </div>
        )}

        {/* Tenant List */}
        {filteredTenants.length === 0 && tenants.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Sin arrendatarios</h3>
            <p className="text-sm text-slate-500 mb-6">
              Aún no hay arrendatarios registrados en el sistema.
            </p>
            <Button
              onClick={() => ctl.setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Crear Primer Arrendatario
            </Button>
          </Card>
        ) : filteredTenants.length === 0 && tenants.length > 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-slate-500">
              No se encontraron resultados para "{searchQuery}"
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeTenants.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">
                  Activos
                </h3>
                <div className="space-y-2">
                  {activeTenants.map((t) => (
                    <Card key={t.id} className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {t.name}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>{t.idNumber}</span>
                              {t.email && <span>{t.email}</span>}
                              {t.phone && <span>{t.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-medium text-slate-900">
                              {getPropertyAddress(t.propertyId)}
                            </p>
                            <p className="text-xs font-bold text-emerald-600">
                              {formatCurrency(t.rent || 0)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Ver detalle (próximamente — commit 2)"
                              disabled
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingTenant(t)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setTenantToDelete(t)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {inactiveTenants.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">
                  Inactivos
                </h3>
                <div className="space-y-2">
                  {inactiveTenants.map((t) => (
                    <Card key={t.id} className="p-4 opacity-60">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-slate-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-500 truncate">
                              {t.name}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span>{t.idNumber}</span>
                              {t.email && <span>{t.email}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-medium text-slate-400">
                              {getPropertyAddress(t.propertyId)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatCurrency(t.rent || 0)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Ver detalle (próximamente — commit 2)"
                              disabled
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingTenant(t)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}
