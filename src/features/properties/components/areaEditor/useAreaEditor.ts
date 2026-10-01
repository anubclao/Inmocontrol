// filepath: src/features/properties/components/areaEditor/useAreaEditor.ts
import { useRef, useState } from 'react';
import { ITEM_CATALOG, type ItemStatus } from '../../inventoryConfig';
import type {
  InventoryArea,
  InventoryItem,
  InventoryPhoto,
  ItemMedia,
} from '../../inventoryTypes';
import { compressImage } from '../../imageCompress';
import {
  extractVideoThumbnail,
  readFileAsDataUrl,
  readVideoDuration,
} from '../../videoThumbnail';
import type { AreaItemsChecklistHandlers } from './AreaItemsChecklist';
import type { RemoveItemModalState } from './RemoveItemModal';

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

interface UseAreaEditorArgs {
  area: InventoryArea;
  photos: InventoryPhoto[];
  onChange: (area: InventoryArea) => void;
  onPhotosChange: (photos: InventoryPhoto[]) => void;
  onAddPhoto?: (file: File, caption?: string) => Promise<void> | void;
  onSaveItemMedia?: (itemId: string, media: ItemMedia) => Promise<void>;
  onDeleteItemMedia?: (itemId: string, mediaId: string) => Promise<void>;
}

/**
 * Hook con todo el state + handlers del editor de un área. Mantiene la
 * API simple: devuelve refs, state, derived y handlers listos para usar
 * desde el shell. La lógica de UI vive en `AreaEditor` (el componente).
 */
export function useAreaEditor({
  area,
  photos,
  onChange,
  onPhotosChange,
  onAddPhoto,
  onSaveItemMedia,
  onDeleteItemMedia,
}: UseAreaEditorArgs) {
  const itemPhotoInputRef = useRef<HTMLInputElement>(null);
  const itemVideoInputRef = useRef<HTMLInputElement>(null);
  const [viewingPhoto, setViewingPhoto] = useState<InventoryPhoto | null>(null);
  const [viewingMedia, setViewingMedia] = useState<ItemMedia | null>(null);
  const [mediaTargetItemId, setMediaTargetItemId] = useState<string | null>(null);
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<RemoveItemModalState | null>(null);
  const [removalReason, setRemovalReason] = useState('');

  const items = ITEM_CATALOG[area.category] ?? [];
  const photosForArea = photos.filter((p) => p.areaId === area.id);
  const filledItems = Object.values(area.items).filter((i) => i.status && !i.removed).length;
  const removedItems = Object.values(area.items).filter((i) => i.removed).length;
  const progress = items.length > 0 ? (filledItems / items.length) * 100 : 100;

  // ── Item handlers ──────────────────────────────────────────────
  const updateItem = (itemId: string, patch: Partial<InventoryItem>) => {
    const def = items.find((i) => i.id === itemId);
    if (!def) return;
    const prev = area.items[itemId];
    const base: InventoryItem = {
      id: def.id,
      label: def.label,
      status: prev?.status ?? 'na',
      qty: prev?.qty ?? 1,
      material: prev?.material ?? '',
      observations: prev?.observations ?? prev?.notes ?? '',
      media: prev?.media ?? [],
      removed: prev?.removed ?? false,
      removalReason: prev?.removalReason ?? '',
    };
    onChange({
      ...area,
      items: { ...area.items, [itemId]: { ...base, ...patch } },
    });
  };
  const setItemStatus = (itemId: string, status: ItemStatus) => updateItem(itemId, { status });
  const setItemQty = (itemId: string, qty: number) =>
    updateItem(itemId, { qty: Math.max(1, Math.floor(qty || 1)) });
  const setItemMaterial = (itemId: string, material: string) => updateItem(itemId, { material });
  const setItemObservations = (itemId: string, observations: string) =>
    updateItem(itemId, { observations });

  // ── Item media handlers ────────────────────────────────────────
  const addItemMedia = async (itemId: string, file: File, kind: 'photo' | 'video') => {
    const def = items.find((i) => i.id === itemId);
    if (!def) return;
    const seq = (area.items[itemId]?.media ?? []).length + 1;
    const slug = slugify(def.label);
    const fileName = `${slug}_${String(seq).padStart(2, '0')}`;
    const base = {
      id: `${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName,
      takenAt: new Date().toISOString(),
      sizeBytes: file.size,
    };
    const media: ItemMedia = kind === 'photo'
      ? { ...base, type: 'photo', dataUrl: await compressImage(file) }
      : {
          ...base,
          type: 'video',
          dataUrl: await extractVideoThumbnail(file),
          videoDataUrl: await readFileAsDataUrl(file),
          durationSec: await readVideoDuration(file),
        };
    if (onSaveItemMedia) {
      try { await onSaveItemMedia(itemId, media); }
      catch (e) { console.error('[itemMedia] no se pudo persistir:', e); }
    }
    const prevMedia = area.items[itemId]?.media ?? [];
    updateItem(itemId, { media: [...prevMedia, media] });
  };

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

  // ── Item "no aplica" handlers ──────────────────────────────────
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
  const restoreItem = (itemId: string) => {
    updateItem(itemId, { removed: false, status: 'na' });
  };

  // ── Área photos handler ────────────────────────────────────────
  const addAreaPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await compressImage(file);
    const seq = photosForArea.length + 1;
    const slug = slugify(area.label);
    const photo: InventoryPhoto = {
      id: `${area.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      areaId: area.id,
      areaLabel: area.label,
      dataUrl,
      takenAt: new Date().toISOString(),
      fileName: `${slug}_${String(seq).padStart(2, '0')}`,
    };
    onPhotosChange([...photos, photo]);
  };
  const handleAddPhoto = (file: File) =>
    onAddPhoto ? onAddPhoto(file) : addAreaPhoto(file);

  // ── Item file input handlers ───────────────────────────────────
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
  const handleItemVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = mediaTargetItemId;
    if (!target) return;
    const file = e.target.files?.[0];
    if (file) await addItemMedia(target, file, 'video');
    if (itemVideoInputRef.current) itemVideoInputRef.current.value = '';
    setMediaTargetItemId(null);
  };

  // ── Handlers objeto para AreaItemsChecklist ────────────────────
  const checklistHandlers: AreaItemsChecklistHandlers = {
    updateItem,
    setItemStatus,
    setItemQty,
    setItemMaterial,
    setItemObservations,
    onRequestRemoveItem: (itemId, label) => setConfirmRemoveItem({ itemId, label }),
    onRestoreItem: restoreItem,
    onAddItemMedia: addItemMedia,
    onRemoveItemMedia: removeItemMedia,
    onViewMedia: setViewingMedia,
  };

  const cancelRemoveItem = () => {
    setConfirmRemoveItem(null);
    setRemovalReason('');
  };

  return {
    // refs
    itemPhotoInputRef,
    itemVideoInputRef,
    // state
    viewingPhoto,
    setViewingPhoto,
    viewingMedia,
    setViewingMedia,
    mediaTargetItemId,
    setMediaTargetItemId,
    confirmRemoveItem,
    removalReason,
    setRemovalReason,
    // derived
    items,
    photosForArea,
    filledItems,
    removedItems,
    progress,
    // handlers
    checklistHandlers,
    handleAddPhoto,
    handleItemPhotoFile,
    handleItemVideoFile,
    executeRemoveItem,
    cancelRemoveItem,
  };
}
