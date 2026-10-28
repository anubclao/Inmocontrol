/**
 * server/lib/uploadLimits.ts — límites de tamaño por endpoint de subida.
 *
 * Contexto (auditoría Hostinger, oct-2026): el único tope era el envelope
 * global `express.json({limit:'15mb'})`. Eso significa que CUALQUIER endpoint
 * aceptaba 15 MB de JSON, y base64 mantiene tres copias del mismo contenido en
 * RAM (string crudo, JSON parseado, Buffer decodificado): ~40 MB de pico por
 * request. Tres o cuatro subidas simultáneas en un plan compartido es un OOM
 * plausible.
 *
 * Regla: validar ANTES de decodificar, y responder 413 con un mensaje que
 * diga cuál es el máximo. El cliente (driveService) ya sabe mostrar
 * `{ error }`, así que el usuario ve un motivo claro en vez de un 500.
 */

import { AppError } from "./errors.js";

/** PDFs de la app (jsPDF) suelen pesar <1 MB. 10 MB es holgado. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Lote de fotos de inventario: el frontend ya corta en 6 M chars (~4.5 MB). */
export const MAX_PHOTO_BATCH_BYTES = 8 * 1024 * 1024;

/**
 * Bytes que ocupa el contenido decodificado de un base64.
 * No decodifica: solo calcula (len * 3/4, menos el padding).
 */
export function base64DecodedBytes(base64: string): number {
  if (!base64) return 0;
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/** Quita el prefijo `data:...;base64,` si viene. */
export function stripDataUrlPrefix(base64: string): string {
  return base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
}

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Valida el tamaño decodificado y lanza 413 si se pasa.
 * @param label nombre humano del archivo ("PDF", "lote de fotos")
 */
export function assertBase64Size(
  base64: string,
  maxBytes: number,
  label: string,
): void {
  const size = base64DecodedBytes(base64);
  if (size > maxBytes) {
    throw new AppError(
      413,
      `${label} demasiado grande: ${formatMb(size)} (máximo ${formatMb(maxBytes)}).`,
      "PAYLOAD_TOO_LARGE",
      true,
    );
  }
}
