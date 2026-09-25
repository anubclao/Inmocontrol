/**
 * useCrudHandlers — encapsula los handlers de CRUD que estaban inline
 * en App.tsx. Cada handler delega al Zustand store correspondiente y
 * muestra el toast.
 *
 * Mantiene 1:1 la semántica legacy (incluyendo el refetch puntual de
 * `handleAddProperty` para refrescar inventory_count + PDF URLs).
 */
import { useCallback } from 'react';
import { useAppStore } from '../../shared/store/appStore';
import type { ToastType } from '../../shared/hooks/useToast';

type ShowToast = (message: string, type?: ToastType) => void;

interface CrudHandlersOptions {
  user: { uid: string } | null;
  showToast: ShowToast;
}

export function useCrudHandlers(opts: CrudHandlersOptions) {
  const { user, showToast } = opts;
  const addProperty = useAppStore((s) => s.addProperty);
  const updateProperty = useAppStore((s) => s.updateProperty);
  const addTenant = useAppStore((s) => s.addTenant);
  const updateTenant = useAppStore((s) => s.updateTenant);
  const removeTenant = useAppStore((s) => s.removeTenant);
  const addFinancialRecord = useAppStore((s) => s.addFinancialRecord);
  const updateFinancialRecord = useAppStore((s) => s.updateFinancialRecord);
  const removeFinancialRecord = useAppStore((s) => s.removeFinancialRecord);

  const handleAddProperty = useCallback(
    (newProperty: any) => {
      console.log(
        '[App] handleAddProperty — newProperty.id:',
        newProperty.id,
        'address:',
        newProperty.address,
      );
      const propertyWithId = {
        ...newProperty,
        id: newProperty.id ?? `prop-${Date.now()}`,
        createdAt: newProperty.createdAt ?? new Date().toISOString(),
        createdBy: newProperty.createdBy ?? user?.uid,
      };
      console.log('[App] addProperty al store con id:', propertyWithId.id);
      addProperty(propertyWithId);
      showToast('Propiedad guardada');

      // Refetch puntual para refrescar inventoryCount + PDF URLs.
      void fetch(`/api/properties/${propertyWithId.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((fresh) => {
          if (!fresh) return;
          const patch: Record<string, any> = {};
          if (fresh.inventory_count !== undefined)
            patch.inventoryCount = fresh.inventory_count;
          if (fresh.inventory_pdf_url)
            patch.inventoryPdfUrl = fresh.inventory_pdf_url;
          if (
            fresh.inventario_captacion_pdf_url ||
            fresh.inventory_captacion_pdf_url
          ) {
            patch.inventoryCaptacionPdfUrl =
              fresh.inventario_captacion_pdf_url ??
              fresh.inventory_captacion_pdf_url;
          }
          if (
            fresh.inventario_colocacion_pdf_url ||
            fresh.inventory_colocacion_pdf_url
          ) {
            patch.inventoryColocacionPdfUrl =
              fresh.inventario_colocacion_pdf_url ??
              fresh.inventory_colocacion_pdf_url;
          }
          if (Object.keys(patch).length > 0) {
            updateProperty(propertyWithId.id, patch);
          }
        })
        .catch((err) => {
          console.warn('[handleAddProperty] refetch puntual falló:', err);
          showToast(
            'La propiedad se guardó pero no se pudo refrescar el detalle. Reintentá desde el Detalle del Inmueble.',
            'warning',
          );
        });
    },
    [addProperty, updateProperty, showToast, user?.uid],
  );

  const handleUpdateProperty = useCallback(
    async (id: string, updates: any): Promise<boolean> => {
      try {
        await updateProperty(id, updates);
        showToast('Propiedad actualizada');
        return true;
      } catch {
        showToast(
          'Error al actualizar la propiedad. Reintentá en unos segundos.',
          'error',
        );
        return false;
      }
    },
    [updateProperty, showToast],
  );

  const handleUpdateTenant = useCallback(
    async (id: string, updates: any): Promise<boolean> => {
      const ok = await updateTenant(id, updates);
      if (ok) {
        showToast('Inquilino actualizado');
      } else {
        showToast(
          'Error al actualizar el inquilino. Reintentá en unos segundos.',
          'error',
        );
      }
      return ok;
    },
    [updateTenant, showToast],
  );

  const handleAddTenant = useCallback(
    (newTenant: any) => {
      const tenantWithId = {
        ...newTenant,
        id: newTenant.id ?? `tenant-${Date.now()}`,
        createdAt: newTenant.createdAt ?? new Date().toISOString(),
      };
      addTenant(tenantWithId);
      showToast('Inquilino registrado');
    },
    [addTenant, showToast],
  );

  const handleAddRecord = useCallback(
    (record: any) => {
      const recordWithId = { ...record, id: record.id ?? `fin-${Date.now()}` };
      addFinancialRecord(recordWithId);
      showToast('Registro financiero guardado');
    },
    [addFinancialRecord, showToast],
  );

  const handleDeleteTenant = useCallback(
    async (id: string) => {
      await removeTenant(id);
      showToast('Arrendatario eliminado');
    },
    [removeTenant, showToast],
  );

  const handleDeleteRecord = useCallback(
    (id: string) => {
      removeFinancialRecord(id);
      showToast('Registro eliminado');
    },
    [removeFinancialRecord, showToast],
  );

  const handleUpdateRecord = useCallback(
    (updatedRecord: any) => {
      const { id, ...data } = updatedRecord;
      updateFinancialRecord(id, data);
      showToast('Registro actualizado');
    },
    [updateFinancialRecord, showToast],
  );

  return {
    handleAddProperty,
    handleUpdateProperty,
    handleUpdateTenant,
    handleAddTenant,
    handleAddRecord,
    handleDeleteTenant,
    handleDeleteRecord,
    handleUpdateRecord,
  };
}