// filepath: src/features/properties/components/inventory/InventoryEditingStage.tsx
/**
 * InventoryEditingStage — stage de edición por área del inventario.
 * Renderiza el banner informativo de fase final + el `AreaEditor` con
 * el stepper de áreas y el botón de "Guardar borrador" + el botón de
 * skip-to-sign o skip-to-finalize.
 *
 * Sale de StepInventory.tsx como parte del refactor #10 (commit 2/2).
 */
import { Button, Card } from "../../../../shared/ui";
import { getPropertyTypeConfig } from "../../inventoryConfig";
import type {
  Inventory,
  InventoryArea,
  InventoryItem,
  InventoryPhoto,
  ItemMedia,
  Signature,
} from "../../inventoryTypes";
import { AreaEditor } from "../AreaEditor";

export interface InventoryEditingStageProps {
  inventory: Inventory;
  currentArea: InventoryArea;
  currentAreaIndex: number;
  phase: "inicial" | "final";
  hideSignatures: boolean;
  showToast: (msg: string, type?: "success" | "error") => void;
  // Handlers
  onAreaChange: (area: InventoryArea) => void;
  onPhotosChange: (photos: InventoryPhoto[]) => void;
  onRemovePhoto: (photoId: string) => void;
  onSaveItemMedia: (itemId: string, media: ItemMedia) => Promise<void>;
  onDeleteItemMedia: (itemId: string, mediaId: string) => Promise<void>;
  setCurrentAreaIndex: (i: number) => void;
  setStage: (s: "signing") => void;
  handleFinalizeInventory: () => Promise<void>;
}

export function InventoryEditingStage({
  inventory,
  currentArea,
  currentAreaIndex,
  phase,
  hideSignatures,
  showToast,
  onAreaChange,
  onPhotosChange,
  onRemovePhoto,
  onSaveItemMedia,
  onDeleteItemMedia,
  setCurrentAreaIndex,
  setStage,
  handleFinalizeInventory,
}: InventoryEditingStageProps) {
  const config = getPropertyTypeConfig(inventory.propertyType);

  return (
    <div className="space-y-4">
      {phase === "final" && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <span className="font-bold uppercase">Inventario Final —</span> los
          items se prellenan desde el Inventario Inicial. Ajusta los estados si
          hubo cambios durante el arriendo.
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
          onBack={() => setCurrentAreaIndex(Math.max(0, currentAreaIndex - 1))}
          onNext={() => {
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
            showToast("✓ Inventario guardado en este dispositivo", "success")
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
                const itemMediaCount = Object.values(a.items).reduce<number>(
                  (acc, it) => acc + ((it as InventoryItem).media?.length ?? 0),
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
  );
}
