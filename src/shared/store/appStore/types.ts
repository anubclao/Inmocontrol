// filepath: src/shared/store/appStore/types.ts
// Tipos del store global de InmoControl.
import type { Property, Tenant } from "../../../types";
import type { FinancialRecord } from "../types";

/**
 * Store global de InmoControl.
 *
 * Migración: los datos ahora viven en MySQL (vía backend Express).
 * El store solo mantiene el state en memoria para la UI y dispara
 * llamadas a la API en cada acción. El backend es la fuente de verdad.
 */
export interface AppState {
  properties: Property[];
  tenants: Tenant[];
  financialRecords: FinancialRecord[];

  loading: boolean;
  error: string | null;

  /** Timestamp (ms) de la última vez que se hizo fetch de properties.
   *  Lo usa `fetchProperties({ force })` para no re-fetchear si los datos
   *  están frescos. Spec fix_wizard_docs_persistence.md AC-3. */
  lastPropertiesFetchedAt: number | null;
  /** `true` cuando un componente marcó la lista como stale. El próximo
   *  `fetchProperties()` ignora el cache y siempre refetchea. */
  propertiesListStale: boolean;
  /** ID de la propiedad recién creada por el wizard. PropertiesView la
   *  usa para mostrar un highlight azul de 3s en la card correspondiente.
   *  Spec AC-3.3. */
  lastCreatedPropertyId: string | null;

  // Bootstrap: cargar todo desde MySQL
  hydrate: () => Promise<void>;
  /** `true` si el último `hydrate()` terminó con al menos un endpoint fallido
   *  (timeout, 5xx, red caída). Lo consume la App shell para mostrar un toast
   *  "Algunos datos no pudieron cargarse". Se resetea al volver a hidratar. */
  hydrationPartial: boolean;

  /** Refetch SOLO de properties. Usado por el mount de PropertiesView (AC-3.1)
   *  y por el `handleFinalize` para refrescar la lista sin re-hidratar todo.
   *  Si `force=true` ignora el flag de stale y refetchea igual. */
  fetchProperties: (opts?: { force?: boolean }) => Promise<void>;
  /** Marca la lista como stale. El próximo `fetchProperties()` siempre
   *  refetchea aunque los datos sean frescos. Llamado desde `handleFinalize`
   *  para que al volver a la lista, la nueva propiedad aparezca sin F5. */
  invalidatePropertiesList: () => void;
  /** Setea el id de la propiedad recién creada (para highlight 3s en la card). */
  setLastCreatedPropertyId: (id: string | null) => void;

  // Properties
  addProperty: (
    p: Partial<Property> & { id?: string },
  ) => Promise<Property | null>;
  updateProperty: (id: string, patch: Partial<Property>) => Promise<void>;
  removeProperty: (
    id: string,
  ) => Promise<
    | { ok: true; driveCleanupStatus: string }
    | { ok: false; error: string; hasInventories?: boolean }
  >;

  // Tenants
  addTenant: (t: Partial<Tenant> & { id?: string }) => Promise<Tenant | null>;
  /** Devuelve `true` si el PATCH al server respondió OK, `false` si falló.
   *  Antes era `Promise<void>` con catch silencioso — eso producía un "toast
   *  mentiroso" en el modal de edición de tenants (toast de éxito aunque el
   *  server hubiera devuelto 500). Ahora el caller puede mostrar feedback real. */
  updateTenant: (id: string, patch: Partial<Tenant>) => Promise<boolean>;
  removeTenant: (id: string) => Promise<void>;

  // Financial
  addFinancialRecord: (
    r: Partial<FinancialRecord> & { id?: string },
  ) => Promise<FinancialRecord | null>;
  updateFinancialRecord: (
    id: string,
    patch: Partial<FinancialRecord>,
  ) => Promise<void>;
  removeFinancialRecord: (id: string) => Promise<void>;

  reset: () => void;
}
