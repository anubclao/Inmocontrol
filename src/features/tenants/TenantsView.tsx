import { useState, type ChangeEvent } from "react";
import { motion } from "motion/react";
import {
  Edit,
  Eye,
  Plus,
  Search,
  User,
  Phone,
  Mail,
  FileText,
  FileSignature,
  Trash2,
  X,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button, Card, Input, Modal } from "../../shared/ui";
import { ProcessOrderBanner } from "../../shared/ui/ProcessOrderBanner";
import { StepInventory } from "../properties/components/StepInventory";
import { inventoryDB } from "../properties/inventoryDB";
import { formatCurrency } from "../../utils/calculations";
import { formatIdNumber, formatTenantName } from "../../utils/validators";
import { Role } from "../auth/permissions";
import { ActaEntregaModal } from "./ActaEntregaModal";
import { createContractServer } from "../contracts/contractApi";
import { useContractStore } from "../contracts/contractStore";
import { BillingSetupWizard } from "../billing/components/BillingSetupWizard";
import type { Contract } from "../contracts/contractTypes";
import {
  fetchWithTimeout,
  TimeoutError,
} from "../../shared/lib/fetchWithTimeout";

export interface Tenant {
  id: string;
  name: string;
  idNumber: string;
  email?: string;
  phone?: string;
  propertyId: string;
  rent: number;
  adminFee?: number;
  status: "Activo" | "Inactivo";
  leaseStartDate: string;
  documents?: string[];
  tenantDriveFolderId?: string | null;
}

export interface TenantsViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
  tenants: Tenant[];
  properties: any[];
  onAddTenant: (tenant: any) => void;
  /** Devuelve `true` si el PATCH OK, `false` si falló. El modal de edición
   *  usa el return para mostrar el toast correcto. */
  onUpdateTenant: (id: string, updates: any) => Promise<boolean>;
  onDeleteTenant: (id: string) => Promise<void>;
  onUpdateProperty: (id: string, updates: any) => Promise<boolean>;
  role: Role | null;
}

