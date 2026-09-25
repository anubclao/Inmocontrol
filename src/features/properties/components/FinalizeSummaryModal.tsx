/**
 * FinalizeSummaryModal — modal que muestra el resumen post-finalize del
 * wizard de captación de propiedades.
 *
 * Commit 1 del refactor #5b (spec #5b, verifier #5b). Sale de
 * `PropertiesView.tsx` con contrato tipado. Preserva el copy exacto,
 * el orden de las secciones y el visual pixel-perfect.
 *
 * Secciones mostradas (en orden):
 *  1. Header con dirección + path de Drive (gris)
 *  2. Banner rojo si persistFailed (BUG-2026-08-05)
 *  3. Verde: docs subidos a Drive (count + lista)
 *  4. Amber: solo local (count + lista)  [si > 0]
 *  5. Rojo: faltantes (count + lista)    [si > 0]
 *  6. Rojo: errores durante la subida    [si > 0]
 *  7. Footer: [Ver en Drive] + Cerrar
 *
 * El state sigue en `PropertiesView.tsx` (per AC-10 del spec); este
 * componente solo renderiza.
 */

import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  X,
} from "lucide-react";
import { Button, Modal } from "../../../shared/ui";
import type { FinalizeSummary } from "../utils/finalizeSummary";
import { slotKeyToLabel } from "../utils/slotKeyHelpers";

export interface FinalizeSummaryModalProps {
  isOpen: boolean;
  summary: FinalizeSummary | null;
  /** Propietarios del wizard (para resolver `cedula:<id>` → nombre). */
  wizardOwners: ReadonlyArray<{ id: string; name?: string }>;
  /** Unidades del wizard (para resolver `certificado_tradicion:<id>` → label). */
  wizardUnits: ReadonlyArray<{ id: string; label?: string }>;
  onClose: () => void;
}

/**
 * Renderiza el modal de resumen al finalizar el wizard. El componente
 * retorna `null` cuando `summary` es null (estado transitorio entre
 * llamadas, ver EC-1 del spec).
 */
export function FinalizeSummaryModal({
  isOpen,
  summary,
  wizardOwners,
  wizardUnits,
  onClose,
}: FinalizeSummaryModalProps) {
  if (!summary) return null;

  const allOnDrive =
    summary.uploadedToDrive.length === summary.totalDocs &&
    (summary.uploadedLocalOnly.length ?? 0) === 0;

  const title = summary.persistFailed
    ? "✗ Propiedad creada — documentos NO persistidos"
    : allOnDrive
      ? "✓ Propiedad creada — todo en Drive"
      : "⚠ Propiedad creada con pendientes";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
          <p>
            <strong>{summary.address}</strong>
          </p>
          {summary.driveFolderPath && (
            <p className="text-xs text-slate-500 mt-1">
              📁 Drive: Mi unidad / {summary.driveFolderPath}/
            </p>
          )}
        </div>

        {/* FIX BUG-2026-08-05 — Banner rojo si el server NO persistió los docs.
            El server devolvió 200 pero ningún INSERT a property_documents se ejecutó
            (probable: slotKeys con wizard-* que el server rechaza silenciosamente,
            o URLs blob:/data: que AC-15 filtra). */}
        {summary.persistFailed && (
          <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
            <p className="text-sm font-bold text-red-900 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5" />
              Los documentos NO se guardaron en MySQL
            </p>
            <p className="text-xs text-red-800 mt-2">
              Los archivos quedaron <strong>solo en Google Drive</strong>{" "}
              (carpeta <code>Propietario/</code> de esta propiedad) pero el
              servidor no pudo registrar las URLs en la base de datos.
            </p>
            <p className="text-xs text-red-800 mt-2">
              <strong>Qué hacer:</strong> abrí el{" "}
              <strong>Detalle del Inmueble</strong>, entrá a la sección{" "}
              <em>Propietarios</em> y tocá <em>Subir</em> en cada slot. El
              modal de upload detectará que ya están en Drive y los
              re-vinculará con un INSERT a <code>property_documents</code>.
            </p>
            <p className="text-xs text-red-700 mt-2 font-mono">
              Si el problema persiste, mandame una captura de hPanel → Logs
              (filtrada por "[docs]") y los logs de DevTools filtrados por
              "[finalize]".
            </p>
          </div>
        )}

        {/* 🟢 Subidos a Drive */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            En Google Drive ({summary.uploadedToDrive.length})
          </p>
          {summary.uploadedToDrive.length > 0 ? (
            <ul className="text-xs text-emerald-800 mt-2 space-y-0.5 list-disc pl-5">
              {summary.uploadedToDrive.map((k) => (
                <li key={k}>{slotKeyToLabel(k, wizardOwners, wizardUnits)}</li>
              ))}
              {summary.inventoryUploaded && (
                <li>PDF de Inventario de captación</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-emerald-700 mt-1">Ninguno.</p>
          )}
        </div>

        {/* 🟠 Solo local (se perdió al cerrar el navegador) */}
        {summary.uploadedLocalOnly.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <CloudOff className="w-4 h-4" />
              Solo en este navegador ({summary.uploadedLocalOnly.length})
            </p>
            <p className="text-xs text-amber-800 mt-1">
              {summary.driveConnected
                ? "Falló la subida a Drive. Reintentá desde el Detalle del Inmueble."
                : "Drive no estaba conectado. Reintentá desde el Detalle del Inmueble."}
            </p>
            <ul className="text-xs text-amber-800 mt-2 space-y-0.5 list-disc pl-5">
              {summary.uploadedLocalOnly.map((k) => (
                <li key={k}>{slotKeyToLabel(k, wizardOwners, wizardUnits)}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ❌ Faltantes (no se subieron ni local ni a Drive) */}
        {summary.missingDocs.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-semibold text-red-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Faltantes — no subiste ({summary.missingDocs.length})
            </p>
            <p className="text-xs text-red-800 mt-1">
              Quedan como <strong>pendientes</strong>. La propiedad queda en
              estado <strong> Pendiente</strong> hasta que subas el Contrato
              de Mandato. Subilos desde el Detalle del Inmueble.
            </p>
            <ul className="text-xs text-red-800 mt-2 space-y-0.5 list-disc pl-5">
              {summary.missingDocs.map((k) => (
                <li key={k}>{slotKeyToLabel(k, wizardOwners, wizardUnits)}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 🔴 Errores de subida */}
        {summary.failedUploads.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-semibold text-red-900 flex items-center gap-1.5">
              <X className="w-4 h-4" />
              Errores durante la subida
            </p>
            <ul className="text-xs text-red-800 mt-2 space-y-0.5 list-disc pl-5">
              {summary.failedUploads.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {summary.driveFolderId && (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                window.open(
                  `https://drive.google.com/drive/folders/${summary.driveFolderId}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver carpeta en Drive
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}