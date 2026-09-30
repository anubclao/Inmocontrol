/**
 * Definición de roles y permisos para InmoControl (cliente).
 *
 * Esta matriz DEBE estar sincronizada con `server/lib/permissions.ts`.
 * El test `tests/permissions-matrix.test.ts` compara ambas y falla si
 * difieren (drift detection).
 *
 * Si cambiás un permiso acá, cambiálo también en el server (o viceversa).
 *
 * Spec: docs/specs/fix-issue-permissions-by-endpoint.md
 */

// FIX 2026-09-26 (saas_user_mgmt.md): rol 'gestor' agregado al type.
// El CHECK constraint de la DB ya lo aceptaba, pero el type no (drift).
export type Role = "admin" | "gestor" | "propietario" | "inquilino";

export interface RolePermissions {
  // Properties
  canAddProperty: boolean;
  canEditProperty: boolean;
  canDeleteProperty: boolean;
  // Tenants
  canAddTenant: boolean;
  canEditTenant: boolean;
  canDeleteTenant: boolean;
  // Financial
  canAddFinancial: boolean;
  canDeleteFinancial: boolean;
  // Contracts
  canAddContract: boolean;
  canEditContract: boolean;
  canDeleteContract: boolean;
  // Inventory
  canAddInventory: boolean;
  canEditInventory: boolean;
  canDeleteInventory: boolean;
  // Billing
  canSendInvoice: boolean;
  canRegisterPayment: boolean;
  // Owner statement
  canViewOwnerStatement: boolean;
  canRegisterOwnerPayout: boolean;
  // Drive
  canManageDrive: boolean;
  // Notifications
  canManageNotifications: boolean;
  // SaaS billing
  canManageSaasBilling: boolean;
  // Reports
  canViewReports: boolean;
  // Settings
  canViewSettings: boolean;
  // User management (saas_user_mgmt.md)
  canManageOrgUsers: boolean;
  canInviteUsers: boolean;
  canChangeMemberRole: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
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
    canManageOrgUsers: false,
    canInviteUsers: false,
    canChangeMemberRole: false,
    canManageSaasBilling: false,
    canViewReports: false,
    canViewSettings: false,
  },
};

/** Helper de uso: `can(role, 'canAddProperty')` */
export const can = (
  role: Role | null | undefined,
  action: keyof RolePermissions,
): boolean => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[action] ?? false;
};
