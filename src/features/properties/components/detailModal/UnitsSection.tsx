// filepath: src/features/properties/components/detailModal/UnitsSection.tsx
/**
 * UnitsSection — lista de unidades adicionales (parqueaderos, depósitos, etc.)
 * con sus certificados de tradición.
 * Sale de PropertyDetailModal.tsx como parte del refactor #14.
 */
import { Box, Car, FileText, Package, Upload } from "lucide-react";

export interface UnitsSectionProps {
  property: any;
  onViewDoc: (label: string, url: string) => void;
  triggerUnitDocUpload: (
    propertyId: string,
    unitId: string,
  ) => Promise<void> | void;
}

function getUnitIcon(type: string) {
  if (type === "parking") return Car;
  if (type === "storage") return Package;
  return Box;
}

export function UnitsSection({
  property,
  onViewDoc,
  triggerUnitDocUpload,
}: UnitsSectionProps) {
  if ((property.units?.length ?? 0) === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
        Unidades Adicionales ({property.units.length})
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {property.units.map((u: any) => {
          const certUrl = u.documents?.certificado_tradicion;
          const Icon = getUnitIcon(u.type);
          const isBlob =
            !!certUrl &&
            (certUrl.startsWith("blob:") || certUrl.startsWith("data:"));
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
              {certUrl && !isBlob ? (
                <button
                  onClick={() =>
                    onViewDoc(`Certificado de ${u.label}`, certUrl)
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
              ) : (
                <button
                  onClick={() => void triggerUnitDocUpload(property.id, u.id)}
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
