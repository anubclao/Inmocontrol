// filepath: src/features/properties/components/detailModal/HeaderSection.tsx
/**
 * HeaderSection — header del PropertyDetailModal con dirección, CHIP, status
 * picker y lista de "lo que falta" si la propiedad no está completa.
 * Sale de PropertyDetailModal.tsx como parte del refactor #14.
 */
import { allDocsComplete } from "../../utils/allDocsComplete";

export interface HeaderSectionProps {
  property: any;
  hasActiveContract: boolean;
  onUpdateProperty: (id: string, patch: any) => void;
  onLocalUpdate: (updated: any) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

const STATUS_COLORS: Record<string, { on: string; off: string }> = {
  Activo: {
    on: "bg-emerald-500 text-white border-emerald-500",
    off: "bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400",
  },
  Pendiente: {
    on: "bg-amber-500 text-white border-amber-500",
    off: "bg-white text-amber-600 border-amber-200 hover:border-amber-400",
  },
  Arrendado: {
    on: "bg-blue-500 text-white border-blue-500",
    off: "bg-white text-blue-600 border-blue-200 hover:border-blue-400",
  },
  Inactivo: {
    on: "bg-slate-500 text-white border-slate-500",
    off: "bg-white text-slate-500 border-slate-200 hover:border-slate-400",
  },
};

const STATUSES = ["Pendiente", "Activo", "Arrendado", "Inactivo"] as const;

export function HeaderSection({
  property,
  hasActiveContract,
  onUpdateProperty,
  onLocalUpdate,
  showToast,
}: HeaderSectionProps) {
  const docsComplete = allDocsComplete(property);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase">
          Dirección
        </p>
        <p className="text-sm font-semibold">{property.address}</p>
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase">CHIP</p>
        <p className="text-sm font-semibold">{property.chip}</p>
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase">Creado</p>
        <p className="text-sm font-semibold">
          {property.createdAt
            ? new Date(property.createdAt).toLocaleDateString("es-CO", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "—"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase">
          Propietarios ({property.owners?.length ?? 1})
        </p>
        <p className="text-sm font-semibold truncate">
          {(property.owners ?? []).map((o: any) => o.name).join(", ") ||
            property.owner ||
            "—"}
        </p>
      </div>
      <div className="col-span-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">
          Estado del Inmueble
        </p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => {
            const isCurrent = property.status === status;
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
            const colors = STATUS_COLORS[status];
            return (
              <button
                key={status}
                disabled={disabled}
                onClick={() => {
                  onUpdateProperty(property.id, { status });
                  onLocalUpdate({ ...property, status });
                  showToast(`Estado actualizado a ${status}`);
                }}
                title={disabled ? reason : ""}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase transition-all border ${isCurrent ? colors.on : colors.off} ${disabled ? "opacity-50 cursor-not-allowed" : ""} shadow-sm`}
              >
                {status}
              </button>
            );
          })}
        </div>
        {!allDocsComplete(property) && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[9px] font-bold text-amber-700 uppercase mb-1">
              Lo que falta
            </p>
            <ul className="space-y-0.5">
              {!property.mandatePdfUrl && (
                <li className="text-[9px] text-amber-600 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
                  Contrato de Mandato
                </li>
              )}
              {(property.owners ?? [])
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
              {!property.documents_property?.certificado_tradicion &&
                !property.documents?.["Certificado de Tradición"] && (
                  <li className="text-[9px] text-amber-600 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
                    Certificado de Tradición (unidad principal)
                  </li>
                )}
              {(property.units ?? [])
                .filter(
                  (u: any) => u.label && !u.documents?.certificado_tradicion,
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
  );
}
