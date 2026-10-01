// filepath: src/features/properties/components/detailModal/OwnersSection.tsx
/**
 * OwnersSection — lista de propietarios con sus cédulas (migración 010+).
 * Sale de PropertyDetailModal.tsx como parte del refactor #14.
 */
import { FileText, Upload } from "lucide-react";

export interface OwnersSectionProps {
  property: any;
  onViewDoc: (label: string, url: string) => void;
  triggerDetailDocUpload: (
    propertyId: string,
    slotKey: string,
  ) => Promise<void> | void;
}

export function OwnersSection({
  property,
  onViewDoc,
  triggerDetailDocUpload,
}: OwnersSectionProps) {
  if ((property.owners?.length ?? 0) === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2 flex-1">
          Propietarios ({property.owners.length})
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {property.owners.map((o: any) => {
          const cedulaUrl = o.documents?.cedula;
          const isBlob =
            !!cedulaUrl &&
            (cedulaUrl.startsWith("blob:") || cedulaUrl.startsWith("data:"));
          return (
            <div
              key={o.id}
              className="p-3 bg-slate-50/50 border border-slate-200 rounded-lg"
            >
              <p className="text-xs font-bold text-slate-800 mb-1 truncate">
                {o.name}
              </p>
              {o.idNumber && (
                <p className="text-[10px] text-slate-500 mb-1.5">
                  CC {o.idNumber}
                </p>
              )}
              {cedulaUrl && !isBlob ? (
                <button
                  onClick={() => onViewDoc(`Cédula de ${o.name}`, cedulaUrl)}
                  className="w-full flex items-center gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded text-left hover:bg-emerald-100"
                >
                  <FileText className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                  <span className="text-[10px] font-medium text-slate-800 truncate flex-1">
                    Cédula
                  </span>
                  <span className="text-[9px] font-bold text-emerald-700">
                    Ver
                  </span>
                </button>
              ) : (
                <button
                  onClick={() =>
                    void triggerDetailDocUpload(property.id, `cedula:${o.id}`)
                  }
                  className={`w-full flex items-center gap-1.5 p-2 rounded border border-dashed text-left ${
                    isBlob
                      ? "bg-amber-50 border-amber-300 hover:border-amber-500 hover:bg-amber-100"
                      : "bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50"
                  }`}
                >
                  <Upload
                    className={`w-3 h-3 flex-shrink-0 ${isBlob ? "text-amber-600" : "text-slate-400"}`}
                  />
                  <span className="text-[10px] font-medium truncate flex-1 text-slate-700">
                    {isBlob ? "Cédula (re-subir)" : "Cédula"}
                  </span>
                  <span
                    className={`text-[9px] font-bold ${isBlob ? "text-amber-700" : "text-blue-600"}`}
                  >
                    {isBlob ? "Re-subir" : "Subir"}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
