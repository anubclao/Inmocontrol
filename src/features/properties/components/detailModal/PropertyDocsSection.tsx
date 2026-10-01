// filepath: src/features/properties/components/detailModal/PropertyDocsSection.tsx
/**
 * PropertyDocsSection — documentos a nivel de propiedad: Predial y Certificado
 * de Tradición principal. Sale de PropertyDetailModal.tsx (#14).
 */
import { FileText, Upload } from "lucide-react";

export interface PropertyDocsSectionProps {
  property: any;
  onViewDoc: (label: string, url: string) => void;
  triggerPropertyDocUpload: (
    propertyId: string,
    slotKey: "predial" | "certificado_tradicion:main",
  ) => Promise<void> | void;
}

const DOC_ITEMS = [
  {
    slotKey: "predial",
    label: "Impuesto Predial",
  },
  {
    slotKey: "certificado_tradicion:main",
    label: "Certificado de Tradición",
  },
] as const;

function isBlobUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith("blob:") || url.startsWith("data:"));
}

function getUrl(property: any, slotKey: string): string | undefined {
  if (slotKey === "predial") {
    return (
      property.documents_property?.predial ??
      property.documents?.["Impuesto Predial"]
    );
  }
  return (
    property.documents_property?.certificado_tradicion ??
    property.documents?.["Certificado de Tradición"]
  );
}

export function PropertyDocsSection({
  property,
  onViewDoc,
  triggerPropertyDocUpload,
}: PropertyDocsSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
        Documentos de la Propiedad
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DOC_ITEMS.map((item) => {
          const url = getUrl(property, item.slotKey);
          const isBlob = isBlobUrl(url);
          if (url && !isBlob) {
            return (
              <button
                key={item.slotKey}
                onClick={() => onViewDoc(item.label, url)}
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
                void triggerPropertyDocUpload(property.id, item.slotKey)
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
        })}
      </div>
    </div>
  );
}
