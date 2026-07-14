/**
 * InmoControl — Distribución del estado de cuenta entre copropietarios.
 * ============================================================================
 * Migración 010+: una propiedad puede tener N propietarios con % de
 * participación opcional. Esta función reparte el neto del estado de
 * cuenta y las transferencias reales entre los copropietarios según
 * el `ownership_pct` de cada uno.
 *
 * Reglas:
 *  - 1 propietario (con o sin %): 100% a él, sin tabla de desglose.
 *  - N propietarios con TODOS los % NULL: 100% al primero. Se retorna
 *    `assumedDistribution: true` para que la UI muestre un warning
 *    "Los % de participación no están configurados".
 *  - N propietarios con algunos/sin %: se normaliza proporcionalmente
 *    para que la suma sea 100%. (Si hay 3 dueños sin %, cada uno
 *    recibe 33.33%.) Se retorna `assumedDistribution: true`.
 *  - N propietarios con TODOS los % definidos: se usan directamente
 *    sin renormalizar. Asumimos que el usuario los configuró bien.
 *
 * Payouts: se prorratean por % de participación (no hay asociación
 * manual owner-payout todavía). En el futuro se puede agregar
 * `payout.owner_id` para asignar transferencias a un dueño específico.
 */

import type { PropertyOwner } from '../../types';

export interface OwnerDistribution {
  owner: PropertyOwner;
  /** % aplicado (0-100). Si fue renormalizado, este es el valor efectivo. */
  pct: number;
  /** Proporción del neto calculado: `statement.netCalculated * pct / 100`. */
  netCalculated: number;
  /** Proporción de las transferencias reales: `statement.totalPayouts * pct / 100`. */
  totalPayouts: number;
  /** `netCalculated - totalPayouts`. Positivo = a favor del propietario. */
  finalBalance: number;
}

export interface DistributionResult {
  /**
   * Lista de distribuciones, una por propietario. Vacía si `owners` es vacío.
   * Si hay 1 solo propietario, también se devuelve (1 elemento) para que
   * el caller pueda decidir si mostrar tabla o no.
   */
  items: OwnerDistribution[];
  /**
   * `true` si los % usados NO son los que el usuario configuró, sino que
   * se normalizaron/rellenaron automáticamente. La UI debería mostrar un
   * warning "Configure los % de participación para una distribución precisa".
   */
  assumedDistribution: boolean;
  /** Mensaje human-readable de la situación (para mostrar en warning/tooltip). */
  note?: string;
}

/** Versión de PropertyOwner que tolera campos opcionales/ausentes. */
type LooseOwner = {
  id: string;
  name: string;
  ownershipPct?: number | null;
};

export function computeOwnerDistribution(
  netCalculated: number,
  totalPayouts: number,
  owners: LooseOwner[] | null | undefined,
): DistributionResult {
  // Sin owners: imposible distribuir
  if (!owners || owners.length === 0) {
    return { items: [], assumedDistribution: false, note: 'Sin propietarios registrados.' };
  }

  // 1 solo propietario: 100% a él, sin renormalizar
  if (owners.length === 1) {
    return {
      items: [{
        owner: owners[0] as PropertyOwner,
        pct: 100,
        netCalculated,
        totalPayouts,
        finalBalance: netCalculated - totalPayouts,
      }],
      assumedDistribution: false,
    };
  }

  // N propietarios: contar cuántos tienen % definido
  const ownersWithPct = owners.filter((o) => o.ownershipPct != null && !isNaN(Number(o.ownershipPct)) && Number(o.ownershipPct) > 0);
  const ownersWithoutPct = owners.filter((o) => !ownersWithPct.includes(o));

  // Caso 1: TODOS los % son NULL → 100% al primero
  if (ownersWithPct.length === 0) {
    return {
      items: owners.map((o, i) => ({
        owner: o as PropertyOwner,
        pct: i === 0 ? 100 : 0,
        netCalculated: i === 0 ? netCalculated : 0,
        totalPayouts: i === 0 ? totalPayouts : 0,
        finalBalance: i === 0 ? netCalculated - totalPayouts : 0,
      })),
      assumedDistribution: true,
      note: 'Los % de participación no están configurados. Se asignó 100% al primer propietario. Configurá los % en el detalle de la propiedad para una distribución precisa.',
    };
  }

  // Caso 2: ALGUNOS % están definidos (no todos) → normalizar proporcionalmente
  if (ownersWithoutPct.length > 0) {
    const sumDefined = ownersWithPct.reduce((s, o) => s + Number(o.ownershipPct), 0);
    // Asignar a los sin-% la parte proporcional (lo que falta para 100)
    const remaining = Math.max(0, 100 - sumDefined);
    const perWithout = remaining / ownersWithoutPct.length;
    return {
      items: owners.map((o) => {
        const pct = o.ownershipPct != null ? Number(o.ownershipPct) : perWithout;
        return {
          owner: o as PropertyOwner,
          pct,
          netCalculated: netCalculated * pct / 100,
          totalPayouts: totalPayouts * pct / 100,
          finalBalance: (netCalculated - totalPayouts) * pct / 100,
        };
      }),
      assumedDistribution: true,
      note: 'Algunos propietarios no tienen % de participación definido. Se distribuyó proporcionalmente. Configurá los % faltantes para precisión.',
    };
  }

  // Caso 3: TODOS los % están definidos → usar directamente
  const sumPct = ownersWithPct.reduce((s, o) => s + Number(o.ownershipPct), 0);
  const isClean = Math.abs(sumPct - 100) < 0.01;
  if (isClean) {
    return {
      items: owners.map((o) => {
        const pct = Number(o.ownershipPct);
        return {
          owner: o as PropertyOwner,
          pct,
          netCalculated: netCalculated * pct / 100,
          totalPayouts: totalPayouts * pct / 100,
          finalBalance: (netCalculated - totalPayouts) * pct / 100,
        };
      }),
      assumedDistribution: false,
    };
  }

  // Caso 4: TODOS definidos pero suman != 100 → renormalizar
  return {
    items: owners.map((o) => {
      const rawPct = Number(o.ownershipPct);
      const normalizedPct = (rawPct / sumPct) * 100;
      return {
        owner: o as PropertyOwner,
        pct: normalizedPct,
        netCalculated: netCalculated * normalizedPct / 100,
        totalPayouts: totalPayouts * normalizedPct / 100,
        finalBalance: (netCalculated - totalPayouts) * normalizedPct / 100,
      };
    }),
    assumedDistribution: true,
    note: `Los % de participación suman ${sumPct.toFixed(2)}% (no 100%). Se renormalizó proporcionalmente. Ajustá los % para que sumen 100%.`,
  };
}