export function TenantsView({
  showToast,
  tenants,
  properties,
  onAddTenant,
  onUpdateTenant,
  onDeleteTenant,
  onUpdateProperty,
}: TenantsViewProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [viewingTenant, setViewingTenant] = useState<any>(null);

  const openTenantDetail = (tenant: any) => {
    // Inicializar el uploadStatus con folders vacíos (no {} como antes) para
    // que la UI pueda mostrar "0 archivos" en cada folder desde el primer render.
    setUploadStatus({
      Cedula: { files: [] },
      Contrato: { files: [] },
      Recibos: { files: [] },
    });
    setActaStatus(null);
    setLastUploadedFolder(null);
    setViewingTenant(tenant);
    // Pre-cargar el estado de Drive para este tenant consultando los archivos
    // que ya existen en su carpeta Cedula/. Esto hace que la cédula "subida"
    // sobreviva un refresh de la página (mientras el archivo siga en Drive).
    void refreshCedulaStatus(tenant);
    void refreshActaStatus(tenant);
  };

  /**
   * Asegura que el tenant tenga carpeta en Drive. Si ya la tiene, devuelve
   * el ID sin tocar la red. Si NO la tiene (caso de tenants creados sin
   * Drive conectado, o con creación de carpeta que falló silenciosamente),
   * llama al backend para crearla on-demand y actualiza el estado local
   * para que el botón "Abrir Inventario de Colocación" se habilite.
   *
   * Devuelve el `tenantDriveFolderId` o `null` si falló.
   *
   * FIX Karpathy (jul-2026): agregamos `silent` para que las llamadas de
   * background (refreshCedulaStatus, refreshActaStatus) NO muestren el
   * toast rojo gritón. El DriveStatusBanner persistente arriba del
   * contenido ya muestra el mensaje correcto cuando Drive está
   * desconectado. Solo las llamadas user-initiated (handleDocUpload,
   * ActaEntregaModal) deben mostrar toast.
   */
  const ensureTenantDriveFolder = async (
    tenant: any,
    silent = false,
  ): Promise<string | null> => {
    if (!tenant?.id) return null;
    if (tenant.tenantDriveFolderId) return tenant.tenantDriveFolderId;
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(tenant.id)}/ensure-drive-folder`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) {
          showToast(
            data?.error ??
              "No se pudo crear la carpeta del arrendatario en Drive",
            "error",
          );
        } else {
          console.warn(
            "[tenants] ensure-drive-folder failed (silent):",
            data?.error ?? res.status,
          );
        }
        return null;
      }
      const newFolderId = data.tenantDriveFolderId as string;
      // Reflejar el nuevo folderId en el tenant local para que los próximos
      // reads (handleDocUpload, refreshActaStatus, render del botón) lo vean.
      setViewingTenant((prev: any) =>
        prev?.id === tenant.id
          ? { ...prev, tenantDriveFolderId: newFolderId }
          : prev,
      );
      if (data.created && !silent) {
        showToast("Carpeta de Drive creada para el arrendatario", "success");
      }
      return newFolderId;
    } catch (e) {
      console.warn("[tenants] ensure-drive-folder failed:", e);
      if (!silent) {
        showToast("Error de conexión al preparar Drive", "error");
      }
      return null;
    }
  };

  /**
   * Consulta Drive para ver si este tenant ya tiene archivos en su carpeta
   * Cedula/. Hidratamos la lista COMPLETA (no solo el primero) para que la UI
   * muestre todos los archivos que el agente subió previamente, no solo uno.
   *
   * FIX Karpathy (jul-2026): `silent: true` en ensureTenantDriveFolder para
   * que el toast rojo 'No hay conexión con Google Drive' NO se dispare
   * cuando el user abre el Detalle. El DriveStatusBanner persistente arriba
   * del contenido ya muestra el mensaje correcto. Solo las acciones
   * user-initiated (subir doc, generar acta) muestran el toast.
   */
  const refreshCedulaStatus = async (tenant: any) => {
    const folderId = await ensureTenantDriveFolder(tenant, true);
    if (!folderId) return;
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(tenant.id)}/documents?folder=Cedula`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const files: any[] = data.files ?? [];
      if (files.length > 0) {
        setUploadStatus((s) => ({
          ...s,
          Cedula: {
            files: files.map((f: any) => ({
              name: f.name ?? "Archivo",
              link: f.webViewLink,
              webViewLink: f.webViewLink,
              fileId: f.id,
            })),
          },
        }));
      }
    } catch (e) {
      // Si falla, no importa — el usuario puede subir la cédula desde la UI.
      console.warn("[cedula] refresh status failed:", e);
    }
  };

  /** Misma idea que refreshCedulaStatus pero para el Acta de Entrega.
   *  FIX Karpathy (jul-2026): `silent: true` — ver refreshCedulaStatus. */
  const refreshActaStatus = async (tenant: any) => {
    const folderId = await ensureTenantDriveFolder(tenant, true);
    if (!folderId) return;
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(tenant.id)}/documents?folder=Acta`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const files: any[] = data.files ?? [];
      if (files.length > 0) {
        setActaStatus({
          fileId: files[0].id,
          webViewLink: files[0].webViewLink,
        });
      }
    } catch (e) {
      console.warn("[acta] refresh status failed:", e);
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  /** Estado de subida por folder del tenant. Ahora soporta N archivos por folder
   *  (antes: solo 1, vía `success/link`). Un folder puede tener varios PDFs:
   *  ej: cara y respaldo de la cédula, varios recibos. */
  const [uploadStatus, setUploadStatus] = useState<
    Record<
      string,
      {
        uploading?: boolean;
        files: Array<{
          name: string;
          link?: string;
          webViewLink?: string;
          fileId?: string;
        }>;
      }
    >
  >({});
  const [placementInventoryOpen, setPlacementInventoryOpen] = useState(false);
  const [placementProperty, setPlacementProperty] = useState<any>(null);
  const [placementBaseInventory, setPlacementBaseInventory] =
    useState<any>(null);
  const [actaModalOpen, setActaModalOpen] = useState(false);
  const [actaStatus, setActaStatus] = useState<{
    fileId?: string;
    webViewLink?: string;
  } | null>(null);
  /** FIX Karpathy (jul-2026): al firmar el Inventario de Colocación, abrimos
   *  el wizard de billing para que el agente configure la BillingPolicy +
   *  genere la amortización sin tener que ir manualmente al BillingPanel. */
  const [billingWizardContract, setBillingWizardContract] =
    useState<Contract | null>(null);
  /** Folder al que el agente acaba de subir un PDF exitosamente. Cuando se
   *  setea, abrimos el modal "¿Querés subir otro documento?" para que pueda
   *  encadenar varias hojas (ej: 2 PDFs de cédula). */
  const [lastUploadedFolder, setLastUploadedFolder] = useState<
    "Cedula" | "Contrato" | "Recibos" | null
  >(null);
  /** Estado del modal "¿subir otro?" para re-disparar el file picker. */
  const [pendingFolderForAnother, setPendingFolderForAnother] = useState<
    "Cedula" | "Contrato" | "Recibos" | null
  >(null);

  // Confirmación de borrado de tenant (usado para limpiar duplicados).
  const [tenantToDelete, setTenantToDelete] = useState<any>(null);
  const [deletingTenant, setDeletingTenant] = useState(false);

  const handleConfirmDeleteTenant = async () => {
    if (!tenantToDelete) return;
    setDeletingTenant(true);
    try {
      const deletedPropertyId = tenantToDelete.propertyId;
      await onDeleteTenant(tenantToDelete.id);

      // Si era el último tenant activo de esa propiedad, reseteamos el status
      // del property para que vuelva a estar disponible para arrendar.
      const remainingActiveForProp = tenants.filter(
        (x: any) =>
          x.id !== tenantToDelete.id &&
          x.propertyId === deletedPropertyId &&
          x.status === "Activo",
      );
      if (remainingActiveForProp.length === 0 && deletedPropertyId) {
        onUpdateProperty(deletedPropertyId, { status: "Pendiente" });
      }

      showToast(`Arrendatario ${tenantToDelete.name} eliminado`, "success");
      setViewingTenant(null);
      setUploadStatus({});
      setTenantToDelete(null);
    } catch (e: any) {
      showToast(e?.message ?? "No se pudo eliminar el arrendatario", "error");
    } finally {
      setDeletingTenant(false);
    }
  };

  // Create form state
  const [form, setForm] = useState({
    name: "",
    idNumber: "",
    email: "",
    phone: "",
    propertyId: "",
    rent: "",
    adminFee: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  // FIX 2026-07-22: loading state para que el modal muestre "Guardando..."
  // mientras el POST corre. Sin esto, el modal se cierra antes de que el
  // server responda y el usuario no sabe si el guardado fue OK o no.
  const [creatingTenant, setCreatingTenant] = useState(false);

  // Formato colombiano del celular: 3001234567 -> 300 123 4567
  const formatColombianPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  };

  // Filter tenants by search
  const filteredTenants = tenants.filter((t: Tenant) => {
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.idNumber.includes(q) ||
      (t.email && t.email.toLowerCase().includes(q)) ||
      (t.phone && t.phone.includes(q))
    );
  });

  // Only show available properties (not rented AND not in placement process).
  // "En Colocación" = ya tiene arrendatario pero el inventario de colocación
  // aún no está firmado, así que tampoco debe poder asignársele otro inquilino.
  const availableProperties = properties.filter(
    (p: any) => p.status !== "Arrendado" && p.status !== "En Colocación",
  );

  // Defensa adicional contra duplicados: aunque el status del property diga
  // "Pendiente"/"Activo" pero ya exista un tenant Activo apuntando a este
  // propertyId (caso de bug histórico o edición manual del status), también
  // lo bloqueamos acá. Esto es lo que evita el bug "2 DARY SEGURA en la misma
  // propiedad" que viste en el screenshot.
  const propertyIdsWithActiveTenant = new Set(
    tenants
      .filter((t: any) => t.status === "Activo" && t.propertyId)
      .map((t: any) => t.propertyId),
  );
  const isPropertyAvailable = (p: any) =>
    availableProperties.some((x: any) => x.id === p.id) &&
    !propertyIdsWithActiveTenant.has(p.id);

  const getPropertyAddress = (propertyId: string) => {
    const p = properties.find((x: any) => x.id === propertyId);
    return p ? p.address : "—";
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    const name = String(form.name ?? "").trim();
    const idNumber = String(form.idNumber ?? "");
    const email = String(form.email ?? "").trim();
    const phone = String(form.phone ?? "");
    const propertyId = String(form.propertyId ?? "");
    const rent = String(form.rent ?? "");
    const adminFee = String(form.adminFee ?? "");

    if (!name) {
      errors.name = "El nombre es obligatorio";
    }

    const cleanId = idNumber.replace(/[^0-9]/g, "");
    if (!idNumber || cleanId.length < 6) {
      errors.idNumber = "La cédula debe tener al menos 6 dígitos";
    } else if (
      tenants.some(
        (t: Tenant) => (t.idNumber ?? "").replace(/[^0-9]/g, "") === cleanId,
      )
    ) {
      errors.idNumber = "Ya existe un arrendatario con esta cédula";
    }

    // Email: obligatorio + formato válido (caso típico: falta el @)
    if (!email) {
      errors.email = "El correo electrónico es obligatorio";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Correo inválido (ej: nombre@dominio.com)";
    }

    // Celular colombiano: obligatorio + exactamente 10 dígitos
    const cleanPhone = phone.replace(/\D/g, "");
    if (!phone.trim()) {
      errors.phone = "El celular es obligatorio";
    } else if (cleanPhone.length !== 10) {
      errors.phone = `El celular debe tener 10 dígitos (tiene ${cleanPhone.length})`;
    } else if (!cleanPhone.startsWith("3")) {
      errors.phone = "Celular colombiano debe iniciar con 3";
    }

    if (!propertyId) {
      errors.propertyId = "Selecciona un inmueble";
    }

    // Canon mensual: obligatorio, en pesos COP, > 0
    const cleanRent = rent.replace(/[^0-9]/g, "");
    const rentValue = cleanRent ? parseInt(cleanRent, 10) : 0;
    if (!rent.trim() || rentValue <= 0) {
      errors.rent = "Ingresa el canon mensual en pesos (COP)";
    }

    // Cuota de administración: opcional; si se ingresa, debe ser un monto válido en COP
    if (adminFee.trim()) {
      const cleanAdminFee = adminFee.replace(/[^0-9]/g, "");
      if (!cleanAdminFee) {
        errors.adminFee = "Ingresa la cuota en pesos (COP) — solo números";
      } else if (parseInt(cleanAdminFee, 10) < 0) {
        errors.adminFee = "La cuota no puede ser negativa";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAskCreate = () => {
    if (!validateForm()) return;
    setConfirmCreateOpen(true);
  };

  const handleConfirmAndCreate = async () => {
    // FIX 2026-07-22: NO cerrar el modal inmediatamente. Si lo cerramos
    // antes de que el POST termine y el server tarda (ej: Drive está
    // lento), el usuario ve el modal desaparecer y piensa "no se guardó"
    // cuando en realidad el request sigue corriendo. Ahora mostramos un
    // loading state en el mismo modal y solo cerramos cuando hay éxito
    // (o mostramos el error manteniendo el modal abierto).
    const selectedProperty = properties.find(
      (p: any) => p.id === form.propertyId,
    );
    const rentValue =
      parseFloat(String(form.rent ?? "").replace(/[^0-9]/g, "")) || 0;
    const today = new Date().toISOString().split("T")[0];

    // Pre-check local antes de pegar al server (UX: feedback instantáneo).
    if (propertyIdsWithActiveTenant.has(form.propertyId)) {
      showToast(
        "Este inmueble ya tiene un arrendatario activo. Finaliza ese contrato primero.",
        "error",
      );
      return;
    }

    setCreatingTenant(true); // ← loading state en el modal
    try {
      // Timeout agresivo: si el server no responde en 15s, abortamos.
      // El server tiene 8s de timeout en Drive + 1-2s en DB → 15s es
      // generoso. Si pasa, el modal sigue abierto con error claro.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      let res: Response;
      try {
        res = await fetch("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: form.propertyId,
            propertyDriveFolderId: selectedProperty?.driveFolderId || null,
            propertyAddress: selectedProperty?.address,
            name: formatTenantName(form.name),
            idNumber: formatIdNumber(form.idNumber),
            email: form.email,
            phone: form.phone,
            rent: rentValue,
            adminFee:
              parseFloat(String(form.adminFee ?? "").replace(/[^0-9]/g, "")) ||
              0,
            leaseStartDate: today,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await res.json();
      if (!res.ok) {
        // 409 = el server detectó el duplicado (defensa en profundidad)
        if (res.status === 409) {
          showToast(
            data.error || "Este inmueble ya tiene un arrendatario activo",
            "error",
          );
        } else {
          showToast(data.error || "Error al crear arrendatario", "error");
        }
        setCreatingTenant(false); // ← modal sigue abierto para que el user corrija
        return;
      }

      // Guardar también en el store (Zustand) para la UI local
      onAddTenant({
        id: data.tenantId,
        name: formatTenantName(form.name),
        idNumber: formatIdNumber(form.idNumber),
        email: form.email,
        phone: form.phone,
        propertyId: form.propertyId,
        rent: rentValue,
        status: "Activo",
        leaseStartDate: today,
        tenantDriveFolderId: data.tenantDriveFolderId || null,
      });

      // Si el backend creó carpeta del inmueble, guardar el id en la propiedad
      // Status "En Colocación": ya tiene arrendatario pero el inventario de
      // colocación todavía no está firmado. Pasará a "Arrendado" cuando se
      // firme el Inventario de Colocación (en el wizard de StepInventory).
      const propUpdate: any = { status: "En Colocación" };
      if (data.propertyDriveFolderId && !selectedProperty?.driveFolderId) {
        propUpdate.driveFolderId = data.propertyDriveFolderId;
      }
      // BUG-023: el PATCH a la propiedad puede fallar. Antes era fire-and-forget
      // y dejaba el tenant creado en MySQL pero la propiedad sin actualizar,
      // con toast mentiroso de éxito. Ahora esperamos el resultado:
      // - Si OK: cerrar modal, resetear form, mostrar toast de éxito.
      // - Si falla: NO cerrar el modal, mostrar toast de warning. El tenant
      //   ya existe en MySQL (no lo podemos "descrear"); el user puede
      //   reintentar el PATCH desde el módulo Properties o reintentar
      //   el wizard completo (el 409 lo bloquea preventivamente).
      const propertyUpdated = await onUpdateProperty(
        form.propertyId,
        propUpdate,
      );
      if (!propertyUpdated) {
        // BUG-023: el tenant SÍ se creó en MySQL pero la propiedad quedó sin
        // actualizar. Mostramos error (toast system solo soporta success|error)
        // para que el user lo note. El modal sigue abierto para que pueda
        // decidir si reintenta o cancela (el tenant creado quedará visible en
        // la lista — no se "deshace" mágicamente).
        showToast(
          "Inquilino creado pero la propiedad no se pudo actualizar a 'En Colocación'. Reintentá desde el módulo Propiedades.",
          "error",
        );
        // Salimos sin resetear form ni cerrar modal para que el user note
        // que algo falló. El modal sigue abierto con los datos.
        setCreatingTenant(false);
        return;
      }
      showToast(
        (data.message || "Arrendatario creado") +
          " — completa el Inventario de Colocación para activar la propiedad",
      );
      setForm({
        name: "",
        idNumber: "",
        email: "",
        phone: "",
        propertyId: "",
        rent: "",
        adminFee: "",
      });
      setFormErrors({});
      setIsCreateModalOpen(false);
    } catch (err: any) {
      console.error(err);
      if (err?.name === "AbortError") {
        showToast(
          "El servidor tardó demasiado. Reintentá en unos segundos.",
          "error",
        );
      } else {
        showToast("Error de conexión con el servidor", "error");
      }
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleIdNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatIdNumber(raw);
    setForm((f) => ({ ...f, idNumber: formatted }));
    // Clear error on change
    if (formErrors.idNumber) {
      const cleanId = raw.replace(/[^0-9]/g, "");
      const exists = tenants.some(
        (t: Tenant) => t.idNumber.replace(/[^0-9]/g, "") === cleanId,
      );
      if (!exists) {
        setFormErrors((e) => ({ ...e, idNumber: "" }));
      }
    }
  };

  const handleCloseCreate = () => {
    setForm({
      name: "",
      idNumber: "",
      email: "",
      phone: "",
      propertyId: "",
      rent: "",
      adminFee: "",
    });
    setFormErrors({});
    setIsCreateModalOpen(false);
  };

  const openPlacementInventory = async (tenant: any) => {
    const prop = properties.find((p: any) => p.id === tenant.propertyId);
    if (!prop) {
      showToast("No se encontró el inmueble", "error");
      return;
    }

    // Cargar inventario inicial de la propiedad desde IndexedDB
    const inicialId = `${tenant.propertyId}:inicial`;
    const inicial = await inventoryDB.getInventory(inicialId);

    setPlacementProperty(prop);
    setPlacementBaseInventory(inicial ?? null);
    setPlacementInventoryOpen(true);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /** Sube un PDF al folder de Drive del tenant. Soporta N archivos por folder
   *  (antes solo 1): cada upload agrega un item a `files[]` en lugar de
   *  pisar el anterior. Después de subir, dispara el modal "¿Querés subir
   *  otro documento?" para que el agente pueda encadenar varias hojas. */
  const handleDocUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    folder: "Cedula" | "Contrato" | "Recibos",
    tenant: any,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Auto-recuperación: si el tenant no tiene carpeta en Drive (caso legacy
    // o creación sin Drive), se crea on-demand vía /ensure-drive-folder
    // antes de subir. Así nadie queda atrapado en el bucle "no podés subir
    // porque no hay carpeta, y no podés crear carpeta porque no podés subir".
    const folderId = await ensureTenantDriveFolder(tenant);
    if (!folderId) {
      // El helper ya mostró el toast de error correspondiente.
      return;
    }
    // Trabajamos siempre con el folderId fresco (puede haber cambiado).
    const tenantWithFolder = { ...tenant, tenantDriveFolderId: folderId };

    setUploadStatus((s) => ({
      ...s,
      [folder]: { ...(s[folder] ?? { files: [] }), uploading: true },
    }));

    try {
      const base64 = await fileToBase64(file);
      const fileName = `${folder}_${new Date().toISOString().slice(0, 10)}_${file.name}`;

      // BUG-022: timeout 30s para uploads (más generoso que el default 15s).
      // Sin esto, si Drive está lento, el fetch puede colgar 5min.
      const res = await fetchWithTimeout(
        "/api/tenants/upload-document",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantDriveFolderId: tenantWithFolder.tenantDriveFolderId,
            folder,
            fileName,
            base64Data: base64,
          }),
        },
        30_000,
      );

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Error subiendo documento", "error");
        setUploadStatus((s) => ({
          ...s,
          [folder]: { ...(s[folder] ?? { files: [] }), uploading: false },
        }));
        return;
      }

      // Append el nuevo archivo al array (no pisar anteriores).
      setUploadStatus((s) => {
        const current = s[folder] ?? { files: [] };
        return {
          ...s,
          [folder]: {
            uploading: false,
            files: [
              ...current.files,
              {
                name: fileName,
                link: data.webViewLink,
                webViewLink: data.webViewLink,
                fileId: data.fileId,
              },
            ],
          },
        };
      });
      showToast(`Documento subido a ${folder}/ en Google Drive`);
      // Disparar el modal "¿Querés subir otro?" después de un upload exitoso.
      setLastUploadedFolder(folder);
    } catch (err: any) {
      console.error(err);
      // BUG-022: distinguir timeout de error genérico.
      if (err instanceof TimeoutError) {
        showToast("La subida tardó más de 30s. Reintentá.", "error");
      } else {
        showToast("Error de conexión al subir documento", "error");
      }
      setUploadStatus((s) => ({
        ...s,
        [folder]: { ...(s[folder] ?? { files: [] }), uploading: false },
      }));
    }

    // Reset file input
    e.target.value = "";
  };

  const activeTenants = filteredTenants.filter(
    (t: Tenant) => t.status === "Activo",
  );
  const inactiveTenants = filteredTenants.filter(
    (t: Tenant) => t.status === "Inactivo",
  );

  return (
    <>
      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreate}
        title="Nuevo Arrendatario"
      >
        <div className="space-y-4">
          <Input
            label="Nombre Completo"
            placeholder="Ej: Tatiana Prieto Ruiz"
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                name: formatTenantName(e.target.value),
              }));
              if (formErrors.name) setFormErrors((e) => ({ ...e, name: "" }));
            }}
            error={formErrors.name}
          />
          <Input
            label="Cédula / NIT"
            placeholder="1.023.456.789"
            value={form.idNumber}
            onChange={handleIdNumberChange}
            error={formErrors.idNumber}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Correo Electrónico"
              placeholder="tatianap@correo.com"
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm((f) => ({ ...f, email: e.target.value.toLowerCase() }));
                if (formErrors.email)
                  setFormErrors((e) => ({ ...e, email: "" }));
              }}
              error={formErrors.email}
            />
            <Input
              label="Celular"
              placeholder="300 123 4567"
              value={form.phone}
              maxLength={12}
              inputMode="numeric"
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  phone: formatColombianPhone(e.target.value),
                }));
                if (formErrors.phone)
                  setFormErrors((e) => ({ ...e, phone: "" }));
              }}
              error={formErrors.phone}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase">
              Inmueble
            </label>
            <select
              className={`w-full h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none ${formErrors.propertyId ? "border-red-400 bg-red-50" : ""}`}
              value={form.propertyId}
              onChange={(e) => {
                setForm((f) => ({ ...f, propertyId: e.target.value }));
                if (formErrors.propertyId)
                  setFormErrors((e) => ({ ...e, propertyId: "" }));
                // Auto-fill rent if property has a default rent
                const prop = properties.find(
                  (p: any) => p.id === e.target.value,
                );
                if (prop?.rentAmount) {
                  setForm((f) => ({ ...f, rent: prop.rentAmount.toString() }));
                }
              }}
            >
              <option value="">Seleccionar inmueble...</option>
              {properties.map((p: any) => {
                const available = isPropertyAvailable(p);
                const reason = !available
                  ? p.status === "Arrendado"
                    ? " · ya arrendado"
                    : p.status === "En Colocación"
                      ? " · en colocación"
                      : propertyIdsWithActiveTenant.has(p.id)
                        ? " · ya tiene arrendatario activo"
                        : " · no disponible"
                  : "";
                return (
                  <option key={p.id} value={p.id} disabled={!available}>
                    {p.address}
                    {reason}
                  </option>
                );
              })}
            </select>
            {formErrors.propertyId && (
              <p className="text-xs text-red-500 mt-1">
                {formErrors.propertyId}
              </p>
            )}
            {availableProperties.length === 0 &&
              propertyIdsWithActiveTenant.size === 0 && (
                <p className="text-xs text-amber-500 mt-1">
                  No hay inmuebles disponibles para arrendar
                </p>
              )}
            {propertyIdsWithActiveTenant.size > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                Los inmuebles marcados con "ya tiene arrendatario activo" no se
                pueden asignar de nuevo. Finaliza el contrato actual primero.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Canon Mensual (COP)"
              placeholder="$ 1.696.037"
              value={form.rent}
              onChange={(e) => {
                setForm((f) => ({ ...f, rent: e.target.value }));
                if (formErrors.rent) setFormErrors((e) => ({ ...e, rent: "" }));
              }}
              error={formErrors.rent}
            />
            <Input
              label="Cuota Administración (COP)"
              placeholder="$ 0"
              value={form.adminFee}
              onChange={(e) => {
                setForm((f) => ({ ...f, adminFee: e.target.value }));
                if (formErrors.adminFee)
                  setFormErrors((e) => ({ ...e, adminFee: "" }));
              }}
              error={formErrors.adminFee}
            />
          </div>
          <div className="pt-4 flex flex-col sm:flex-row justify-end gap-3">
            <Button variant="outline" onClick={handleCloseCreate}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // El form de creación de tenant es chico: no necesitamos
                // persistencia local. "Guardar borrador" muestra feedback al
                // agente de que revise los datos antes de hacer el POST final.
                showToast(
                  '✓ Datos del arrendatario listos (botón "Crear" los guarda)',
                  "success",
                );
              }}
              className="gap-2"
            >
              💾 Guardar borrador
            </Button>
            <Button onClick={handleAskCreate}>Crear Arrendatario</Button>
          </div>
        </div>
      </Modal>

      {/* ── Confirmación antes de guardar ─────────────────────────────
          Evita que un click distraído cree el inquilino + cambie el
          estado de la propiedad a "Arrendado" + cree carpeta en Drive. */}
      <Modal
        isOpen={confirmCreateOpen}
        // FIX 2026-07-22: si está creando, NO dejamos cerrar el modal con
        // click afuera o ESC. Si no, se puede cancelar a mitad del POST y
        // el server queda con el tenant creado pero la UI sin saberlo.
        onClose={() => {
          if (!creatingTenant) setConfirmCreateOpen(false);
        }}
        title="¿Guardar arrendatario?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <svg
              className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
              />
            </svg>
            <div className="text-sm">
              <p className="font-bold text-amber-900">
                Revisa antes de guardar
              </p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Al guardar, <strong>{form.name || "este arrendatario"}</strong>{" "}
                queda activo y la propiedad{" "}
                <strong>
                  {properties.find((p: any) => p.id === form.propertyId)
                    ?.address ?? ""}
                </strong>{" "}
                pasa a estado
                <strong> En Colocación</strong>. Se creará su carpeta en Google
                Drive.
                <br />
                <br />
                La propiedad pasará a <strong>Arrendado</strong> solo cuando
                firmes el
                <strong> Inventario de Colocación</strong> con el arrendatario
                (2 firmas: arrendatario + agente).
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 space-y-1 px-1">
            <p>
              <strong className="text-slate-700">Cédula:</strong>{" "}
              {form.idNumber}
            </p>
            <p>
              <strong className="text-slate-700">Correo:</strong> {form.email}
            </p>
            <p>
              <strong className="text-slate-700">Celular:</strong> {form.phone}
            </p>
            <p>
              <strong className="text-slate-700">Canon:</strong> ${" "}
              {form.rent.replace(/[^0-9]/g, "") || "0"}
            </p>
            {form.adminFee && (
              <p>
                <strong className="text-slate-700">Administración:</strong> ${" "}
                {form.adminFee.replace(/[^0-9]/g, "")}
              </p>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setConfirmCreateOpen(false)}
              disabled={creatingTenant}
            >
              Modificar
            </Button>
            <Button onClick={handleConfirmAndCreate} disabled={creatingTenant}>
              {creatingTenant ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Sí, guardar"
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingTenant}
        onClose={() => setEditingTenant(null)}
        title="Editar Arrendatario"
      >
        {editingTenant && (
          <div className="space-y-4">
            <Input
              label="Nombre Completo"
              value={editingTenant.name}
              onChange={(e) =>
                setEditingTenant({
                  ...editingTenant,
                  name: formatTenantName(e.target.value),
                })
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Cédula / NIT"
                value={editingTenant.idNumber}
                onChange={(e) =>
                  setEditingTenant({
                    ...editingTenant,
                    idNumber: formatIdNumber(e.target.value),
                  })
                }
              />
              <Input
                label="Celular"
                value={editingTenant.phone || ""}
                onChange={(e) =>
                  setEditingTenant({ ...editingTenant, phone: e.target.value })
                }
              />
            </div>
            <Input
              label="Correo Electrónico"
              type="email"
              value={editingTenant.email || ""}
              onChange={(e) =>
                setEditingTenant({
                  ...editingTenant,
                  email: e.target.value.toLowerCase(),
                })
              }
            />
            <Input
              label="Canon Mensual"
              value={editingTenant.rent}
              onChange={(e) =>
                setEditingTenant({ ...editingTenant, rent: e.target.value })
              }
            />
            <Input
              label="Cuota Administración (COP)"
              placeholder="$ 0"
              // FIX Karpathy (jul-2026): campo agregado al modal de edición.
              // Antes el adminFee solo se podía setear al CREAR el tenant.
              // Ahora aparece siempre (algunas propiedades tienen admin, otras
              // no) y se pre-rellena con el valor actual. Opcional.
              value={
                editingTenant.adminFee != null
                  ? String(editingTenant.adminFee)
                  : ""
              }
              onChange={(e) =>
                setEditingTenant({ ...editingTenant, adminFee: e.target.value })
              }
            />
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Estado
              </label>
              <select
                className="w-full h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                value={editingTenant.status}
                onChange={(e) =>
                  setEditingTenant({ ...editingTenant, status: e.target.value })
                }
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingTenant(null)}>
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  // FIX Karpathy (jul-2026): antes era fire-and-forget con toast
                  // mentiroso. Ahora esperamos el resultado real del store y
                  // mostramos el toast correcto según éxito/error.
                  // Limpiamos adminFee igual que el modal de Crear: solo números,
                  // default 0 si está vacío.
                  const adminFeeClean =
                    parseFloat(
                      String(editingTenant.adminFee ?? "").replace(
                        /[^0-9]/g,
                        "",
                      ),
                    ) || 0;
                  const ok = await onUpdateTenant(editingTenant.id, {
                    name: editingTenant.name,
                    idNumber: editingTenant.idNumber,
                    email: editingTenant.email,
                    phone: editingTenant.phone,
                    rent: editingTenant.rent,
                    adminFee: adminFeeClean,
                    status: editingTenant.status,
                  });
                  if (ok) {
                    showToast(
                      `✓ Cambios guardados: ${editingTenant.name}`,
                      "success",
                    );
                    setEditingTenant(null);
                  } else {
                    // Modal NO se cierra — el agente puede reintentar.
                    showToast(
                      "Error al guardar cambios. Reintentá en unos segundos.",
                      "error",
                    );
                  }
                }}
              >
                Guardar Cambios
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* View Detail Modal */}
      <Modal
        isOpen={!!viewingTenant}
        onClose={() => setViewingTenant(null)}
        title="Detalle del Arrendatario"
        size="lg"
      >
        {viewingTenant && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{viewingTenant.name}</h3>
                <p className="text-sm text-slate-500">
                  {viewingTenant.idNumber}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {viewingTenant.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span>{viewingTenant.email}</span>
                </div>
              )}
              {viewingTenant.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{viewingTenant.phone}</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Inmueble
                </p>
                <p className="text-sm font-medium">
                  {getPropertyAddress(viewingTenant.propertyId)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Canon
                </p>
                <p className="text-sm font-bold text-emerald-600">
                  {formatCurrency(viewingTenant.rent || 0)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Fecha Inicio
                </p>
                <p className="text-sm">{viewingTenant.leaseStartDate}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Estado
                </p>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${viewingTenant.status === "Activo" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}
                >
                  {viewingTenant.status}
                </span>
              </div>
            </div>

            {/* Banner del Acta de Entrega — recordatorio amigable, NO bloqueante.
                Aparece SOLO si el tenant está Activo (ya firmó Inventario de
                Colocación) y NO se generó el acta todavía. actaStatus=null
                después de que refreshActaStatus termine significa "no hay acta".
                El acta NO es prerequisito para billing — es solo documentación
                legal que se entrega al inquilino con las llaves. */}
            {viewingTenant.status === "Activo" && actaStatus === null && (
              <button
                type="button"
                onClick={() => setActaModalOpen(true)}
                className="w-full flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left hover:bg-amber-100 transition-colors group"
                data-testid="acta-reminder-banner"
              >
                <span className="text-xl flex-shrink-0">📌</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-900">
                    No generaste el Acta de Entrega y Recibo de Llaves
                  </p>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    Documento legal que se entrega al inquilino con las llaves.
                    No bloquea facturación.{" "}
                    <span className="font-bold underline">
                      Click acá para generarla
                    </span>
                    .
                  </p>
                </div>
                <FileSignature className="w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
              </button>
            )}

            {/* Inventario de Colocación */}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-slate-900">
                  Inventario de Colocación
                </h4>
                <span className="text-xs text-slate-400">
                  Firmas + PDF firmado
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Carga el inventario de captación, revisa si hay novedades y
                genera el PDF firmado con fotos.
              </p>
              {/* NOTA: la cédula ya NO bloquea el Inventario de Colocación. La
                  subís cuando puedas desde la sección Documentos de abajo;
                  firmar el inventario sigue funcionando aunque la cédula no
                  esté subida. Esto le da flexibilidad al agente para no
                  quedar trabado por una suba de Drive que puede fallar. */}
              <Button
                className="w-full gap-2"
                onClick={() => {
                  if (!viewingTenant.propertyId) {
                    showToast(
                      "Este arrendatario no tiene inmueble asignado",
                      "error",
                    );
                    return;
                  }
                  void openPlacementInventory(viewingTenant);
                }}
              >
                <FileText className="w-4 h-4" />
                Abrir Inventario de Colocación
              </Button>
            </div>

            {/* Documentos — soporta N archivos por folder. Cada upload se apila
                en una lista con botón Ver por archivo. Después de subir, el
                modal "¿Querés subir otro?" permite encadenar varias hojas
                (ej: cara y respaldo de la cédula, varios recibos). */}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-slate-900">
                  Documentos en Google Drive
                </h4>
                {/* FIX Karpathy (jul-2026): antes decía "Sin carpeta en Drive"
                    en ámbar, lo cual se leía como "Drive desconectado". En
                    realidad solo significa que la carpeta ESPECÍFICA de este
                    tenant no se ha creado todavía (se crea al subir el primer
                    doc). Nuevo copy: aclara que la carpeta se crea automáticamente. */}
                {!viewingTenant.tenantDriveFolderId && (
                  <span className="text-xs text-slate-400">
                    Carpeta se crea al subir el primer doc
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {(
                  [
                    {
                      folder: "Cedula",
                      label: "Cédula de Ciudadanía",
                      icon: "🪪",
                    },
                    {
                      folder: "Contrato",
                      label: "Contrato de Arrendamiento",
                      icon: "📄",
                    },
                    { folder: "Recibos", label: "Recibos de Pago", icon: "🧾" },
                  ] as const
                ).map((doc) => {
                  const folderStatus = uploadStatus[doc.folder];
                  const files = folderStatus?.files ?? [];
                  const uploading = !!folderStatus?.uploading;
                  return (
                    <div
                      key={doc.folder}
                      className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{doc.icon}</span>
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {doc.label}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              Drive → {doc.folder}/
                              {files.length > 0 &&
                                ` · ${files.length} archivo${files.length === 1 ? "" : "s"}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {uploading ? (
                            <span className="text-xs text-blue-500 animate-pulse">
                              Subiendo...
                            </span>
                          ) : (
                            <>
                              <input
                                type="file"
                                id={`upload-${doc.folder}`}
                                accept=".pdf,image/*"
                                className="hidden"
                                onChange={(e) =>
                                  handleDocUpload(e, doc.folder, viewingTenant)
                                }
                              />
                              <label
                                htmlFor={`upload-${doc.folder}`}
                                className="cursor-pointer px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                {files.length === 0
                                  ? "Subir PDF"
                                  : "Agregar otro"}
                              </label>
                            </>
                          )}
                        </div>
                      </div>
                      {/* ── Lista de archivos subidos ── */}
                      {files.length > 0 && (
                        <ul className="space-y-1 pl-9">
                          {files.map((f, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-2 text-[11px] bg-white border border-slate-200 rounded px-2 py-1"
                            >
                              <a
                                href={f.webViewLink ?? f.link ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 text-blue-600 hover:underline truncate flex-1"
                                title={f.name}
                              >
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{f.name}</span>
                              </a>
                              <span className="text-emerald-600 font-bold text-[10px]">
                                ✓
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}

                {/* ── Acta de Entrega (generada desde la app, no subida) ── */}
                <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📜</span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Acta de Entrega y Recibo de Llaves
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Se genera desde el formulario · Drive → Acta/
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {actaStatus?.fileId ? (
                      <>
                        <span className="text-xs text-emerald-600 font-bold">
                          ✓ Generada y guardada
                        </span>
                        {actaStatus.webViewLink && (
                          <a
                            href={actaStatus.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                          >
                            Ver
                          </a>
                        )}
                        <button
                          onClick={() => setActaModalOpen(true)}
                          className="px-3 py-1.5 text-xs font-bold bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1"
                        >
                          <FileSignature className="w-3.5 h-3.5" />
                          Regenerar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setActaModalOpen(true)}
                        className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                      >
                        <FileSignature className="w-3.5 h-3.5" />
                        Generar acta
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => {
                setViewingTenant(null);
                setUploadStatus({});
              }}
            >
              Cerrar
            </Button>
          </div>
        )}
      </Modal>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-6"
      >
        {/* ── Banner de orientación: dónde estamos en el orden del proceso ── */}
        <ProcessOrderBanner
          currentStep="tenants"
          title="Pasos 2 y 3: Asignar arrendatario y cerrar el flujo"
          description="Acá se registra al arrendatario (la propiedad pasa a En Colocación), se sube la cédula a Drive, y se firma el Inventario de Colocación (arrendatario + agente). Recién cuando el inventario está firmado se crea el Contrato y la propiedad pasa a Arrendado. NO se crea contrato al asignar el tenant."
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Módulo de Arrendatarios
            </h2>
            <p className="text-slate-500 text-sm">
              {tenants.length} arrendatario{tenants.length !== 1 ? "s" : ""}{" "}
              registrado{tenants.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Arrendatario
          </Button>
        </div>

        {/* Search */}
        {tenants.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o correo..."
              className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Stats */}
        {tenants.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">
                {activeTenants.length}
              </p>
              <p className="text-xs text-slate-500 uppercase font-bold">
                Activos
              </p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-400">
                {inactiveTenants.length}
              </p>
              <p className="text-xs text-slate-500 uppercase font-bold">
                Inactivos
              </p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">
                {tenants.length}
              </p>
              <p className="text-xs text-slate-500 uppercase font-bold">
                Total
              </p>
            </Card>
          </div>
        )}

        {/* Tenant List */}
        {filteredTenants.length === 0 && tenants.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Sin arrendatarios</h3>
            <p className="text-sm text-slate-500 mb-6">
              Aún no hay arrendatarios registrados en el sistema.
            </p>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Crear Primer Arrendatario
            </Button>
          </Card>
        ) : filteredTenants.length === 0 && tenants.length > 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-slate-500">
              No se encontraron resultados para "{searchQuery}"
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeTenants.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">
                  Activos
                </h3>
                <div className="space-y-2">
                  {activeTenants.map((t: Tenant) => (
                    <Card key={t.id} className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {t.name}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>{t.idNumber}</span>
                              {t.email && <span>{t.email}</span>}
                              {t.phone && <span>{t.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-medium text-slate-900">
                              {getPropertyAddress(t.propertyId)}
                            </p>
                            <p className="text-xs font-bold text-emerald-600">
                              {formatCurrency(t.rent || 0)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openTenantDetail(t)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingTenant(t)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setTenantToDelete(t)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {inactiveTenants.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">
                  Inactivos
                </h3>
                <div className="space-y-2">
                  {inactiveTenants.map((t: Tenant) => (
                    <Card key={t.id} className="p-4 opacity-60">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-slate-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-500 truncate">
                              {t.name}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span>{t.idNumber}</span>
                              {t.email && <span>{t.email}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-medium text-slate-400">
                              {getPropertyAddress(t.propertyId)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatCurrency(t.rent || 0)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openTenantDetail(t)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingTenant(t)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Inventario de Colocación — overlay completo */}
      {placementInventoryOpen && placementProperty && viewingTenant && (
        <div className="fixed inset-0 z-[200] bg-white overflow-y-auto">
          <div className="p-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setPlacementInventoryOpen(false);
                setPlacementProperty(null);
                setPlacementBaseInventory(null);
              }}
            >
              ← Volver al arrendatario
            </Button>
          </div>
          <div className="max-w-4xl mx-auto pb-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900">
                Inventario de Colocación
              </h2>
              <p className="text-slate-500 text-sm">
                Arrendatario:{" "}
                <span className="font-semibold text-slate-700">
                  {viewingTenant.name}
                </span>
                {" · "}
                Inmueble:{" "}
                <span className="font-semibold text-slate-700">
                  {placementProperty.address}
                </span>
              </p>
              {!placementBaseInventory && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  No se encontró el inventario de captación para este inmueble.
                  Podés crear uno nuevo.
                </div>
              )}
            </div>
            <StepInventory
              showToast={showToast}
              propertyId={viewingTenant.propertyId}
              property={{
                address: placementProperty.address,
                owner: placementProperty.owner,
                chip: placementProperty.chip,
                ownerIdNumber: placementProperty.ownerIdNumber,
              }}
              propertyType={placementProperty.propertyType ?? "apartamento"}
              phase="final"
              hideSignatures={false}
              baseInventory={placementBaseInventory}
              tenantData={{
                name: viewingTenant.name,
                idNumber: viewingTenant.idNumber,
                email: viewingTenant.email,
                phone: viewingTenant.phone,
              }}
              tenantDriveFolderId={viewingTenant.tenantDriveFolderId}
              onBack={() => {
                setPlacementInventoryOpen(false);
                setPlacementProperty(null);
                setPlacementBaseInventory(null);
              }}
              onComplete={async () => {
                // ── Momento legal del contrato ──────────────────────────────
                // El Inventario de Colocación FIRMADO (arrendatario + agente)
                // es el cierre formal del flujo del tenant. Acá se crea el
                // contrato en MySQL + Zustand y se flipea el status de la
                // propiedad a "Arrendado". A partir de acá el billing ya
                // puede operar (el contrato existe y la FK resuelve).
                if (placementProperty?.id && viewingTenant) {
                  try {
                    // 1) Crear contrato en MySQL (status='active' porque ya
                    //    está firmado el inventario, que es lo que avala el
                    //    inicio del arrendamiento).
                    const startDate =
                      viewingTenant.leaseStartDate ??
                      new Date().toISOString().slice(0, 10);
                    const endDate = (() => {
                      const d = new Date(startDate);
                      d.setFullYear(d.getFullYear() + 1);
                      return d.toISOString().slice(0, 10);
                    })();
                    const newContract = await createContractServer({
                      id: crypto.randomUUID(),
                      propertyId: placementProperty.id,
                      tenantId: viewingTenant.id,
                      rentAmount: Number(viewingTenant.rent ?? 0),
                      adminFee: Number(viewingTenant.adminFee ?? 0),
                      commissionPct: 8,
                      insurancePct: 0,
                      startDate,
                      endDate,
                      status: "active",
                      renewalStrategy: "manual",
                      inventoryEndRequired: true,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                    useContractStore.getState().addContract(newContract);
                    console.info(
                      `[contrato] Generado al firmar Inventario de Colocación: ` +
                        `canon $${newContract.rentAmount}, ${newContract.startDate} → ${newContract.endDate}`,
                    );

                    // 2) Flip de status: propiedad formalmente arrendada.
                    onUpdateProperty(placementProperty.id, {
                      status: "Arrendado",
                    });

                    // 3) FIX Karpathy (jul-2026): abrir el wizard de billing para
                    // configurar la BillingPolicy + generar la amortización. El
                    // wizard chequea si ya hay policy (AC-4) y se cierra solo si
                    // sí. Si no hay, deja al agente configurar 1 paso consolidado.
                    setBillingWizardContract(newContract);
                    showToast(
                      "Inventario de colocación firmado — contrato creado, propiedad ahora Arrendada",
                      "success",
                    );
                  } catch (err: any) {
                    console.error(
                      "[contrato] No se pudo crear al firmar inventario:",
                      err,
                    );
                    showToast(
                      "Inventario firmado, pero no se pudo crear el contrato. " +
                        "Contactá al admin: " +
                        (err?.message ?? "error desconocido"),
                      "error",
                    );
                    // Aún así flipeamos el status porque el inventario SÍ se firmó.
                    onUpdateProperty(placementProperty.id, {
                      status: "Arrendado",
                    });
                  }
                }
                setPlacementInventoryOpen(false);
                setPlacementProperty(null);
                setPlacementBaseInventory(null);
              }}
            />
          </div>
        </div>
      )}

      {/* ── Wizard de Billing (FIX Karpathy jul-2026) ──────── */}
      {billingWizardContract && (
        <BillingSetupWizard
          isOpen={!!billingWizardContract}
          onClose={() => setBillingWizardContract(null)}
          showToast={showToast}
          contract={billingWizardContract}
          onSuccess={() => {
            // Refrescar la lista de propiedades para que la card del
            // BillingPanel muestre el botón "Ir al billing" sin policy.
            // El BillingPanel mismo hace su propio fetch al mount, así que
            // no necesitamos hacer nada extra acá.
          }}
        />
      )}

      {/* ── Modal del Acta de Entrega ─────────────────────────── */}
      {actaModalOpen && viewingTenant && (
        <ActaEntregaModal
          isOpen={actaModalOpen}
          onClose={() => setActaModalOpen(false)}
          showToast={showToast}
          tenant={viewingTenant}
          property={(() => {
            const p = properties.find(
              (x: any) => x.id === viewingTenant.propertyId,
            );
            return {
              address: p?.address ?? "",
              owner: p?.owner ?? "",
              ownerIdNumber: p?.ownerIdNumber ?? "",
            };
          })()}
          onUploaded={(fileId, webViewLink) => {
            setActaStatus({ fileId, webViewLink });
          }}
        />
      )}

      {/* ── Modal: Confirmar eliminación de tenant ─────────────── */}
      {tenantToDelete && (
        <Modal
          isOpen={!!tenantToDelete}
          onClose={() => !deletingTenant && setTenantToDelete(null)}
          title="Eliminar arrendatario"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              ¿Eliminar a{" "}
              <span className="font-bold text-slate-900">
                {tenantToDelete.name}
              </span>
              ? Esta acción borra el registro en MySQL. La carpeta de Drive del
              arrendatario NO se borra automáticamente (queda como respaldo).
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setTenantToDelete(null)}
                disabled={deletingTenant}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmDeleteTenant}
                disabled={deletingTenant}
                className="bg-red-600 hover:bg-red-700"
              >
                {deletingTenant ? "Eliminando…" : "Eliminar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: "¿Querés subir otro documento?" ──
          Se dispara después de cada upload exitoso a un folder del tenant.
          Le da al agente la opción de encadenar varias hojas (ej: cara y
          respaldo de la cédula, varios recibos de pago) sin tener que volver
          a buscar el botón. */}
      <Modal
        isOpen={!!lastUploadedFolder}
        onClose={() => {
          setLastUploadedFolder(null);
          setPendingFolderForAnother(null);
        }}
        title="¿Querés subir otro documento?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {lastUploadedFolder && (
              <>
                Subiste <strong>1 archivo</strong> a{" "}
                <strong>
                  {lastUploadedFolder === "Cedula" && "Cédula de Ciudadanía"}
                  {lastUploadedFolder === "Contrato" &&
                    "Contrato de Arrendamiento"}
                  {lastUploadedFolder === "Recibos" && "Recibos de Pago"}
                </strong>
                .
              </>
            )}
          </p>
          <p className="text-xs text-slate-500">
            Si este documento tiene varias hojas (ej: cara y respaldo de la
            cédula, o varios recibos de pago), podés subir más archivos del
            mismo tipo acá mismo. Cuando termines, presioná{" "}
            <strong>"No, ya está"</strong> para volver a la lista.
          </p>
          {lastUploadedFolder && (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
              <strong>Archivos en este folder:</strong>{" "}
              {uploadStatus[lastUploadedFolder]?.files.length ?? 0}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setLastUploadedFolder(null);
                setPendingFolderForAnother(null);
              }}
            >
              No, ya está
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => {
                // Dispara el file picker del folder correspondiente. El input
                // file está en el doc.<folder>; lo activamos por id.
                if (lastUploadedFolder) {
                  setPendingFolderForAnother(lastUploadedFolder);
                  // Pequeño delay para asegurar que el modal se cierre antes
                  // de abrir el picker (algunos browsers lo ignoran si está
                  // abierto un dialog).
                  setTimeout(() => {
                    const el = document.getElementById(
                      `upload-${lastUploadedFolder}`,
                    ) as HTMLInputElement | null;
                    el?.click();
                  }, 100);
                }
                setLastUploadedFolder(null);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Sí, subir otro
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
