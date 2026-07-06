/**
 * Utilidades para URLs de Google Drive.
 *
 * Por qué existe esto:
 * - Los archivos subidos por nuestra app tienen `webViewLink` como
 *   `https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk`.
 * - Cargar eso en un `<iframe>` muestra "Necesitas acceso" cuando el browser
 *   del usuario está logueado a Google con una cuenta distinta a la dueña
 *   del archivo. El iframe de Drive detecta la sesión del browser, no la
 *   sesión OAuth de nuestra app.
 * - La solución es servir el archivo a través de NUESTRO backend
 *   (`/api/drive/file?fileId=X`), que usa el access_token guardado en MySQL
 *   para pedirlo a la API de Drive. El browser lo recibe como stream propio
 *   y lo renderiza sin chequear contra la sesión de Google.
 *
 * - Para imágenes, `/api/drive/thumb?fileId=X&sz=w800` usa el `thumbnailLink`
 *   cacheable de Google (más liviano que un stream completo).
 *
 * Las URLs `blob:` se respetan tal cual (archivos subidos en sesión, no Drive).
 */

const DRIVE_FILE_URL_RE = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_THUMB_URL_RE = /drive\.google\.com\/thumbnail\?id=([a-zA-Z0-9_-]+)/;
const DRIVE_OPEN_URL_RE = /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/;

/** Extrae el fileId de Google Drive de una URL almacenada, o null si no es Drive. */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(DRIVE_FILE_URL_RE)
         ?? url.match(DRIVE_THUMB_URL_RE)
         ?? url.match(DRIVE_OPEN_URL_RE);
  return m ? m[1] : null;
}

/** Devuelve la URL del proxy backend para embeber el archivo en iframes/img.
 *  - blob:    → unchanged (archivos locales)
 *  - /api/    → unchanged (ya pasó por proxy)
 *  - Drive    → /api/drive/file?fileId=X (con Content-Disposition: inline) */
export function driveProxyUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/api/')) return url;
  const id = extractDriveFileId(url);
  if (id) return `/api/drive/file?fileId=${encodeURIComponent(id)}`;
  // Otros casos (URL firmada propia de Drive, https://lh3.googleusercontent.com/d/...)
  if (url.startsWith('https://lh3.googleusercontent.com/')) return url;
  return url;
}

/** URL de miniatura para imágenes (usa thumbnailLink cacheable). */
export function driveThumbUrl(url: string | null | undefined, size: 'w400' | 'w800' | 'w1600' = 'w800'): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  const id = extractDriveFileId(url);
  if (id) return `/api/drive/thumb?fileId=${encodeURIComponent(id)}&sz=${size}`;
  if (url.startsWith('https://lh3.googleusercontent.com/')) return url;
  return url;
}

/** URL para forzar descarga (Content-Disposition: attachment). */
export function driveDownloadUrl(url: string | null | undefined): string {
  if (!url) return '';
  const id = extractDriveFileId(url);
  if (id) return `/api/drive/file?fileId=${encodeURIComponent(id)}&download=1`;
  return url;
}