/**
 * PropertyDetailModal — popup "Detalle del Inmueble" con propietarios,
 * unidades, documentos, contratos, inventario, galería y mandato.
 *
 * Commit 2 del refactor #5b (spec #5b, verifier #5b). Es el modal más
 * grande extraído (~770 líneas JSX). Comportamiento preservado
 * pixel-perfect: badges, colores, validaciones de status, acciones
 * por slot, navegación a Drive, etc.
 *
 * State local: NINGUNO grande. Solo loading flag de galería y el state
 * vive en `PropertiesView.tsx` (que pasa props/callbacks).
 *
 * El tipo de props es `any` para los campos legacy (viewingProperty,
 * contracts) — la tipificación fina se hará en un commit posterior
 * (#5c). Priorizamos que el refactor no rompa nada.
 */

import {
  AlertTriangle,
  Box,
  Building2,
  Camera,
  Car,
  ClipboardCheck,
  Download,
  Eye,
  FileSignature,
  FileText,
  GitCompare,
  Image,
  Package,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button, Modal } from "../../../shared/ui";
import { driveDownloadUrl } from "../../../lib/drive/driveProxy";
import { allDocsComplete } from "../utils/allDocsComplete";

export interface PropertyDetailModalProps {
  isOpen: boolean;
  /** Property actualmente visualizada. `any` por compat con shape legacy. */
  viewingProperty: any | null;

  // Callbacks de cierre/update
  onClose: () => void;
  /** Actualiza `viewingProperty` localmente (sin round-trip al server). */
  onLocalUpdate: (updated: any) => void;
  /** Trigger status update (server). */
  onUpdateProperty: (id: string, patch: any) => void;

  // Toast
  showToast: (msg: string, type?: "success" | "error") => void;

  // Doc actions (delegadas al shell porque orquestan `fileInputRef`)
  onViewDoc: (label: string, url: string) => void;
  triggerDetailDocUpload: (
    propertyId: string,
    slotKey: string,
  ) => Promise<void> | void;
  triggerUnitDocUpload: (
    propertyId: string,
    unitId: string,
  ) => Promise<void> | void;
  triggerPropertyDocUpload: (
    propertyId: string,
    slotKey: "predial" | "certificado_tradicion:main",
  ) => Promise<void> | void;
  triggerMandatoUpload: (propertyId: string) => Promise<void> | void;
  handleDownloadMandato: (property: any) => Promise<void>;

  // Inventarios
  onOpenInventory: (property: any, phase: "inicial" | "final") => void;
  openPhotoGallery: (
    property: any,
    phase: "inicial" | "final",
  ) => Promise<void> | void;
  photoGalleryLoading: boolean;
  onCompareInventories: (property: any) => void;

  // UI
  detailRefreshing: boolean;
  contracts: any[];
}

