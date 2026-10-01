// filepath: src/features/properties/components/areaEditor/MediaViewers.tsx
import { Modal } from "../../../../shared/ui";
import type { InventoryPhoto, ItemMedia } from "../../inventoryTypes";

export interface MediaViewersProps {
  viewingPhoto: InventoryPhoto | null;
  setViewingPhoto: (p: InventoryPhoto | null) => void;
  viewingMedia: ItemMedia | null;
  setViewingMedia: (m: ItemMedia | null) => void;
}

/**
 * Modales de solo lectura para visualizar fotos de área y media de items
 * (foto o video). Se montan condicionalmente en el shell de AreaEditor.
 */
export function MediaViewers({
  viewingPhoto,
  setViewingPhoto,
  viewingMedia,
  setViewingMedia,
}: MediaViewersProps) {
  return (
    <>
      {/* Visor de foto de área */}
      <Modal
        isOpen={!!viewingPhoto}
        onClose={() => setViewingPhoto(null)}
        title="Foto"
      >
        {viewingPhoto && (
          <div className="space-y-2">
            <img
              src={viewingPhoto.dataUrl}
              alt=""
              className="w-full rounded-lg"
            />
            <p className="text-xs text-slate-500 text-center">
              {new Date(viewingPhoto.takenAt).toLocaleString("es-CO")}
            </p>
          </div>
        )}
      </Modal>

      {/* Visor de media de item (foto o video) */}
      <Modal
        isOpen={!!viewingMedia}
        onClose={() => setViewingMedia(null)}
        title={viewingMedia?.type === "video" ? "Video" : "Foto"}
        size="lg"
      >
        {viewingMedia?.type === "video" ? (
          <div className="space-y-2">
            {viewingMedia.videoDataUrl ? (
              <video
                src={viewingMedia.videoDataUrl}
                controls
                className="w-full rounded-lg bg-black max-h-[70vh]"
              />
            ) : (
              <img
                src={viewingMedia.dataUrl}
                alt=""
                className="w-full rounded-lg"
              />
            )}
            <p className="text-xs text-slate-500 text-center">
              {viewingMedia.durationSec
                ? `Duración: ${viewingMedia.durationSec}s · `
                : ""}
              {new Date(viewingMedia.takenAt).toLocaleString("es-CO")}
            </p>
          </div>
        ) : viewingMedia ? (
          <div className="space-y-2">
            <img
              src={viewingMedia.dataUrl}
              alt=""
              className="w-full rounded-lg"
            />
            <p className="text-xs text-slate-500 text-center">
              {new Date(viewingMedia.takenAt).toLocaleString("es-CO")}
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
