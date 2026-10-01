// filepath: src/features/tenants/TenantsView.tsx
// Vista principal del módulo de Arrendatarios.
//
// fix-issue-06 commit 2/2 (oct-2026): de 387 → <250 lineas. Extrae:
//   - TenantCard (la card que se repite para Activos/Inactivos)
//   - TenantStats (las 3 cards de stats)
//   - TenantSearch (input de búsqueda)
//   - ViewTenantModal (modal de detalle — antes el botón Eye estaba disabled)
//
// fix-issue-06 commit 1/2: extrajo 5 modales + useCreateTenant + 3 helpers
// puros. El monolito original tenía 1910 lineas; hoy TenantsView.tsx
// está por debajo de 250.
//
// Sin cambio funcional observable. El botón "Ver detalle" ahora abre
// el modal en vez de estar disabled.

import { useState } from "react";
import { motion } from "motion/react";
import { Plus, User } from "lucide-react";
import { Button, Card } from "../../shared/ui";
import { ProcessOrderBanner } from "../../shared/ui/ProcessOrderBanner";
import { useCreateTenant } from "./hooks/useCreateTenant";
import {
  filterTenantsByQuery,
  getAvailableProperties,
  getPropertyAddress,
  isPropertyAvailable,
  splitActiveInactive,
} from "./hooks/tenantFilters";
import { CreateTenantModal } from "./modals/CreateTenantModal";
import { DeleteTenantModal } from "./modals/DeleteTenantModal";
import { EditTenantModal } from "./modals/EditTenantModal";
import { UploadAnotherDocModal } from "./modals/UploadAnotherDocModal";
import { ViewTenantModal } from "./modals/ViewTenantModal";
import { TenantListSection } from "./TenantListSection";
import { TenantSearch } from "./TenantSearch";
import { TenantStats } from "./TenantStats";
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
  const [viewingTenant, setViewingTenant] = useState<Tenant | null>(null);
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

  // Filtros + computed values (extraidos a hooks/tenantFilters.ts)
  const filteredTenants = filterTenantsByQuery(tenants, searchQuery);
  const availableProperties = getAvailableProperties(properties);
  const isPropAvail = (p: any) =>
    isPropertyAvailable(p, availableProperties, tenants);
  const getAddr = (propertyId: string) =>
    getPropertyAddress(propertyId, properties);
  const { activeTenants, inactiveTenants } =
    splitActiveInactive(filteredTenants);

  return (
    <>
      {/* ── Modales (extraídos en commit 1/2) ── */}
      <CreateTenantModal
        properties={properties}
        isPropertyAvailable={(p) =>
          isPropertyAvailable(p, availableProperties, tenants)
        }
        showToast={showToast}
        ctl={ctl}
      />
      <EditTenantModal
        isOpen={!!editingTenant}
        tenant={editingTenant}
        onSave={onUpdateTenant}
        onClose={() => setEditingTenant(null)}
        showToast={showToast}
      />
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
      {/* Modal nuevo de commit 2/2: Ver detalle */}
      <ViewTenantModal
        isOpen={!!viewingTenant}
        tenant={viewingTenant}
        propertyAddress={
          viewingTenant ? getAddr(viewingTenant.propertyId) : "—"
        }
        onClose={() => setViewingTenant(null)}
      />
      Avail
      {/* ── UploadAnother modal (placeholder, sin uso actual) ── */}
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
        <ProcessOrderBanner
          currentStep="tenants"
          title="Pasos 2 y 3: Asignar arrendatario y cerrar el flujo"
          description="Acá se registra al arrendatario (la propiedad pasa a En Colocación), se sube la cédula a Drive, y se firma el Inventario de Colocación (arrendatario + agente). Recién cuando el inventario está firmado se crea el Contrato y la propiedad pasa a Arrendado. NO se crea contrato al asignar el tenant."
        />

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

        {tenants.length > 0 && (
          <TenantSearch value={searchQuery} onChange={setSearchQuery} />
        )}

        {tenants.length > 0 && (
          <TenantStats
            activeCount={activeTenants.length}
            inactiveCount={inactiveTenants.length}
            totalCount={tenants.length}
          />
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
            <TenantListSection
              title="Activos"
              tenants={activeTenants}
              getPropertyAddress={getAddr}
              onView={setViewingTenant}
              onEdit={setEditingTenant}
              onDelete={setTenantToDelete}
            />
            <TenantListSection
              title="Inactivos"
              tenants={inactiveTenants}
              getPropertyAddress={getAddr}
              onView={setViewingTenant}
              onEdit={setEditingTenant}
              onDelete={setTenantToDelete}
              inactive
            />
          </div>
        )}
      </motion.div>
    </>
  );
}
