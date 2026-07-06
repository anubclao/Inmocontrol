/**
 * Definición de roles y permisos para InmoControl.
 *
 * Migrado del monolito (App.tsx línea 525). Quedó como `Record<Role, ...>` con
 * tipo fuerte para evitar el `Record<string, any>` original — así un typo en
 * `ROLE_PERMISSIONS.admin.canAddFoo` rompe el build en vez de fallar en runtime.
 *
 * Pendiente (Fase 3): cuando hagamos auth real, estos flags deben venir del
 * backend (RLS en Supabase o equivalente), no estar hardcodeados.
 */

export type Role = 'admin' | 'propietario' | 'inquilino';

export interface RolePermissions {
  canAddProperty: boolean;
  canEditProperty: boolean;
  canDeleteProperty: boolean;
  canAddTenant: boolean;
  canEditTenant: boolean;
  canDeleteTenant: boolean;
  canAddFinancial: boolean;
  canDeleteFinancial: boolean;
  canViewReports: boolean;
  canViewSettings: boolean;
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
    canViewReports: true,
    canViewSettings: true,
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
    canViewReports: true,
    canViewSettings: false,
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
    canViewReports: false,
    canViewSettings: false,
  },
};

/** Helper de uso: `can(role, 'canAddProperty')` */
export const can = (role: Role | null, action: keyof RolePermissions): boolean => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[action] ?? false;
};
