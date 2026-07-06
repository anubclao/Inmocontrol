/**
 * Compresión de imágenes para inventarios.
 *
 * - Redimensiona al MAX_SIDE mayor entre alto/ancho
 * - Codifica a JPEG 0.7
 * - Resultado: dataURL listo para guardar en IndexedDB
 *
 * Sin esta compresión, una foto de celular (4-8MB) satura IndexedDB en 5-10
 * propiedades. Con esta: 100-300KB por foto → 50+ propiedades sin problema.
 */

const MAX_SIDE = 1600;
const QUALITY = 0.7;

export async function compressImage(file: File): Promise<string> {
  const bitmap = await readAsImageBitmap(file);
  try {
    const { canvas, width, height } = fitCanvas(bitmap.width, bitmap.height, MAX_SIDE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    bitmap.close();
  }
}

function fitCanvas(srcW: number, srcH: number, maxSide: number) {
  const ratio = Math.min(1, maxSide / Math.max(srcW, srcH));
  const width = Math.round(srcW * ratio);
  const height = Math.round(srcH * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, width, height };
}

function readAsImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}
