import React, { useRef, useState } from 'react';
import { Camera, Trash2, Eye } from 'lucide-react';
import { Button, Input, Modal } from '../../../shared/ui';
import { ITEM_CATALOG, ITEM_STATUS_COLOR, ITEM_STATUS_LABEL, type ItemStatus } from '../inventoryConfig';
import type { InventoryArea, InventoryPhoto, InventoryItem } from '../inventoryTypes';
import { compressImage } from '../imageCompress';

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
}

const STATUSES: ItemStatus[] = ['bueno', 'regular', 'malo', 'na'];

export function AreaEditor({
  area, index, total, recommendedPhotos, photos, onChange, onPhotosChange,
  onAddPhoto, onRemovePhoto, onBack, onNext, onSkipToSign, hideSignatures,
}: AreaEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewingPhoto, setViewingPhoto] = useState<InventoryPhoto | null>(null);

  const items = ITEM_CATALOG[area.category] ?? [];
  const photosForArea = photos.filter((p) => p.areaId === area.id);
  const filledItems = Object.values(area.items).filter((i) => i.status).length;
  const progress = items.length > 0 ? (filledItems / items.length) * 100 : 100;

  const setItemStatus = (itemId: string, status: ItemStatus) => {
    const def = items.find((i) => i.id === itemId);
    if (!def) return;
    onChange({
      ...area,
      items: {
        ...area.items,
        [itemId]: { id: def.id, label: def.label, status },
      },
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files as FileList | null;
    const files: File[] = fileList ? Array.from(fileList) : [];
    // Cuántas fotos de esta área ya hay (para numerar el bautizado)
    const baseIndex = (photos ?? []).filter((p) => p.areaId === area.id).length;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      // Compresión automática: redimensiona a max 1600px y guarda JPEG 0.7
      const dataUrl = await compressImage(file);
      // Nombre bautizado: {area_label_snake}_{NN}
      // ej: "cocina_01", "alcoba_2_02", "sala_03"
      const areaSlug = slugify(area.label);
      const seq = String(baseIndex + i + 1).padStart(2, '0');
      const fileName = `${areaSlug}_${seq}`;
      const photo: InventoryPhoto = {
        id: `${area.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        areaId: area.id,
        areaLabel: area.label,
        dataUrl,
        takenAt: new Date().toISOString(),
        fileName,
      };
      onPhotosChange([...photos, photo]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

/** Convierte "Alcoba 2 (Principal)" en "alcoba_2_principal" */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // sin tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

  return (
    <div className="space-y-4">
      {/* Header con progreso */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{area.label}</h3>
          <p className="text-xs text-slate-500">Área {index + 1} de {total}</p>
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
      <div className="space-y-2">
        {items.map((item) => {
          const current = area.items[item.id];
          return (
            <div key={item.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-sm font-bold text-slate-900 mb-2">{item.label}</p>
              <div className="grid grid-cols-4 gap-1">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setItemStatus(item.id, s)}
                    className={`py-1.5 text-[10px] font-bold rounded uppercase transition-all ${
                      current?.status === s
                        ? ITEM_STATUS_COLOR[s] + ' shadow-sm'
                        : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {ITEM_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Observaciones */}
      <div>
        <Input
          label="Observaciones del área"
          placeholder="Ej: mancha de humedad en techo, balcón con pintura descascarada..."
          value={area.observations ?? ''}
          onChange={(e) => onChange({ ...area, observations: e.target.value })}
        />
      </div>

      {/* Fotos */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Fotos del área</p>
            <p className="text-xs text-slate-500">
              {photosForArea.length} / {recommendedPhotos} sugeridas
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
          <div className="py-6 text-center text-slate-400 text-xs uppercase tracking-wider">
            Sin fotos — sube al menos una para que el inventario sea válido
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photosForArea.map((p) => (
              <div key={p.id} className="relative group aspect-square bg-slate-200 rounded-lg overflow-hidden">
                <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setViewingPhoto(p)}
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

      {/* Visor de foto */}
      <Modal isOpen={!!viewingPhoto} onClose={() => setViewingPhoto(null)} title="Foto">
        {viewingPhoto && (
          <div className="space-y-2">
            <img src={viewingPhoto.dataUrl} alt="" className="w-full rounded-lg" />
            <p className="text-xs text-slate-500 text-center">
              {new Date(viewingPhoto.takenAt).toLocaleString('es-CO')}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
