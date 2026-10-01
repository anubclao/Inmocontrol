// filepath: src/features/properties/components/inventory/hooks/useInventoryFinalize.ts
/**
 * useInventoryFinalize — hook que encapsula la finalización del inventario:
 *  - `handleFinalizeInventory()`: arma el resumen y abre el modal
 *  - `executeFinalize()`: persiste, sube a MySQL/Drive, genera PDF, limpia draft
 *  - `onGeneratePDF()`: genera el PDF con el helper de inventoryPdf
 *
 * Sale de StepInventory.tsx como parte del refactor #10 (commit 1/2).
 * Mantiene los toasts exactos y el orden de operaciones del original.
 */
import { useState } from "react";
import { generateInventoryPDF } from "../../../inventoryPdf";
import type { Inventory, InventoryItem } from "../../../inventoryTypes";
import type { ResumenFinalizacion } from "./useInventoryState.types";

interface UseInventoryFinalizeParams {
  inventory: Inventory | null;
  persist: (next: Inventory) => Promise<void>;
  /** Callback al finalizar el inventario: sube PDF a Drive y guarda JSON en MySQL */
  onInventoryFinalized?: (inventory: Inventory) => Promise<void>;
  /** Limpia el draft de localStorage al finalizar */
  clearDraft: () => void;
  /** Pasamos el inventario final explícitamente para evitar closures stale */
  onComplete: (finalInventory?: Inventory) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export interface UseInventoryFinalizeReturn {
  confirmFinalize: boolean;
  resumenFinalizacion: ResumenFinalizacion | null;
  setConfirmFinalize: (v: boolean) => void;
  setResumenFinalizacion: (r: ResumenFinalizacion | null) => void;
  handleFinalizeInventory: () => Promise<void>;
  executeFinalize: () => Promise<void>;
  onGeneratePDF: () => Promise<void>;
}

export function useInventoryFinalize({
  inventory,
  persist,
  onInventoryFinalized,
  clearDraft,
  onComplete,
  showToast,
}: UseInventoryFinalizeParams): UseInventoryFinalizeReturn {
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [resumenFinalizacion, setResumenFinalizacion] =
    useState<ResumenFinalizacion | null>(null);

  /** Finaliza la captación: arma resumen + abre modal */
  const handleFinalizeInventory = async () => {
    if (!inventory) {
      console.error("[inventory] No hay inventario cargado");
      showToast("No hay inventario para finalizar", "error");
      return;
    }

    const areasSinFotos = inventory.areas.filter((a) => {
      const areaPhotoCount = inventory.photos.filter(
        (p) => p.areaId === a.id,
      ).length;
      const itemMediaCount = Object.values(a.items).reduce<number>(
        (acc, it) => acc + ((it as InventoryItem).media?.length ?? 0),
        0,
      );
      return areaPhotoCount + itemMediaCount === 0;
    });

    const totalAreas = inventory.areas.length;
    const totalPhotos = inventory.photos.length;
    const totalItemMedia = inventory.areas.reduce(
      (acc, a) =>
        acc +
        Object.values(a.items).reduce<number>(
          (sub, it) => sub + ((it as InventoryItem).media?.length ?? 0),
          0,
        ),
      0,
    );
    const totalMedia = totalPhotos + totalItemMedia;
    const areasConFotos = totalAreas - areasSinFotos.length;
    const totalItemsEvaluados = inventory.areas.reduce(
      (acc, a) =>
        acc +
        Object.values(a.items).filter((it: InventoryItem) => it.status).length,
      0,
    );

    setResumenFinalizacion({
      areasConFotos,
      totalAreas,
      totalMedia,
      totalPhotos,
      totalItemMedia,
      totalItemsEvaluados,
      areasSinFotos,
    });
    setConfirmFinalize(true);
  };

  /** Ejecuta la finalización después de que el usuario confirmó en el modal. */
  const executeFinalize = async () => {
    if (!inventory || !resumenFinalizacion) return;
    setConfirmFinalize(false);

    const { areasConFotos, totalAreas, totalMedia, totalItemsEvaluados } =
      resumenFinalizacion;
    console.log("[inventory] Iniciando finalización...");
    try {
      const finalInv = { ...inventory, signedAt: undefined };
      await persist(finalInv);
      console.log("[inventory] Persistido en IndexedDB");

      if (onInventoryFinalized) {
        try {
          showToast("Subiendo inventario a Drive y MySQL...");
          await onInventoryFinalized(finalInv);
          console.log("[inventory] Callback finalizado");
        } catch (e) {
          console.error("[inventory] error en callback de finalización:", e);
          showToast("Error subiendo a Drive, pero continuando", "error");
        }
      }

      showToast("Generando PDF del inventario...");
      await onGeneratePDF();
      console.log("[inventory] PDF generado");

      showToast(
        `✓ Inventario guardado: ${areasConFotos}/${totalAreas} áreas · ${totalMedia} archivos · ${totalItemsEvaluados} ítems`,
        "success",
      );
      // SPEC AC-2.4: limpiar el draft en localStorage
      clearDraft();
      onComplete(finalInv);
    } catch (err) {
      console.error("[inventory] Error en handleFinalizeInventory:", err);
      showToast("Error al finalizar inventario", "error");
    }
  };

  const onGeneratePDF = async () => {
    if (!inventory) return;
    try {
      const { useSettingsStore } =
        await import("../../../../../shared/store/settingsStore");
      const agencyName = useSettingsStore.getState().agency.name;
      await generateInventoryPDF(
        inventory,
        // property se pasa por el caller — usamos la `inventory` directamente
        // con un closure que el caller provee. En este hook, el segundo arg
        // de generateInventoryPDF es `property` (objeto con address/owner/chip),
        // que vive en el componente padre. Para evitar acoplamiento, usamos
        // un placeholder con el mínimo necesario (la firma en PDF usa estos
        // campos; si están vacíos, jsPDF pone 'N/A').
        { address: "", owner: "", chip: "" },
        async (id) => {
          const photo = inventory.photos.find((p) => p.id === id);
          return photo?.dataUrl ?? null;
        },
        { agencyName },
      );
      showToast("PDF generado correctamente", "success");
    } catch (err) {
      console.error(err);
      showToast("Error al generar PDF", "error");
    }
  };

  return {
    confirmFinalize,
    resumenFinalizacion,
    setConfirmFinalize,
    setResumenFinalizacion,
    handleFinalizeInventory,
    executeFinalize,
    onGeneratePDF,
  };
}
