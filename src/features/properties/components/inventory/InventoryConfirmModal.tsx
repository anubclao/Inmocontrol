// filepath: src/features/properties/components/inventory/InventoryConfirmModal.tsx
/**
 * InventoryConfirmModal — modal que muestra el resumen del inventario antes
 * de finalizar. Se muestra en CUALQUIER return path (loading, config, editing)
 * para no perder el state del modal.
 *
 * Sale de StepInventory.tsx como parte del refactor #10 (commit 2/2).
 * Mantiene el copy exacto y el visual del original.
 */
import { Button, Modal } from "../../../../shared/ui";
import type { ResumenFinalizacion } from "./hooks/useInventoryState.types";

export interface InventoryConfirmModalProps {
  isOpen: boolean;
  resumen: ResumenFinalizacion | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function InventoryConfirmModal({
  isOpen,
  resumen,
  onClose,
  onConfirm,
}: InventoryConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen && !!resumen}
      onClose={onClose}
      title="Inventario completado — ¿Desea revisar antes de finalizar?"
    >
      {resumen && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-sm font-semibold text-emerald-900 mb-2">
              Resumen del inventario
            </p>
            <ul className="text-xs text-emerald-800 space-y-1">
              <li>
                • <strong>Áreas evaluadas:</strong> {resumen.areasConFotos} de{" "}
                {resumen.totalAreas}
              </li>
              <li>
                • <strong>Archivos:</strong> {resumen.totalMedia} (
                {resumen.totalPhotos} fotos de área + {resumen.totalItemMedia}{" "}
                fotos/videos de items)
              </li>
              <li>
                • <strong>Ítems evaluados:</strong>{" "}
                {resumen.totalItemsEvaluados}
              </li>
            </ul>
          </div>

          {resumen.areasSinFotos.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <p className="font-semibold mb-1">⚠️ Áreas sin foto:</p>
              <p>{resumen.areasSinFotos.map((a) => a.label).join(", ")}</p>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Al confirmar, el inventario se guardará en MySQL, se generará el PDF
            y se subirá a Google Drive (carpeta <code>Inventarios/</code> de la
            propiedad), junto con todas las fotos. La propiedad quedará en
            estado <strong>Activo</strong>.
          </p>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Revisar inventario
            </Button>
            <Button className="flex-1" onClick={() => void onConfirm()}>
              Sí, finalizar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
