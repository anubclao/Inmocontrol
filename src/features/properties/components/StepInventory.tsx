import { useMemo } from "react";
import { Button, Card, Modal } from "../../../shared/ui";
import { AreaConfigPanel } from "./AreaConfigPanel";
import { AreaEditor } from "./AreaEditor";
import { SignatureStep } from "./SignatureStep";
import { inventoryDB } from "../inventoryDB";
import {
  getPropertyTypeConfig,
  resolveAreas,
  type PropertyType,
} from "../inventoryConfig";
import type {
  Inventory,
  InventoryArea,
  InventoryItem,
  InventoryPhoto,
  ItemMedia,
  Signature,
} from "../inventoryTypes";
import { useAppStore } from "../../../shared/store/appStore";
import { useInventoryState } from "./inventory/hooks/useInventoryState";
import { useInventoryFinalize } from "./inventory/hooks/useInventoryFinalize";
import { useInventorySigning } from "./inventory/hooks/useInventorySigning";
import { InventoryConfirmModal } from "./inventory/InventoryConfirmModal";
import { InventoryConfigStage } from "./inventory/InventoryConfigStage";
import { InventoryEditingStage } from "./inventory/InventoryEditingStage";

interface StepInventoryProps {
  showToast: (msg: string, type?: "success" | "error") => void;
  propertyId: string;
  property: {
    address: string;
    owner: string;
    chip: string;
    ownerIdNumber?: string;
  };
  propertyType: PropertyType;
  phase: "inicial" | "final";
  onBack: () => void;
  /** Llamado al finalizar el inventario. Acepta el inventario final como parámetro
   *  para evitar closures stale en el componente padre (PropertiesView). */
  onComplete: (finalInventory?: Inventory) => void;
  /** Cuando es Inventario Final, le pasamos el Inicial para poder copiar áreas base */
  baseInventory?: Inventory | null;
  /** Datos del arrendatario asignado a la propiedad (para prellenar firmas) */
  tenantData?: {
    name: string;
    idNumber: string;
    email?: string;
    phone?: string;
  } | null;
  /** ID de la carpeta del arrendatario en Google Drive (para subir el PDF firmado) */
  tenantDriveFolderId?: string | null;
  /** Modo captación: oculta las firmas del agente/arrendatario; la finalize solo genera PDF del inventario */
  hideSignatures?: boolean;
  /** Callback al finalizar el inventario: debe subir el PDF a Drive y guardar JSON en MySQL */
  onInventoryFinalized?: (inventory: Inventory) => Promise<void>;
}

type Stage = "config" | "editing" | "signing";

