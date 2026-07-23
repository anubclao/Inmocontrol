import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal } from '../../../shared/ui';
import { AreaConfigPanel } from './AreaConfigPanel';
import { AreaEditor } from './AreaEditor';
import { SignatureStep } from './SignatureStep';
import { inventoryDB, normalizePhotosArray } from '../inventoryDB';
import { getPropertyTypeConfig, resolveAreas, type PropertyType } from '../inventoryConfig';
import type { Inventory, InventoryArea, InventoryItem, InventoryPhoto, ItemMedia, Signature } from '../inventoryTypes';
import { generateInventoryPDF } from '../inventoryPdf';
import { useAppStore } from '../../../shared/store/appStore';

interface StepInventoryProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  propertyId: string;
  property: { address: string; owner: string; chip: string; ownerIdNumber?: string };
  propertyType: PropertyType;
  phase: 'inicial' | 'final';
  onBack: () => void;
  /** Llamado al finalizar el inventario. Acepta el inventario final como parámetro
   *  para evitar closures stale en el componente padre (PropertiesView). */
  onComplete: (finalInventory?: Inventory) => void;
  /** Cuando es Inventario Final, le pasamos el Inicial para poder copiar áreas base */
  baseInventory?: Inventory | null;
  /** Datos del arrendatario asignado a la propiedad (para prellenar firmas) */
  tenantData?: { name: string; idNumber: string; email?: string; phone?: string } | null;
  /** ID de la carpeta del arrendatario en Google Drive (para subir el PDF firmado) */
  tenantDriveFolderId?: string | null;
  /** Modo captación: oculta las firmas del agente/arrendatario; la finalize solo genera PDF del inventario */
  hideSignatures?: boolean;
  /** Callback al finalizar el inventario: debe subir el PDF a Drive y guardar JSON en MySQL */
  onInventoryFinalized?: (inventory: Inventory) => Promise<void>;
}

type Stage = 'config' | 'editing' | 'signing';

const initialCounters = (
  propertyType: PropertyType,
  base?: Inventory | null,
): Record<string, number> => {
  if (base) {
    return { ...base.counters };
  }
  const def = getPropertyTypeConfig(propertyType);
  const c: Record<string, number> = {};
  def.multiCounters.forEach((mc) => { c[mc.key] = mc.default; });
  return c;
};

