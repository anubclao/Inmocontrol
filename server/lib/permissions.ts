/**
 * server/lib/permissions.ts — Matriz de permisos server-side.
 *
 * Single source of truth para `requireRole(action)` en el backend.
 * El frontend (src/features/auth/permissions.ts) mantiene una copia
 * sincronizada. El test `tests/permissions-matrix.test.ts` compara ambas
 * matrices y falla si difieren (drift detection).
 *
 * Si cambiás un permiso acá, cambiálo también en el frontend (o al revés).
 *
 * Spec: docs/specs/fix-issue-permissions-by-endpoint.md
 * Verifier: tests/verifiers/fix-issue-permissions-by-endpoint.md
 */

// FIX 2026-09-30 (saas_user_mgmt.md): rol 'gestor' agregado al type.
// El CHECK constraint de la DB ya lo aceptaba, pero el type no (drift).
// Frontend (`src/features/auth/permissions.ts`) ya estaba sincronizado.
export type Role = "admin" | "gestor" | "propietario" | "inquilino";

/**
 * Catálogo completo de acciones. Si agregás una acción nueva, agregá
 * un campo acá Y en `src/features/auth/permissions.ts`. El test de
 * drift va a fallar si difieren.
 */
export type Action =
  // Properties
  | "canAddProperty"
  | "canEditProperty"
  | "canDeleteProperty"
  // Tenants
  | "canAddTenant"
  | "canEditTenant"
  | "canDeleteTenant"
  // Financial
  | "canAddFinancial"
  | "canDeleteFinancial"
  // Contracts
  | "canAddContract"
  | "canEditContract"
  | "canDeleteContract"
  // Inventory
  | "canAddInventory"
  | "canEditInventory"
  | "canDeleteInventory"
  // Billing
  | "canSendInvoice"
  | "canRegisterPayment"
  // Owner statement
  | "canViewOwnerStatement"
  | "canRegisterOwnerPayout"
  // Drive
  | "canManageDrive"
  // Notifications
  | "canManageNotifications"
  // SaaS billing
  | "canManageSaasBilling"
  // Reports
  | "canViewReports"
  // Settings
  | "canViewSettings"
  // User management (saas_user_mgmt.md)
  | "canManageOrgUsers"
  | "canInviteUsers"
  | "canChangeMemberRole";

export const ROLE_PERMISSIONS: Record<Role, Record<Action, boolean>> = {
  admin: {
    canAddProperty: true,
    canEditProperty: true,
    canDeleteProperty: true,
    canAddTenant: true,
    canEditTenant: true,
    canDeleteTenant: true,
    canAddFinancial: true,
    canDeleteFinancial: true,
    canAddContract: true,
    canEditContract: true,
    canDeleteContract: true,
    canAddInventory: true,
    canEditInventory: true,
    canDeleteInventory: true,
    canSendInvoice: true,
    canRegisterPayment: true,
    canViewOwnerStatement: true,
    canRegisterOwnerPayout: true,
    canManageDrive: true,
    canManageNotifications: true,
    canManageSaasBilling: true,
    canViewReports: true,
    canViewSettings: true,
    canManageOrgUsers: true,
    canInviteUsers: true,
    canChangeMemberRole: true,
  },
  gestor: {
    canAddProperty: true,
    canEditProperty: true,
    canDeleteProperty: false,
    canAddTenant: true,
    canEditTenant: true,
    canDeleteTenant: false,
    canAddFinancial: true,
    canDeleteFinancial: false,
    canAddContract: true,
    canEditContract: true,
    canDeleteContract: false,
    canAddInventory: false,
    canEditInventory: false,
    canDeleteInventory: false,
    canSendInvoice: false,
    canRegisterPayment: false,
    canViewOwnerStatement: true,
    canRegisterOwnerPayout: false,
    canManageDrive: true,
    canManageNotifications: true,
    canManageSaasBilling: false,
    canViewReports: true,
    canViewSettings: false,
    canManageOrgUsers: false,
    canInviteUsers: false,
    canChangeMemberRole: false,
  },
  propietario: {
    canAddProperty: true,
    canEditProperty: true,
    canDeleteProperty: false,
    canAddTenant: false,
    canEditTenant: false,
    canDeleteTenant: false,
    canAddFinancial: true,
    canDeleteFinancial: false,
    canAddContract: true,
    canEditContract: true,
    canDeleteContract: false,
    canAddInventory: false,
    canEditInventory: false,
    canDeleteInventory: false,
    canSendInvoice: false,
    canRegisterPayment: false,
    canViewOwnerStatement: true,
    canRegisterOwnerPayout: false,
    canManageDrive: true,
    canManageNotifications: true,
    canManageSaasBilling: false,
    canViewReports: true,
    canViewSettings: false,
    canManageOrgUsers: false,
    canInviteUsers: false,
    canChangeMemberRole: false,
  },
  inquilino: {
    canAddProperty: false,
    canEditProperty: false,
    canDeleteProperty: false,
    canAddTenant: false,
    canEditTenant: false,
    canDeleteTenant: false,
    canAddFinancial: false,
    canDeleteFinancial: false,
    canAddContract: false,
    canEditContract: false,
    canDeleteContract: false,
    canAddInventory: false,
    canEditInventory: false,
    canDeleteInventory: false,
    canSendInvoice: false,
    canRegisterPayment: false,
    canViewOwnerStatement: false,
    canRegisterOwnerPayout: false,
    canManageDrive: false,
    canManageNotifications: false,
    canManageSaasBilling: false,
    canViewReports: false,
    canViewSettings: false,
    canManageOrgUsers: false,
    canInviteUsers: false,
    canChangeMemberRole: false,
  },
};

/**
 * Helper: chequea si un role tiene permiso para una acción.
 * Default deny: si el role es null/undefined o la acción no existe,
 * devuelve false.
 */
export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[action] ?? false;
}
