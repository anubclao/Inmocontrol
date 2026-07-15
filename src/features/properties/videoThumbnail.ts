/**
 * Helpers para video en el inventario.
 *
 *  - extractVideoThumbnail(file): toma el primer frame del video y lo
 *    devuelve como dataURL JPEG comprimido (max 480px de lado mayor,
 *    quality 0.7). Ese thumbnail es lo que se muestra en la UI y en el PDF.
 *  - readVideoDuration(file): lee los metadatos del video para reportar
 *    la duración en segundos. Si el browser no soporta (Safari iOS < 16),
 *    devuelve 0 silenciosamente.
 *
 * El video COMPLETO se guarda aparte en IndexedDB como dataURL
 * (`<inventoryId>:<mediaId>` → `ItemMedia` con `videoDataUrl`). En el PDF
 * se reemplaza por un marcador "▶ VIDEO" porque jsPDF no embebe MP4.
 */

const THUMB_MAX_SIDE = 480;
const THUMB_QUALITY = 0.7;

/** Devuelve dataURL JPEG con el thumbnail del primer frame del video. */
export async function extractVideoThumbnail(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    // Esperar a que carguen los metadatos y se posicione en 0.1s
    // (muchos videos tienen frame negro en t=0)
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        // Forzar seek a 0.1s para saltar el frame negro inicial
        try { video.currentTime = Math.min(0.1, (video.duration || 1) / 2); }
        catch { /* ignore */ }
      };
      const onSeeked = () => resolve();
      const onError = () => reject(new Error('No se pudo leer el video'));
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const w = video.videoWidth || 320;
    const h = video.videoHeight || 240;
    const ratio = Math.min(1, THUMB_MAX_SIDE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * ratio));
    const ch = Math.max(1, Math.round(h * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.drawImage(video, 0, 0, cw, ch);
    return canvas.toDataURL('image/jpeg', THUMB_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lee la duración del video en segundos. Devuelve 0 si no se puede. */
export async function readVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.addEventListener('loadedmetadata', done, { once: true });
      video.addEventListener('error', done, { once: true });
    });
    return Math.round((video.duration || 0) * 10) / 10;
  } catch {
    return 0;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lee un File como dataURL base64 (sin compresión). Usado para el video completo. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Error leyendo el archivo'));
    reader.readAsDataURL(file);
  });
}
