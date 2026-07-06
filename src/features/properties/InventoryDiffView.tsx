import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, AlertTriangle, XCircle, Plus, Minus, FileDown } from 'lucide-react';
import { Button, Card, Modal } from '../../shared/ui';
import { inventoryDB } from './inventoryDB';
import { diffInventories, SEVERITY_BADGE, STATUS_SHORT, type InventoryDiff, type AreaDiff, type ItemDiff } from './inventoryDiff';
import { ITEM_STATUS_LABEL } from './inventoryConfig';
import type { Inventory } from './inventoryTypes';
import { generateActaEntregaPDF } from './actaPdf';

interface InventoryDiffViewProps {
  propertyId: string;
  property: { address: string; owner: string; chip: string };
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onClose: () => void;
}

/**
 * Vista de comparativa Inicial vs Final, área por área e item por item.
 * Resalta en rojo los daños detectados, en amarillo los cambios menores,
 * y muestra totales agregados.
 */
export function InventoryDiffView({ propertyId, property, showToast, onClose }: InventoryDiffViewProps) {
  const [initial, setInitial] = useState<Inventory | null>(null);
  const [finalInv, setFinalInv] = useState<Inventory | null>(null);
  const [diff, setDiff] = useState<InventoryDiff | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Primero intenta desde MySQL (fuente de verdad); fallback a IndexedDB
      let a: any = null;
      let b: any = null;
      try {
        const res = await fetch(`/api/inventories?propertyId=${propertyId}`);
        if (res.ok) {
          const data = await res.json();
          const invs: any[] = data.inventories ?? [];
          a = invs.find((i) => i.phase === 'inicial');
          b = invs.find((i) => i.phase === 'final');
          // MySQL devuelve JSON como string en algunos setups; parseamos
          if (a) {
            a = {
              ...a,
              counters: typeof a.counters === 'string' ? JSON.parse(a.counters) : a.counters,
              areas: typeof a.areas === 'string' ? JSON.parse(a.areas) : a.areas,
              photos: typeof a.photos === 'string' ? JSON.parse(a.photos) : a.photos,
              signatures: typeof a.signatures === 'string' ? JSON.parse(a.signatures) : a.signatures,
              customAreas: a.custom_areas
                ? (typeof a.custom_areas === 'string' ? JSON.parse(a.custom_areas) : a.custom_areas)
                : undefined,
            };
          }
          if (b) {
            b = {
              ...b,
              counters: typeof b.counters === 'string' ? JSON.parse(b.counters) : b.counters,
              areas: typeof b.areas === 'string' ? JSON.parse(b.areas) : b.areas,
              photos: typeof b.photos === 'string' ? JSON.parse(b.photos) : b.photos,
              signatures: typeof b.signatures === 'string' ? JSON.parse(b.signatures) : b.signatures,
              customAreas: b.custom_areas
                ? (typeof b.custom_areas === 'string' ? JSON.parse(b.custom_areas) : b.custom_areas)
                : undefined,
            };
          }
        }
      } catch (e) {
        console.warn('[InventoryDiffView] no se pudo leer de MySQL:', e);
      }

      // Fallback: IndexedDB
      if (!a) a = await inventoryDB.getInventory(`${propertyId}:inicial`);
      if (!b) b = await inventoryDB.getInventory(`${propertyId}:final`);

      if (cancelled) return;
      setInitial(a);
      setFinalInv(b);
      if (a && b) setDiff(diffInventories(a, b));
    })();
    return () => { cancelled = true; };
  }, [propertyId]);

  if (!initial) {
    return (
      <Modal isOpen onClose={onClose} title="Comparativa de Inventarios" size="xl">
        <div className="text-center py-10">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h3 className="font-bold text-slate-900">No hay Inventario Inicial</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            Para comparar necesitas primero hacer el Inventario Inicial al captar la propiedad. Una vez firmado, vuelve aquí.
          </p>
          <Button className="mt-6" onClick={onClose}>Entendido</Button>
        </div>
      </Modal>
    );
  }

  if (!finalInv) {
    return (
      <Modal isOpen onClose={onClose} title="Comparativa de Inventarios" size="xl">
        <div className="text-center py-10">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h3 className="font-bold text-slate-900">No hay Inventario Final</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            El Inventario Final se hace al entregar/devolver el inmueble. Ábrelo desde el detalle de la propiedad.
          </p>
          <Button className="mt-6" onClick={onClose}>Entendido</Button>
        </div>
      </Modal>
    );
  }

  if (!diff) {
    return (
      <Modal isOpen onClose={onClose} title="Comparando inventarios…" size="xl">
        <p className="text-sm text-slate-500 text-center py-10">Calculando diferencias…</p>
      </Modal>
    );
  }

  const handleGenerateActa = async () => {
    if (!initial || !finalInv) return;
    setGenerating(true);
    try {
      await generateActaEntregaPDF(initial, finalInv, diff, property, async (id) => {
        const photo = finalInv.photos.find((p) => p.id === id)
          ?? initial.photos.find((p) => p.id === id);
        return photo?.dataUrl ?? null;
      });
      showToast('Acta de entrega generada', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al generar el acta', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Comparativa de Inventarios — ${property.address}`} size="full">
      <div className="space-y-6">
        {/* Header con totales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Áreas" value={diff.areas.length} icon="📋" />
          <SummaryCard label="Items evaluados" value={diff.totalItems} icon="🔍" />
          <SummaryCard
            label="Cambios"
            value={diff.changedItems}
            tone={diff.changedItems > 0 ? 'warn' : 'ok'}
            icon="⚠️"
          />
          <SummaryCard
            label="Daños"
            value={diff.areas.filter((a) => a.severity === 'major').length}
            tone={diff.areas.some((a) => a.severity === 'major') ? 'bad' : 'ok'}
            icon="🔴"
          />
        </div>

        {/* Resumen global */}
        <Card className={`p-4 ${diff.hasIssues ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex items-start gap-3">
            {diff.hasIssues ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            )}
            <div>
              <h4 className={`font-bold text-sm ${diff.hasIssues ? 'text-amber-900' : 'text-emerald-900'}`}>
                {diff.hasIssues ? 'Se detectaron cambios durante el arriendo' : 'El inmueble se entregó en el mismo estado'}
              </h4>
              <p className={`text-xs mt-1 ${diff.hasIssues ? 'text-amber-800' : 'text-emerald-800'}`}>
                {diff.changedItems > 0 && `${diff.changedItems} items con cambio de estado. `}
                {diff.addedItems > 0 && `${diff.addedItems} items nuevos. `}
                {diff.removedItems > 0 && `${diff.removedItems} items removidos. `}
                {!diff.hasIssues && 'Todos los items coinciden con el Inventario Inicial.'}
              </p>
            </div>
          </div>
        </Card>

        {/* Detalle por área */}
        <div className="space-y-3">
          {diff.areas.map((area: AreaDiff) => (
            <AreaDiffCard key={area.areaId} area={area} />
          ))}
        </div>

        {/* Acciones */}
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <div className="flex-1" />
          <Button
            onClick={handleGenerateActa}
            disabled={generating}
            className="gap-2"
          >
            <FileDown className="w-4 h-4" />
            {generating ? 'Generando acta…' : 'Generar Acta de Entrega PDF'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SummaryCard({ label, value, icon, tone = 'neutral' }: { label: string; value: number; icon: string; tone?: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const colors = {
    ok: 'bg-emerald-50 border-emerald-100',
    warn: 'bg-amber-50 border-amber-100',
    bad: 'bg-red-50 border-red-100',
    neutral: 'bg-slate-50 border-slate-100',
  }[tone];
  return (
    <div className={`p-4 rounded-lg border ${colors}`}>
      <div className="flex items-center gap-2 text-2xl mb-1">{icon}</div>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function AreaDiffCard({ area }: { area: AreaDiff; key?: string }) {
  const [expanded, setExpanded] = useState(area.severity !== 'unchanged');
  const sev = SEVERITY_BADGE[area.severity];
  const changeCount = area.items.filter((i) => i.severity !== 'unchanged').length;

  return (
    <Card className={`overflow-hidden ${area.severity === 'major' ? 'border-red-200' : area.severity === 'minor' ? 'border-amber-200' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {area.severity === 'unchanged' ? (
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          ) : area.severity === 'major' ? (
            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          )}
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 truncate">{area.label}</h4>
            <p className="text-[10px] text-slate-500 uppercase">
              {area.items.length} items · {changeCount > 0 ? `${changeCount} con cambios` : 'sin cambios'}
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${sev.bg} ${sev.text}`}>
          {sev.label.toUpperCase()}
        </span>
      </button>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-slate-100"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-center">Inicial</th>
                  <th className="px-4 py-2 text-center w-12"></th>
                  <th className="px-4 py-2 text-center">Final</th>
                  <th className="px-4 py-2 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {area.items.map((item: ItemDiff) => (
                  <ItemDiffRow key={item.itemId} item={item} />
                ))}
              </tbody>
            </table>
          </div>
          {area.observationsDiff && (
            <div className="p-3 bg-amber-50 border-t border-amber-100 text-xs space-y-1">
              {area.observationsDiff.initial && (
                <p><span className="font-bold text-amber-900">Obs. inicial:</span> {area.observationsDiff.initial}</p>
              )}
              {area.observationsDiff.final && (
                <p><span className="font-bold text-amber-900">Obs. final:</span> {area.observationsDiff.final}</p>
              )}
            </div>
          )}

          {/* Comparativa de fotos */}
          {area.photosDiff && (area.photosDiff.initial.length > 0 || area.photosDiff.final.length > 0) && (
            <div className="border-t border-slate-100 p-4 bg-slate-50/50">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">
                Comparativa de fotos ({area.photosDiff.initial.length} inicial / {area.photosDiff.final.length} final)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-blue-600 uppercase mb-2">Captación</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {area.photosDiff.initial.length === 0 && (
                      <p className="text-xs text-slate-400 col-span-2">Sin fotos</p>
                    )}
                    {area.photosDiff.initial.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block aspect-square bg-slate-200 rounded overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors"
                      >
                        {photo.dataUrl ? (
                          <img src={photo.dataUrl} alt="Foto captación" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">Sin imagen</div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase mb-2">Colocación</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {area.photosDiff.final.length === 0 && (
                      <p className="text-xs text-slate-400 col-span-2">Sin fotos</p>
                    )}
                    {area.photosDiff.final.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block aspect-square bg-slate-200 rounded overflow-hidden border border-slate-200 hover:border-emerald-400 transition-colors"
                      >
                        {photo.dataUrl ? (
                          <img src={photo.dataUrl} alt="Foto colocación" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">Sin imagen</div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </Card>
  );
}

function ItemDiffRow({ item }: { item: ItemDiff; key?: string }) {
  const changed = item.severity !== 'unchanged';
  const isMajor = item.severity === 'major';
  return (
    <tr className={changed ? (isMajor ? 'bg-red-50/50' : 'bg-amber-50/50') : ''}>
      <td className="px-4 py-2 font-medium text-slate-900">{item.label}</td>
      <td className="px-4 py-2 text-center">
        {item.initial ? (
          <StatusPill status={item.initial} />
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-center text-slate-400">
        {item.severity === 'added' ? <Plus className="w-3 h-3 inline" />
          : item.severity === 'removed' ? <Minus className="w-3 h-3 inline" />
          : changed ? '→' : '·'}
      </td>
      <td className="px-4 py-2 text-center">
        {item.final ? (
          <StatusPill status={item.final} />
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {changed && (
          <span className={`text-[10px] font-bold uppercase ${SEVERITY_BADGE[item.severity].text}`}>
            {SEVERITY_BADGE[item.severity].label}
          </span>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: 'bueno' | 'regular' | 'malo' | 'na' }) {
  const colors = {
    bueno: 'bg-emerald-500 text-white',
    regular: 'bg-amber-500 text-white',
    malo: 'bg-red-500 text-white',
    na: 'bg-slate-300 text-slate-600',
  }[status];
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${colors}`} title={ITEM_STATUS_LABEL[status]}>
      {STATUS_SHORT[status]}
    </span>
  );
}
