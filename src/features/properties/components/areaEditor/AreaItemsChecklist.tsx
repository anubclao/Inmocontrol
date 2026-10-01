// filepath: src/features/properties/components/areaEditor/AreaItemsChecklist.tsx
import type { RefObject } from 'react';
import { Camera, Video, X, Eye, Trash2 } from 'lucide-react';
import {
  ITEM_STATUS_COLOR,
  ITEM_STATUS_LABEL,
  MATERIAL_CATALOG,
  type ItemDef,
  type ItemStatus,
} from '../../inventoryConfig';
import type {
  InventoryArea,
  InventoryItem,
  ItemMedia,
} from '../../inventoryTypes';
import { RemovedItemRow } from './RemovedItemRow';

const STATUSES: ItemStatus[] = ['bueno', 'regular', 'malo', 'na'];

/** Compat: si el item viejo no tiene `qty`, `material`, `observations`,
 *  devuelve defaults razonables al renderizar. */
function fillItemDefaults(
  raw: Partial<InventoryItem> | undefined,
  def: { id: string; label: string },
): InventoryItem {
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

export interface AreaItemsChecklistHandlers {
  updateItem: (itemId: string, patch: Partial<InventoryItem>) => void;
  setItemStatus: (itemId: string, status: ItemStatus) => void;
  setItemQty: (itemId: string, qty: number) => void;
  setItemMaterial: (itemId: string, material: string) => void;
  setItemObservations: (itemId: string, observations: string) => void;
  onRequestRemoveItem: (itemId: string, label: string) => void;
  onRestoreItem: (itemId: string) => void;
  onAddItemMedia: (itemId: string, file: File, kind: 'photo' | 'video') => Promise<void> | void;
  onRemoveItemMedia: (itemId: string, mediaId: string) => Promise<void> | void;
  onViewMedia: (m: ItemMedia) => void;
}

export interface AreaItemsChecklistProps {
  items: ItemDef[];
  area: InventoryArea;
  handlers: AreaItemsChecklistHandlers;
  mediaTargetItemId: string | null;
  setMediaTargetItemId: (id: string | null) => void;
  itemPhotoInputRef: RefObject<HTMLInputElement | null>;
  itemVideoInputRef: RefObject<HTMLInputElement | null>;
  onItemPhotoFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  onItemVideoFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
}

/**
 * Checklist de items de un área. Cada item tiene: cantidad, material,
 * estado (bueno/regular/malo/na), observaciones y adjuntos (fotos/videos).
 * Soporta "no aplica" (saca el item del inventario con motivo).
 */
export function AreaItemsChecklist({
  items,
  area,
  handlers,
  mediaTargetItemId,
  setMediaTargetItemId,
  itemPhotoInputRef,
  itemVideoInputRef,
  onItemPhotoFile,
  onItemVideoFile,
}: AreaItemsChecklistProps) {
  return (
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
            <RemovedItemRow
              key={item.id}
              label={item.label}
              removalReason={current.removalReason}
              onRestore={() => handlers.onRestoreItem(item.id)}
            />
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
                  onChange={(e) => handlers.setItemQty(item.id, Number(e.target.value))}
                  className="w-full px-1.5 py-1 bg-white border border-slate-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              {/* Botón "no aplica" — saca el item del inventario */}
              <button
                type="button"
                onClick={() => handlers.onRequestRemoveItem(item.id, item.label)}
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
                    onChange={(e) => handlers.setItemMaterial(item.id, e.target.value)}
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
                      onClick={() => handlers.setItemStatus(item.id, s)}
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
              onChange={(e) => handlers.setItemObservations(item.id, e.target.value)}
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
                        onClick={() => handlers.onViewMedia(m)}
                        className="p-1 bg-white rounded text-slate-700 hover:text-blue-600"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlers.onRemoveItemMedia(item.id, m.id)}
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
  );
}
