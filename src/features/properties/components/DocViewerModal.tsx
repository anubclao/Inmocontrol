/**
 * DocViewerModal — visor de documento (CC, Predial, Mandato, RUT, etc.)
 * dentro del Detalle del Inmueble.
 *
 * Commit 5 del refactor #5b (spec #5b, verifier #5b). Sale del monolito
 * `PropertiesView.tsx`. Comportamiento preservado pixel-perfect:
 *  - Si la URL es `blob:` → iframe directo.
 *  - Si la URL es de Drive → `/api/drive/file` proxy para evitar
 *    "Necesitas acceso" (la sesión de Google del browser ≠ la del OAuth
 *    de la app, documentado en el comentario legacy BUG-021).
 *
 * El padre pasa el `label` (etiqueta humana del doc) y la `url`. El cierre
 * invoca `onClose`, donde el shell hace `revokeIfBlob(url)` para limpiar
 * el blob URL de memoria.
 */

import { Modal } from "../../../shared/ui";
import { driveProxyUrl } from "../../../lib/drive/driveProxy";

export interface DocViewerModalProps {
  isOpen: boolean;
  label: string;
  url: string | null;
  onClose: () => void;
}

export function DocViewerModal({ isOpen, label, url, onClose }: DocViewerModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Visualizando: ${label}`}>
      <div className="w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
        {!url ? (
          <div className="h-[40vh] flex items-center justify-center text-slate-400 text-sm">
            No hay documento para mostrar
          </div>
        ) : url.startsWith("blob:") ? (
          <iframe src={url} title={label} className="w-full h-[70vh]" />
        ) : (
          // FIX Drive "Necesitas acceso": en vez de cargar directamente
          // https://drive.google.com/file/d/X/view (que muestra login si la
          // sesión de Google del browser ≠ la del OAuth de la app),
          // pasamos por /api/drive/file que usa el token guardado en MySQL
          // para servir el archivo. El browser lo trata como contenido propio.
          <iframe
            src={driveProxyUrl(url)}
            title={label}
            className="w-full h-[70vh]"
          />
        )}
      </div>
    </Modal>
  );
}