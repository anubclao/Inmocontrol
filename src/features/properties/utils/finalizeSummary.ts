/**
 * finalizeSummary — tipo + constructor puro del summary del modal
 * que se muestra al finalizar el wizard de captación.
 *
 * Commit 4 del refactor de PropertiesView.tsx (spec #5, verifier #5).
 * El tipo `FinalizeSummary` y la función `buildFinalizeSummary` salen
 * del monolito para ser testeables sin React.
 *
 * El state de React (`finalizeSummary`) y el render del modal se quedan
 * en `PropertiesView.tsx` (Commit 4 de spec #5 los trata por separado
 * si fueran necesarios). Este módulo es el constructor y el contrato.
 */

export interface FinalizeSummary {
  /** Dirección de la propiedad (para mostrar en el modal). */
  address: string;
  /** ID de la carpeta en Drive (para el botón "Ver carpeta en Drive"). */
  driveFolderId: string | null;
  /** Path humano de la carpeta en Drive (Mi unidad / ...). */
  driveFolderPath: string | null;
  /** ¿Drive estaba conectado al finalizar? */
  driveConnected: boolean;
  /** slotKeys que SÍ se subieron a Drive. */
  uploadedToDrive: string[];
  /** slotKeys que quedaron solo en el navegador (blob URL, sin Drive). */
  uploadedLocalOnly: string[];
  /** slotKeys que el usuario nunca llegó a subir. */
  missingDocs: string[];
  /** Mensajes de error por upload fallido (uno por slotKey). */
  failedUploads: string[];
  /** ¿Se subió también el PDF de inventario a Drive? */
  inventoryUploaded: boolean;
  /** Total de docs que el wizard esperaba (para el header del modal). */
  totalDocs: number;
  /**
   * ¿Falló la persistencia en MySQL (property_documents INSERTs)?
   * Cuando true, el modal muestra un banner rojo arriba con instrucciones.
   */
  persistFailed?: boolean;
}

export interface BuildFinalizeSummaryInput {
  address: string;
  driveFolderId: string | null;
  driveFolderPath: string | null;
  driveConnected: boolean;
  uploadedToDrive: string[];
  uploadedLocalOnly: string[];
  missingSlotKeys: string[];
  failedUploads: string[];
  inventoryUploadedToDrive: boolean;
  totalDocs: number;
  persistFailed: boolean;
}

/**
 * Constructor puro: arma el `FinalizeSummary` que el modal renderiza.
 * Esta función es 100% determinística — mismo input → mismo output.
 *
 * Se separó del componente para poder testearla sin React. Si en el
 * futuro se ajustan las reglas (ej: contar `missingDocs` diferente),
 * solo se cambia acá y los tests cubren la regresión.
 */
export function buildFinalizeSummary(
  input: BuildFinalizeSummaryInput,
): FinalizeSummary {
  return {
    address: input.address,
    driveFolderId: input.driveFolderId,
    driveFolderPath: input.driveFolderPath,
    driveConnected: input.driveConnected,
    uploadedToDrive: input.uploadedToDrive,
    uploadedLocalOnly: input.uploadedLocalOnly,
    missingDocs: input.missingSlotKeys,
    failedUploads: input.failedUploads,
    inventoryUploaded: input.inventoryUploadedToDrive,
    totalDocs: input.totalDocs,
    persistFailed: input.persistFailed,
  };
}