export function StepInventory({
  showToast,
  propertyId,
  property,
  propertyType,
  phase,
  onBack,
  onComplete,
  baseInventory,
  tenantData,
  tenantDriveFolderId,
  hideSignatures = false,
  onInventoryFinalized,
}: StepInventoryProps) {
  // ── Hooks extraídos (refactor #10, commit 1/2) ─────────────────────────
  const {
    inventory,
    loading,
    customAreas,
    setCustomAreas,
    currentAreaIndex,
    setCurrentAreaIndex,
    stage,
    setStage,
    persist,
    clearDraft,
  } = useInventoryState({
    propertyId,
    phase,
    propertyType,
    baseInventory,
    hideSignatures,
    showToast,
  });

  // Prellenar datos del arrendatario: del prop o del store
  const storeTenants = useAppStore((s) => s.tenants);
  const storeTenant = useMemo(
    () =>
      storeTenants.find(
        (t) => t.propertyId === propertyId && t.status === "Activo",
      ) ?? null,
    [storeTenants, propertyId],
  );
  // Combina prop + store: el prop tiene prioridad (viene del tenant placement flow)
  const effectiveTenantData =
    tenantData ??
    (storeTenant
      ? {
          name: storeTenant.name,
          idNumber: storeTenant.idNumber,
          email: storeTenant.email,
          phone: storeTenant.phone,
        }
      : null);

  const finalize = useInventoryFinalize({
    inventory,
    persist,
    onInventoryFinalized,
    clearDraft,
    onComplete,
    showToast,
  });

  const signing = useInventorySigning({
    inventory,
    persist,
    baseInventory,
    property,
    tenantDriveFolderId,
    onComplete,
    showToast,
  });

  // Aliases para mantener compatibilidad con el render JSX existente
  const confirmFinalize = finalize.confirmFinalize;
  const setConfirmFinalize = finalize.setConfirmFinalize;
  const resumenFinalizacion = finalize.resumenFinalizacion;
  const setResumenFinalizacion = finalize.setResumenFinalizacion;
  const handleFinalizeInventory = finalize.handleFinalizeInventory;
  const executeFinalize = finalize.executeFinalize;
  const onGeneratePDF = finalize.onGeneratePDF;
  const onSaveSignatures = signing.onSaveSignatures;

  const onStart = () => {
    if (!inventory) return;
    setCurrentAreaIndex(0);
    setStage("editing");
  };

  const onAreaChange = (area: InventoryArea) => {
    if (!inventory) return;
    const next: Inventory = {
      ...inventory,
      areas: inventory.areas.map((a) => (a.id === area.id ? area : a)),
    };
    void persist(next);
  };

  const onPhotosChange = (photos: InventoryPhoto[]) => {
    if (!inventory) return;
    // Mantener areas.photos en sincronía: el id de la foto se agrega al área actual
    const diff = photos.length - inventory.photos.length;
    let updatedAreas = inventory.areas;
    if (diff > 0 && currentArea) {
      // Se agregaron fotos
      const newPhotos = photos.slice(inventory.photos.length);
      updatedAreas = inventory.areas.map((a) => {
        if (a.id !== currentArea.id) return a;
        return { ...a, photos: [...a.photos, ...newPhotos.map((p) => p.id)] };
      });
    }
    void persist({ ...inventory, photos, areas: updatedAreas });
  };

  const onRemovePhoto = (photoId: string) => {
    if (!inventory) return;
    void persist({
      ...inventory,
      photos: inventory.photos.filter((p) => p.id !== photoId),
      areas: inventory.areas.map((a) => ({
        ...a,
        photos: a.photos.filter((id) => id !== photoId),
      })),
    });
  };

  /**
   * Persiste el media (foto o video) de un item específico en el store
   * `photos` de IndexedDB. Se guarda con la convención
   * `<inventoryId>:<mediaId>` para que `getMediaDataUrl` (inyectado al PDF)
   * pueda recuperarlo después.
   *
   * El media también queda inline en el `InventoryItem.media` para que la
   * UI lo muestre sin tener que hacer un round-trip a IndexedDB.
   */
  const onSaveItemMedia = async (
    _itemId: string,
    media: ItemMedia,
  ): Promise<void> => {
    if (!inventory) return;
    try {
      await inventoryDB.savePhoto({
        id: `${inventory.id}:${media.id}`,
        inventoryId: inventory.id,
        dataUrl: media.dataUrl,
        // Para videos guardamos AMBOS: el thumbnail (dataUrl) y el video completo (videoDataUrl).
        // Lo guardamos en el mismo record para que un solo GET traiga todo.
        ...(media.videoDataUrl ? { videoDataUrl: media.videoDataUrl } : {}),
        fileName: media.fileName,
        takenAt: media.takenAt,
        type: media.type,
        durationSec: media.durationSec,
        sizeBytes: media.sizeBytes,
      });
    } catch (err) {
      console.error("[itemMedia] savePhoto failed:", err);
      throw err;
    }
  };

  /** Borra el media persistido de un item. */
  const onDeleteItemMedia = async (
    _itemId: string,
    mediaId: string,
  ): Promise<void> => {
    if (!inventory) return;
    try {
      await inventoryDB.deletePhoto(`${inventory.id}:${mediaId}`);
    } catch (err) {
      console.error("[itemMedia] deletePhoto failed:", err);
      throw err;
    }
  };

  const currentArea = useMemo(() => {
    if (!inventory) return null;
    return inventory.areas[currentAreaIndex] ?? null;
  }, [inventory, currentAreaIndex]);

  // Modal de confirmación al finalizar (siempre presente en cualquier return path)
  const confirmModal = (
    <InventoryConfirmModal
      isOpen={confirmFinalize}
      resumen={resumenFinalizacion}
      onClose={() => setConfirmFinalize(false)}
      onConfirm={() => void executeFinalize()}
    />
  );

  if (loading || !inventory) {
    return (
      <>
        <Card className="p-8">
          <p className="text-sm text-slate-500">Cargando inventario…</p>
        </Card>
        {confirmModal}
      </>
    );
  }

  if (stage === "config") {
    return (
      <>
        <InventoryConfigStage
          inventory={inventory}
          customAreas={customAreas}
          setCustomAreas={setCustomAreas}
          persist={persist}
          setStage={setStage}
          onBack={onBack}
          showToast={showToast}
        />
        {confirmModal}
      </>
    );
  }

  if (stage === "editing" && currentArea) {
    return (
      <>
        <InventoryEditingStage
          inventory={inventory}
          currentArea={currentArea}
          currentAreaIndex={currentAreaIndex}
          phase={phase}
          hideSignatures={hideSignatures}
          showToast={showToast}
          onAreaChange={onAreaChange}
          onPhotosChange={onPhotosChange}
          onRemovePhoto={onRemovePhoto}
          onSaveItemMedia={onSaveItemMedia}
          onDeleteItemMedia={onDeleteItemMedia}
          setCurrentAreaIndex={setCurrentAreaIndex}
          setStage={setStage}
          handleFinalizeInventory={handleFinalizeInventory}
        />
        {confirmModal}
      </>
    );
  }

  return (
    <>
      <Card className="p-6">
        <SignatureStep
          inventory={inventory}
          propertyOwner={property.owner}
          propertyOwnerIdNumber={property.ownerIdNumber}
          tenantData={effectiveTenantData}
          onSaveSignatures={onSaveSignatures}
          onGeneratePDF={onGeneratePDF}
          onBack={() => setStage("editing")}
        />
      </Card>
      {confirmModal}
    </>
  );
}
