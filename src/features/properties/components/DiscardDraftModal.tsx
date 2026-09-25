/**
 * DiscardDraftModal — confirmación antes de descartar el draft del wizard.
 *
 * Commit 4 del refactor #5b (spec #5b, verifier #5b). Sale del monolito
 * `PropertiesView.tsx`. Copy preservado pixel-perfect.
 *
 * El botón "Sí, descartar borrador" invoca `onConfirm` (que es `discardDraft`
 * en el shell, async; borra el draft + la propiedad persistida si la hay).
 *
 * Si `hasPersistedProperty` es true, el modal adapta el copy para advertir
 * sobre la eliminación de la fila MySQL huérfana (per EC-4 del spec).
 */

import { Button, Modal } from "../../../shared/ui";

export interface DiscardDraftModalProps {
  isOpen: boolean;
  /**
   * Si true → la propiedad YA fue persistida en MySQL (Option B). El
   * botón de confirmar también la borrará del server. Si false → solo
   * limpiamos el state local.
   */
  hasPersistedProperty: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DiscardDraftModal({
  isOpen,
  hasPersistedProperty,
  onConfirm,
  onCancel,
}: DiscardDraftModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="¿Descartar el borrador?" size="md">
      <div className="space-y-4">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-900">
          <p className="font-semibold mb-1">
            Vas a perder todo el progreso actual del wizard.
          </p>
          <p className="text-xs text-red-700">
            Se borran: dirección, CHIP, folio, propietarios, unidades, archivos
            subidos, fotos del inventario y observaciones. Esta acción no se
            puede deshacer.
          </p>
          {hasPersistedProperty && (
            <p className="text-xs text-red-700 mt-2 font-semibold">
              Adicionalmente, se borrará la fila huérfana en MySQL (la
              propiedad ya fue persistida al pasar al paso 2).
            </p>
          )}
        </div>
        <p className="text-sm text-slate-600">
          Si solo querés cerrar el wizard y volver después, usá el botón
          <span className="font-semibold">
            {" "}
            "← Ver Inmuebles (guardar borrador)"{" "}
          </span>
          en la parte superior. El borrador se preserva automáticamente.
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm}>
            Sí, descartar borrador
          </Button>
        </div>
      </div>
    </Modal>
  );
}