export function StepInventory({
  showToast, propertyId, property, propertyType, phase, onBack, onComplete, baseInventory,
  tenantData,   tenantDriveFolderId, hideSignatures = false, onInventoryFinalized,
}: StepInventoryProps) {
  const inventoryId = `${propertyId}:${phase}`;
  const [inventory, setInventory] = useState<Inventory | null>(null);

  // Prellenar datos del arrendatario: del prop o del store
  const storeTenants = useAppStore((s) => s.tenants);
  const storeTenant = useMemo(
    () => storeTenants.find((t) => t.propertyId === propertyId && t.status === 'Activo') ?? null,
    [storeTenants, propertyId],
  );
  // Combina prop + store: el prop tiene prioridad (viene del tenant placement flow)
  const effectiveTenantData = tenantData ?? (storeTenant ? {
    name: storeTenant.name,
    idNumber: storeTenant.idNumber,
    email: storeTenant.email,
    phone: storeTenant.phone,
  } : null);
  const [stage, setStage] = useState<Stage>('config');
  const [currentAreaIndex, setCurrentAreaIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [customAreas, setCustomAreas] = useState<{ id: string; label: string }[]>([]);
  // Modal de confirmación al finalizar inventario (reemplaza window.confirm)
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [resumenFinalizacion, setResumenFinalizacion] = useState<{
    areasConFotos: number; totalAreas: number; totalMedia: number;
    totalPhotos: number; totalItemMedia: number;
    totalItemsEvaluados: number; areasSinFotos: InventoryArea[];
  } | null>(null);

  // Carga inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let existing = await inventoryDB.getInventory(inventoryId);

      // FIX: si IndexedDB está vacío (porque el usuario corrió reset-data.js
      // o porque el inventario se creó en otra sesión del browser), intentamos
      // recuperar desde MySQL. El inventario se guarda en `inventories.photos`
      // (JSON column) con `dataUrl` base64, así que las fotos NO se pierden.
      if (!existing) {
        try {
          const res = await fetch(`/api/inventories?propertyId=${encodeURIComponent(propertyId)}`);
          if (res.ok) {
            const data = await res.json();
            const remote = (data.inventories ?? []).find(
              (i: any) => i.phase === phase,
            );
            if (remote) {
              existing = {
                id: remote.id,
                propertyId: remote.property_id,
                phase: remote.phase,
                propertyType: remote.property_type,
                counters: remote.counters ?? {},
                areas: remote.areas ?? [],
                // FIX (jul-2026): `remote.photos` puede llegar como Record/Object
                // desde MySQL si la data legacy se guardó mal. Normalizamos.
                photos: normalizePhotosArray(remote.photos),
                signatures: remote.signatures ?? [],
                customAreas: remote.custom_areas ?? [],
                signedAt: remote.signed_at,
                createdAt: remote.created_at,
                updatedAt: remote.updated_at,
              } as Inventory;
              // Re-hidratar IndexedDB: inventario + cada foto en su store
              await inventoryDB.saveInventory(existing);
              for (const p of (existing.photos ?? [])) {
                if (p?.dataUrl) {
                  await inventoryDB.savePhoto({
                    id: p.id,
                    inventoryId: existing.id,
                    dataUrl: p.dataUrl,
                    areaId: p.areaId,
                    fileName: p.fileName,
                    takenAt: p.takenAt,
                  });
                }
              }
              console.log(`[inventory] Recuperado de MySQL: ${remote.id} (${(existing.photos ?? []).length} fotos)`);
            }
          }
        } catch (err) {
          console.warn('[inventory] fallback MySQL fetch failed:', err);
        }
      }
      if (cancelled) return;

      if (existing) {
        // FIX (jul-2026): normalizar `photos` por si IndexedDB tiene data
        // legacy con forma Record/Object en vez de Array. Si la forma era
        // objeto, re-save con la forma correcta (self-heal).
        const normalizedPhotos = normalizePhotosArray(existing.photos);
        if (normalizedPhotos.length === 0 && existing.photos && typeof existing.photos === 'object' && !Array.isArray(existing.photos)) {
          console.warn(`[inventory] ${inventoryId}: photos era Record/Object — normalizado a array vacío. Self-heal save.`);
          existing = { ...existing, photos: [] };
          void inventoryDB.saveInventory(existing);
        } else if (normalizedPhotos !== existing.photos) {
          existing = { ...existing, photos: normalizedPhotos };
        }
        setInventory(existing);
        setCustomAreas(existing.customAreas ?? []);
        // En modo captación (hideSignatures) no hay firmas — se salta el paso de firmas
        if (hideSignatures) {
          setStage(existing.signedAt ? 'editing' : 'editing');
        } else {
          setStage(existing.signedAt ? 'signing' : 'editing');
        }
      } else {
        const type: PropertyType = baseInventory?.propertyType ?? propertyType ?? 'apartamento';
        const counters = initialCounters(type, baseInventory);
        const config = getPropertyTypeConfig(type);
        const resolved = resolveAreas(config, counters);

        const areas: InventoryArea[] = resolved.map((a) => ({
          id: a.id,
          category: a.category,
          label: a.label,
          items: {},
          photos: [],
        }));

        // Si es Final, copiamos items de cada área del Inicial
        if (phase === 'final' && baseInventory) {
          baseInventory.areas.forEach((baseArea) => {
            const target = areas.find((a) => a.id === baseArea.id);
            if (target) {
              target.items = { ...baseArea.items };
              target.observations = baseArea.observations;
            }
          });
        }

        const inv: Inventory = {
          id: inventoryId,
          propertyId,
          phase,
          propertyType: type,
          counters,
          areas,
          photos: phase === 'final' && baseInventory ? baseInventory.photos : [],
          signatures: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          agentName: baseInventory?.agentName,
          customAreas: baseInventory?.customAreas ?? [],
        };
        await inventoryDB.saveInventory(inv);
        setInventory(inv);
        // Mantener en 'config' para que el usuario configure los contadores primero
        setStage('config');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [inventoryId, propertyId, phase, baseInventory]);

  const persist = async (next: Inventory) => {
    next.updatedAt = new Date().toISOString();
    setInventory(next);
    await inventoryDB.saveInventory(next);
    // FIX CRÍTICO: sincronizar también cada foto al store `photos` aparte.
    // Sin esto, `inventoryDB.getPhoto(id)` siempre devuelve null → el PDF
    // sale sin fotos y la subida a Drive en finalize se saltea silenciosamente.
    // Solo guardamos fotos NUEVAS o actualizadas (comparamos dataUrl).
    for (const p of (next.photos ?? [])) {
      if (!p?.dataUrl) continue;
      const existing = await inventoryDB.getPhoto(p.id);
      if (!existing || existing.dataUrl !== p.dataUrl) {
        await inventoryDB.savePhoto({
          id: p.id,
          inventoryId: next.id,
          dataUrl: p.dataUrl,
          areaId: p.areaId,
          fileName: p.fileName,
          takenAt: p.takenAt,
        });
      }
    }
    // Limpieza: borrar fotos que ya no están en el inventory
    const liveIds = new Set((next.photos ?? []).map((p) => p.id));
    const allPhotos = await inventoryDB.listPhotosByInventory(next.id);
    for (const old of allPhotos) {
      if (!liveIds.has(old.id)) {
        await inventoryDB.deletePhoto(old.id);
      }
    }
  };

  /** Finaliza la captación: guarda el inventario y genera el PDF antes de llamar onComplete */
  const handleFinalizeInventory = async () => {
    if (!inventory) {
      console.error('[inventory] No hay inventario cargado');
      showToast('No hay inventario para finalizar', 'error');
      return;
    }

    // Validación final: áreas sin fotos (cuenta fotos de área + media de items)
    const areasSinFotos = inventory.areas.filter((a) => {
      const areaPhotoCount = inventory.photos.filter((p) => p.areaId === a.id).length;
      const itemMediaCount = Object.values(a.items).reduce<number>(
        (acc, it) => acc + ((it as InventoryItem).media?.length ?? 0), 0,
      );
      return areaPhotoCount + itemMediaCount === 0;
    });

    // Conteos para mostrar
    const totalAreas = inventory.areas.length;
    const totalPhotos = inventory.photos.length;
    const totalItemMedia = inventory.areas.reduce(
      (acc, a) => acc + Object.values(a.items).reduce<number>(
        (sub, it) => sub + ((it as InventoryItem).media?.length ?? 0), 0,
      ), 0,
    );
    const totalMedia = totalPhotos + totalItemMedia;
    const areasConFotos = totalAreas - areasSinFotos.length;
    const totalItemsEvaluados = inventory.areas.reduce(
      (acc, a) => acc + Object.values(a.items).filter((it: InventoryItem) => it.status).length,
      0,
    );

    // En lugar de window.confirm, mostramos un Modal con el resumen y la opción de revisar.
    // Esto le da al usuario la chance de volver si olvidó algo, sin alerta nativa fea.
    setResumenFinalizacion({
      areasConFotos, totalAreas, totalMedia, totalPhotos, totalItemMedia, totalItemsEvaluados, areasSinFotos,
    });
    setConfirmFinalize(true);
  };

  /** Ejecuta la finalización después de que el usuario confirmó en el modal. */
  const executeFinalize = async () => {
    if (!inventory || !resumenFinalizacion) return;
    setConfirmFinalize(false);

    const { areasConFotos, totalAreas, totalMedia, totalItemsEvaluados, areasSinFotos } = resumenFinalizacion;
    console.log('[inventory] Iniciando finalización...');
    try {
      // Guardar inventario con signedAt vacío (es captación, sin firmas)
      const finalInv = { ...inventory, signedAt: undefined };
      await persist(finalInv);
      console.log('[inventory] Persistido en IndexedDB');

      // Subir JSON a MySQL + PDF a Drive (si hay callback)
      if (onInventoryFinalized) {
        try {
          showToast('Subiendo inventario a Drive y MySQL...');
          await onInventoryFinalized(finalInv);
          console.log('[inventory] Callback finalizado');
        } catch (e) {
          console.error('[inventory] error en callback de finalización:', e);
          showToast('Error subiendo a Drive, pero continuando', 'error');
        }
      }

      // Generar y descargar PDF del inventario
      showToast('Generando PDF del inventario...');
      await onGeneratePDF();
      console.log('[inventory] PDF generado');

      // Toast final con resumen
      showToast(
        `✓ Inventario guardado: ${areasConFotos}/${totalAreas} áreas · ${totalMedia} archivos · ${totalItemsEvaluados} ítems`,
        'success',
      );
      // Pasamos el inventario final explícitamente para evitar closures stale del padre
      onComplete(finalInv);
    } catch (err) {
      console.error('[inventory] Error en handleFinalizeInventory:', err);
      showToast('Error al finalizar inventario', 'error');
    }
  };

  const onStart = () => {
    if (!inventory) return;
    setCurrentAreaIndex(0);
    setStage('editing');
  };

  const onAreaChange = (area: InventoryArea) => {
    if (!inventory) return;
    const next: Inventory = {
      ...inventory,
      areas: inventory.areas.map((a) => (a.id === area.id ? area : a)),
    };
    void persist(next);
  };

  const onPhotosChange = (photos: InventoryPhoto[]) => {
    if (!inventory) return;
    // Mantener areas.photos en sincronía: el id de la foto se agrega al área actual
    const diff = photos.length - inventory.photos.length;
    let updatedAreas = inventory.areas;
    if (diff > 0 && currentArea) {
      // Se agregaron fotos
      const newPhotos = photos.slice(inventory.photos.length);
      updatedAreas = inventory.areas.map((a) => {
        if (a.id !== currentArea.id) return a;
        return { ...a, photos: [...a.photos, ...newPhotos.map((p) => p.id)] };
      });
    }
    void persist({ ...inventory, photos, areas: updatedAreas });
  };

  const onRemovePhoto = (photoId: string) => {
    if (!inventory) return;
    void persist({
      ...inventory,
      photos: inventory.photos.filter((p) => p.id !== photoId),
      areas: inventory.areas.map((a) => ({
        ...a,
        photos: a.photos.filter((id) => id !== photoId),
      })),
    });
  };

  /**
   * Persiste el media (foto o video) de un item específico en el store
   * `photos` de IndexedDB. Se guarda con la convención
   * `<inventoryId>:<mediaId>` para que `getMediaDataUrl` (inyectado al PDF)
   * pueda recuperarlo después.
   *
   * El media también queda inline en el `InventoryItem.media` para que la
   * UI lo muestre sin tener que hacer un round-trip a IndexedDB.
   */
  const onSaveItemMedia = async (_itemId: string, media: ItemMedia): Promise<void> => {
    if (!inventory) return;
    try {
      await inventoryDB.savePhoto({
        id: `${inventory.id}:${media.id}`,
        inventoryId: inventory.id,
        dataUrl: media.dataUrl,
        // Para videos guardamos AMBOS: el thumbnail (dataUrl) y el video completo (videoDataUrl).
        // Lo guardamos en el mismo record para que un solo GET traiga todo.
        ...(media.videoDataUrl ? { videoDataUrl: media.videoDataUrl } : {}),
        fileName: media.fileName,
        takenAt: media.takenAt,
        type: media.type,
        durationSec: media.durationSec,
        sizeBytes: media.sizeBytes,
      });
    } catch (err) {
      console.error('[itemMedia] savePhoto failed:', err);
      throw err;
    }
  };

  /** Borra el media persistido de un item. */
  const onDeleteItemMedia = async (_itemId: string, mediaId: string): Promise<void> => {
    if (!inventory) return;
    try {
      await inventoryDB.deletePhoto(`${inventory.id}:${mediaId}`);
    } catch (err) {
      console.error('[itemMedia] deletePhoto failed:', err);
      throw err;
    }
  };

  const onSaveSignatures = async (signatures: Signature[]) => {
    if (!inventory) return;

    // Conteos para mostrar
    const totalAreas = inventory.areas.length;
    const totalPhotos = inventory.photos.length;
    // Áreas evaluadas: cuentan las que tienen al menos 1 foto O item con media.
    // (los items marcados `removed: true` también cuentan como "evaluados")
    const areasConFotos = inventory.areas.filter((a) => {
      const areaPhotoCount = inventory.photos.filter((p) => p.areaId === a.id).length;
      const itemMediaCount = Object.values(a.items).reduce<number>(
        (acc, it) => acc + ((it as InventoryItem).media?.length ?? 0), 0,
      );
      return areaPhotoCount + itemMediaCount > 0;
    }).length;
    // Total media: fotos de área + media de items
    const totalItemMedia = inventory.areas.reduce(
      (acc, a) => acc + Object.values(a.items).reduce<number>(
        (sub, it) => sub + ((it as InventoryItem).media?.length ?? 0), 0,
      ), 0,
    );
    const totalMedia = totalPhotos + totalItemMedia;
    const totalItemsEvaluados = inventory.areas.reduce(
      (acc, a) => acc + Object.values(a.items).filter((it: InventoryItem) => it.status).length,
      0,
    );

    // En fase final: detectar novedades vs. inventario de captación
    let novedadesCount = 0;
    if (inventory.phase === 'final' && baseInventory) {
      for (const area of inventory.areas) {
        const baseArea = baseInventory.areas.find((ba) => ba.id === area.id);
        if (!baseArea) continue;
        for (const [itemId, currentItem] of Object.entries(area.items) as [string, InventoryItem][]) {
          const baseItem = baseArea.items[itemId];
          if (!baseItem) continue;
          if (baseItem.status !== currentItem.status) novedadesCount++;
        }
      }
    }

    // Confirmación con resumen
    const phaseLabel = inventory.phase === 'inicial' ? 'de captación' : 'de colocación';
    const resumen =
      `¿Está seguro de firmar el inventario ${phaseLabel}?\n\n` +
      `• Firmantes: ${signatures.length} (${signatures.map((s) => s.signerRole).join(', ')})\n` +
      `• Áreas evaluadas: ${areasConFotos}/${totalAreas}\n` +
      `• Archivos: ${totalMedia} (fotos + videos)\n` +
      `• Ítems evaluados: ${totalItemsEvaluados}` +
      (novedadesCount > 0 ? `\n• Novedades detectadas: ${novedadesCount}` : '');

    if (!window.confirm(resumen)) return;

    const next: Inventory = {
      ...inventory,
      signatures,
      signedAt: new Date().toISOString(),
      tenantName: signatures.find((s) => s.signerRole === 'arrendatario')?.signerName,
      agentName: signatures.find((s) => s.signerRole === 'agente')?.signerName,
    };
    await persist(next);
    showToast('Inventario firmado y guardado', 'success');

    if (inventory.phase === 'final') {
      // phase === 'final': Inventario de Colocación firmado.
      // (El contrato de arrendamiento se sube por separado desde el módulo de arrendatarios)
      // Avisamos al padre para que haga los efectos colaterales:
      //  - flip status de la propiedad a "Arrendado"
      //  - cerrar overlay
      try {
        const { generateInventoryPdfBlob } = await import('../inventoryPdf');
        const { inventoryDB: invDB } = await import('../inventoryDB');
        const blob = await generateInventoryPdfBlob(next, property, async (id) => {
          const photo = await invDB.getPhoto(id);
          return (photo as any)?.dataUrl ?? null;
        });

        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });

        const fileName = `Inventario_Colocacion_${new Date().toISOString().slice(0, 10)}.pdf`;
        const today = new Date().toISOString().slice(0, 10);

        // 1) Subir a Inventarios/ del Drive de la propiedad (respaldo principal)
        try {
          await fetch('/api/inventories/upload-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              propertyId: inventory.propertyId,
              phase: 'final',
              base64Data: base64,
              inventoryDate: today,
            }),
          });
          showToast('✓ PDF de colocación guardado en Inventarios/', 'success');
        } catch (e) {
          console.warn('[colocación] no se pudo subir a Inventarios/', e);
        }

        // 2) Copiar también a la carpeta Contrato/ del arrendatario
        if (tenantDriveFolderId) {
          try {
            await fetch('/api/tenants/upload-document', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenantDriveFolderId,
                folder: 'Contrato',
                fileName,
                base64Data: base64,
              }),
            });
            showToast('✓ Copia guardada en carpeta del arrendatario', 'success');
          } catch (e) {
            console.warn('[colocación] no se pudo copiar al arrendatario:', e);
          }
        }

        showToast(
          `✓ Inventario de colocación firmado: ${areasConFotos}/${totalAreas} áreas · ${totalMedia} archivos · ${novedadesCount} novedades`,
          'success',
        );

        // Inventario de colocación completo: avisamos al padre para que
        // cierre el overlay y haga el flip de status a "Arrendado".
        onComplete(next);
      } catch (e) {
        console.error('Error generando/subiendo PDF de colocación:', e);
        showToast('Error al generar/subir PDF firmado', 'error');
      }
    }
  };

  const onGeneratePDF = async () => {
    if (!inventory) return;
    try {
      const { useSettingsStore } = await import('../../../shared/store/settingsStore');
      const agencyName = useSettingsStore.getState().agency.name;
      await generateInventoryPDF(inventory, property, async (id) => {
        const photo = inventory.photos.find((p) => p.id === id);
        return photo?.dataUrl ?? null;
      }, { agencyName });
      showToast('PDF generado correctamente', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al generar PDF', 'error');
    }
  };

  const currentArea = useMemo(() => {
    if (!inventory) return null;
    return inventory.areas[currentAreaIndex] ?? null;
  }, [inventory, currentAreaIndex]);

  // Modal de confirmación al finalizar. Se muestra en CUALQUIER return path para que
  // el usuario pueda confirmar desde cualquier etapa del inventario sin perder estado.
  const confirmModal = (
    <Modal
      isOpen={confirmFinalize && !!resumenFinalizacion}
      onClose={() => setConfirmFinalize(false)}
      title="Inventario completado — ¿Desea revisar antes de finalizar?"
    >
      {resumenFinalizacion && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-sm font-semibold text-emerald-900 mb-2">Resumen del inventario</p>
            <ul className="text-xs text-emerald-800 space-y-1">
              <li>• <strong>Áreas evaluadas:</strong> {resumenFinalizacion.areasConFotos} de {resumenFinalizacion.totalAreas}</li>
              <li>• <strong>Archivos:</strong> {resumenFinalizacion.totalMedia} ({resumenFinalizacion.totalPhotos} fotos de área + {resumenFinalizacion.totalItemMedia} fotos/videos de items)</li>
              <li>• <strong>Ítems evaluados:</strong> {resumenFinalizacion.totalItemsEvaluados}</li>
            </ul>
          </div>

          {resumenFinalizacion.areasSinFotos.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <p className="font-semibold mb-1">⚠️ Áreas sin foto:</p>
              <p>{resumenFinalizacion.areasSinFotos.map((a) => a.label).join(', ')}</p>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Al confirmar, el inventario se guardará en MySQL, se generará el PDF y se
            subirá a Google Drive (carpeta <code>Inventarios/</code> de la propiedad),
            junto con todas las fotos. La propiedad quedará en estado <strong>Activo</strong>.
          </p>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmFinalize(false)}
            >
              Revisar inventario
            </Button>
            <Button
              className="flex-1"
              onClick={() => void executeFinalize()}
            >
              Sí, finalizar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );

  if (loading || !inventory) {
    return (
      <>
        <Card className="p-8">
          <p className="text-sm text-slate-500">Cargando inventario…</p>
        </Card>
        {confirmModal}
      </>
    );
  }

  if (stage === 'config') {
    return (
      <>
      <AreaConfigPanel
        propertyType={inventory.propertyType}
        counters={inventory.counters}
        customAreas={customAreas}
        onPropertyTypeChange={(t) => {
          const config = getPropertyTypeConfig(t);
          const newCounters: Record<string, number> = {};
          config.multiCounters.forEach((mc) => { newCounters[mc.key] = mc.default; });
          const resolved = resolveAreas(config, newCounters, customAreas);
          const newAreas: InventoryArea[] = resolved.map((a) => ({
            id: a.id, category: a.category, label: a.label, items: {}, photos: [],
          }));
          void persist({ ...inventory, propertyType: t, counters: newCounters, areas: newAreas, customAreas });
        }}
        onCountersChange={(c) => {
          const config = getPropertyTypeConfig(inventory.propertyType);
          const resolved = resolveAreas(config, c, customAreas);
          // Preservar items de áreas que ya existían por id
          const itemsMap = new Map<string, Record<string, InventoryItem>>(
            inventory.areas.map((a) => [a.id, a.items])
          );
          const newAreas: InventoryArea[] = resolved.map((a) => ({
            id: a.id, category: a.category, label: a.label,
            items: itemsMap.get(a.id) ?? {},
            photos: [],
          }));
          void persist({ ...inventory, counters: c, areas: newAreas, customAreas });
        }}
        onCustomAreasChange={(next) => {
          setCustomAreas(next);
          const config = getPropertyTypeConfig(inventory.propertyType);
          const resolved = resolveAreas(config, inventory.counters, next);
          const itemsMap = new Map<string, Record<string, InventoryItem>>(
            inventory.areas.map((a) => [a.id, a.items])
          );
          const newAreas: InventoryArea[] = resolved.map((a) => ({
            id: a.id, category: a.category, label: a.label,
            items: itemsMap.get(a.id) ?? {},
            photos: [],
          }));
          void persist({ ...inventory, customAreas: next, areas: newAreas });
        }}
        onStart={() => setStage('editing')}
        onCancel={onBack}
        onSaveDraft={() => {
          // El autosave a IndexedDB ya persiste en cada cambio (vía `persist`).
          // Este botón es un checkpoint explícito: confirmamos al agente.
          showToast('✓ Configuración del inventario guardada como borrador', 'success');
        }}
      />
      {confirmModal}
      </>
    );
  }

  if (stage === 'editing' && currentArea) {
    const config = getPropertyTypeConfig(inventory.propertyType);
    return (
      <>
      <div className="space-y-4">
        {phase === 'final' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <span className="font-bold uppercase">Inventario Final —</span> los items se prellenan desde el Inventario Inicial. Ajusta los estados si hubo cambios durante el arriendo.
          </div>
        )}
        <Card className="p-6">
          <AreaEditor
            area={currentArea}
            index={currentAreaIndex}
            total={inventory.areas.length}
            recommendedPhotos={config.recommendedPhotos}
            photos={inventory.photos}
            onChange={onAreaChange}
            onPhotosChange={onPhotosChange}
            onRemovePhoto={onRemovePhoto}
            onSaveItemMedia={onSaveItemMedia}
            onDeleteItemMedia={onDeleteItemMedia}
            onBack={() => setCurrentAreaIndex(Math.max(0, currentAreaIndex - 1))}
            onNext={() => {
              if (!inventory) return;
              const area = inventory.areas[currentAreaIndex];
              const areaPhotoCount = inventory.photos.filter((p) => p.areaId === area.id).length;
              const itemMediaCount = Object.values(area.items).reduce<number>(
                (acc, it) => acc + ((it as InventoryItem).media?.length ?? 0), 0,
              );
              if (areaPhotoCount + itemMediaCount === 0) {
                showToast(`Sube al menos una foto o video de "${area.label}" antes de continuar`, 'error');
                return;
              }
              setCurrentAreaIndex(Math.min(inventory.areas.length - 1, currentAreaIndex + 1));
            }}
            onSkipToSign={hideSignatures
              ? () => { void handleFinalizeInventory(); }
              : () => setStage('signing')}
            hideSignatures={hideSignatures}
          />
        </Card>
        {/* Banner de autoguardado + botón de checkpoint explícito.
            El state del inventario se persiste en IndexedDB en cada cambio
            (vía `persist()`), pero el agente necesita un botón visible para
            confirmar que su progreso está a salvo sin tener que finalizar. */}
        <div className="flex items-center justify-between gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="text-xs text-emerald-800">
            <strong>Autoguardado activo.</strong> Tus cambios se guardan automáticamente al cambiar de área o de step.
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => showToast('✓ Inventario guardado en este dispositivo', 'success')}
            className="gap-1.5 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
          >
            💾 Guardar borrador
          </Button>
        </div>
        {/* Stepper de áreas */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {inventory.areas.map((a, i) => {
            const filled = Object.values(a.items).filter((it: InventoryItem) => it.status).length;
            const done = filled > 0;
            return (
              <button
                key={a.id}
                onClick={() => {
                  const areaPhotoCount = inventory.photos.filter((p) => p.areaId === a.id).length;
                  const itemMediaCount = Object.values(a.items).reduce<number>(
                    (acc, it) => acc + ((it as InventoryItem).media?.length ?? 0), 0,
                  );
                  if (i !== currentAreaIndex && areaPhotoCount + itemMediaCount === 0 && !inventory.areas[currentAreaIndex]) {
                    showToast(`Sube al menos una foto o video de "${a.label}" antes de ir`, 'error');
                    return;
                  }
                  setCurrentAreaIndex(i);
                }}
                className={`w-7 h-7 rounded text-[10px] font-bold transition-all ${
                  i === currentAreaIndex
                    ? 'bg-blue-600 text-white'
                    : done
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-400'
                }`}
                title={a.label}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
      {confirmModal}
      </>
    );
  }

  return (
    <>
    <Card className="p-6">
      <SignatureStep
        inventory={inventory}
        propertyOwner={property.owner}
        propertyOwnerIdNumber={property.ownerIdNumber}
        tenantData={effectiveTenantData}
        onSaveSignatures={onSaveSignatures}
        onGeneratePDF={onGeneratePDF}
        onBack={() => setStage('editing')}
      />
    </Card>
    {confirmModal}
    </>
  );
}
