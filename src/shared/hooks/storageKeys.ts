/**
 * Centraliza los nombres de las claves de localStorage.
 * Si migramos a Zustand persist, este es el punto único a tocar.
 */
export const STORAGE_KEYS = {
  user: 'user',
  properties: 'properties',
  tenants: 'tenants',
  financialRecords: 'financialRecords',
  // Migración futura:
  //   contracts: 'contracts',
  //   owners: 'owners',
  //   organization: 'organization',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
