/**
 * InmoControl — Contexto de Organización para Multi-Tenant
 * ============================================================================
 * Helper central que resuelve el `organizationId` de la request actual.
 * Reemplaza los usos de `ensureDefaultOrg()` en endpoints autenticados
 * (ver docs/specs/saas_multitenant.md).
 *
 * Reglas:
 *   1. Si hay sesión válida con `organizationId` → usar ese (caso normal).
 *   2. Si hay sesión pero sin `organizationId` (legacy) → flag
 *      `isLegacySession: true` para que el caller decida (típicamente 401).
 *   3. Si NO hay sesión (bootstrap, tests) → fallback a `ensureDefaultOrg()`.
 *
 * NUNCA lanza. Devuelve siempre un objeto `OrgContext`.
 */

import type { Request } from "express";
import { ensureDefaultOrg } from "../db.js";

export interface OrgContext {
  /** UUID de la organización a la que pertenece la request. */
  orgId: string;
  /** True si el user es el admin del seed (puede ver TODO, incluso nulls). */
  isAdmin: boolean;
  /**
   * True si hay sesión pero sin `organizationId`. El caller debe rechazar
   * con 401 + `SESSION_MISSING_ORG` (ver spec saas_multitenant.md EC-1).
   */
  isLegacySession: boolean;
}

// UUID del admin del seed (constante en server/seed/pilotSeed.ts:30).
// Si cambia allá, hay que cambiar acá.
const SEED_ADMIN_PROFILE_ID = "00000000-0000-0000-0000-000000000005";

export async function getOrgIdForRequest(req: Request): Promise<OrgContext> {
  const user = (req as any).user;

  // Caso 1: sesión válida con orgId.
  if (user?.organizationId) {
    const isAdmin = user.role === "admin" && user.id === SEED_ADMIN_PROFILE_ID;
    return {
      orgId: user.organizationId,
      isAdmin,
      isLegacySession: false,
    };
  }

  // Caso 2: sesión pero sin orgId (legacy pre-multi-tenant).
  if (user) {
    return {
      orgId: "", // vacío a propósito — el caller debe rechazar.
      isAdmin: false,
      isLegacySession: true,
    };
  }

  // Caso 3: sin sesión (bootstrap, tests, admin seed endpoint).
  const orgId = await ensureDefaultOrg();
  return {
    orgId,
    isAdmin: true, // treat as admin in fallback
    isLegacySession: false,
  };
}
