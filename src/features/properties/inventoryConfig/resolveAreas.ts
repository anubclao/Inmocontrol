// filepath: src/features/properties/inventoryConfig/resolveAreas.ts
// Helper que arma la lista final de áreas de un inventario a partir del
// PropertyTypeConfig, los counters activos, y las custom areas ("Otros").
import type { CustomArea, PropertyTypeConfig } from "./propertyTypes";

/**
 * Resuelve las áreas finales de un inventario a partir del tipo, los counters
 * y las custom areas (botón "Otros").
 */
export function resolveAreas(
  config: PropertyTypeConfig,
  counters: Record<string, number>,
  customAreas: CustomArea[] = [],
): { id: string; category: string; label: string }[] {
  const areas: { id: string; category: string; label: string }[] = [];

  // Áreas fijas
  config.areas.forEach((area, i) => {
    areas.push({
      id: `single-${i}`,
      category: area.category,
      label: area.label(),
    });
  });

  // Áreas múltiples (counterKey resuelve el counter asociado)
  config.multiAreas.forEach((multi) => {
    if (!multi.counterKey) return;
    const counter = config.multiCounters.find(
      (c) => c.key === multi.counterKey,
    );
    if (!counter) return;
    const count = counters[counter.key] ?? counter.default;
    for (let i = 1; i <= count; i++) {
      areas.push({
        id: `multi-${multi.category}-${i}`,
        category: multi.category,
        label: multi.label(i),
      });
    }
  });

  // Custom areas ("Otros" con nombre personalizado) — siempre al final
  customAreas.forEach((c) => {
    areas.push({ id: c.id, category: "otros", label: c.label });
  });

  return areas;
}