export function PropertyDetailModal({
  isOpen,
  viewingProperty,
  onClose,
  onLocalUpdate,
  onUpdateProperty,
  showToast,
  onViewDoc,
  triggerDetailDocUpload,
  triggerUnitDocUpload,
  triggerPropertyDocUpload,
  triggerMandatoUpload,
  handleDownloadMandato,
  onOpenInventory,
  openPhotoGallery,
  photoGalleryLoading,
  onCompareInventories,
  detailRefreshing,
  contracts,
}: PropertyDetailModalProps) {
  if (!viewingProperty) return null;

  // Aliases para no tocar el JSX original (que usaba nombres legacy como
  // `setViewingDoc`, `viewingProperty.id`, etc.). Estos setters se
  // delegan al shell vía callbacks.
  const setViewingDoc = (doc: { label: string; url: string }) =>
    onViewDoc(doc.label, doc.url);

  const docsComplete = allDocsComplete(viewingProperty);
  const hasActiveContract = contracts.some(
    (c: any) =>
      c.propertyId === viewingProperty?.id && c.status === "active",
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle del Inmueble">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">
              Dirección
            </p>
            <p className="text-sm font-semibold">{viewingProperty.address}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">
              CHIP
            </p>
            <p className="text-sm font-semibold">{viewingProperty.chip}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">
              Creado
            </p>
            <p className="text-sm font-semibold">
              {viewingProperty.createdAt
                ? new Date(viewingProperty.createdAt).toLocaleDateString(
                    "es-CO",
                    { day: "2-digit", month: "short", year: "numeric" },
                  )
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">
              Propietarios ({viewingProperty.owners?.length ?? 1})
            </p>
            <p className="text-sm font-semibold truncate">
              {(viewingProperty.owners ?? [])
                .map((o: any) => o.name)
                .join(", ") ||
                viewingProperty.owner ||
                "—"}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">
              Estado del Inmueble
            </p>
            <div className="flex flex-wrap gap-2">
              {(["Pendiente", "Activo", "Arrendado", "Inactivo"] as const).map(
                (status) => {
                  const isCurrent = viewingProperty.status === status;
                  let disabled = false;
                  let reason = "";
                  if (!isCurrent) {
                    if (status === "Activo") {
                      if (!docsComplete) {
                        disabled = true;
                        reason = "Faltan documentos o mandato";
                      }
                    } else if (status === "Arrendado") {
                      if (!docsComplete) {
                        disabled = true;
                        reason = "Docs incompletos";
                      } else if (!hasActiveContract) {
                        disabled = true;
                        reason = "Sin contrato activo";
                      }
                    }
                  }
                  const colors =
                    status === "Activo"
                      ? {
                          on: "bg-emerald-500 text-white border-emerald-500",
                          off: "bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400",
                        }
                      : status === "Pendiente"
                        ? {
                            on: "bg-amber-500 text-white border-amber-500",
                            off: "bg-white text-amber-600 border-amber-200 hover:border-amber-400",
                          }
                        : status === "Arrendado"
                          ? {
                              on: "bg-blue-500 text-white border-blue-500",
                              off: "bg-white text-blue-600 border-blue-200 hover:border-blue-400",
                            }
                          : {
                              on: "bg-slate-500 text-white border-slate-500",
                              off: "bg-white text-slate-500 border-slate-200 hover:border-slate-400",
                            };
                  return (
                    <button
                      key={status}
                      disabled={disabled}
                      onClick={() => {
                        onUpdateProperty(viewingProperty.id, { status });
                        onLocalUpdate({ ...viewingProperty, status });
                        showToast(`Estado actualizado a ${status}`);
                      }}
                      title={disabled ? reason : ""}
                      className={`text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase transition-all border ${isCurrent ? colors.on : colors.off} ${disabled ? "opacity-50 cursor-not-allowed" : ""} shadow-sm`}
                    >
                      {status}
                    </button>
                  );
                },
              )}
            </div>
            {!allDocsComplete(viewingProperty) && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-[9px] font-bold text-amber-700 uppercase mb-1">
                  Lo que falta
                </p>
                <ul className="space-y-0.5">
                  {!viewingProperty.mandatePdfUrl && (
                    <li className="text-[9px] text-amber-600 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
                      Contrato de Mandato
                    </li>
                  )}
                  {(viewingProperty.owners ?? [])
                    .filter((o: any) => o.name && !o.documents?.cedula)
                    .map((o: any) => (
                      <li
                        key={o.id}
                        className="text-[9px] text-amber-600 flex items-center gap-1"
                      >
                        <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
                        Cédula de {o.name}
                      </li>
                    ))}
                  {!viewingProperty.documents_property
                    ?.certificado_tradicion &&
                    !viewingProperty.documents?.[
                      "Certificado de Tradición"
                    ] && (
                      <li className="text-[9px] text-amber-600 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
                        Certificado de Tradición (unidad principal)
                      </li>
                    )}
                  {(viewingProperty.units ?? [])
                    .filter(
                      (u: any) =>
                        u.label && !u.documents?.certificado_tradicion,
                    )
                    .map((u: any) => (
                      <li
                        key={u.id}
                        className="text-[9px] text-amber-600 flex items-center gap-1"
                      >
                        <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
                        Certificado de {u.label}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Propietarios (migración 010+) */}
        {(viewingProperty.owners?.length ?? 0) > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2 flex-1">
                Propietarios ({viewingProperty.owners.length})
              </p>
              {detailRefreshing && (
                <span className="text-[10px] text-blue-500 animate-pulse">
                  Actualizando…
                </span>
              )}
            </div>
            <div className="space-y-2">
              {viewingProperty.owners.map((o: any, idx: number) => (
                <div
                  key={o.id}
                  className="p-3 bg-slate-50/50 border border-slate-200 rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </div>
                    <p className="text-xs font-bold text-slate-800 flex-1">
                      {o.name}
                    </p>
                    {o.ownershipPct != null && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                        {o.ownershipPct}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      {
                        slotKey: `cedula:${o.id}`,
                        label: "Cédula",
                        url: o.documents?.cedula,
                      },
                      {
                        slotKey: `rut:${o.id}`,
                        label: "RUT",
                        url: o.documents?.rut,
                      },
                    ].map(({ slotKey, label, url }) => {
                      const isBlob =
                        !!url &&
                        (url.startsWith("blob:") || url.startsWith("data:"));
                      if (url && !isBlob) {
                        return (
                          <button
                            key={slotKey}
                            onClick={() =>
                              setViewingDoc({
                                label: `${label} de ${o.name}`,
                                url,
                              })
                            }
                            className="flex items-center gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded text-left hover:bg-emerald-100"
                          >
                            <FileText className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            <span className="text-[10px] font-medium text-slate-800 truncate flex-1">
                              {label}
                            </span>
                            <span className="text-[9px] font-bold text-emerald-700">
                              Ver
                            </span>
                          </button>
                        );
                      }
                      return (
                        <button
                          key={slotKey}
                          onClick={() =>
                            void triggerDetailDocUpload(
                              viewingProperty.id,
                              slotKey,
                            )
                          }
                          className={`flex items-center gap-1.5 p-2 rounded border border-dashed text-left ${
                            isBlob
                              ? "bg-amber-50 border-amber-300 hover:border-amber-500 hover:bg-amber-100"
                              : "bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50"
                          }`}
                          title={
                            isBlob
                              ? "Archivo previo perdido (URL local expirada) — re-subí para acceder"
                              : undefined
                          }
                        >
                          <Upload
                            className={`w-3 h-3 flex-shrink-0 ${isBlob ? "text-amber-600" : "text-slate-400"}`}
                          />
                          <span className="text-[10px] font-medium truncate flex-1 text-slate-700">
                            {isBlob ? `${label} (re-subir)` : label}
                          </span>
                          <span
                            className={`text-[9px] font-bold ${isBlob ? "text-amber-700" : "text-blue-600"}`}
                          >
                            {isBlob ? "Re-subir" : "Subir"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unidades adicionales */}
        {(viewingProperty.units?.length ?? 0) > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
              Unidades Adicionales ({viewingProperty.units.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {viewingProperty.units.map((u: any) => {
                const certUrl = u.documents?.certificado_tradicion;
                const Icon =
                  u.type === "parking"
                    ? Car
                    : u.type === "storage"
                      ? Package
                      : Box;
                return (
                  <div
                    key={u.id}
                    className="p-3 bg-slate-50/50 border border-slate-200 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="w-3.5 h-3.5 text-blue-600" />
                      <p className="text-xs font-bold text-slate-800 flex-1 truncate">
                        {u.label}
                      </p>
                    </div>
                    {u.folioMatricula && (
                      <p className="text-[9px] text-slate-500 mb-1.5">
                        Matrícula: {u.folioMatricula}
                      </p>
                    )}
                    {(() => {
                      const isBlob =
                        !!certUrl &&
                        (certUrl.startsWith("blob:") ||
                          certUrl.startsWith("data:"));
                      if (certUrl && !isBlob) {
                        return (
                          <button
                            onClick={() =>
                              setViewingDoc({
                                label: `Certificado de ${u.label}`,
                                url: certUrl,
                              })
                            }
                            className="w-full flex items-center gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded text-left hover:bg-emerald-100"
                          >
                            <FileText className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            <span className="text-[10px] font-medium text-slate-800 truncate flex-1">
                              Certificado de Tradición
                            </span>
                            <span className="text-[9px] font-bold text-emerald-700">
                              Ver
                            </span>
                          </button>
                        );
                      }
                      return (
                        <button
                          onClick={() =>
                            void triggerUnitDocUpload(
                              viewingProperty.id,
                              u.id,
                            )
                          }
                          className={`w-full flex items-center gap-1.5 p-2 rounded border border-dashed text-left ${
                            isBlob
                              ? "bg-amber-50 border-amber-300 hover:border-amber-500 hover:bg-amber-100"
                              : "bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50"
                          }`}
                          title={
                            isBlob
                              ? "Archivo previo perdido (URL local expirada) — re-subí para acceder"
                              : undefined
                          }
                        >
                          <Upload
                            className={`w-3 h-3 flex-shrink-0 ${isBlob ? "text-amber-600" : "text-slate-400"}`}
                          />
                          <span className="text-[10px] font-medium truncate flex-1 text-slate-700">
                            {isBlob
                              ? "Certificado (re-subir)"
                              : "Certificado de Tradición"}
                          </span>
                          <span
                            className={`text-[9px] font-bold ${isBlob ? "text-amber-700" : "text-blue-600"}`}
                          >
                            {isBlob ? "Re-subir" : "Subir"}
                          </span>
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Documentos a nivel de propiedad */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
            Documentos de la Propiedad
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(() => {
              const items = [
                {
                  slotKey: "predial",
                  label: "Impuesto Predial",
                  url:
                    viewingProperty.documents_property?.predial ??
                    viewingProperty.documents?.["Impuesto Predial"],
                },
                {
                  slotKey: "certificado_tradicion:main",
                  label: "Certificado de Tradición",
                  url:
                    viewingProperty.documents_property
                      ?.certificado_tradicion ??
                    viewingProperty.documents?.[
                      "Certificado de Tradición"
                    ],
                },
              ];
              return items.map((item) => {
                const isBlob =
                  !!item.url &&
                  (item.url.startsWith("blob:") ||
                    item.url.startsWith("data:"));
                if (item.url && !isBlob) {
                  return (
                    <button
                      key={item.slotKey}
                      onClick={() =>
                        setViewingDoc({ label: item.label, url: item.url! })
                      }
                      className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 hover:border-emerald-400 transition-colors text-left group"
                      data-testid={`view-doc-${item.slotKey}`}
                    >
                      <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate flex-1">
                        {item.label}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 group-hover:underline">
                        Ver
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={item.slotKey}
                    onClick={() =>
                      void triggerPropertyDocUpload(
                        viewingProperty.id,
                        item.slotKey as
                          | "predial"
                          | "certificado_tradicion:main",
                      )
                    }
                    className={`flex items-center gap-2 p-2.5 rounded-lg border border-dashed transition-colors text-left ${
                      isBlob
                        ? "bg-amber-50 border-amber-300 hover:border-amber-500 hover:bg-amber-100"
                        : "bg-slate-50 border-slate-200 hover:border-blue-400 hover:bg-blue-50"
                    }`}
                    title={
                      isBlob
                        ? "Archivo previo perdido (URL local expirada) — re-subí para acceder"
                        : undefined
                    }
                  >
                    <Upload
                      className={`w-4 h-4 flex-shrink-0 ${isBlob ? "text-amber-600" : "text-slate-400"}`}
                    />
                    <span
                      className={`text-[11px] font-medium truncate flex-1 ${isBlob ? "text-slate-700" : "text-slate-500"}`}
                    >
                      {isBlob ? `${item.label} (re-subir)` : item.label}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${isBlob ? "text-amber-700" : "text-blue-600"}`}
                    >
                      {isBlob ? "Re-subir" : "Subir"}
                    </span>
                  </button>
                );
              });
            })()}
          </div>
        </div>

        {/* Contratos */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
            Contratos
          </p>
          <div className="grid grid-cols-1 gap-2">
            <div className="w-full p-3 border border-blue-200 bg-blue-50/40 rounded-lg flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-slate-900">
                    Contrato de Mandato
                  </p>
                  {(() => {
                    const mandateUrl = viewingProperty.mandatePdfUrl;
                    const isBlobMandate =
                      !!mandateUrl &&
                      (mandateUrl.startsWith("blob:") ||
                        mandateUrl.startsWith("data:"));
                    if (isBlobMandate) {
                      return (
                        <span
                          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"
                          title="El PDF del mandato se perdió (URL local expirada). Re-subilo para activar la propiedad."
                        >
                          <AlertTriangle className="w-3 h-3" /> Archivo perdido
                        </span>
                      );
                    }
                    if (mandateUrl) {
                      return (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          <ClipboardCheck className="w-3 h-3" /> Firmado
                        </span>
                      );
                    }
                    return (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        Pendiente
                      </span>
                    );
                  })()}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {viewingProperty.mandateSignedAt
                    ? `Firmado el ${new Date(viewingProperty.mandateSignedAt).toLocaleDateString("es-CO")}`
                    : "No se subió durante la creación de la propiedad"}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                {(() => {
                  const mandateUrl = viewingProperty.mandatePdfUrl;
                  const isBlobMandate =
                    !!mandateUrl &&
                    (mandateUrl.startsWith("blob:") ||
                      mandateUrl.startsWith("data:"));
                  if (mandateUrl && !isBlobMandate) {
                    return (
                      <>
                        <button
                          onClick={() =>
                            setViewingDoc({
                              label: "Contrato de Mandato",
                              url: mandateUrl,
                            })
                          }
                          className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
                          title="Ver PDF firmado"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                        <button
                          onClick={() =>
                            void handleDownloadMandato(viewingProperty)
                          }
                          className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
                          title="Descargar PDF"
                        >
                          <Download className="w-3.5 h-3.5 text-blue-600" />
                        </button>
                        <button
                          onClick={() =>
                            void triggerMandatoUpload(viewingProperty.id)
                          }
                          className="p-1.5 bg-white border border-amber-200 rounded-md hover:bg-amber-50"
                          title="Reemplazar PDF (si quedó mal)"
                          data-testid="replace-mandato"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                        </button>
                      </>
                    );
                  }
                  if (isBlobMandate) {
                    return (
                      <>
                        <button
                          onClick={() =>
                            void triggerMandatoUpload(viewingProperty.id)
                          }
                          className="px-2 py-1.5 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 text-[10px] font-bold text-amber-700 flex items-center gap-1"
                          title="El PDF se perdió (URL local expirada) — re-subilo desde tu equipo"
                          data-testid="replace-mandato"
                        >
                          <RefreshCw className="w-3 h-3" /> Re-subir
                        </button>
                        <span className="text-[9px] text-red-600 text-right max-w-[120px] leading-tight">
                          PDF previo perdido
                        </span>
                      </>
                    );
                  }
                  return (
                    <div className="text-[10px] text-slate-400 italic text-right max-w-[140px] leading-tight">
                      Subir solo durante la creación
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Acciones de Inventario */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
            Inventarios
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                onOpenInventory(viewingProperty, "inicial")
              }
            >
              <ClipboardCheck className="w-4 h-4" />
              Inicial
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => onOpenInventory(viewingProperty, "final")}
            >
              <ClipboardCheck className="w-4 h-4" />
              Final
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                void openPhotoGallery(viewingProperty, "inicial")
              }
              disabled={photoGalleryLoading}
              data-testid={`view-photos-inicial-${viewingProperty?.id}`}
            >
              <Camera className="w-4 h-4" />
              {photoGalleryLoading ? "Cargando…" : "Fotos captación"}
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                void openPhotoGallery(viewingProperty, "final")
              }
              disabled={photoGalleryLoading}
              data-testid={`view-photos-final-${viewingProperty?.id}`}
            >
              <Camera className="w-4 h-4" />
              Fotos colocación
            </Button>
          </div>
          <Button
            className="w-full gap-2"
            onClick={() => onCompareInventories(viewingProperty)}
          >
            <GitCompare className="w-4 h-4" />
            Comparar Inicial vs Final
          </Button>

          {(viewingProperty.inventoryPdfUrl ||
            viewingProperty.inventory_captacion_pdf_url) && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                PDFs en Drive
              </p>
              {viewingProperty.inventory_captacion_pdf_url && (
                <a
                  href={driveDownloadUrl(
                    viewingProperty.inventory_captacion_pdf_url,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                  data-testid={`pdf-captacion-${viewingProperty.id}`}
                >
                  <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="text-[11px] font-medium text-emerald-900 truncate">
                    PDF Inventario de Captación
                  </span>
                  <Download className="w-3 h-3 text-emerald-600 ml-auto flex-shrink-0" />
                </a>
              )}
              {viewingProperty.inventory_colocacion_pdf_url && (
                <a
                  href={driveDownloadUrl(
                    viewingProperty.inventory_colocacion_pdf_url,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  data-testid={`pdf-colocacion-${viewingProperty.id}`}
                >
                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="text-[11px] font-medium text-blue-900 truncate">
                    PDF Inventario de Colocación
                  </span>
                  <Download className="w-3 h-3 text-blue-600 ml-auto flex-shrink-0" />
                </a>
              )}
              {viewingProperty.inventoryPdfUrl &&
                !viewingProperty.inventory_captacion_pdf_url && (
                  <a
                    href={driveDownloadUrl(viewingProperty.inventoryPdfUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-emerald-900 truncate">
                      PDF Inventario
                    </span>
                    <Download className="w-3 h-3 text-emerald-600 ml-auto flex-shrink-0" />
                  </a>
                )}
            </div>
          )}

          <p className="text-[10px] text-slate-500">
            El Inicial se hace al captar la propiedad. El Final se hace al
            entregar/devolver el inmueble. La comparativa genera el Acta de
            Entrega.
          </p>
        </div>

        {viewingProperty.inventoryPhotos && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
              Inventario Fotográfico (legacy)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(viewingProperty.inventoryPhotos).map(
                ([area, urls]: [string, any]) => (
                  <div
                    key={area}
                    className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100"
                  >
                    <Image className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-medium">
                      {area} ({urls.length})
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        <Button className="w-full mt-4" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}