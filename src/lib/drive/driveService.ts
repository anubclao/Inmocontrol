/**
 * driveService — helpers para interactuar con Google Drive via el backend Express.
 * Solo se usa cuando el usuario tiene GDrive conectado (useGoogleDriveStore).
 */

import { useGoogleDriveStore } from "../../shared/store/googleDriveStore";
import {
  fetchWithTimeout,
  TimeoutError,
} from "../../shared/lib/fetchWithTimeout";

const API = "/api/drive";

// BUG-024: timeouts diferenciados. Queries rapidas (15s), uploads (30s).
const DRIVE_QUERY_TIMEOUT_MS = 15_000;
const DRIVE_UPLOAD_TIMEOUT_MS = 30_000;

/** Crea las carpetas de una propiedad nueva en Drive y devuelve el folderId. */
export async function createPropertyFolders(
  propertyId: string,
  propertyName: string,
): Promise<string | null> {
  const { connected } = useGoogleDriveStore.getState();
  if (!connected) return null;

  try {
    const res = await fetchWithTimeout(
      `${API}/create-property-folders?propertyId=${encodeURIComponent(propertyId)}&propertyName=${encodeURIComponent(propertyName)}`,
      {},
      DRIVE_QUERY_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.propertyFolderId;
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.warn("[Drive] createPropertyFolders timeout");
    } else {
      console.error("[Drive] Error creando carpetas:", err);
    }
    return null;
  }
}

/**
 * Sube un archivo a Drive dentro de la carpeta de una propiedad.
 * @param propertyId   ID de la propiedad (para logging)
 * @param folderId     ID de la carpeta de la propiedad en Drive
 * @param subfolder   'Propietario' | 'Inventarios'
 * @param fileName     Nombre del archivo (ej: "Contrato de Mandato.pdf")
 * @param base64Data   Contenido del archivo en base64
 */
export async function uploadFileToDrive(
  propertyId: string,
  folderId: string,
  subfolder: "Propietario" | "Inventarios",
  fileName: string,
  base64Data: string,
): Promise<{ webViewLink?: string; error?: string }> {
  const { connected } = useGoogleDriveStore.getState();
  if (!connected || !folderId) return { error: "Drive no conectado" };

  try {
    const res = await fetchWithTimeout(
      `${API}/upload-file`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          folderId,
          subfolder,
          fileName,
          base64Data,
        }),
      },
      DRIVE_UPLOAD_TIMEOUT_MS,
    );
    if (!res.ok) {
      const err = await res.json();
      return { error: err.error ?? "Upload failed" };
    }
    const data = await res.json();
    return { webViewLink: data.webViewLink };
  } catch (err) {
    if (err instanceof TimeoutError) {
      return { error: "Drive no respondió a tiempo. Reintentá." };
    }
    return { error: String(err) };
  }
}

/** Convierte un File a base64. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // sin el prefix "data:...;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Sube un PDF a una subcarpeta ARBITRARIA de Drive (crea la subcarpeta on-demand).
 * Usado por los flujos automáticos de cuenta de cobro y estado de cuenta.
 *
 * Si Drive no está conectado, retorna `{ skipped: true, reason: 'Drive no conectado' }`
 * sin romper el flujo — el PDF ya se descargó localmente, solo que NO quedó en Drive.
 *
 * @param blob         PDF como Blob (sale de `generateXxxPdfBlob()`)
 * @param parentFolderId  ID de la carpeta padre (carpeta de la propiedad o del inquilino)
 * @param parentKind      'property' | 'tenant' | 'custom' — solo para logging
 * @param subfolder       Nombre de la subcarpeta (ej: 'Recibos', 'EstadosCuenta')
 * @param fileName        Nombre del archivo (ej: 'CuentaCobro_CC-202607-001.pdf')
 */
export async function uploadPdfToDrive(
  blob: Blob,
  parentFolderId: string,
  parentKind: "property" | "tenant" | "custom",
  subfolder: string,
  fileName: string,
): Promise<{
  fileId?: string;
  webViewLink?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
}> {
  const { connected } = useGoogleDriveStore.getState();
  if (!connected) return { skipped: true, reason: "Drive no conectado" };
  if (!parentFolderId)
    return { skipped: true, reason: "No hay carpeta padre en Drive" };

  try {
    const base64 = await blobToBase64(blob);
    const res = await fetchWithTimeout(
      `${API}/upload-pdf`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentFolderId,
          parentKind,
          subfolder,
          fileName,
          base64Data: base64,
        }),
      },
      DRIVE_UPLOAD_TIMEOUT_MS,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error ?? `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { fileId: data.fileId, webViewLink: data.webViewLink };
  } catch (err) {
    if (err instanceof TimeoutError) {
      return { error: "Drive no respondió a tiempo. Reintentá." };
    }
    return { error: String(err) };
  }
}

/** Convierte un Blob (típicamente PDF) a base64 sin prefijo. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
