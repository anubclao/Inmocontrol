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

  // Modal de confirmación al finalizar. Se muestra en CUALQUIER return path para que
  // el usuario pueda confirmar desde cualquier etapa del inventario sin perder estado.
  const confirmModal = (
    <Modal
      isOpen={confirmFinalize && !!resumenFinalizacion}
      onClose={() => setConfirmFinalize(false)}
      title="Inventario completado — ¿Desea revisar antes de finalizar?"
    >
      {resumenFinalizacion && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-sm font-semibold text-emerald-900 mb-2">
              Resumen del inventario
            </p>
            <ul className="text-xs text-emerald-800 space-y-1">
              <li>
                • <strong>Áreas evaluadas:</strong>{" "}
                {resumenFinalizacion.areasConFotos} de{" "}
                {resumenFinalizacion.totalAreas}
              </li>
              <li>
                • <strong>Archivos:</strong> {resumenFinalizacion.totalMedia} (
                {resumenFinalizacion.totalPhotos} fotos de área +{" "}
                {resumenFinalizacion.totalItemMedia} fotos/videos de items)
              </li>
              <li>
                • <strong>Ítems evaluados:</strong>{" "}
                {resumenFinalizacion.totalItemsEvaluados}
              </li>
            </ul>
          </div>

          {resumenFinalizacion.areasSinFotos.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <p className="font-semibold mb-1">⚠️ Áreas sin foto:</p>
              <p>
                {resumenFinalizacion.areasSinFotos
                  .map((a) => a.label)
                  .join(", ")}
              </p>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Al confirmar, el inventario se guardará en MySQL, se generará el PDF
            y se subirá a Google Drive (carpeta <code>Inventarios/</code> de la
            propiedad), junto con todas las fotos. La propiedad quedará en
            estado <strong>Activo</strong>.
          </p>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmFinalize(false)}
            >
              Revisar inventario
            </Button>
            <Button className="flex-1" onClick={() => void executeFinalize()}>
              Sí, finalizar
            </Button>
          </div>
        </div>
      )}
    </Modal>
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
        <AreaConfigPanel
          propertyType={inventory.propertyType}
          counters={inventory.counters}
          customAreas={customAreas}
          onPropertyTypeChange={(t) => {
            const config = getPropertyTypeConfig(t);
            const newCounters: Record<string, number> = {};
            config.multiCounters.forEach((mc) => {
              newCounters[mc.key] = mc.default;
            });
            const resolved = resolveAreas(config, newCounters, customAreas);
            const newAreas: InventoryArea[] = resolved.map((a) => ({
              id: a.id,
              category: a.category,
              label: a.label,
              items: {},
              photos: [],
            }));
            void persist({
              ...inventory,
              propertyType: t,
              counters: newCounters,
              areas: newAreas,
              customAreas,
            });
          }}
          onCountersChange={(c) => {
            const config = getPropertyTypeConfig(inventory.propertyType);
            const resolved = resolveAreas(config, c, customAreas);
            // Preservar items de áreas que ya existían por id
            const itemsMap = new Map<string, Record<string, InventoryItem>>(
              inventory.areas.map((a) => [a.id, a.items]),
            );
            const newAreas: InventoryArea[] = resolved.map((a) => ({
              id: a.id,
              category: a.category,
              label: a.label,
              items: itemsMap.get(a.id) ?? {},
              photos: [],
            }));
            void persist({
              ...inventory,
              counters: c,
              areas: newAreas,
              customAreas,
            });
          }}
          onCustomAreasChange={(next) => {
            setCustomAreas(next);
            const config = getPropertyTypeConfig(inventory.propertyType);
            const resolved = resolveAreas(config, inventory.counters, next);
            const itemsMap = new Map<string, Record<string, InventoryItem>>(
              inventory.areas.map((a) => [a.id, a.items]),
            );
            const newAreas: InventoryArea[] = resolved.map((a) => ({
              id: a.id,
              category: a.category,
              label: a.label,
              items: itemsMap.get(a.id) ?? {},
              photos: [],
            }));
            void persist({ ...inventory, customAreas: next, areas: newAreas });
          }}
          onStart={() => setStage("editing")}
          onCancel={onBack}
          onSaveDraft={() => {
            // El autosave a IndexedDB ya persiste en cada cambio (vía `persist`).
            // Este botón es un checkpoint explícito: confirmamos al agente.
            showToast(
              "✓ Configuración del inventario guardada como borrador",
              "success",
            );
          }}
        />
        {confirmModal}
      </>
    );
  }

  if (stage === "editing" && currentArea) {
    const config = getPropertyTypeConfig(inventory.propertyType);
    return (
      <>
        <div className="space-y-4">
          {phase === "final" && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <span className="font-bold uppercase">Inventario Final —</span>{" "}
              los items se prellenan desde el Inventario Inicial. Ajusta los
              estados si hubo cambios durante el arriendo.
            </div>
          )}
          <Card className="p-6">
            <AreaEditor
              area={currentArea}
              index={currentAreaIndex}
              total={inventory.areas.length}
              recommendedPhotos={config.recommendedPhotos}
              photos={inventory.photos}
              onChange={onAreaChange}
              onPhotosChange={onPhotosChange}
              onRemovePhoto={onRemovePhoto}
              onSaveItemMedia={onSaveItemMedia}
              onDeleteItemMedia={onDeleteItemMedia}
              onBack={() =>
                setCurrentAreaIndex(Math.max(0, currentAreaIndex - 1))
              }
              onNext={() => {
                if (!inventory) return;
                const area = inventory.areas[currentAreaIndex];
                const areaPhotoCount = inventory.photos.filter(
                  (p) => p.areaId === area.id,
                ).length;
                const itemMediaCount = Object.values(area.items).reduce<number>(
                  (acc, it) => acc + ((it as InventoryItem).media?.length ?? 0),
                  0,
                );
                if (areaPhotoCount + itemMediaCount === 0) {
                  showToast(
                    `Sube al menos una foto o video de "${area.label}" antes de continuar`,
                    "error",
                  );
                  return;
                }
                setCurrentAreaIndex(
                  Math.min(inventory.areas.length - 1, currentAreaIndex + 1),
                );
              }}
              onSkipToSign={
                hideSignatures
                  ? () => {
                      void handleFinalizeInventory();
                    }
                  : () => setStage("signing")
              }
              hideSignatures={hideSignatures}
            />
          </Card>
          {/* Banner de autoguardado + botón de checkpoint explícito.
            El state del inventario se persiste en IndexedDB en cada cambio
            (vía `persist()`), pero el agente necesita un botón visible para
            confirmar que su progreso está a salvo sin tener que finalizar. */}
          <div className="flex items-center justify-between gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="text-xs text-emerald-800">
              <strong>Autoguardado activo.</strong> Tus cambios se guardan
              automáticamente al cambiar de área o de step.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                showToast(
                  "✓ Inventario guardado en este dispositivo",
                  "success",
                )
              }
              className="gap-1.5 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
            >
              💾 Guardar borrador
            </Button>
          </div>
          {/* Stepper de áreas */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {inventory.areas.map((a, i) => {
              const filled = Object.values(a.items).filter(
                (it: InventoryItem) => it.status,
              ).length;
              const done = filled > 0;
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    const areaPhotoCount = inventory.photos.filter(
                      (p) => p.areaId === a.id,
                    ).length;
                    const itemMediaCount = Object.values(
                      a.items,
                    ).reduce<number>(
                      (acc, it) =>
                        acc + ((it as InventoryItem).media?.length ?? 0),
                      0,
                    );
                    if (
                      i !== currentAreaIndex &&
                      areaPhotoCount + itemMediaCount === 0 &&
                      !inventory.areas[currentAreaIndex]
                    ) {
                      showToast(
                        `Sube al menos una foto o video de "${a.label}" antes de ir`,
                        "error",
                      );
                      return;
                    }
                    setCurrentAreaIndex(i);
                  }}
                  className={`w-7 h-7 rounded text-[10px] font-bold transition-all ${
                    i === currentAreaIndex
                      ? "bg-blue-600 text-white"
                      : done
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-400"
                  }`}
                  title={a.label}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
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
