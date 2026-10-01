// filepath: src/features/properties/components/inventory/InventoryConfigStage.tsx
/**
 * InventoryConfigStage — stage de configuración inicial del inventario.
 * Renderiza el `AreaConfigPanel` con todos los handlers de cambio de
 * propertyType, counters, customAreas. Al confirmar, pasa al stage="editing".
 *
 * Sale de StepInventory.tsx como parte del refactor #10 (commit 2/2).
 */
import {
  getPropertyTypeConfig,
  resolveAreas,
} from "../../inventoryConfig";
import type { Inventory, InventoryArea, InventoryItem } from "../../inventoryTypes";
import { AreaConfigPanel } from "../AreaConfigPanel";

export interface InventoryConfigStageProps {
  inventory: Inventory;
  customAreas: { id: string; label: string }[];
  setCustomAreas: (next: { id: string; label: string }[]) => void;
  persist: (next: Inventory) => Promise<void>;
  setStage: (s: "editing") => void;
  onBack: () => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export function InventoryConfigStage({
  inventory,
  customAreas,
  setCustomAreas,
  persist,
  setStage,
  onBack,
  showToast,
}: InventoryConfigStageProps) {
  return (
    <AreaConfigPanel
      propertyType={inventory.propertyType}
      counters={inventory.counters}
      customAreas={customAreas}
      onPropertyTypeChange={(t) => {
        const config = getPropertyTypeConfig(t);
        const newCounters: Record<string, number> = {};
        config.multiCounters.forEach((mc) => {
          newCounters[mc.key] = mc.default;
        });
        const resolved = resolveAreas(config, newCounters, customAreas);
        const newAreas: InventoryArea[] = resolved.map((a) => ({
          id: a.id,
          category: a.category,
          label: a.label,
          items: {},
          photos: [],
        }));
        void persist({
          ...inventory,
          propertyType: t,
          counters: newCounters,
          areas: newAreas,
          customAreas,
        });
      }}
      onCountersChange={(c) => {
        const config = getPropertyTypeConfig(inventory.propertyType);
        const resolved = resolveAreas(config, c, customAreas);
        // Preservar items de áreas que ya existían por id
        const itemsMap = new Map<string, Record<string, InventoryItem>>(
          inventory.areas.map((a) => [a.id, a.items]),
        );
        const newAreas: InventoryArea[] = resolved.map((a) => ({
          id: a.id,
          category: a.category,
          label: a.label,
          items: itemsMap.get(a.id) ?? {},
          photos: [],
        }));
        void persist({
          ...inventory,
          counters: c,
          areas: newAreas,
          customAreas,
        });
      }}
      onCustomAreasChange={(next) => {
        setCustomAreas(next);
        const config = getPropertyTypeConfig(inventory.propertyType);
        const resolved = resolveAreas(config, inventory.counters, next);
        const itemsMap = new Map<string, Record<string, InventoryItem>>(
          inventory.areas.map((a) => [a.id, a.items]),
        );
        const newAreas: InventoryArea[] = resolved.map((a) => ({
          id: a.id,
          category: a.category,
          label: a.label,
          items: itemsMap.get(a.id) ?? {},
          photos: [],
        }));
        void persist({ ...inventory, customAreas: next, areas: newAreas });
      }}
      onStart={() => setStage("editing")}
      onCancel={onBack}
      onSaveDraft={() => {
        // El autosave a IndexedDB ya persiste en cada cambio (vía `persist`).
        // Este botón es un checkpoint explícito: confirmamos al agente.
        showToast(
          "✓ Configuración del inventario guardada como borrador",
          "success",
        );
      }}
    />
  );
}
