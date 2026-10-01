// filepath: src/features/properties/components/StepDocs/modals/ConfirmContinueModal.tsx
// Modal de confirmacion antes de pasar al inventario.
//
// fix-issue-07 (FASE 4 Karpathy, oct-2026): extraido del componente
// principal StepDocs.tsx para mantenerlo <200 lineas.
//
// Migracion 011+: si faltan documentos requeridos, muestra la lista
// explicita + un checkbox de "Entiendo los pendientes" para que el
// user no se cuele por error.

import { AlertTriangle } from "lucide-react";
import { Button, Modal } from "../../../../../shared/ui";
import { labelForKey } from "../hooks/useDocCards";
import type { WizardOwner, WizardUnit } from "../../StepBasic";

interface RequiredSlot {
  slotKey: string;
}

interface ConfirmContinueModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  missingRequired: RequiredSlot[];
  owners: WizardOwner[];
  units: WizardUnit[];
}

export function ConfirmContinueModal({
  isOpen,
  onCancel,
  onConfirm,
  missingRequired,
  owners,
  units,
}: ConfirmContinueModalProps) {
  const hasMissing = missingRequired.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="¿Continuar al Inventario?">
      <div className="space-y-4">
        {hasMissing && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 space-y-2">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Vas a finalizar con {missingRequired.length} documento(s)
              pendiente(s)
            </p>
            <ul className="text-xs space-y-1 list-disc pl-5">
              {missingRequired.map((m) => (
                <li key={m.slotKey}>{labelForKey(m.slotKey, owners, units)}</li>
              ))}
            </ul>
            <p className="text-xs text-amber-800">
              La propiedad quedará en estado <strong>Pendiente</strong> y los
              docs faltantes se podrán subir después desde el{" "}
              <strong>Detalle del Inmueble</strong>.
            </p>
          </div>
        )}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
          <p>
            Una vez en el inventario no podrá modificar los documentos desde
            aquí.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Si después detecta un error en algún PDF, puede entrar al Detalle
            del Inmueble y reemplazarlo manualmente.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            {hasMissing ? "Subir los pendientes" : "Revisar documentos"}
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            {hasMissing
              ? `Sí, continuar con ${missingRequired.length} pendiente(s)`
              : "Sí, continuar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
