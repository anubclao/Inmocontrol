// filepath: src/features/tenants/modals/UploadAnotherDocModal.tsx
// Modal "¿Querés subir otro documento?" — se dispara después de CADA upload
// exitoso a un folder del tenant. Le da al agente la opción de encadenar
// varias hojas (ej: cara y respaldo de la cédula, varios recibos de pago)
// sin tener que volver a buscar el botón.
//
// Antes vivía inline en TenantsView.tsx (líneas 1900-1990). Extraído en
// fix-issue-06.

import { Plus } from "lucide-react";
import { Button, Modal } from "../../../shared/ui";
import type { DriveFolder } from "../types";

export interface UploadAnotherDocModalProps {
  isOpen: boolean;
  folder: DriveFolder | null;
  fileCount: number;
  onUploadAnother: (folder: DriveFolder) => void;
  onClose: () => void;
}

const FOLDER_LABELS: Record<DriveFolder, string> = {
  Cedula: "Cédula de Ciudadanía",
  Contrato: "Contrato de Arrendamiento",
  Recibos: "Recibos de Pago",
};

export function UploadAnotherDocModal({
  isOpen,
  folder,
  fileCount,
  onUploadAnother,
  onClose,
}: UploadAnotherDocModalProps) {
  if (!folder) return null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="¿Querés subir otro documento?"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Subiste <strong>1 archivo</strong> a{" "}
          <strong>{FOLDER_LABELS[folder]}</strong>.
        </p>
        <p className="text-xs text-slate-500">
          Si este documento tiene varias hojas (ej: cara y respaldo de la
          cédula, o varios recibos de pago), podés subir más archivos del mismo
          tipo acá mismo. Cuando termines, presioná{" "}
          <strong>"No, ya está"</strong> para volver a la lista.
        </p>
        <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
          <strong>Archivos en este folder:</strong> {fileCount}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            No, ya está
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={() => onUploadAnother(folder)}
          >
            <Plus className="w-3.5 h-3.5" />
            Sí, subir otro
          </Button>
        </div>
      </div>
    </Modal>
  );
}
