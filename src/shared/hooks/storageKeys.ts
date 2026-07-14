/**
 * Centraliza los nombres de las claves de localStorage.
 * Si migramos a Zustand persist, este es el punto único a tocar.
 */
export const STORAGE_KEYS = {
  user: 'user',
  properties: 'properties',
  tenants: 'tenants',
  financialRecords: 'financialRecords',
  /**
   * Draft del wizard de captación de propiedad. Guarda el state del
   * wizard (dirección, chip, folio, lista de N propietarios/unidades,
   * y los slotKeys con archivos ya subidos a Drive) para sobrevivir un
   * refresh o cierre accidental del browser. Los archivos en sí NO se
   * guardan aquí (los blob URLs expiran); se asume que si Drive está
   * conectado, los archivos ya están ahí. Sin Drive, este draft solo
   * preserva los inputs del form y los slotKeys pendientes.
   * Se limpia al finalizar el wizard o al cancelarlo explícitamente.
   */
  wizardPropertyDraft: 'wizard:property-draft',
  // Migración futura:
  //   contracts: 'contracts',
  //   owners: 'owners',
  //   organization: 'organization',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
