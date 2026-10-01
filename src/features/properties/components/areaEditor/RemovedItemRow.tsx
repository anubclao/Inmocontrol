// filepath: src/features/properties/components/areaEditor/RemovedItemRow.tsx
import { AlertTriangle } from "lucide-react";

export interface RemovedItemRowProps {
  label: string;
  removalReason: string;
  onRestore: () => void;
}

/**
 * Fila colapsada de un item marcado como "no aplica en este inmueble".
 * Muestra el label tachado, el motivo, y un botón para restaurar el item
 * al inventario activo.
 */
export function RemovedItemRow({
  label,
  removalReason,
  onRestore,
}: RemovedItemRowProps) {
  return (
    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-amber-900 line-through">{label}</p>
        <p className="text-xs text-amber-700 italic">
          {removalReason || "No aplica en este inmueble"}
        </p>
      </div>
      <button
        type="button"
        onClick={onRestore}
        className="text-xs text-amber-700 hover:text-amber-900 font-semibold underline flex-shrink-0"
      >
        Restaurar
      </button>
    </div>
  );
}
