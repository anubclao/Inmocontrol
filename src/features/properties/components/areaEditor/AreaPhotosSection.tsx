// filepath: src/features/properties/components/areaEditor/AreaPhotosSection.tsx
import { useRef } from 'react';
import { Camera, Eye, Trash2 } from 'lucide-react';
import { Button, Input } from '../../../../shared/ui';
import type { InventoryPhoto } from '../../inventoryTypes';

export interface AreaPhotosSectionProps {
  photos: InventoryPhoto[];
  areaId: string;
  recommendedPhotos: number;
  observations: string;
  onChangeObservations: (v: string) => void;
  onAddPhoto: (file: File) => Promise<void> | void;
  onRemovePhoto: (photoId: string) => void;
  onViewPhoto: (p: InventoryPhoto) => void;
}

/**
 * Sección "Fotos generales del área" del editor de área. Muestra la grilla
 * de fotos (no asociadas a un item específico), el botón "Subir foto" y
 * el input de observaciones del área. Las fotos de item viven en
 * AreaItemsChecklist.
 */
export function AreaPhotosSection({
  photos,
  areaId,
  recommendedPhotos,
  observations,
  onChangeObservations,
  onAddPhoto,
  onRemovePhoto,
  onViewPhoto,
}: AreaPhotosSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosForArea = photos.filter((p) => p.areaId === areaId);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files as FileList | null;
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      await onAddPhoto(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      {/* Observaciones del área */}
      <div>
        <Input
          label="Observaciones del área"
          placeholder="Ej: mancha de humedad en techo, balcón con pintura descascarada..."
          value={observations}
          onChange={(e) => onChangeObservations(e.target.value)}
        />
      </div>

      {/* Fotos adicionales del área (no asociadas a un item) */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Fotos generales del área</p>
            <p className="text-xs text-slate-500">
              {photosForArea.length} / {recommendedPhotos} sugeridas · sin asociar a un item
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            Subir foto
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
        </div>
        {photosForArea.length === 0 ? (
          <div className="py-4 text-center text-slate-400 text-xs uppercase tracking-wider">
            Sin fotos generales — las fotos por item ya cuentan para el inventario
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {photosForArea.map((p) => (
              <div key={p.id} className="relative group aspect-square bg-slate-200 rounded-lg overflow-hidden">
                <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onViewPhoto(p)}
                    className="p-1.5 bg-white rounded-md text-slate-700 hover:text-blue-600"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(p.id)}
                    className="p-1.5 bg-white rounded-md text-slate-700 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
