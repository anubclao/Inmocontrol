// filepath: src/features/properties/components/signatureStep/useSignatureStep.ts
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import type { SignaturePadRef } from "../../SignaturePad";
import { compressImage } from "../../imageCompress";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import type { Inventory, Signature } from "../../inventoryTypes";
import { PROPERTY_TYPE_LABEL } from "./legalTexts";

export type TenantData = {
  name: string;
  idNumber: string;
  email?: string;
  phone?: string;
};

export interface SignerFormState {
  name: string;
  setName: (v: string) => void;
  idNumber: string;
  setIdNumber: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  photo: string | null;
  setPhoto: (v: string | null) => void;
  valid: boolean;
  setValid: (v: boolean) => void;
  fieldsValid: boolean;
  setFieldsValid: (v: boolean) => void;
  padRef: RefObject<SignaturePadRef | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUploadPhoto: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  uploadLabel?: string;
}

export interface UseSignatureStepArgs {
  inventory: Inventory;
  propertyOwner?: string;
  propertyOwnerIdNumber?: string;
  tenantData?: TenantData | null;
  onSaveSignatures: (signatures: Signature[]) => void;
}

export interface UseSignatureStepResult {
  tenant: SignerFormState;
  agent: SignerFormState;
  legal: {
    accepted: boolean;
    setAccepted: (v: boolean) => void;
    expanded: boolean;
    setExpanded: (v: boolean) => void;
  };
  share: {
    open: boolean;
    setOpen: (v: boolean) => void;
  };
  propertyLabel: string;
  isFinal: boolean;
  allValid: boolean;
  allNamesValid: boolean;
  missingReasons: string[];
  handleFinish: () => void;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Hook con todo el state + handlers del paso de firmas. Maneja 2 firmantes
 * (arrendatario + agente), textos jurídicos con accept obligatorio, y
 * la lógica de "Guardar firmas" (genera array de Signature con dataURLs).
 */
export function useSignatureStep({
  inventory,
  tenantData,
  onSaveSignatures,
}: UseSignatureStepArgs): UseSignatureStepResult {
  const profile = useSettingsStore((s) => s.profile);

  const tenantPad = useRef<SignaturePadRef>(null);
  const agentPad = useRef<SignaturePadRef>(null);
  const tenantFileInput = useRef<HTMLInputElement>(null);
  const agentFileInput = useRef<HTMLInputElement>(null);

  // ── Tenant state ──
  const [tenantName, setTenantName] = useState(
    tenantData?.name ?? inventory.tenantName ?? "",
  );
  const [tenantId, setTenantId] = useState(
    tenantData?.idNumber ?? inventory.tenantId ?? "",
  );
  const [tenantPhone, setTenantPhone] = useState(tenantData?.phone ?? "");
  const [tenantEmail, setTenantEmail] = useState(tenantData?.email ?? "");
  const [tenantPhoto, setTenantPhoto] = useState<string | null>(null);
  const [tenantValid, setTenantValid] = useState(false);
  const [tenantFieldsValid, setTenantFieldsValid] = useState(false);

  // ── Agent state ──
  const [agentName, setAgentName] = useState(
    inventory.agentName ?? profile.name,
  );
  const [agentId, setAgentId] = useState("");
  const [agentPhone, setAgentPhone] = useState(profile.phone);
  const [agentEmail, setAgentEmail] = useState(profile.email);
  const [agentPhoto, setAgentPhoto] = useState<string | null>(
    profile.photoDataUrl ?? null,
  );
  const [agentValid, setAgentValid] = useState(false);
  const [agentFieldsValid, setAgentFieldsValid] = useState(false);

  // ── Legal texts + share modal ──
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalExpanded, setLegalExpanded] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Sincronizar tenantData con el estado local cuando cambia (async).
  useEffect(() => {
    if (tenantData) {
      if (tenantData.name) setTenantName(tenantData.name);
      if (tenantData.idNumber) setTenantId(tenantData.idNumber);
      if (tenantData.phone) setTenantPhone(tenantData.phone);
      if (tenantData.email) setTenantEmail(tenantData.email);
    }
  }, [tenantData]);

  // Sincronizar agentPhoto con profile.photoDataUrl (caso: Settings carga async).
  useEffect(() => {
    if (!agentPhoto && profile.photoDataUrl) {
      setAgentPhoto(profile.photoDataUrl);
    }
  }, [profile.photoDataUrl, agentPhoto]);

