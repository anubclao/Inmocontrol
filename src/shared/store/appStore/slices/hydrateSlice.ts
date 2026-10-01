// filepath: src/shared/store/appStore/slices/hydrateSlice.ts
// Slice: hydrate. Carga properties/tenants/financial-records/contracts/amortization
// desde MySQL en paralelo (Promise.allSettled). Si un endpoint falla, los otros
// siguen y la UI muestra el banner de carga parcial (hydrationPartial=true).
import type { StateCreator } from "zustand";
import { useContractStore } from "../../../../features/contracts/contractStore";
import { mapServerContract } from "../../../../features/contracts/contractApi";
import { useBillingStore } from "../../../../features/billing/billingStore";
import type { AppState } from "../types";
import { apiCall, mapServerProperty, mapServerTenant } from "../api";

export const createHydrateSlice: StateCreator<
  AppState,
  [],
  [],
  Pick<AppState, "hydrate">
> = (_set, get) => ({
  hydrate: async () => {
    const set = _set; // alias para mutabilidad local
    set({ loading: true, error: null, hydrationPartial: false });
    // BUG-019: usar Promise.allSettled en vez de Promise.all.
    // Si UNO solo de los 5 endpoints falla (timeout, 5xx, red caída), los
    // otros 4 siguen y la app carga con datos parciales. Antes, un solo
    // endpoint colgado dejaba la app con spinner eterno (browser esperando
    // hasta 5min, cuando el fetch interno decide cortar).
    const results = await Promise.allSettled([
      apiCall("GET", "/api/properties"),
      apiCall("GET", "/api/tenants"),
      apiCall("GET", "/api/financial-records"),
      // Cargamos contratos desde MySQL para que Zustand refleje el estado
      // canónico del server. Sin esto, contratos viejos huérfanos en
      // localStorage seguían apareciendo aunque MySQL estuviera limpio.
      apiCall("GET", "/api/entities/contracts"),
      // Amortización desde MySQL: usamos la lista TOTAL del org para
      // sincronizar el cache local. Cualquier entrada que apunte a un
      // contratoId que ya no exista en MySQL se descarta.
      apiCall("GET", "/api/billing/amortization"),
    ]);

    // Extraer valores (null si rejected) y contar fallos.
    const [propsRes, tenantsRes, finRes, contractsRes, amortRes] = results.map(
      (r) => (r.status === "fulfilled" ? r.value : null),
    );
    const failedCount = results.filter((r) => r.status === "rejected").length;
    if (failedCount > 0) {
      // Log de los motivos para debugging en consola (no rompe UX).
      const labels = [
        "properties",
        "tenants",
        "financial-records",
        "contracts",
        "amortization",
      ];
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.warn(
            `[hydrate] ${labels[i]} falló: ${(r as PromiseRejectedResult).reason?.message ?? r.reason}`,
          );
        }
      });
      console.warn(
        `[hydrate] ${failedCount}/5 endpoints fallaron — la app cargará con datos parciales.`,
      );
      set({ hydrationPartial: true });
    }

    try {
      // Mapear campos del backend (snake_case) al frontend (camelCase).
      // BUG-019: si el endpoint falló (propsRes es null), el fallback `?? {}`
      // evita que explote el `.map`. La UI mostrará "0 propiedades" — el
      // toast de carga parcial le avisa al user.
      const properties = ((propsRes as any)?.properties ?? []).map(
        mapServerProperty,
      );
      const tenants = ((tenantsRes as any)?.tenants ?? []).map(mapServerTenant);

      set({
        properties,
        tenants,
        // BUG-019: si el endpoint de financial-records falló, no pisamos los
        // records existentes con undefined. Mantenemos lo que ya estaba (cache
        // local puede tener algo útil) o [] si no había nada.
        financialRecords:
          (finRes as any)?.records ?? get().financialRecords ?? [],
        loading: false,
      });

      // ── Sincronizar contratos desde MySQL ─────────────────────────────
      // Antes del fix, los contratos vivían solo en Zustand (localStorage)
      // y eso permitía que contratos huérfanos/basura quedaran visibles
      // aunque MySQL no los tuviera. Ahora la fuente de verdad es MySQL.
      // Si la respuesta falla, dejamos Zustand como está para no romper
      // la app en modo offline.
      let serverContractIds = new Set<string>();
      try {
        const serverContracts = (contractsRes ?? []).map(mapServerContract);
        useContractStore.setState({ contracts: serverContracts });
        serverContractIds = new Set(serverContracts.map((c: any) => c.id));
      } catch (contractsErr: any) {
        console.warn(
          "[store] No se pudieron sincronizar contratos desde MySQL:",
          contractsErr?.message ?? contractsErr,
        );
      }

      // ── Sincronizar amortización desde MySQL ──────────────────────────
      // Mismo principio: si MySQL está vacío, el cache local de amortización
      // es basura (caso típico: admin borró contratos con el script de
      // limpieza y el cache de Zustand sigue mostrando filas fantasma).
      try {
        const serverAmortRows: any[] = amortRes?.rows ?? [];
        const localBilling = useBillingStore.getState();

        if (serverContractIds.size === 0) {
          // Caso limpieza total: MySQL no tiene contratos → no debería haber
          // amortización, recibos, ni nada de billing cacheado.
          if (
            Object.keys(localBilling.amortization).length > 0 ||
            Object.keys(localBilling.invoices).length > 0 ||
            Object.keys(localBilling.billingPolicies).length > 0
          ) {
            console.warn(
              "[hydrate] MySQL sin contratos pero cache local tiene billing. Limpiando.",
            );
            useBillingStore.setState({
              amortization: {},
              invoices: {},
              discounts: {},
              increases: {},
              billingPolicies: {},
            });
          }
        } else {
          // Caso normal: agrupar amortización del server por contractId.
          const grouped: Record<string, any[]> = {};
          for (const row of serverAmortRows) {
            if (!row.contractId) continue;
            if (!grouped[row.contractId]) grouped[row.contractId] = [];
            grouped[row.contractId].push(row);
          }
          // Solo conservamos entradas cuyo contractId está en MySQL.
          const cleaned: Record<string, any[]> = {};
          for (const [cid, rows] of Object.entries(grouped)) {
            if (serverContractIds.has(cid)) {
              cleaned[cid] = rows;
            }
          }
          const droppedCount =
            Object.keys(localBilling.amortization).length -
            Object.keys(cleaned).length;
          if (droppedCount > 0) {
            console.info(
              `[hydrate] Amortización sincronizada: ${Object.keys(cleaned).length} contratos con datos, ` +
                `${droppedCount} contrato(s) huérfano(s) descartados del cache local.`,
            );
          }
          useBillingStore.setState({ amortization: cleaned });
        }
      } catch (billingErr: any) {
        console.warn(
          "[hydrate] No se pudo sincronizar amortización desde MySQL:",
          billingErr?.message ?? billingErr,
        );
      }
    } catch (err: any) {
      // Con Promise.allSettled ya no se cae acá por una promise individual,
      // pero sí puede explotar un error de mapeo o un null deref inesperado.
      console.error("[store] hydrate failed:", err);
      set({ error: err?.message ?? "Error desconocido", loading: false });
    }
  },
});
