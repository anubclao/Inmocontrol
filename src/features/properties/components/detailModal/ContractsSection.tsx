// filepath: src/features/properties/components/detailModal/ContractsSection.tsx
/**
 * ContractsSection — Contrato de Mandato con badge de status, fechas y
 * acciones (ver / descargar / re-subir). Sale de PropertyDetailModal (#14).
 */
import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  Eye,
  FileSignature,
  RefreshCw,
} from "lucide-react";

export interface ContractsSectionProps {
  property: any;
  onViewDoc: (label: string, url: string) => void;
  triggerMandatoUpload: (propertyId: string) => Promise<void> | void;
  handleDownloadMandato: (property: any) => Promise<void>;
}

function isBlobUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith("blob:") || url.startsWith("data:"));
}

export function ContractsSection({
  property,
  onViewDoc,
  triggerMandatoUpload,
  handleDownloadMandato,
}: ContractsSectionProps) {
  const mandateUrl = property.mandatePdfUrl;
  const isBlobMandate = isBlobUrl(mandateUrl);

  return (
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
              {isBlobMandate ? (
                <span
                  className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"
                  title="El PDF del mandato se perdió (URL local expirada). Re-subilo para activar la propiedad."
                >
                  <AlertTriangle className="w-3 h-3" /> Archivo perdido
                </span>
              ) : mandateUrl ? (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <ClipboardCheck className="w-3 h-3" /> Firmado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Pendiente
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {property.mandateSignedAt
                ? `Firmado el ${new Date(property.mandateSignedAt).toLocaleDateString("es-CO")}`
                : "No se subió durante la creación de la propiedad"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {mandateUrl && !isBlobMandate ? (
              <>
                <button
                  onClick={() => onViewDoc("Contrato de Mandato", mandateUrl)}
                  className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
                  title="Ver PDF firmado"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button
                  onClick={() => void handleDownloadMandato(property)}
                  className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
                  title="Descargar PDF"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                </button>
                <button
                  onClick={() => void triggerMandatoUpload(property.id)}
                  className="p-1.5 bg-white border border-amber-200 rounded-md hover:bg-amber-50"
                  title="Reemplazar PDF (si quedó mal)"
                  data-testid="replace-mandato"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                </button>
              </>
            ) : isBlobMandate ? (
              <>
                <button
                  onClick={() => void triggerMandatoUpload(property.id)}
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
            ) : (
              <div className="text-[10px] text-slate-400 italic text-right max-w-[140px] leading-tight">
                Subir solo durante la creación
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
