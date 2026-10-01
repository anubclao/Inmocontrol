// filepath: src/features/properties/components/SignatureStep.tsx
import { CheckCircle, FileText, Share2 } from "lucide-react";
import { Button } from "../../../shared/ui";
import { useSettingsStore } from "../../../shared/store/settingsStore";
import type { Inventory, Signature } from "../inventoryTypes";
import { useSignatureStep } from "./signatureStep/useSignatureStep";
import { SignerCard } from "./signatureStep/SignerCard";
import { LegalTextsCard } from "./signatureStep/LegalTextsCard";
import { SharePdfModal } from "./signatureStep/SharePdfModal";

interface SignatureStepProps {
  inventory: Inventory;
  propertyOwner?: string;
  propertyOwnerIdNumber?: string;
  tenantData?: {
    name: string;
    idNumber: string;
    email?: string;
    phone?: string;
  } | null;
  onSaveSignatures: (signatures: Signature[]) => void;
  onGeneratePDF: () => void;
  onBack: () => void;
}

export function SignatureStep({
  inventory,
  propertyOwner,
  propertyOwnerIdNumber,
  tenantData,
  onSaveSignatures,
  onGeneratePDF,
  onBack,
}: SignatureStepProps) {
  const profile = useSettingsStore((s) => s.profile);
  const {
    tenant,
    agent,
    legal,
    share,
    propertyLabel,
    isFinal,
    allValid,
    allNamesValid,
    missingReasons,
    handleFinish,
  } = useSignatureStep({
    inventory,
    propertyOwner,
    propertyOwnerIdNumber,
    tenantData,
    onSaveSignatures,
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">
          Firmas del Inventario {isFinal ? "Final" : "Inicial"}
        </h3>
        <p className="text-sm text-slate-500">
          Las partes firman en conformidad con el estado del inmueble descrito y
          los textos jurídicos adjuntos.
        </p>
      </div>

      {/* ── Textos jurídicos con aceptación obligatoria ───────────── */}
      <LegalTextsCard
        propertyLabel={propertyLabel}
        accepted={legal.accepted}
        onAcceptChange={legal.setAccepted}
        expanded={legal.expanded}
        onExpandedChange={legal.setExpanded}
      />

      {/* ── Firmante: Arrendatario ───────────────────────────────── */}
      <SignerCard
        title="Arrendatario"
        name={tenant.name}
        onName={tenant.setName}
        idNumber={tenant.idNumber}
        onIdNumber={tenant.setIdNumber}
        phone={tenant.phone}
        onPhone={tenant.setPhone}
        email={tenant.email}
        onEmail={tenant.setEmail}
        photo={tenant.photo}
        onPhoto={tenant.setPhoto}
        padRef={tenant.padRef}
        onValid={tenant.setValid}
        onFieldsValid={tenant.setFieldsValid}
        fileInputRef={tenant.fileInputRef}
        onUploadPhoto={tenant.onUploadPhoto}
        uploadLabel={tenant.uploadLabel}
      />

      {/* ── Firmante: Agente (representante de la agencia) ─────── */}
      <SignerCard
        title={`Agente (${profile.role || "Representante de la agencia"})`}
        name={agent.name}
        onName={agent.setName}
        idNumber={agent.idNumber}
        onIdNumber={agent.setIdNumber}
        phone={agent.phone}
        onPhone={agent.setPhone}
        email={agent.email}
        onEmail={agent.setEmail}
        photo={agent.photo}
        onPhoto={agent.setPhoto}
        padRef={agent.padRef}
        onValid={agent.setValid}
        onFieldsValid={agent.setFieldsValid}
        fileInputRef={agent.fileInputRef}
        onUploadPhoto={agent.onUploadPhoto}
        subtitle="Datos del usuario logueado en la aplicación."
        uploadLabel={agent.uploadLabel}
      />

      {/* Nota: Inventario de Colocación solo requiere 2 firmas
          (arrendatario + agente). La firma del propietario va en el
          Contrato de Mandato y en el Contrato de Arrendamiento, NO acá. */}

      {/* ── Banner con lo que falta para habilitar Guardar firmas ── */}
      {missingReasons.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">
            Para habilitar "Guardar firmas" te falta:
          </p>
          <ul className="text-sm text-amber-800 space-y-1 list-disc pl-5">
            {missingReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={onBack}>
          ← Volver al inventario
        </Button>
        <div className="flex-1" />
        <Button
          onClick={handleFinish}
          disabled={!allValid || !allNamesValid || !legal.accepted}
          className="gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Guardar firmas
        </Button>
        {inventory.signedAt && (
          <>
            <Button onClick={onGeneratePDF} variant="outline" className="gap-2">
              <FileText className="w-4 h-4" />
              Descargar PDF
            </Button>
            <Button onClick={() => share.setOpen(true)} className="gap-2">
              <Share2 className="w-4 h-4" />
              Compartir PDF firmado
            </Button>
          </>
        )}
      </div>

      {/* ── Modal de compartir ──────────────────────────────────── */}
      <SharePdfModal
        isOpen={share.open}
        onClose={() => share.setOpen(false)}
        inventory={inventory}
        signatures={inventory.signatures.length > 0 ? inventory.signatures : []}
      />
    </div>
  );
}
