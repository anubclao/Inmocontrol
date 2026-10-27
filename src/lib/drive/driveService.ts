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

// ── Fotos del inventario: subida por lotes ─────────────────────────────────
// El server acepta JSON de hasta 15 MB (`express.json({limit:'15mb'})`). Un
// inventario real tiene 20–60 fotos de 2–4 MB: mandarlas todas en un solo POST
// producía 413 Payload Too Large y las fotos NUNCA llegaban a Drive (el
// frontend solo hacía console.warn, así que nadie se enteraba).
// Ahora se mandan lotes chicos, en secuencia, y se reporta qué falló.
const PHOTOS_MAX_PER_BATCH = 4;
/** Presupuesto de base64 por lote (~4.5 MB de payload real + overhead JSON). */
const PHOTOS_MAX_BASE64_CHARS = 6_000_000;
const PHOTOS_BATCH_TIMEOUT_MS = 60_000;

export interface InventoryPhotoUploadResult {
  uploaded: number;
  failed: Array<{ name: string; error: string }>;
  batches: number;
  skippedReason?: string;
}

export async function uploadInventoryPhotos(
  propertyId: string,
  phase: "inicial" | "final",
  photos: Array<{ name: string; base64Data: string }>,
): Promise<InventoryPhotoUploadResult> {
  const result: InventoryPhotoUploadResult = {
    uploaded: 0,
    failed: [],
    batches: 0,
  };
  if (photos.length === 0) return result;

  const { connected } = useGoogleDriveStore.getState();
  if (!connected) {
    result.skippedReason = "Drive no conectado";
    return result;
  }

  // Partir en lotes por cantidad y por peso.
  const batches: Array<Array<{ name: string; base64Data: string }>> = [];
  let current: Array<{ name: string; base64Data: string }> = [];
  let currentChars = 0;
  for (const photo of photos) {
    const size = photo.base64Data?.length ?? 0;
    const wouldOverflow =
      current.length >= PHOTOS_MAX_PER_BATCH ||
      (current.length > 0 && currentChars + size > PHOTOS_MAX_BASE64_CHARS);
    if (wouldOverflow) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(photo);
    currentChars += size;
  }
  if (current.length > 0) batches.push(current);

  for (const batch of batches) {
    result.batches++;
    try {
      const res = await fetchWithTimeout(
        "/api/inventories/upload-photos",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, phase, photos: batch }),
        },
        PHOTOS_BATCH_TIMEOUT_MS,
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        const reason = detail?.error ?? `HTTP ${res.status}`;
        for (const photo of batch) {
          result.failed.push({ name: photo.name, error: reason });
        }
        continue;
      }
      const data = await res.json();
      result.uploaded += data.uploaded?.length ?? 0;
      for (const f of data.failed ?? []) {
        result.failed.push({ name: f.name, error: f.error });
      }
    } catch (err) {
      const reason =
        err instanceof TimeoutError
          ? "Drive no respondió a tiempo"
          : String(err);
      for (const photo of batch) {
        result.failed.push({ name: photo.name, error: reason });
      }
    }
  }

  return result;
}
