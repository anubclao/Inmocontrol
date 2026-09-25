/**
 * PhotoGalleryModal — galería de fotos del inventario con lightbox.
 *
 * Commit 4 del refactor #5b (spec #5b, verifier #5b). Sale del monolito
 * `PropertiesView.tsx` (~260 líneas JSX). Comportamiento preservado:
 *  - Lista las fotos agrupadas por área.
 *  - Click en miniatura abre lightbox a pantalla completa.
 *  - Botón "Recuperar fotos del servidor" cuando no hay fotos en
 *    IndexedDB pero MySQL sí tiene (re-hidrata).
 *  - Navegación del lightbox con flechas o botones Anterior/Siguiente.
 *  - Esc y click fuera cierra el lightbox.
 *
 * El state del lightbox (`lightboxIndex`) es **local** al modal
 * (per AC-10: state mínimo permitido en cada modal). El state del
 * gallery (`photoGallery`, `photoGalleryLoading`) sigue en el shell
 * porque `openPhotoGallery` carga async desde IndexedDB.
 */

import { useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import { Button, Modal } from "../../../shared/ui";

export interface PhotoGalleryItem {
  id: string;
  areaId: string;
  areaLabel: string;
  dataUrl: string;
  phase: "inicial" | "final";
}

export interface PhotoGalleryModalProps {
  isOpen: boolean;
  propertyId: string | null;
  address: string;
  photos: PhotoGalleryItem[];
  loading: boolean;
  onClose: () => void;
  /** Callback para "Recuperar fotos del servidor" (re-hidrata IndexedDB). */
  onRecoverFromServer: () => Promise<void> | void;
}

export function PhotoGalleryModal({
  isOpen,
  propertyId,
  address,
  photos,
  loading,
  onClose,
  onRecoverFromServer,
}: PhotoGalleryModalProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleClose = () => {
    setLightboxIndex(null);
    onClose();
  };

  const lightboxPhoto =
    lightboxIndex !== null ? photos[lightboxIndex] ?? null : null;

  // Agrupa por `areaLabel` (per el código legacy que vivía en PropertiesView).
  const grouped: Record<string, PhotoGalleryItem[]> = (photos ?? []).reduce(
    (acc, p) => {
      (acc[p.areaLabel] ??= []).push(p);
      return acc;
    },
    {} as Record<string, PhotoGalleryItem[]>,
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={`📷 Fotos del Inventario — ${address}`}
        size="xl"
      >
        <div className="space-y-5">
          {photos.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <Camera className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                No hay fotos guardadas para este inventario.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Las fotos se guardan en el navegador (IndexedDB). Si limpiaste
                la caché del navegador, podés volver a tomarlas desde el botón
                "Inicial" / "Final".
              </p>
              {/* FIX Karpathy (jul-2026): si MySQL tiene las fotos (caso típico:
                  IndexedDB stale post-self-heal o limpieza de caché), este
                  botón re-hidrata manualmente. */}
              <button
                type="button"
                onClick={() => void onRecoverFromServer()}
                disabled={loading}
                className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50"
                data-testid="gallery-recover-from-mysql"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                />
                Recuperar fotos del servidor
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  <strong>{photos.length}</strong> fotos en total — click para
                  ver en grande.
                </p>
                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                  Almacenamiento local del navegador
                </p>
              </div>
              {Object.entries(grouped).map(([areaLabel, areaPhotos]) => (
                <div key={areaLabel} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <p className="text-xs font-bold text-slate-700 uppercase">
                      {areaLabel}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {areaPhotos.length} foto
                      {areaPhotos.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {areaPhotos.map((photo, i) => {
                      const globalIndex = photos.findIndex(
                        (p) => p.id === photo.id,
                      );
                      return (
                        <button
                          key={photo.id}
                          onClick={() => setLightboxIndex(globalIndex)}
                          className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all group bg-slate-100"
                          title={`${areaLabel} — foto ${i + 1}`}
                        >
                          <img
                            src={photo.dataUrl}
                            alt={`${areaLabel} ${i + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                          <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                            {i + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
          <Button variant="outline" className="w-full" onClick={handleClose}>
            Cerrar
          </Button>
        </div>
      </Modal>

      {/* ── Lightbox para ver foto a tamaño completo ── */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex(null);
            }}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="w-6 h-6" />
          </button>
          {lightboxIndex !== null && lightboxIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              title="Anterior (←)"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
          )}
          {lightboxIndex !== null &&
            lightboxIndex < photos.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(lightboxIndex + 1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                title="Siguiente (→)"
              >
                <ChevronRight className="w-7 h-7" />
              </button>
            )}
          <div
            className="max-w-[90vw] max-h-[85vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxPhoto.dataUrl}
              alt={lightboxPhoto.areaLabel}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="mt-3 px-4 py-2 bg-white/10 rounded-lg text-white text-sm">
              <strong>{lightboxPhoto.areaLabel}</strong>
              {" · "}foto {lightboxIndex! + 1} de {photos.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
}