// filepath: src/features/tenants/hooks/tenantFilters.ts
// Funciones puras de filtrado y computos del modulo de Arrendatarios.
//
// fix-issue-06 (commit 2/2, oct-2026): extraidas del monolito TenantsView.tsx
// para reducir su tamano. Sin estado ni side-effects — son funciones
// puras que reciben tenants + properties + searchQuery y devuelven
// los computos derivados.

import type { Tenant } from "../types";

/** Filtra tenants por nombre / cedula / email / telefono. */
export function filterTenantsByQuery(
  tenants: Tenant[],
  searchQuery: string,
): Tenant[] {
  const q = searchQuery.toLowerCase();
  return tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.idNumber.includes(q) ||
      (t.email && t.email.toLowerCase().includes(q)) ||
      (t.phone && t.phone.includes(q)),
  );
}

/** Filtra properties disponibles (no Arrendado ni En Colocacion). */
export function getAvailableProperties(properties: any[]): any[] {
  return properties.filter(
    (p) => p.status !== "Arrendado" && p.status !== "En Colocación",
  );
}

/**
 * Defensa adicional contra duplicados: aunque el status del property diga
 * "Pendiente"/"Activo" pero ya exista un tenant Activo apuntando a este
 * propertyId (caso de bug historico o edicion manual del status), tambien
 * lo bloqueamos aca.
 */
export function isPropertyAvailable(
  p: any,
  availableProperties: any[],
  tenants: Tenant[],
): boolean {
  const propertyIdsWithActiveTenant = new Set(
    tenants
      .filter((t) => t.status === "Activo" && t.propertyId)
      .map((t) => t.propertyId),
  );
  return (
    availableProperties.some((x) => x.id === p.id) &&
    !propertyIdsWithActiveTenant.has(p.id)
  );
}

/** Resuelve la direccion de un propertyId desde el array de properties. */
export function getPropertyAddress(
  propertyId: string,
  properties: any[],
): string {
  const p = properties.find((x) => x.id === propertyId);
  return p ? p.address : "—";
}

/** Separa tenants en activos e inactivos (post-filter). */
export function splitActiveInactive(filtered: Tenant[]): {
  activeTenants: Tenant[];
  inactiveTenants: Tenant[];
} {
  return {
    activeTenants: filtered.filter((t) => t.status === "Activo"),
    inactiveTenants: filtered.filter((t) => t.status === "Inactivo"),
  };
}
