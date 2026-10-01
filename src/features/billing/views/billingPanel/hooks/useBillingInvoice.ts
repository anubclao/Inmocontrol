// filepath: src/features/billing/views/billingPanel/hooks/useBillingInvoice.ts
/**
 * useBillingInvoice — hook que agrupa los handlers de cuenta de cobro y pago:
 *  - handleSendInvoice: envía la CC del mes al inquilino (PDF + Drive + log)
 *  - handlePay: registra el pago de un mes
 *
 * Sale de BillingPanel.tsx como parte del refactor #12.
 */
import { useCallback, useState } from "react";
import {
  listPropertyChargesForPeriod,
  logAction,
  markInvoiceAsSent,
  registerPayment,
} from "../../../api";
import { generateCuentaCobroPdfBlob } from "../../../cuentaCobroPdf";
import { uploadPdfToDrive } from "../../../../../lib/drive/driveService";
import { formatCurrency } from "../../../../../utils/calculations";
import type { Property } from "../../../../../types";
import type {
  AmortizationRow,
  BillingPolicy,
  Contract,
  RentInvoice,
} from "../../../types";

type Tenant = {
  id: string;
  name: string;
  idNumber: string;
  email?: string;
  phone?: string;
  propertyId: string;
  status: string;
  tenantDriveFolderId?: string | null;
};

interface UseBillingInvoiceParams {
  property: Property;
  selectedContract: Contract | null;
  policy: BillingPolicy | null;
  tenants: Tenant[];
  userName: string;
  showToast: (msg: string, type: "success" | "error") => void;
  onRowsUpdate: React.Dispatch<React.SetStateAction<AmortizationRow[]>>;
  setPayingRow: React.Dispatch<React.SetStateAction<AmortizationRow | null>>;
  refreshInvoiceLookup: () => Promise<void>;
}

export interface UseBillingInvoiceReturn {
  sendingRow: AmortizationRow | null;
  payingRow: AmortizationRow | null;
  handleSendInvoice: (row: AmortizationRow) => Promise<void>;
  handlePay: (paidOnDayOfMonth: number, _totalPaid: number) => Promise<boolean>;
}

export function useBillingInvoice({
  property,
  selectedContract,
  policy,
  tenants,
  userName,
  showToast,
  onRowsUpdate,
  setPayingRow,
  refreshInvoiceLookup,
}: UseBillingInvoiceParams): UseBillingInvoiceReturn {
  const [sendingRow, setSendingRow] = useState<AmortizationRow | null>(null);
  const [payingRowState, setPayingRowState] = useState<AmortizationRow | null>(
    null,
  );

  const handleSendInvoice = useCallback(
    async (row: AmortizationRow) => {
      if (!selectedContract) return;
      setSendingRow(row);
      try {
        const period = row.periodStart.slice(0, 7);

        // 1. Backend: marcar sent + generar invoice_number
        const invoice = await markInvoiceAsSent(
          property.id,
          selectedContract.id,
          period,
        );
        if (!invoice) {
          showToast("No se pudo emitir la cuenta de cobro", "error");
          return;
        }

        // 2. Refrescar lookup local inmediatamente
        await refreshInvoiceLookup();

        // 3. Generar PDF (blob) con el modelo colombiano
        const primaryBank =
          (policy?.bankAccounts ?? []).find((b) => b.isPrimary) ??
          policy?.bankAccounts?.[0];
        const activeTenant = tenants.find(
          (t) => t.propertyId === property.id && t.status === "Activo",
        );

        const chargesOfPeriod = await listPropertyChargesForPeriod(
          property.id,
          period,
        );
        const extraCharges = chargesOfPeriod.filter(
          (c) =>
            c.appliesToInvoice &&
            (c.chargedTo === "tenant" || c.chargedTo === "both"),
        );

        const pdfBlob = await generateCuentaCobroPdfBlob({
          invoice,
          contract: selectedContract,
          property,
          owner: {
            name: property.ownerName ?? "",
            idNumber: property.ownerIdNumber ?? "",
          },
          tenant: {
            name: activeTenant?.name ?? "—",
            idNumber: activeTenant?.idNumber ?? "—",
            email: activeTenant?.email,
            phone: activeTenant?.phone,
          },
          bankAccount: primaryBank,
          totalAmount: invoice.subtotal,
          extraCharges,
        });

        // 4. Subir a Google Drive
        let driveLink: string | undefined;
        const tenantFolderId = activeTenant?.tenantDriveFolderId ?? null;
        if (tenantFolderId) {
          const fileName = `CuentaCobro_${invoice.invoiceNumber ?? `inv-${period}`}_${period}.pdf`;
          const upRes = await uploadPdfToDrive(
            pdfBlob,
            tenantFolderId,
            "tenant",
            "Recibos",
            fileName,
          );
          if (upRes.webViewLink) {
            driveLink = upRes.webViewLink;
            showToast(
              `Cuenta ${invoice.invoiceNumber ?? ""} subida a Drive (Recibos/)`,
              "success",
            );
          } else if (upRes.skipped) {
            console.info("[BillingPanel] Drive upload omitido:", upRes.reason);
          } else {
            console.warn("[BillingPanel] Drive upload error:", upRes.error);
            showToast(
              "La cuenta se envió, pero no se pudo subir a Drive",
              "error",
            );
          }
        }

        // 5. Descargar localmente
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `CuentaCobro_${invoice.invoiceNumber ?? `inv-${period}`}_${period}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

        // 6. Log histórico
        await logAction(
          property.id,
          "invoice_sent",
          `Cuenta de cobro ${invoice.invoiceNumber ?? ""} enviada al inquilino (período ${period}, ${formatCurrency(invoice.subtotal)})${driveLink ? " · subida a Drive" : ""}`,
          userName,
        );
        showToast(
          driveLink
            ? `Cuenta ${invoice.invoiceNumber ?? ""} enviada · PDF en Drive`
            : `Cuenta ${invoice.invoiceNumber ?? ""} enviada — PDF descargado`,
          "success",
        );
      } catch (err: any) {
        console.error("[BillingPanel] handleSendInvoice:", err);
        showToast(
          `Error enviando cuenta de cobro: ${err?.message ?? err}`,
          "error",
        );
      } finally {
        setSendingRow(null);
      }
    },
    [
      selectedContract,
      property,
      policy,
      tenants,
      userName,
      showToast,
      refreshInvoiceLookup,
    ],
  );

  const handlePay = useCallback(
    async (paidOnDayOfMonth: number, _totalPaid: number): Promise<boolean> => {
      if (!payingRowState || !selectedContract) return false;
      try {
        const updated = await registerPayment(
          selectedContract.id,
          payingRowState.id,
          paidOnDayOfMonth,
        );
        if (!updated) {
          showToast("No se pudo registrar el pago", "error");
          return false;
        }
        onRowsUpdate((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
        await logAction(
          property.id,
          "payment_received",
          `Pago de ${formatCurrency(updated.paidAmount ?? updated.total)} recibido (día ${paidOnDayOfMonth})`,
          userName,
        );
        showToast(
          `Pago registrado: ${formatCurrency(updated.paidAmount ?? updated.total)}`,
          "success",
        );
        void refreshInvoiceLookup();
        return true;
      } catch (err: any) {
        showToast(`Error: ${err?.message ?? err}`, "error");
        return false;
      }
    },
    [
      payingRowState,
      selectedContract,
      property.id,
      userName,
      showToast,
      refreshInvoiceLookup,
      onRowsUpdate,
    ],
  );

  return {
    sendingRow,
    payingRow: payingRowState,
    handleSendInvoice,
    handlePay,
  };
}
