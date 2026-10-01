// filepath: src/features/contracts/components/ContractDetail.tsx
/**
 * ContractDetail — modal de detalle de un contrato.
 * Sale de ContractsView.tsx como parte del refactor #13.
 */
import { Download } from "lucide-react";
import { Button, Modal } from "../../../shared/ui";
import { formatCurrency } from "../../../utils/calculations";
import { deriveContractStatus, type Contract } from "../contractTypes";
import { Row } from "./Row";

export interface ContractDetailProps {
  contract: Contract;
  onClose: () => void;
  propertyName: string;
  tenantName: string;
  onDownloadPdf: () => void;
}

export function ContractDetail({
  contract,
  onClose,
  propertyName,
  tenantName,
  onDownloadPdf,
}: ContractDetailProps) {
  const info = deriveContractStatus(contract);
  return (
    <Modal isOpen onClose={onClose} title="Detalle del Contrato" size="md">
      <div className="space-y-3 text-sm">
        <Row label="Propiedad" value={propertyName} />
        <Row label="Inquilino" value={tenantName} />
        <Row label="Canon" value={formatCurrency(contract.rentAmount)} />
        <Row label="Administración" value={formatCurrency(contract.adminFee)} />
        <Row label="Comisión" value={`${contract.commissionPct}%`} />
        <Row
          label="Inicio"
          value={new Date(contract.startDate).toLocaleDateString("es-CO")}
        />
        <Row
          label="Fin"
          value={new Date(contract.endDate).toLocaleDateString("es-CO")}
        />
        <Row
          label="Días para vencer"
          value={`${info.daysToEnd}`}
          highlight={info.daysToEnd < 90}
        />
        <Row label="Renovación" value={contract.renewalStrategy} />
        <Row
          label="Req. Inv. Final"
          value={contract.inventoryEndRequired ? "Sí" : "No"}
        />
        {contract.notes && <Row label="Notas" value={contract.notes} />}
      </div>
      <Button className="w-full mt-6 gap-2" onClick={onDownloadPdf}>
        <Download className="w-4 h-4" /> Descargar Contrato PDF
      </Button>
    </Modal>
  );
}
