// filepath: src/features/properties/components/detailModal/InventoryActionsSection.tsx
/**
 * InventoryActionsSection — botones de acción para inventarios (Inicial / Final)
 * + galería de fotos + comparación. Sale de PropertyDetailModal (#14).
 */
import {
  Camera,
  ClipboardCheck,
  GitCompare,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "../../../../shared/ui";

export interface InventoryActionsSectionProps {
  property: any;
  onOpenInventory: (property: any, phase: "inicial" | "final") => void;
  openPhotoGallery: (
    property: any,
    phase: "inicial" | "final",
  ) => Promise<void> | void;
  photoGalleryLoading: boolean;
  onCompareInventories: (property: any) => void;
  detailRefreshing: boolean;
  onRefresh: () => void;
}

export function InventoryActionsSection({
  property,
  onOpenInventory,
  openPhotoGallery,
  photoGalleryLoading,
  onCompareInventories,
  detailRefreshing,
  onRefresh,
}: InventoryActionsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2 flex-1">
          Inventarios
        </p>
        <button
          onClick={onRefresh}
          disabled={detailRefreshing}
          className="text-[10px] text-slate-500 hover:text-slate-700 flex items-center gap-1 disabled:opacity-50"
          title="Refrescar desde el servidor"
        >
          <RefreshCw
            className={`w-3 h-3 ${detailRefreshing ? "animate-spin" : ""}`}
          />
          Actualizar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => onOpenInventory(property, "inicial")}
        >
          <ClipboardCheck className="w-4 h-4" />
          Inicial
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => onOpenInventory(property, "final")}
        >
          <ClipboardCheck className="w-4 h-4" />
          Final
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => void openPhotoGallery(property, "inicial")}
          disabled={photoGalleryLoading}
        >
          {photoGalleryLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          Galería Inicial
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => void openPhotoGallery(property, "final")}
          disabled={photoGalleryLoading}
        >
          {photoGalleryLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          Galería Final
        </Button>
        <Button
          variant="outline"
          className="col-span-2 gap-2"
          onClick={() => onCompareInventories(property)}
        >
          <GitCompare className="w-4 h-4" />
          Comparar Inicial vs Final
        </Button>
      </div>
    </div>
  );
}
