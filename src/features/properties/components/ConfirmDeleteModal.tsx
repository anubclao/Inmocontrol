/**
 * ConfirmDeleteModal — modal de confirmación para eliminar un inmueble.
 * Commit 2 #5c (spec #5c). Es JSX puro: recibe el pendingDelete,
 * handlers de cancel/confirm y flag `deleting`. Cero state interno.
 */
import { Trash2 } from "lucide-react";
import { Modal } from "../../../shared/ui";

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  property: any | null;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  property,
  deleting,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={deleting ? () => {} : onCancel} title="¿Eliminar inmueble?">
      {property && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-900">
              <p className="font-semibold">
                Esta acción NO se puede deshacer.
              </p>
              <p className="mt-1 text-red-800">
                Vas a eliminar <strong>{property.address}</strong> del
                sistema.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <strong>Se eliminará de la Base de Datos:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
              <li>El registro del inmueble y del propietario</li>
              <li>
                Cualquier documento legal (cédula, certificado, predial, rut)
                que se haya subido
              </li>
            </ul>
            <p className="mt-3">
              <strong>En Google Drive:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
              <li>
                Si la carpeta Drive está vacía, se manda a la papelera
                automáticamente
              </li>
              <li>
                Si tiene archivos subidos (mandato, predial, etc.),{" "}
                <em>la carpeta queda en Drive</em> como histórico — podés
                borrarla manual desde tu Drive
              </li>
            </ul>
          </div>

          <div className="flex gap-2 pt-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              data-testid="confirm-delete-property"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Eliminando…" : "Sí, eliminar"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}