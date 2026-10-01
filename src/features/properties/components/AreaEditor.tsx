// filepath: src/features/properties/components/AreaEditor.tsx
import { Button } from '../../../shared/ui';
import type {
  InventoryArea,
  InventoryPhoto,
  ItemMedia,
} from '../inventoryTypes';
import { AreaItemsChecklist } from './areaEditor/AreaItemsChecklist';
import { AreaPhotosSection } from './areaEditor/AreaPhotosSection';
import { RemoveItemModal } from './areaEditor/RemoveItemModal';
import { MediaViewers } from './areaEditor/MediaViewers';
import { useAreaEditor } from './areaEditor/useAreaEditor';

interface AreaEditorProps {
  area: InventoryArea;
  index: number;
  total: number;
  recommendedPhotos: number;
  photos: InventoryPhoto[];
  onChange: (area: InventoryArea) => void;
  onPhotosChange: (photos: InventoryPhoto[]) => void;
  onRemovePhoto: (photoId: string) => void;
  onAddPhoto?: (file: File, caption?: string) => Promise<void> | void;
  onBack: () => void;
  onNext: () => void;
  onSkipToSign: () => void;
  hideSignatures?: boolean;
  /**
   * Callback para que el padre (StepInventory) persista el media de un item
   * en el store `photos` de IndexedDB. La razón: las fotos de item son
   * grandes dataURLs — guardarlas inline en el inventory JSON satura
   * IndexedDB rápido. Por eso se persisten aparte, igual que las fotos de
   * área. El id del media es `<inventoryId>:<mediaId>` (lo construye el padre).
   */
  onSaveItemMedia?: (itemId: string, media: ItemMedia) => Promise<void>;
  onDeleteItemMedia?: (itemId: string, mediaId: string) => Promise<void>;
}

export function AreaEditor({
  area, index, total, recommendedPhotos, photos, onChange, onPhotosChange,
  onAddPhoto, onRemovePhoto, onBack, onNext, onSkipToSign, hideSignatures,
  onSaveItemMedia, onDeleteItemMedia,
}: AreaEditorProps) {
  const {
    itemPhotoInputRef,
    itemVideoInputRef,
    viewingPhoto,
    setViewingPhoto,
    viewingMedia,
    setViewingMedia,
    mediaTargetItemId,
    setMediaTargetItemId,
    confirmRemoveItem,
    removalReason,
    setRemovalReason,
    items,
    removedItems,
    progress,
    checklistHandlers,
    handleAddPhoto,
    handleItemPhotoFile,
    handleItemVideoFile,
    executeRemoveItem,
    cancelRemoveItem,
  } = useAreaEditor({
    area,
    photos,
    onChange,
    onPhotosChange,
    onAddPhoto,
    onSaveItemMedia,
    onDeleteItemMedia,
  });

  return (
    <div className="space-y-4">
      {/* Header con progreso */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{area.label}</h3>
          <p className="text-xs text-slate-500">Área {index + 1} de {total} · {removedItems > 0 && <span className="text-amber-600">{removedItems} ítem(s) no aplica</span>}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 font-bold uppercase">Progreso</p>
          <p className="text-sm font-bold text-blue-600">{Math.round(progress)}%</p>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* Checklist de items */}
      <AreaItemsChecklist
        items={items}
        area={area}
        handlers={checklistHandlers}
        mediaTargetItemId={mediaTargetItemId}
        setMediaTargetItemId={setMediaTargetItemId}
        itemPhotoInputRef={itemPhotoInputRef}
        itemVideoInputRef={itemVideoInputRef}
        onItemPhotoFile={handleItemPhotoFile}
        onItemVideoFile={handleItemVideoFile}
      />

      {/* Observaciones + fotos del área */}
      <AreaPhotosSection
        photos={photos}
        areaId={area.id}
        recommendedPhotos={recommendedPhotos}
        observations={area.observations ?? ''}
        onChangeObservations={(v) => onChange({ ...area, observations: v })}
        onAddPhoto={handleAddPhoto}
        onRemovePhoto={onRemovePhoto}
        onViewPhoto={setViewingPhoto}
      />

      {/* Inputs ocultos para foto/video por item */}
      <input
        ref={itemPhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleItemPhotoFile}
      />
      <input
        ref={itemVideoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={handleItemVideoFile}
      />

      {/* Navegación */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} disabled={index === 0}>← Atrás</Button>
        <div className="flex-1" />
        {index < total - 1 ? (
          <Button onClick={onNext}>Siguiente área →</Button>
        ) : (
          <Button onClick={onSkipToSign}>
            {hideSignatures ? 'Finalizar inventario →' : 'Ir a firmas →'}
          </Button>
        )}
      </div>

      {/* Visores (read-only) */}
      <MediaViewers
        viewingPhoto={viewingPhoto}
        setViewingPhoto={setViewingPhoto}
        viewingMedia={viewingMedia}
        setViewingMedia={setViewingMedia}
      />

      {/* Modal: confirmar "no aplica" de un item */}
      <RemoveItemModal
        state={confirmRemoveItem}
        removalReason={removalReason}
        onChangeReason={setRemovalReason}
        onConfirm={executeRemoveItem}
        onCancel={cancelRemoveItem}
      />
    </div>
  );
}
