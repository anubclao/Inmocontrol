// filepath: src/features/properties/components/StepDocs/modals/UploadAnotherDocModal.tsx
// Modal que se dispara justo despues de que el padre termino de subir un
// PDF a un slot. Le da al agente la opcion de encadenar varias hojas
// (ej: 2 PDFs de cedula) sin tener que volver a buscar el slot.
//
// fix-issue-07 (FASE 4 Karpathy, oct-2026): extraido del componente
// principal StepDocs.tsx para mantenerlo <200 lineas.

import { Button, Modal } from "../../../../../shared/ui";
import { countInSlot, labelForKey } from "../hooks/useDocCards";
import type { WizardOwner, WizardUnit } from "../../StepBasic";
import type { RequiredSlot, UploadedDocsMap } from "../types";

interface UploadAnotherDocModalProps {
  isOpen: boolean;
  lastUploadedSlot: string | null;
  uploadedDocs: UploadedDocsMap;
  owners: WizardOwner[];
  units: WizardUnit[];
  onClose: () => void;
  onUploadAnother: (slotKey: string) => void;
}

export function UploadAnotherDocModal({
  isOpen,
  lastUploadedSlot,
  uploadedDocs,
  owners,
  units,
  onClose,
  onUploadAnother,
}: UploadAnotherDocModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="¿Querés subir otro documento?"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {lastUploadedSlot && (
            <>
              Subiste <strong>1 archivo</strong> a{" "}
              <strong>{labelForKey(lastUploadedSlot, owners, units)}</strong>.
            </>
          )}
        </p>
        <p className="text-xs text-slate-500">
          Si este documento tiene varias hojas (ej: cara y respaldo de la
          cédula, o varias páginas del RUT), podés subir más archivos del mismo
          tipo acá mismo. Cuando termines, presioná{" "}
          <strong>"No, ya está"</strong> para volver a la lista.
        </p>
        {lastUploadedSlot && (
          <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
            <strong>Archivos subidos hasta ahora:</strong>{" "}
            {countInSlot(uploadedDocs, lastUploadedSlot)}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            No, ya está
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={() => {
              if (lastUploadedSlot) onUploadAnother(lastUploadedSlot);
            }}
          >
            Sí, subir otro
          </Button>
        </div>
      </div>
    </Modal>
  );
}
