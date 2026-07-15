import React, { useRef, useState } from 'react';
import { Camera, Video, Trash2, Eye, X, AlertTriangle } from 'lucide-react';
import { Button, Input, Modal } from '../../../shared/ui';
import {
  ITEM_CATALOG, ITEM_STATUS_COLOR, ITEM_STATUS_LABEL, MATERIAL_CATALOG,
  type ItemStatus,
} from '../inventoryConfig';
import type { InventoryArea, InventoryItem, InventoryPhoto, ItemMedia } from '../inventoryTypes';
import { compressImage } from '../imageCompress';
import { extractVideoThumbnail, readFileAsDataUrl, readVideoDuration } from '../videoThumbnail';

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

const STATUSES: ItemStatus[] = ['bueno', 'regular', 'malo', 'na'];

/** Compat: si el item viejo no tiene `qty`, `material`, `observations`,
 *  devuelve defaults razonables al renderizar. */
function fillItemDefaults(raw: Partial<InventoryItem> | undefined, def: { id: string; label: string }): InventoryItem {
  return {
    id: def.id,
    label: def.label,
    status: raw?.status ?? 'na',
    qty: raw?.qty ?? 1,
    material: raw?.material ?? '',
    observations: raw?.observations ?? raw?.notes ?? '',
    media: raw?.media ?? [],
    removed: raw?.removed ?? false,
    removalReason: raw?.removalReason ?? '',
  };
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function AreaEditor({
  area, index, total, recommendedPhotos, photos, onChange, onPhotosChange,
  onAddPhoto, onRemovePhoto, onBack, onNext, onSkipToSign, hideSignatures,
  onSaveItemMedia, onDeleteItemMedia,
}: AreaEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const itemPhotoInputRef = useRef<HTMLInputElement>(null);
  const itemVideoInputRef = useRef<HTMLInputElement>(null);
  const [viewingPhoto, setViewingPhoto] = useState<InventoryPhoto | null>(null);
  const [viewingMedia, setViewingMedia] = useState<ItemMedia | null>(null);
  /** itemId del item al que se le está adjuntando foto/video en este momento. */
  const [mediaTargetItemId, setMediaTargetItemId] = useState<string | null>(null);
  /** Modal: confirmar eliminar item (porque el item no aplica en este inmueble). */
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<{
    itemId: string;
    label: string;
  } | null>(null);
  const [removalReason, setRemovalReason] = useState('');

  const items = ITEM_CATALOG[area.category] ?? [];
  const photosForArea = photos.filter((p) => p.areaId === area.id);
  const filledItems = Object.values(area.items).filter((i) => i.status && !i.removed).length;
  const removedItems = Object.values(area.items).filter((i) => i.removed).length;
  const progress = items.length > 0 ? (filledItems / items.length) * 100 : 100;

  /** Helper para mutar un item. Si el item no existe, lo crea con defaults. */
  const updateItem = (itemId: string, patch: Partial<InventoryItem>) => {
    const def = items.find((i) => i.id === itemId);
    if (!def) return;
    const prev = area.items[itemId];
    const base = fillItemDefaults(prev, def);
    onChange({
      ...area,
      items: {
        ...area.items,
        [itemId]: { ...base, ...patch },
      },
    });
  };
  const setItemStatus = (itemId: string, status: ItemStatus) => updateItem(itemId, { status });
  const setItemQty = (itemId: string, qty: number) => updateItem(itemId, { qty: Math.max(1, Math.floor(qty || 1)) });
  const setItemMaterial = (itemId: string, material: string) => updateItem(itemId, { material });
  const setItemObservations = (itemId: string, observations: string) => updateItem(itemId, { observations });

  /** Adjuntar media (foto o video) a un item específico. */
  const addItemMedia = async (itemId: string, file: File, kind: 'photo' | 'video') => {
    const def = items.find((i) => i.id === itemId);
    if (!def) return;
    const itemSlug = slugify(def.label);
    const seqBase = (area.items[itemId]?.media ?? []).length + 1;
    const seq = String(seqBase).padStart(2, '0');

    let media: ItemMedia;
    if (kind === 'photo') {
      const dataUrl = await compressImage(file);
      media = {
        id: `${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'photo',
        dataUrl,
        fileName: `${itemSlug}_${seq}`,
        takenAt: new Date().toISOString(),
        sizeBytes: file.size,
      };
    } else {
      // Video: extrae thumbnail y guarda el dataURL del video aparte
      const [thumb, videoDataUrl, duration] = await Promise.all([
        extractVideoThumbnail(file),
        readFileAsDataUrl(file),
        readVideoDuration(file),
      ]);
      media = {
        id: `${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'video',
        dataUrl: thumb,         // thumbnail para UI/PDF
        videoDataUrl,           // archivo completo para descarga futura
        fileName: `${itemSlug}_${seq}`,
        takenAt: new Date().toISOString(),
        durationSec: duration,
        sizeBytes: file.size,
      };
    }

    // Persiste en el store `photos` de IndexedDB (key: inventoryId:mediaId)
    if (onSaveItemMedia) {
      try { await onSaveItemMedia(itemId, media); }
      catch (e) { console.error('[itemMedia] no se pudo persistir:', e); }
    }

    // Y también lo agrega inline al item para que la UI lo muestre al instante
    const prevMedia = area.items[itemId]?.media ?? [];
    updateItem(itemId, { media: [...prevMedia, media] });
  };

  /** Quitar media de un item. */
  const removeItemMedia = async (itemId: string, mediaId: string) => {
    const prev = area.items[itemId];
    if (!prev?.media) return;
    const nextMedia = prev.media.filter((m) => m.id !== mediaId);
    updateItem(itemId, { media: nextMedia });
    if (onDeleteItemMedia) {
      try { await onDeleteItemMedia(itemId, mediaId); }
      catch (e) { console.error('[itemMedia] no se pudo borrar:', e); }
    }
  };

  /** Marcar item como "no aplica en este inmueble" (sale del inventario). */
  const executeRemoveItem = () => {
    if (!confirmRemoveItem) return;
    updateItem(confirmRemoveItem.itemId, {
      removed: true,
      removalReason: removalReason.trim() || 'No aplica en este inmueble',
      status: 'na',
    });
    setConfirmRemoveItem(null);
    setRemovalReason('');
  };

  /** Restaurar un item que fue marcado como "no aplica". */
  const restoreItem = (itemId: string) => {
    updateItem(itemId, { removed: false, status: 'na' });
  };

  // ─── Handlers de fotos de área (los originales) ───────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files as FileList | null;
    const files: File[] = fileList ? Array.from(fileList) : [];
    const baseIndex = (photos ?? []).filter((p) => p.areaId === area.id).length;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await compressImage(file);
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

  /** Handler para el input file de FOTO de un item específico. */
  const handleItemPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = mediaTargetItemId;
    if (!target) return;
    const fileList = e.target.files as FileList | null;
    const files: File[] = fileList ? Array.from(fileList) : [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      await addItemMedia(target, file, 'photo');
    }
    if (itemPhotoInputRef.current) itemPhotoInputRef.current.value = '';
    setMediaTargetItemId(null);
  };

  /** Handler para el input file de VIDEO de un item específico. */
  const handleItemVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = mediaTargetItemId;
    if (!target) return;
    const fileList = e.target.files as FileList | null;
    const files: FileList | null = e.target.files;
    if (files && files[0]) {
      await addItemMedia(target, files[0], 'video');
    }
    if (itemVideoInputRef.current) itemVideoInputRef.current.value = '';
    setMediaTargetItemId(null);
  };

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
      <div className="space-y-2">
        {items.map((item) => {
          const raw = area.items[item.id];
          const def = items.find((i) => i.id === item.id)!;
          const current = fillItemDefaults(raw, def);
          const materialOptions = MATERIAL_CATALOG[item.id] ?? [];
          const itemMedia = current.media ?? [];

          // Si el item fue marcado como "no aplica en este inmueble",
          // lo mostramos colapsado con opción de restaurar.
          if (current.removed) {
            return (
              <div
                key={item.id}
                className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-3"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-900 line-through">{item.label}</p>
                  <p className="text-xs text-amber-700 italic">
                    {current.removalReason || 'No aplica en este inmueble'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restoreItem(item.id)}
                  className="text-xs text-amber-700 hover:text-amber-900 font-semibold underline flex-shrink-0"
                >
                  Restaurar
                </button>
              </div>
            );
          }

          return (
            <div key={item.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
              {/* Fila 1: Label + Cantidad + Estado + Acciones */}
              <div className="flex items-start gap-2">
                <p className="text-sm font-bold text-slate-900 flex-1 min-w-0">{item.label}</p>
                <div className="w-14 flex-shrink-0">
                  <label className="text-[9px] uppercase text-slate-500 font-bold block leading-tight mb-0.5">Cant.</label>
                  <input
                    type="number"
                    min="1"
                    value={current.qty}
                    onChange={(e) => setItemQty(item.id, Number(e.target.value))}
                    className="w-full px-1.5 py-1 bg-white border border-slate-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                {/* Botón "no aplica" — saca el item del inventario */}
                <button
                  type="button"
                  onClick={() => setConfirmRemoveItem({ itemId: item.id, label: item.label })}
                  className="flex-shrink-0 self-end p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                  title="Marcar como 'No aplica en este inmueble' (ej: este apto no tiene tina)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {materialOptions.length > 0 && (
                  <div>
                    <label className="text-[9px] uppercase text-slate-500 font-bold block leading-tight mb-0.5">Material</label>
                    <select
                      value={current.material ?? ''}
                      onChange={(e) => setItemMaterial(item.id, e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="">— Seleccionar —</option>
                      {materialOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-[9px] uppercase text-slate-500 font-bold block leading-tight mb-0.5">Estado</label>
                  <div className="grid grid-cols-4 gap-1">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setItemStatus(item.id, s)}
                        className={`py-1 text-[9px] font-bold rounded uppercase transition-all ${
                          current.status === s
                            ? ITEM_STATUS_COLOR[s] + ' shadow-sm'
                            : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-400'
                        }`}
                        title={ITEM_STATUS_LABEL[s]}
                      >
                        {ITEM_STATUS_LABEL[s].slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Fila 2: Observaciones */}
              <input
                type="text"
                value={current.observations ?? ''}
                onChange={(e) => setItemObservations(item.id, e.target.value)}
                placeholder="Observaciones (rayones, manchas, piezas faltantes...)"
                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />

              {/* Fila 3: Media del item (fotos / videos) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setMediaTargetItemId(item.id);
                    itemPhotoInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                  title="Subir foto de este item"
                >
                  <Camera className="w-3 h-3" />
                  Foto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMediaTargetItemId(item.id);
                    itemVideoInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                  title="Grabar/subir video de este item"
                >
                  <Video className="w-3 h-3" />
                  Video
                </button>
                {itemMedia.length > 0 && (
                  <span className="text-[10px] text-slate-500 ml-1">
                    {itemMedia.length} adjunto{itemMedia.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {/* Thumbnails del item */}
              {itemMedia.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {itemMedia.map((m) => (
                    <div
                      key={m.id}
                      className="relative group aspect-square bg-slate-200 rounded overflow-hidden border border-slate-200"
                    >
                      {m.type === 'video' ? (
                        <>
                          <img src={m.dataUrl} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-900/30 flex items-center justify-center pointer-events-none">
                            <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                              <Video className="w-3 h-3 text-slate-700" />
                            </div>
                          </div>
                          {m.durationSec ? (
                            <span className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[9px] font-mono bg-slate-900/80 text-white rounded">
                              {Math.floor(m.durationSec)}s
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <img src={m.dataUrl} alt="" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setViewingMedia(m)}
                          className="p-1 bg-white rounded text-slate-700 hover:text-blue-600"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeItemMedia(item.id, m.id)}
                          className="p-1 bg-white rounded text-slate-700 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Observaciones del área */}
      <div>
        <Input
          label="Observaciones del área"
          placeholder="Ej: mancha de humedad en techo, balcón con pintura descascarada..."
          value={area.observations ?? ''}
          onChange={(e) => onChange({ ...area, observations: e.target.value })}
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

      {/* Visor de foto de área */}
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

      {/* Visor de media de item (foto o video) */}
      <Modal
        isOpen={!!viewingMedia}
        onClose={() => setViewingMedia(null)}
        title={viewingMedia?.type === 'video' ? 'Video' : 'Foto'}
        size="lg"
      >
        {viewingMedia?.type === 'video' ? (
          <div className="space-y-2">
            {viewingMedia.videoDataUrl ? (
              <video
                src={viewingMedia.videoDataUrl}
                controls
                className="w-full rounded-lg bg-black max-h-[70vh]"
              />
            ) : (
              <img src={viewingMedia.dataUrl} alt="" className="w-full rounded-lg" />
            )}
            <p className="text-xs text-slate-500 text-center">
              {viewingMedia.durationSec ? `Duración: ${viewingMedia.durationSec}s · ` : ''}
              {new Date(viewingMedia.takenAt).toLocaleString('es-CO')}
            </p>
          </div>
        ) : viewingMedia ? (
          <div className="space-y-2">
            <img src={viewingMedia.dataUrl} alt="" className="w-full rounded-lg" />
            <p className="text-xs text-slate-500 text-center">
              {new Date(viewingMedia.takenAt).toLocaleString('es-CO')}
            </p>
          </div>
        ) : null}
      </Modal>

      {/* Modal: confirmar "no aplica" de un item */}
      <Modal
        isOpen={!!confirmRemoveItem}
        onClose={() => { setConfirmRemoveItem(null); setRemovalReason(''); }}
        title="¿Este item no aplica en este inmueble?"
        size="md"
      >
        {confirmRemoveItem && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              Vas a marcar <strong>{confirmRemoveItem.label}</strong> como "no aplica" en este inmueble.
              <br />
              <span className="text-xs text-amber-700">
                Úsalo cuando el item no existe físicamente (ej: este apto no tiene tina, no tiene horno, etc.).
                Quedará registrado en el PDF como excluido con tu motivo.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Motivo (opcional)
              </label>
              <input
                type="text"
                value={removalReason}
                onChange={(e) => setRemovalReason(e.target.value)}
                placeholder="Ej: Este apartamento no tiene tina"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setConfirmRemoveItem(null); setRemovalReason(''); }}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={executeRemoveItem}
              >
                Sí, marcar como "no aplica"
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
