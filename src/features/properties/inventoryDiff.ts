import type { Inventory, InventoryArea, InventoryItem } from './inventoryTypes';
import { ITEM_STATUS_LABEL, type ItemStatus } from './inventoryConfig';

/**
 * Compara dos inventarios (Inicial vs Final) área por área e item por item.
 * Detecta:
 *  - áreas nuevas en el Final (no existían en el Inicial)
 *  - áreas removidas (existían en Inicial, no en Final)
 *  - items con cambio de estado
 *  - items nuevos (no marcados en Inicial, sí en Final)
 *  - items removidos
 */

export type DiffSeverity = 'unchanged' | 'minor' | 'major' | 'added' | 'removed';

export interface ItemDiff {
  itemId: string;
  label: string;
  initial: ItemStatus | null;
  final: ItemStatus | null;
  severity: DiffSeverity;
}

export interface AreaDiff {
  areaId: string;
  label: string;
  category: string;
  initialExists: boolean;
  finalExists: boolean;
  items: ItemDiff[];
  /** Severidad agregada del área = la peor de sus items */
  severity: DiffSeverity;
  observationsDiff?: { initial?: string; final?: string };
  /** Fotos del área en cada fase (dataUrl) */
  photosDiff?: {
    initial: { id: string; dataUrl: string; takenAt: string }[];
    final: { id: string; dataUrl: string; takenAt: string }[];
  };
}

export interface InventoryDiff {
  areas: AreaDiff[];
  totalItems: number;
  changedItems: number;
  addedItems: number;
  removedItems: number;
  /** Severidad global = la peor del inventario */
  hasIssues: boolean;
}

function itemSeverity(initial: ItemStatus | null, final: ItemStatus | null): DiffSeverity {
  if (initial === final) return 'unchanged';
  if (initial === null) return 'added';
  if (final === null) return 'removed';
  // De bueno a regular/malo = major; de regular a malo = major; resto = minor
  const rank: Record<ItemStatus, number> = { bueno: 0, regular: 1, malo: 2, na: -1 };
  const initRank = rank[initial];
  const finalRank = rank[final];
  if (initRank === -1 || finalRank === -1) return 'minor';
  if (finalRank > initRank) return 'major'; // empeoró
  if (finalRank < initRank) return 'minor'; // mejoró
  return 'unchanged';
}

function worstSeverity(severities: DiffSeverity[]): DiffSeverity {
  if (severities.includes('major')) return 'major';
  if (severities.includes('added') || severities.includes('removed')) return 'added';
  if (severities.includes('minor')) return 'minor';
  return 'unchanged';
}

export function diffInventories(initial: Inventory, final: Inventory): InventoryDiff {
  const initialById = new Map<string, InventoryArea>(initial.areas.map((a) => [a.id, a]));
  const finalById = new Map<string, InventoryArea>(final.areas.map((a) => [a.id, a]));
  const allIds = new Set<string>([...initialById.keys(), ...finalById.keys()]);

  const areas: AreaDiff[] = [];
  let totalItems = 0;
  let changedItems = 0;
  let addedItems = 0;
  let removedItems = 0;

  // Orden estable: por aparición en el Inicial primero, luego las del Final
  const orderedIds: string[] = [];
  initial.areas.forEach((a) => orderedIds.push(a.id));
  final.areas.forEach((a) => { if (!orderedIds.includes(a.id)) orderedIds.push(a.id); });

  orderedIds.forEach((id) => {
    const a = initialById.get(id);
    const f = finalById.get(id);
    if (!a && !f) return;

    const items: ItemDiff[] = [];
    const allItemIds = new Set<string>([
      ...Object.keys(a?.items ?? {}),
      ...Object.keys(f?.items ?? {}),
    ]);

    allItemIds.forEach((itemId) => {
      const initialItem: InventoryItem | null = a?.items[itemId] ?? null;
      const finalItem: InventoryItem | null = f?.items[itemId] ?? null;
      const sev = itemSeverity(initialItem?.status ?? null, finalItem?.status ?? null);
      items.push({
        itemId,
        label: initialItem?.label ?? finalItem?.label ?? itemId,
        initial: initialItem?.status ?? null,
        final: finalItem?.status ?? null,
        severity: sev,
      });
      totalItems++;
      if (sev === 'major' || sev === 'minor') changedItems++;
      if (sev === 'added') addedItems++;
      if (sev === 'removed') removedItems++;
    });

    areas.push({
      areaId: id,
      label: f?.label ?? a?.label ?? id,
      category: f?.category ?? a?.category ?? '',
      initialExists: !!a,
      finalExists: !!f,
      items,
      severity: worstSeverity(items.map((it) => it.severity)),
      observationsDiff:
        a?.observations !== f?.observations
          ? { initial: a?.observations, final: f?.observations }
          : undefined,
      photosDiff: {
        initial: (initial.photos ?? []).filter((p) => p.areaId === id),
        final: (final.photos ?? []).filter((p) => p.areaId === id),
      },
    });
  });

  return {
    areas,
    totalItems,
    changedItems,
    addedItems,
    removedItems,
    hasIssues: areas.some((a) => a.severity !== 'unchanged'),
  };
}

export const SEVERITY_BADGE: Record<DiffSeverity, { label: string; bg: string; text: string }> = {
  unchanged: { label: 'Sin cambios', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  minor: { label: 'Cambio menor', bg: 'bg-amber-50', text: 'text-amber-700' },
  major: { label: 'Daño detectado', bg: 'bg-red-50', text: 'text-red-700' },
  added: { label: 'Nuevo', bg: 'bg-blue-50', text: 'text-blue-700' },
  removed: { label: 'Removido', bg: 'bg-slate-100', text: 'text-slate-600' },
};

export const STATUS_SHORT: Record<ItemStatus, string> = {
  bueno: 'B',
  regular: 'R',
  malo: 'M',
  na: '—',
};
