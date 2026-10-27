// filepath: src/features/properties/components/inventory/hooks/useInventorySigning.ts
/**
 * useInventorySigning — hook que encapsula `onSaveSignatures` (firmar inventario):
 *  - Calcula resumen (áreas evaluadas, archivos, ítems, novedades vs. base)
 *  - Pide confirmación con window.confirm mostrando el resumen
 *  - Si confirma: persiste con `signedAt` + tenantName/agentName extraídos
 *  - En fase final: genera PDF, sube a Inventarios/ + copia a Contrato/ del tenant
 *
 * Sale de StepInventory.tsx como parte del refactor #10 (commit 1/2).
 */
import type {
  Inventory,
  InventoryItem,
  Signature,
} from "../../../inventoryTypes";

interface UseInventorySigningParams {
  inventory: Inventory | null;
  persist: (next: Inventory) => Promise<void>;
  baseInventory?: Inventory | null;
  /** Datos de la propiedad para el PDF (address, owner, chip, ownerIdNumber) */
  property: {
    address: string;
    owner: string;
    chip: string;
    ownerIdNumber?: string;
  };
  /** ID de la carpeta del arrendatario en Drive (para subir el PDF firmado) */
  tenantDriveFolderId?: string | null;
  /** Callback al completar la firma (para fase final flip status → "Arrendado") */
  onComplete: (finalInventory?: Inventory) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export interface UseInventorySigningReturn {
  onSaveSignatures: (signatures: Signature[]) => Promise<void>;
}

export function useInventorySigning({
  inventory,
  persist,
  baseInventory,
  property,
  tenantDriveFolderId,
  onComplete,
  showToast,
}: UseInventorySigningParams): UseInventorySigningReturn {
  const onSaveSignatures = async (signatures: Signature[]) => {
    if (!inventory) return;

    const totalAreas = inventory.areas.length;
    const totalPhotos = inventory.photos.length;
    const areasConFotos = inventory.areas.filter((a) => {
      const areaPhotoCount = inventory.photos.filter(
        (p) => p.areaId === a.id,
      ).length;
      const itemMediaCount = Object.values(a.items).reduce<number>(
        (acc, it) => acc + ((it as InventoryItem).media?.length ?? 0),
        0,
      );
      return areaPhotoCount + itemMediaCount > 0;
    }).length;
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
    const totalItemsEvaluados = inventory.areas.reduce(
      (acc, a) =>
        acc +
        Object.values(a.items).filter((it: InventoryItem) => it.status).length,
      0,
    );

    // En fase final: detectar novedades vs. inventario de captación
    let novedadesCount = 0;
    if (inventory.phase === "final" && baseInventory) {
      for (const area of inventory.areas) {
        const baseArea = baseInventory.areas.find((ba) => ba.id === area.id);
        if (!baseArea) continue;
        for (const [itemId, currentItem] of Object.entries(area.items) as [
          string,
          InventoryItem,
        ][]) {
          const baseItem = baseArea.items[itemId];
          if (!baseItem) continue;
          if (baseItem.status !== currentItem.status) novedadesCount++;
        }
      }
    }

    const phaseLabel =
      inventory.phase === "inicial" ? "de captación" : "de colocación";
    const resumen =
      `¿Está seguro de firmar el inventario ${phaseLabel}?\n\n` +
      `• Firmantes: ${signatures.length} (${signatures.map((s) => s.signerRole).join(", ")})\n` +
      `• Áreas evaluadas: ${areasConFotos}/${totalAreas}\n` +
      `• Archivos: ${totalMedia} (fotos + videos)\n` +
      `• Ítems evaluados: ${totalItemsEvaluados}` +
      (novedadesCount > 0 ? `\n• Novedades detectadas: ${novedadesCount}` : "");

    if (!window.confirm(resumen)) return;

    const next: Inventory = {
      ...inventory,
      signatures,
      signedAt: new Date().toISOString(),
      tenantName: signatures.find((s) => s.signerRole === "arrendatario")
        ?.signerName,
      agentName: signatures.find((s) => s.signerRole === "agente")?.signerName,
    };
    await persist(next);
    showToast("Inventario firmado y guardado", "success");

    // Persistir el JSON en MySQL. Antes SOLO se guardaba en IndexedDB: si el
    // agente cambiaba de equipo, el inventario de colocación desaparecía (la
    // comparativa Inicial vs Final lee MySQL primero). Best-effort: si falla,
    // el PDF de Drive sigue siendo la evidencia firmada.
    try {
      const { saveInventoryToServer } = await import("../../../inventoryApi");
      const saved = await saveInventoryToServer(next);
      if (saved.ok && saved.withoutPhotos) {
        console.warn(
          "[inventory] guardado en MySQL sin fotos embebidas (payload > 15MB). Las fotos quedan en Drive.",
        );
      } else if (!saved.ok) {
        console.error("[inventory] no se pudo guardar en MySQL:", saved.error);
        showToast(
          `Inventario firmado, pero no se sincronizó al servidor (${saved.error}). El PDF queda en Drive.`,
          "error",
        );
      }
    } catch (err) {
      console.error("[inventory] saveInventoryToServer falló:", err);
    }

    if (inventory.phase === "final") {
      // FIX 2026-10: `onComplete` (que dispara el cambio de estado a
      // "Arrendado") se llamaba DENTRO del try que genera y sube el PDF. Si
      // jsPDF fallaba o Drive demoraba, la firma quedaba guardada pero la
      // propiedad se quedaba en "En Colocación" para siempre. Ahora el estado
      // se actualiza pase lo que pase con el PDF, que es un efecto secundario.
      try {
        const { generateInventoryPdfBlob } =
          await import("../../../inventoryPdf");
        const { getInventoryMediaDataUrl } = await import(
          "../../../inventoryDB"
        );
        const blob = await generateInventoryPdfBlob(
          next,
          property,
          async (id) => {
            // Tolera media de área (key = id) y media de ítem (key = inv:id),
            // más el dataUrl inline de inventarios viejos.
            const inline =
              next.photos.find((p) => p.id === id)?.dataUrl ?? null;
            return getInventoryMediaDataUrl(next.id, id, inline);
          },
        );

        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });

        const fileName = `Inventario_Colocacion_${new Date().toISOString().slice(0, 10)}.pdf`;
        const today = new Date().toISOString().slice(0, 10);

        // 1) Subir a Inventarios/ del Drive de la propiedad.
        //    OJO: `fetch` NO rechaza en 4xx/5xx — hay que mirar `res.ok`, si no
        //    el toast dice "guardado en Inventarios/" aunque Drive haya
        //    devuelto 401/503. Era un toast mentiroso clásico.
        try {
          const res = await fetch("/api/inventories/upload-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              propertyId: inventory.propertyId,
              phase: "final",
              base64Data: base64,
              inventoryDate: today,
            }),
          });
          if (res.ok) {
            showToast("✓ PDF de colocación guardado en Inventarios/", "success");
          } else {
            const detail = await res.json().catch(() => ({}));
            console.warn(
              "[colocación] upload-pdf respondió",
              res.status,
              detail?.error,
            );
            showToast(
              detail?.error ??
                "No se pudo subir el PDF a Drive. El inventario quedó firmado; reintentá desde el detalle del inmueble.",
              "error",
            );
          }
        } catch (e) {
          console.warn("[colocación] no se pudo subir a Inventarios/", e);
          showToast(
            "No se pudo subir el PDF a Drive (sin conexión). El inventario quedó firmado.",
            "error",
          );
        }

        // 2) Copiar también a la carpeta Contrato/ del arrendatario
        if (tenantDriveFolderId) {
          try {
            const res = await fetch("/api/tenants/upload-document", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tenantDriveFolderId,
                folder: "Contrato",
                fileName,
                base64Data: base64,
              }),
            });
            if (res.ok) {
              showToast(
                "✓ Copia guardada en carpeta del arrendatario",
                "success",
              );
            } else {
              const detail = await res.json().catch(() => ({}));
              console.warn(
                "[colocación] upload-document respondió",
                res.status,
                detail?.error,
              );
              showToast(
                "El PDF no se copió a la carpeta del arrendatario.",
                "error",
              );
            }
          } catch (e) {
            console.warn("[colocación] no se pudo copiar al arrendatario:", e);
            showToast(
              "El PDF no se copió a la carpeta del arrendatario (sin conexión).",
              "error",
            );
          }
        }

        showToast(
          `✓ Inventario de colocación firmado: ${areasConFotos}/${totalAreas} áreas · ${totalMedia} archivos · ${novedadesCount} novedades`,
          "success",
        );
      } catch (e) {
        console.error("Error generando/subiendo PDF de colocación:", e);
        showToast(
          "Inventario firmado y guardado, pero falló la generación del PDF. Podés reintentarlo desde el detalle del inmueble.",
          "error",
        );
      } finally {
        // La propiedad pasa a "Arrendado" apenas queda firmada, tenga o no PDF.
        onComplete(next);
      }
    }
  };

  return { onSaveSignatures };
}
