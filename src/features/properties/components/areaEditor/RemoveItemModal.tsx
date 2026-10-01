// filepath: src/features/properties/components/areaEditor/RemoveItemModal.tsx
import { Button, Input, Modal } from "../../../../shared/ui";

export interface RemoveItemModalState {
  itemId: string;
  label: string;
}

export interface RemoveItemModalProps {
  /** Estado del modal: `null` = cerrado. */
  state: RemoveItemModalState | null;
  /** Motivo opcional que el agente puede escribir antes de confirmar. */
  removalReason: string;
  onChangeReason: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal de confirmación para marcar un item como "no aplica en este
 * inmueble" (ej: este apto no tiene tina). Se muestra cuando el agente
 * hace click en la X de un item en AreaItemsChecklist.
 */
export function RemoveItemModal({
  state,
  removalReason,
  onChangeReason,
  onConfirm,
  onCancel,
}: RemoveItemModalProps) {
  return (
    <Modal
      isOpen={!!state}
      onClose={onCancel}
      title="¿Este item no aplica en este inmueble?"
      size="md"
    >
      {state && (
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            Vas a marcar <strong>{state.label}</strong> como "no aplica" en este
            inmueble.
            <br />
            <span className="text-xs text-amber-700">
              Úsalo cuando el item no existe físicamente (ej: este apto no tiene
              tina, no tiene horno, etc.). Quedará registrado en el PDF como
              excluido con tu motivo.
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Motivo (opcional)
            </label>
            <Input
              type="text"
              value={removalReason}
              onChange={(e) => onChangeReason(e.target.value)}
              placeholder="Ej: Este apartamento no tiene tina"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Cancelar
            </Button>
            <Button variant="danger" className="flex-1" onClick={onConfirm}>
              Sí, marcar como "no aplica"
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
