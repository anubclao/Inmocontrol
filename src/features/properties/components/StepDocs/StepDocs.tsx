// filepath: src/features/properties/components/StepDocs/StepDocs.tsx
// Componente principal del segundo paso del wizard de propiedad.
//
// fix-issue-07 (FASE 4 Karpathy, oct-2026): extraido del monolito
// StepDocs.tsx (814 lineas). El shell queda con la UI pura (Card +
// titulo + acciones + 2 modales). La logica de slots/icons/helpers vive
// en `./hooks/useDocCards`. El sub-componente `DocCard` vive en
// `./DocCard`. La seccion de cards repetida vive en `./DocSection`.
// Los modales viven en `./modals/`. Los types viven en `./types`.
//
// Sin cambio funcional observable — paridad exacta con el original.

import { useState } from "react";
import { Users, FileText, FileSignature } from "lucide-react";
import { Button, Card, Input, Modal } from "../../../../shared/ui";
import {
  buildRequiredSlots,
  countInSlot,
  labelForKey,
} from "./hooks/useDocCards";
import { DocSection } from "./DocSection";
import { ConfirmContinueModal } from "./modals/ConfirmContinueModal";
import { UploadAnotherDocModal } from "./modals/UploadAnotherDocModal";
import type { StepDocsProps } from "./types";

export function StepDocs({
  owners,
  units,
  uploadedDocs,
  setUploadedDocs,
  uploadingDoc,
  ownerIdNumber,
  setOwnerIdNumber,
  setViewingDoc,
  showToast,
  onBack,
  onContinue,
  triggerFileInput,
  onSaveDraft,
  lastUploadedSlot,
  setLastUploadedSlot,
}: StepDocsProps) {
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);
  const [confirmContinue, setConfirmContinue] = useState(false);

  const slots = buildRequiredSlots(owners, units);
  const missingRequired = slots.filter(
    (s) => s.required && countInSlot(uploadedDocs, s.slotKey) === 0,
  );
  const ownerSlots = slots.filter((s) => s.group === "owner");
  const unitSlots = slots.filter((s) => s.group === "unit");
  const propertySlots = slots.filter((s) => s.group === "property");

  const removeFileFromSlot = (slotKey: string, index: number) => {
    const current = uploadedDocs[slotKey] ?? [];
    const next = current.filter((_, i) => i !== index);
    setUploadedDocs({ ...uploadedDocs, [slotKey]: next });
    showToast(`Archivo quitado de ${labelForKey(slotKey, owners, units)}`);
  };

  return (
    <Card className="p-8">
      <h3 className="font-bold text-lg mb-2">2. Carga de Documentos Legales</h3>
      <p className="text-xs text-slate-500 mb-6">
        Subí los documentos por propietario y por unidad.{" "}
        <strong>Todos los documentos son opcionales</strong>: podés subir los
        que tengas a mano y completar el resto después desde el Detalle del
        Inmueble.
      </p>

      <DocSection
        title="Documentos de Propietarios"
        Icon={Users}
        slots={ownerSlots}
        uploadedDocs={uploadedDocs}
        uploadingDoc={uploadingDoc}
        owners={owners}
        units={units}
        triggerFileInput={triggerFileInput}
        removeFileFromSlot={removeFileFromSlot}
        setViewingDoc={setViewingDoc}
      />
      <DocSection
        title="Certificados de Tradición y Libertad"
        Icon={FileText}
        slots={unitSlots}
        uploadedDocs={uploadedDocs}
        uploadingDoc={uploadingDoc}
        owners={owners}
        units={units}
        triggerFileInput={triggerFileInput}
        removeFileFromSlot={removeFileFromSlot}
        setViewingDoc={setViewingDoc}
      />
      <DocSection
        title="Documentos de la Propiedad"
        Icon={FileSignature}
        slots={propertySlots}
        uploadedDocs={uploadedDocs}
        uploadingDoc={uploadingDoc}
        owners={owners}
        units={units}
        checkMandato
        triggerFileInput={triggerFileInput}
        removeFileFromSlot={removeFileFromSlot}
        setViewingDoc={setViewingDoc}
      />

      {/* ── Acciones ── */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Atrás
        </Button>
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => {
            // El padre (PropertiesView) muestra el toast honesto tras
            // ensurePropertyPersisted(). NO disparamos un toast mentiroso
            // acá (sería un segundo toast contradictorio — fix de bug
            // reportado el 2026-08-05).
            onSaveDraft();
          }}
        >
          💾 Guardar avance (este equipo)
        </Button>
        <Button className="flex-1" onClick={() => setConfirmContinue(true)}>
          {missingRequired.length > 0
            ? `Continuar con ${missingRequired.length} pendiente(s)`
            : "Continuar a Inventario"}
        </Button>
      </div>

      <ConfirmContinueModal
        isOpen={confirmContinue}
        missingRequired={missingRequired}
        owners={owners}
        units={units}
        onCancel={() => setConfirmContinue(false)}
        onConfirm={() => {
          setConfirmContinue(false);
          onContinue();
        }}
      />

      <Modal
        isOpen={isIdModalOpen}
        onClose={() => setIsIdModalOpen(false)}
        title="Número de Cédula de Ciudadanía"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Ingrese el número de identificación del propietario.
          </p>
          <Input
            label="Número de Cédula"
            placeholder="Ej: 1.023.456.789"
            value={ownerIdNumber}
            onChange={(e) => setOwnerIdNumber(e.target.value)}
          />
          <Button
            className="w-full mt-6"
            onClick={() => {
              if (!ownerIdNumber) {
                showToast("Debe ingresar el número de cédula", "error");
                return;
              }
              setIsIdModalOpen(false);
            }}
          >
            Guardar y Continuar
          </Button>
        </div>
      </Modal>

      <UploadAnotherDocModal
        isOpen={!!lastUploadedSlot}
        lastUploadedSlot={lastUploadedSlot}
        uploadedDocs={uploadedDocs}
        owners={owners}
        units={units}
        onClose={() => setLastUploadedSlot(null)}
        onUploadAnother={(slotKey) => {
          triggerFileInput(slotKey);
          setLastUploadedSlot(null);
        }}
      />

      {/* Botón oculto para tests E2E. */}
      <Button
        style={{ display: "none" }}
        data-testid="open-id-modal"
        onClick={() => setIsIdModalOpen(true)}
      >
        Abrir modal de cédula
      </Button>
    </Card>
  );
}