  // ── Handlers ──
  const makePhotoUpload =
    (setter: (v: string | null) => void) =>
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const dataUrl = await compressImage(file);
      setter(dataUrl);
      if (e.target) e.target.value = "";
    };

  const handleFinish = () => {
    const tenantDataUrl = tenantPad.current?.toDataURL();
    const agentDataUrl = agentPad.current?.toDataURL();
    if (!tenantDataUrl || !agentDataUrl) return;

    const now = new Date().toISOString();
    const tenantSlug = slugify(tenantName.trim() || "arrendatario");
    const agentSlug = slugify(agentName.trim() || "agente");

    const signatures: Signature[] = [
      {
        signerName: tenantName.trim(),
        signerRole: "arrendatario",
        signerIdNumber: tenantId || undefined,
        signerPhone: tenantPhone || undefined,
        signerEmail: tenantEmail || undefined,
        signerPhotoDataUrl: tenantPhoto || undefined,
        signerPhotoName: tenantPhoto ? `${tenantSlug}_ARR_foto` : undefined,
        signatureName: `${tenantSlug}_ARR_firma`,
        dataUrl: tenantDataUrl,
        signedAt: now,
      },
      {
        signerName: agentName.trim(),
        signerRole: "agente",
        signerIdNumber: agentId || undefined,
        signerPhone: agentPhone || undefined,
        signerEmail: agentEmail || undefined,
        signerPhotoDataUrl: agentPhoto || undefined,
        signerPhotoName: agentPhoto ? `${agentSlug}_AG_foto` : undefined,
        signatureName: `${agentSlug}_AG_firma`,
        dataUrl: agentDataUrl,
        signedAt: now,
      },
    ];
    onSaveSignatures(signatures);
  };

  // ── Derived ──
  const isFinal = inventory.phase === "final";
  const allValid =
    tenantFieldsValid &&
    agentFieldsValid &&
    tenantValid &&
    agentValid &&
    !!tenantPhoto &&
    !!agentPhoto;
  const allNamesValid = !!tenantName.trim() && !!agentName.trim();

  const missingReasons = useMemo<string[]>(() => {
    const out: string[] = [];
    if (!tenantFieldsValid)
      out.push(
        "Revisá los datos del arrendatario (cédula/teléfono/correo/nombre)",
      );
    if (!agentFieldsValid)
      out.push("Revisá los datos del agente (cédula/teléfono/correo/nombre)");
    if (!tenantValid) out.push("Falta la firma del arrendatario");
    if (!agentValid) out.push("Falta la firma del agente");
    if (!tenantPhoto) out.push("Falta la foto del arrendatario");
    if (!agentPhoto) out.push("Falta la foto del agente");
    if (!legalAccepted) out.push("Aceptá los textos jurídicos");
    return out;
  }, [
    tenantFieldsValid,
    agentFieldsValid,
    tenantValid,
    agentValid,
    tenantPhoto,
    agentPhoto,
    legalAccepted,
  ]);

  const propertyLabel =
    PROPERTY_TYPE_LABEL[inventory.propertyType] ?? "inmueble";

  return {
    tenant: {
      name: tenantName,
      setName: setTenantName,
      idNumber: tenantId,
      setIdNumber: setTenantId,
      phone: tenantPhone,
      setPhone: setTenantPhone,
      email: tenantEmail,
      setEmail: setTenantEmail,
      photo: tenantPhoto,
      setPhoto: setTenantPhoto,
      valid: tenantValid,
      setValid: setTenantValid,
      fieldsValid: tenantFieldsValid,
      setFieldsValid: setTenantFieldsValid,
      padRef: tenantPad,
      fileInputRef: tenantFileInput,
      onUploadPhoto: makePhotoUpload(setTenantPhoto),
      uploadLabel: "Subir cédula (obligatorio)",
    },
    agent: {
      name: agentName,
      setName: setAgentName,
      idNumber: agentId,
      setIdNumber: setAgentId,
      phone: agentPhone,
      setPhone: setAgentPhone,
      email: agentEmail,
      setEmail: setAgentEmail,
      photo: agentPhoto,
      setPhoto: setAgentPhoto,
      valid: agentValid,
      setValid: setAgentValid,
      fieldsValid: agentFieldsValid,
      setFieldsValid: setAgentFieldsValid,
      padRef: agentPad,
      fileInputRef: agentFileInput,
      onUploadPhoto: makePhotoUpload(setAgentPhoto),
      uploadLabel: "Subir foto (obligatorio)",
    },
    legal: {
      accepted: legalAccepted,
      setAccepted: setLegalAccepted,
      expanded: legalExpanded,
      setExpanded: setLegalExpanded,
    },
    share: { open: shareModalOpen, setOpen: setShareModalOpen },
    propertyLabel,
    isFinal,
    allValid,
    allNamesValid,
    missingReasons,
    handleFinish,
  };
}
