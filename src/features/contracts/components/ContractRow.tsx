// filepath: src/features/contracts/components/ContractRow.tsx
/**
 * ContractRow — fila de un contrato en la lista, con status badge,
 * fechas, canon y botones de acción.
 * Sale de ContractsView.tsx como parte del refactor #13.
 */
import {
  AlertTriangle,
  Calendar,
  ClipboardCheck,
  Download,
  Edit,
  Eye,
  X,
} from "lucide-react";
import { Button, Card } from "../../../shared/ui";
import { formatCurrency } from "../../../utils/calculations";
import { deriveContractStatus, type Contract } from "../contractTypes";

const STATUS_BADGE: Record<
  ReturnType<typeof deriveContractStatus>["status"],
  { label: string; bg: string; text: string }
> = {
  active: { label: "Vigente", bg: "bg-emerald-100", text: "text-emerald-700" },
  expiring: { label: "", bg: "bg-amber-100", text: "text-amber-700" },
  expired: { label: "Vencido", bg: "bg-red-100", text: "text-red-700" },
  terminated: {
    label: "Terminado",
    bg: "bg-slate-200",
    text: "text-slate-700",
  },
  draft: { label: "Borrador", bg: "bg-slate-100", text: "text-slate-600" },
};

export interface ContractRowProps {
  contract: Contract;
  info: ReturnType<typeof deriveContractStatus>;
  propertyName: string;
  tenantName: string;
  onView: () => void;
  onEdit: () => void;
  onStartInventoryEnd: () => void;
  onTerminate: () => void;
  onDownloadPdf: () => void;
}

export function ContractRow({
  contract,
  info,
  propertyName,
  tenantName,
  onView,
  onEdit,
  onStartInventoryEnd,
  onTerminate,
  onDownloadPdf,
}: ContractRowProps) {
  const badge = STATUS_BADGE[info.status];
  const badgeLabel =
    info.status === "expiring" ? `Vence en ${info.daysToEnd}d` : badge.label;

  return (
    <Card
      className={`p-4 ${info.needsInventoryEnd ? "border-amber-300 bg-amber-50/30" : ""}`}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-slate-900 truncate">
              {propertyName}
            </h3>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}
            >
              {badgeLabel}
            </span>
            {info.isNoticeDue && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Preaviso pendiente
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Inquilino: <span className="font-bold">{tenantName}</span> · Canon:{" "}
            <span className="font-bold">
              {formatCurrency(contract.rentAmount)}
            </span>
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <Calendar className="w-3 h-3" />
            {new Date(contract.startDate).toLocaleDateString("es-CO")} →{" "}
            {new Date(contract.endDate).toLocaleDateString("es-CO")}
          </p>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap">
          {info.needsInventoryEnd && (
            <Button
              size="sm"
              className="gap-2 bg-amber-500 hover:bg-amber-600"
              onClick={onStartInventoryEnd}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Iniciar Inv. Final
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onDownloadPdf}
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
            aria-label="Descargar Contrato PDF"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={onView}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          {info.status === "active" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600"
              onClick={onTerminate}
            >
              Terminar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
