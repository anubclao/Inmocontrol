// filepath: src/features/properties/components/StepDocs/DocCard.tsx
// Sub-componente de tarjeta individual de un documento.
//
// fix-issue-07 (FASE 4 Karpathy, oct-2026): extraído del monolito
// StepDocs.tsx (814 lineas). Tarjeta que muestra el estado de cada
// documento, la lista de archivos, y los CTAs de "Subir/Reemplazar" +
// "Agregar otro".
//
// Sin cambio funcional — paridad exacta con la versión original.

import {
  FileText,
  X,
  CheckCircle2,
  CloudUpload,
  CloudOff,
  RefreshCw,
  Plus,
  Loader2,
} from "lucide-react";
import { getDocStorageState } from "./hooks/useDocCards";
import type { DocCardProps, DocStorageState } from "./types";

/**
 * DocCard: tarjeta individual de un documento. Soporta N archivos por
 * slot. Muestra la cantidad de PDFs subidos, la lista con botón ver/quitar,
 * y dos CTAs: "Subir/Reemplazar" (abre el file picker) y "Agregar otro"
 * (lo mismo, para encadenar varias hojas).
 */
export function DocCard(props: DocCardProps) {
  const {
    docKey,
    label,
    Icon,
    files,
    required,
    isMandato,
    helpText,
    uploading,
    onPick,
    onAddAnother,
    onRemove,
    onView,
  } = props;
  const hasFiles = files.length > 0;
  // Estado del almacenamiento: derivado de la URL real de cada archivo.
  // Si TODOS están en Drive → 'drive'. Si al menos uno es local → 'local'.
  const allDrive =
    hasFiles && files.every((u) => getDocStorageState(u) === "drive");
  const anyLocal =
    hasFiles && files.some((u) => getDocStorageState(u) === "local");
  const storageState: DocStorageState | null = !hasFiles
    ? null
    : allDrive
      ? "drive"
      : anyLocal
        ? "local"
        : "pending";

  return (
    <div
      className={`p-4 border-2 border-dashed rounded-xl transition-all group relative ${
        isMandato && storageState === "drive"
          ? "border-emerald-300 bg-emerald-50/30"
          : storageState === "drive"
            ? "border-emerald-200 bg-emerald-50/20"
            : storageState === "local"
              ? "border-amber-200 bg-amber-50/20"
              : "border-slate-200 hover:border-blue-400"
      }`}
      data-testid={`doc-card-${docKey}`}
    >
      <div className="flex justify-between items-start">
        <Icon
          className={`w-6 h-6 ${storageState === "drive" ? "text-emerald-500" : uploading ? "text-blue-500 animate-pulse" : storageState === "local" ? "text-amber-500" : "text-slate-400 group-hover:text-blue-500"} mb-2`}
        />
        {storageState === "drive" && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex items-center gap-1"
            title="Archivo ya está en Google Drive"
          >
            <CheckCircle2 className="w-3 h-3" />
            En Drive
          </span>
        )}
        {storageState === "local" && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1"
            title="Archivo solo en este navegador — se subirá a Drive al finalizar el wizard"
          >
            <CloudUpload className="w-3 h-3" />
            Pendiente → Drive
          </span>
        )}
        {!storageState && hasFiles && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
            {files.length} {files.length === 1 ? "archivo" : "archivos"}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      {helpText && (
        <p className="text-[10px] text-slate-500 mt-0.5">{helpText}</p>
      )}
      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
        {uploading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Subiendo a Drive...
          </>
        ) : storageState === "drive" ? (
          isMandato ? (
            "PDF firmado — propiedad al 100%"
          ) : (
            "Documento en Google Drive"
          )
        ) : storageState === "local" ? (
          isMandato ? (
            "Firmado, falta subir a Drive al finalizar"
          ) : (
            "Listo localmente. Se sube a Drive al finalizar el wizard"
          )
        ) : required ? (
          <>
            <CloudOff className="w-3 h-3" />
            Pendiente (opcional, no bloquea)
          </>
        ) : (
          "Click para subir PDF (opcional)"
        )}
      </p>

      {/* ── Lista de archivos subidos ── */}
      {hasFiles && (
        <ul className="mt-3 space-y-1">
          {files.map((url, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 text-[11px] bg-white/80 border border-slate-200 rounded px-2 py-1"
            >
              <button
                type="button"
                onClick={() => onView(url)}
                className="flex items-center gap-1.5 text-blue-600 hover:underline truncate flex-1 text-left"
                title="Ver PDF"
              >
                <FileText className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">Archivo {i + 1}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-red-500 hover:text-red-700 p-0.5"
                title="Quitar este archivo"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── Acciones: subir/reemplazar + agregar otro ── */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="flex-1 min-w-[110px] px-2.5 py-1.5 text-[11px] font-bold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1 disabled:opacity-50"
        >
          {hasFiles ? (
            <>
              <RefreshCw className="w-3 h-3" />
              Reemplazar
            </>
          ) : (
            <>
              <FileText className="w-3 h-3" />
              Subir PDF
            </>
          )}
        </button>
        {hasFiles && (
          <button
            type="button"
            onClick={onAddAnother}
            disabled={uploading}
            className="flex-1 min-w-[110px] px-2.5 py-1.5 text-[11px] font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            Agregar otro
          </button>
        )}
      </div>

      {/* Botón "Ver" del primer archivo (atajo rápido, legacy compat) — ocultado
          porque el nuevo badge de estado de Drive ocupa el top-right. El ojo
          sigue disponible por archivo en la lista de arriba. */}
    </div>
  );
}
