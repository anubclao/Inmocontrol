/**
 * InmoControl — Panel de detalle de billing para UNA propiedad.
 *
 * Secciones:
 *   1. Header + selector de contrato
 *   2. Form de BillingPolicy (canon, admin, mora, IPC)
 *   3. Tabla de amortización con flujo de cuenta de cobro:
 *        - Botón "Enviar CC" por mes (genera PDF + marca sent)
 *        - Botón "Marcar pagado" después de enviado (registra pago + mora)
 *        - Mes N+1 se desbloquea automáticamente al pagar N
 *   4. Estado de cuenta del propietario (período actual)
 *   5. Descuentos del propietario (lista + agregar)
 *   6. Aumentos al inquilino (lista + agregar)
 *   7. Histórico (timeline)
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Loader2,
  FileSignature,
  Plus,
  Tag,
  TrendingUp,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { Button, Card, cn } from "../../../shared/ui";
import { BillingPolicyForm } from "../components/BillingPolicyForm";
import { BillingSetupWizard } from "../components/BillingSetupWizard";
import { AmortizationTable } from "../components/AmortizationTable";
import { PaymentModal } from "../components/PaymentModal";
import { NovedadFormModal } from "../components/NovedadFormModal";
import { IncreaseFormModal } from "../components/IncreaseFormModal";
import { EstadoCuentaView } from "../components/EstadoCuentaView";
import { ActionTimeline } from "../components/ActionTimeline";
import {
  getBillingPolicy,
  saveBillingPolicy,
  getOrGenerateAmortization,
  registerPayment,
  logAction,
  listPropertyCharges,
  listPropertyChargesForPeriod,
  listRentIncreases,
  addPropertyCharge,
  removePropertyCharge,
  addRentIncrease,
  listInvoices,
  getInvoiceForPeriod,
  markInvoiceAsSent,
} from "../api";
import type {
  AmortizationRow,
  BillingPolicy,
  Contract,
  PropertyCharge,
  RentIncrease,
  RentInvoice,
} from "../types";
import type { Property } from "../../../types";
import { formatCurrency } from "../../../utils/calculations";
import { toPeriod } from "../types";
import {
  generateCuentaCobroPDF,
  generateCuentaCobroPdfBlob,
} from "../cuentaCobroPdf";
import { uploadPdfToDrive } from "../../../lib/drive/driveService";

export interface BillingPanelProps {
  property: Property;
  contracts: Contract[];
  /** Tenants de la org (necesarios para "DEBE A" en el PDF de cuenta de cobro
   *  + subir el PDF a Drive → Recibos/ del inquilino). */
  tenants?: Array<{
    id: string;
    name: string;
    idNumber: string;
    email?: string;
    phone?: string;
    propertyId: string;
    status: string;
    tenantDriveFolderId?: string | null;
  }>;
  userName: string;
  onBack: () => void;
  showToast: (msg: string, type: "success" | "error") => void;
}

export function BillingPanel({
  property,
  contracts,
  tenants = [],
  userName,
  onBack,
  showToast,
}: BillingPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [policy, setPolicy] = useState<BillingPolicy | null>(null);
  const [policyDraft, setPolicyDraft] = useState<BillingPolicy | null>(null);
  const [rows, setRows] = useState<AmortizationRow[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(
    null,
  );
  const [payingRow, setPayingRow] = useState<AmortizationRow | null>(null);
  // FIX Karpathy (jul-2026): track si la policy está persistida en MySQL o
  // solo es el default temporal. Si NO está persistida, mostramos banner para
  // que el agente sepa que tiene que configurar antes de facturar.
  const [hasPersistedPolicy, setHasPersistedPolicy] = useState(false);
  // Wizard de setup (se abre desde el banner).
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const [charges, setCharges] = useState<PropertyCharge[]>([]);
  const [increases, setIncreases] = useState<RentIncrease[]>([]);
  const [showNovedadModal, setShowNovedadModal] = useState(false);
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);

  // ── Estado del flujo de cuenta de cobro ──
  // invoiceLookup: mapa `period` → invoice. Refleja qué meses ya fueron
  // enviados al inquilino (tienen sentAt + invoiceNumber).
  const [invoiceLookup, setInvoiceLookup] = useState<
    Record<string, RentInvoice | null>
  >({});
  const [sendingRow, setSendingRow] = useState<AmortizationRow | null>(null);

  const propertyContracts = contracts.filter(
    (c) => c.propertyId === property.id,
  );
  const currentPeriod = toPeriod(new Date().toISOString());

  // ─── Carga inicial ──────────────────────────────────────────────────
  useEffect(() => {
    if (propertyContracts.length > 0 && !selectedContract) {
      setSelectedContract(propertyContracts[0]);
    }
  }, [property.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Carga de invoices (para saber qué meses ya fueron enviados) ─────
  // Trae todas las invoices de la propiedad y arma el lookup por período.
  // Se vuelve a llamar después de enviar o pagar para refrescar el estado.
  const refreshInvoiceLookup = useCallback(async () => {
    try {
      const list = await listInvoices(property.id);
      const map: Record<string, RentInvoice | null> = {};
      for (const inv of list) {
        map[inv.period] = inv;
      }
      setInvoiceLookup(map);
    } catch (err: any) {
      // Non-fatal: si falla, la tabla funciona sin invoiceLookup (solo no
      // muestra el botón "Marcar pagado" después de enviar).
      console.warn("[BillingPanel] refreshInvoiceLookup:", err?.message ?? err);
    }
  }, [property.id]);

  /**
   * FIX Karpathy (jul-2026): extraído a función para poder llamarla
   * tanto desde el useEffect del mount como desde el onSuccess del
   * BillingSetupWizard. Antes el wizard cerraba y el panel seguía con
   * el state stale — la policy se guardaba en el server pero el form
   * no se actualizaba hasta un refresh manual.
   */
  const refreshBillingData = useCallback(async () => {
    if (!selectedContract) return;
    setLoading(true);
    try {
      const [existingPolicy, cList, iList] = await Promise.all([
        getBillingPolicy(property.id),
        listPropertyCharges(property.id),
        listRentIncreases(property.id),
      ]);
      // FIX Karpathy (jul-2026): log explícito cuando el GET devuelve null.
      // El banner ámbar depende de `hasPersistedPolicy`; si el GET falló por
      // 500/network y el fallback devolvió null, el banner queda pegado y el
      // form muestra 0/0. El log ayuda a debug en prod + el botón "Reintentar"
      // del banner permite al usuario forzarlo manualmente.
      if (!existingPolicy) {
        console.warn(
          `[BillingPanel] No se encontró policy persistida para property=${property.id}. ` +
            `Esto puede ser legítimo (primera vez) o un error transitorio del GET. ` +
            `Si el wizard "Configurar facturación" se cerró con éxito pero el banner sigue, ` +
            `click "Reintentar" en el banner.`,
        );
      }
      const effectivePolicy = existingPolicy ?? defaultPolicyFor(property);
      setPolicy(effectivePolicy);
      setPolicyDraft(effectivePolicy);
      setHasPersistedPolicy(!!existingPolicy);
      setCharges(cList);
      setIncreases(iList);

      const amort = await getOrGenerateAmortization(
        selectedContract,
        effectivePolicy,
      );
      setRows(amort);

      await refreshInvoiceLookup();
    } catch (err: any) {
      console.error("[BillingPanel] refreshBillingData failed:", err);
      showToast(`Error cargando billing: ${err?.message ?? err}`, "error");
    } finally {
      setLoading(false);
    }
  }, [property, selectedContract, refreshInvoiceLookup, showToast]);

  useEffect(() => {
    refreshBillingData();
  }, [selectedContract?.id, refreshBillingData]);

  // ─── Acciones ───────────────────────────────────────────────────────
  const handleSavePolicy = useCallback(async () => {
    if (!policyDraft) return;
    setSaving(true);
    try {
      await saveBillingPolicy(policyDraft);
      setPolicy(policyDraft);
      await logAction(
        property.id,
        "billing_policy_updated",
        `Política actualizada: canon ${formatCurrency(policyDraft.rentAmount)} + admin ${formatCurrency(policyDraft.adminFee)}`,
        userName,
      );
      showToast("Política guardada", "success");
    } catch (err: any) {
      showToast(`Error guardando: ${err?.message ?? err}`, "error");
    } finally {
      setSaving(false);
    }
  }, [policyDraft, property.id, userName, showToast]);

  const handleRegenerate = useCallback(async () => {
    if (!policy || !selectedContract) return;
    setGenerating(true);
    try {
      const fresh = await getOrGenerateAmortization(selectedContract, policy);
      setRows(fresh);
      showToast(`Amortización regenerada (${fresh.length} meses)`, "success");
    } catch (err: any) {
      showToast(`Error: ${err?.message ?? err}`, "error");
    } finally {
      setGenerating(false);
    }
  }, [policy, selectedContract, showToast]);

  const handlePay = useCallback(
    async (paidOnDayOfMonth: number, _totalPaid: number): Promise<boolean> => {
      if (!payingRow || !selectedContract) return false;
      try {
        const updated = await registerPayment(
          selectedContract.id,
          payingRow.id,
          paidOnDayOfMonth,
        );
        if (!updated) {
          showToast("No se pudo registrar el pago", "error");
          return false;
        }
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
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
        // Refrescar lookup por si el invoice se marcó paid (y desbloquea el mes N+1)
        void refreshInvoiceLookup();
        return true;
      } catch (err: any) {
        showToast(`Error: ${err?.message ?? err}`, "error");
        return false; // FIX BUG-003: no re-throw, leave modal open
      }
    },
    [
      payingRow,
      selectedContract,
      property.id,
      userName,
      showToast,
      refreshInvoiceLookup,
    ],
  );

  /**
   * Envía la cuenta de cobro del mes al inquilino:
   *   1. Backend genera `invoice_number` (CC-YYYYMM-NNN) y setea `sent_at`
   *   2. Genera el PDF con el formato colombiano clásico (modelo)
   *   3. Descarga el PDF
   *   4. Loggea la acción en el histórico
   *
   * Después de esto, la fila queda con "Marcar pagado" hasta que el agente
   * registre el pago.
   */
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
        // Buscar el tenant activo para esta propiedad (DEBE A)
        const activeTenant = tenants.find(
          (t: any) => t.propertyId === property.id && t.status === "Activo",
        );

        // Traer cargos del periodo imputables al inquilino (chargedTo ∈ tenant/both
        // AND appliesToInvoice) para imprimirlos en la sección "Otros cargos del mes".
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

        // 4. Subir a Google Drive (carpeta Recibos/ del inquilino)
        //    Si no tiene carpeta de Drive o Drive no está conectado, sigue funcionando
        //    local: el PDF se descarga igual.
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

        // 5. Descargar localmente (UX estándar — el agente ya tenía este patrón)
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

  const handleAddCharge = useCallback(
    async (data: Omit<PropertyCharge, "id" | "recordedAt">) => {
      const created = await addPropertyCharge(property.id, data);
      setCharges((prev) => [created, ...prev]);
      const destinatario =
        data.chargedTo === "owner"
          ? "al propietario"
          : data.chargedTo === "tenant"
            ? "al inquilino"
            : "a ambos";
      await logAction(
        property.id,
        "discount_registered",
        `Novedad ${data.chargedTo === "owner" ? "descuento" : "cargo"} de ${formatCurrency(data.amount)} (${data.description}) en ${data.period} (${destinatario})`,
        userName,
      );
      showToast(
        `Novedad de ${formatCurrency(data.amount)} registrada (${destinatario})`,
        "success",
      );
    },
    [property.id, userName, showToast],
  );

  const handleRemoveCharge = useCallback(
    async (chargeId: string) => {
      await removePropertyCharge(property.id, chargeId);
      setCharges((prev) => prev.filter((c) => c.id !== chargeId));
      showToast("Novedad eliminada", "success");
    },
    [property.id, showToast],
  );

  const handleAddIncrease = useCallback(
    async (data: Omit<RentIncrease, "id" | "recordedAt">) => {
      if (!selectedContract) return;
      const created = await addRentIncrease(property.id, {
        ...data,
        contractId: selectedContract.id,
      });
      setIncreases((prev) => [created, ...prev]);
      const desc =
        data.type === "ipc_annual"
          ? `IPC de ${data.amount}% desde ${data.effectiveFrom}`
          : `Nueva administración ${formatCurrency(data.amount)} desde ${data.effectiveFrom}`;
      await logAction(property.id, "increase_registered", desc, userName);
      showToast(
        "Aumento registrado. Regenerá la amortización para aplicarlo.",
        "success",
      );
    },
    [property.id, selectedContract, userName, showToast],
  );

  // ─── Sin contratos ─────────────────────────────────────────────────
  // El contrato se crea SOLO cuando se firma el Inventario de Colocación
  // (paso 4 del flujo del tenant). Si no hay contrato, el billing no
  // puede operar — mostramos una pantalla explicando qué hacer.
  if (propertyContracts.length === 0) {
    return (
      <div className="space-y-4">
        <Header property={property} onBack={onBack} />
        <Card className="p-8 text-center">
          <FileSignature className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-900">
            Esta propiedad aún no tiene contrato activo
          </h3>
          <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
            El contrato se genera <strong>automáticamente</strong> cuando se
            firma el <strong>Inventario de Colocación</strong> del arrendatario.
          </p>
          <div className="mt-5 inline-block text-left bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700">
            <p className="font-bold text-slate-900 mb-2">Orden del proceso:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>
                Propiedad con mandato firmado → status <em>Activo</em>
              </li>
              <li>
                Crear tenant → status <em>En Colocación</em>
              </li>
              <li>Subir cédula del tenant a Drive</li>
              <li>
                <strong>Firmar Inventario de Colocación</strong> → se crea el
                contrato y la propiedad pasa a <em>Arrendado</em>
              </li>
              <li>Recién acá se puede parametrizar billing</li>
            </ol>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header property={property} onBack={onBack} />

      {/* Selector de contrato (si hay más de uno) */}
      {propertyContracts.length > 1 && (
        <Card className="p-3 flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Contrato:
          </label>
          <select
            value={selectedContract?.id ?? ""}
            onChange={(e) => {
              const c = propertyContracts.find((x) => x.id === e.target.value);
              if (c) setSelectedContract(c);
            }}
            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
          >
            {propertyContracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.startDate} → {c.endDate} · {formatCurrency(c.rentAmount)}
              </option>
            ))}
          </select>
        </Card>
      )}

      {loading || !policyDraft ? (
        <Card className="p-8 flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando billing…
        </Card>
      ) : (
        <>
          {/* FIX Karpathy (jul-2026): banner si NO hay policy persistida.
              Aparece solo después del load (loading=false). Al click, abre
              el wizard que también se dispara desde el Inventario de Colocación. */}
          {!hasPersistedPolicy && selectedContract && (
            <BillingSetupWizard
              isOpen={showSetupWizard}
              onClose={() => setShowSetupWizard(false)}
              showToast={showToast}
              contract={selectedContract}
              onSuccess={async () => {
                setShowSetupWizard(false);
                // FIX Karpathy (jul-2026): el wizard ya guardó la policy en
                // el server y mostró su toast. Recargamos TODO el panel
                // desde el server para que el form muestre los nuevos
                // valores inmediatamente y el banner ámbar desaparezca.
                // Antes el refresh era parcial y el form seguía mostrando
                // 0 en canon/admin.
                await refreshBillingData();
              }}
            />
          )}
          {!hasPersistedPolicy && selectedContract && (
            <div
              className="w-full flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg group"
              data-testid="billing-no-policy-banner"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <button
                type="button"
                onClick={() => setShowSetupWizard(true)}
                className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
              >
                <p className="text-xs font-bold text-amber-900">
                  Esta propiedad no tiene política de facturación
                </p>
                <p className="text-[10px] text-amber-700 mt-0.5">
                  Sin policy no se puede generar la tabla de amortización ni
                  operar el billing.{" "}
                  <span className="font-bold underline">
                    Click acá para configurarla
                  </span>
                  .
                </p>
              </button>
              {/* FIX Karpathy (jul-2026): botón "Reintentar" — si el wizard
                  guardó la policy pero el GET inmediato falló, el banner
                  queda pegado. Este botón re-fetcha sin abrir el wizard. */}
              <button
                type="button"
                onClick={() => void refreshBillingData()}
                disabled={loading}
                className="px-2.5 py-1.5 text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                title="Volver a consultar la policy al servidor (sin abrir el wizard)"
                data-testid="billing-retry-policy"
              >
                <RefreshCw
                  className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}
                />
                Reintentar
              </button>
              <FileSignature className="w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
            </div>
          )}

          {/* Política */}
          <BillingPolicyForm
            value={policyDraft}
            onChange={setPolicyDraft}
            disabled={saving}
          />

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={generating}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${generating ? "animate-spin" : ""}`}
              />
              Regenerar amortización
            </Button>
            <Button onClick={handleSavePolicy} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Guardando…" : "Guardar política"}
            </Button>
          </div>

          {/* Amortización */}
          <AmortizationTable
            rows={rows}
            onPay={setPayingRow}
            onSend={handleSendInvoice}
            invoiceLookup={invoiceLookup}
            loading={loading}
          />

          {/* Estado de cuenta del propietario (con detalle + transferencias reales + PDF) */}
          <EstadoCuentaView
            property={property}
            contract={selectedContract}
            tenant={
              tenants.find(
                (t: any) =>
                  t.propertyId === property.id && t.status === "Activo",
              ) ?? null
            }
            bankAccounts={policy?.bankAccounts ?? []}
            userName={userName}
            initialPeriod={currentPeriod}
            showToast={showToast}
          />

          {/* Novedades de cargos (modelo unificado) */}
          <ChargesSection
            charges={charges}
            onAdd={() => setShowNovedadModal(true)}
          />

          {/* Aumentos */}
          <IncreasesSection
            increases={increases}
            onAdd={() => setShowIncreaseModal(true)}
          />

          {/* Histórico */}
          <ActionTimeline propertyId={property.id} />
        </>
      )}

      <PaymentModal
        row={payingRow}
        policy={policy ?? defaultPolicyFor(property)}
        onClose={() => setPayingRow(null)}
        onConfirm={async (day, total) => await handlePay(day, total)}
      />

      <NovedadFormModal
        propertyId={property.id}
        recordedBy={userName}
        defaultPeriod={currentPeriod}
        defaultAppliesToInvoice={propertyContracts.length > 0}
        isOpen={showNovedadModal}
        onClose={() => setShowNovedadModal(false)}
        onSubmit={handleAddCharge}
        onDelete={handleRemoveCharge}
      />

      {selectedContract && (
        <IncreaseFormModal
          propertyId={property.id}
          contractId={selectedContract.id}
          recordedBy={userName}
          defaultPeriod={currentPeriod}
          isOpen={showIncreaseModal}
          onClose={() => setShowIncreaseModal(false)}
          onSubmit={handleAddIncrease}
        />
      )}
    </div>
  );
}

// ─── Sub-secciones ──────────────────────────────────────────────────

function ChargesSection({
  charges,
  onAdd,
}: {
  charges: PropertyCharge[];
  onAdd: () => void;
}) {
  const currentPeriod = toPeriod(new Date().toISOString());
  const monthCharges = charges.filter((c) => c.period === currentPeriod);
  const totalMonth = monthCharges.reduce((s, c) => s + c.amount, 0);
  const toOwnerCount = monthCharges.filter(
    (c) => c.chargedTo === "owner" || c.chargedTo === "both",
  ).length;
  const toTenantCount = monthCharges.filter(
    (c) => c.chargedTo === "tenant" || c.chargedTo === "both",
  ).length;

  return (
    <Card>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-lg">
              Novedades de cargos
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {charges.length}{" "}
              {charges.length === 1
                ? "novedad registrada"
                : "novedades registradas"}
              {totalMonth > 0 && ` · ${formatCurrency(totalMonth)} este mes`}
              {monthCharges.length > 0 &&
                ` · ${toOwnerCount} al propietario, ${toTenantCount} al inquilino`}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Registrar novedad
        </Button>
      </div>

      {charges.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          Sin novedades registradas. Agregá servicios públicos, mantenimiento,
          impuestos, cargos al inquilino, etc.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {charges.slice(0, 20).map((c) => {
            const tone =
              c.chargedTo === "tenant"
                ? "text-blue-600 bg-blue-50"
                : c.chargedTo === "both"
                  ? "text-purple-600 bg-purple-50"
                  : "text-red-600 bg-red-50";
            const recipient =
              c.chargedTo === "owner"
                ? "Propietario"
                : c.chargedTo === "tenant"
                  ? "Inquilino"
                  : "Ambos";
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 p-3 px-6 text-sm"
              >
                <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded shrink-0">
                  {c.period}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${tone} shrink-0`}
                >
                  {recipient}
                </span>
                <span className="flex-1 text-slate-700 truncate">
                  {c.description}
                </span>
                <span
                  className={`font-semibold tabular-nums shrink-0 ${
                    c.chargedTo === "tenant"
                      ? "text-blue-600"
                      : c.chargedTo === "both"
                        ? "text-purple-600"
                        : "text-red-600"
                  }`}
                >
                  {c.chargedTo === "owner" ? "− " : "+ "}
                  {formatCurrency(c.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function IncreasesSection({
  increases,
  onAdd,
}: {
  increases: RentIncrease[];
  onAdd: () => void;
}) {
  return (
    <Card>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-amber-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-lg">
              Aumentos al inquilino
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {increases.length}{" "}
              {increases.length === 1
                ? "aumento registrado"
                : "aumentos registrados"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Registrar aumento
        </Button>
      </div>

      {increases.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          Sin aumentos. Usá esta sección para registrar IPC anual o cambios de
          admin.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {increases.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-3 px-6 text-sm">
              <span className="text-xs font-medium px-2 py-0.5 bg-amber-100 text-amber-700 rounded shrink-0">
                {i.type === "ipc_annual" ? `IPC ${i.amount}%` : "Admin"}
              </span>
              <span className="text-xs text-slate-500 font-mono shrink-0">
                desde {i.effectiveFrom}
              </span>
              <span className="flex-1 text-slate-700 truncate">
                {i.description}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Header({
  property,
  onBack,
}: {
  property: Property;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <div>
        <h2 className="font-bold text-slate-900 text-xl flex items-center gap-2">
          {property.address}
          <span className="text-xs font-normal text-slate-400 inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
            <Receipt className="w-3 h-3" /> billing
          </span>
        </h2>
        {property.chip && (
          <p className="text-xs text-slate-500">CHIP {property.chip}</p>
        )}
      </div>
    </div>
  );
}

function defaultPolicyFor(property: Property): BillingPolicy {
  const now = new Date().toISOString();
  return {
    propertyId: property.id,
    rentAmount: 0,
    adminFee: 0,
    lateFeeMidPct: 5,
    lateFeeLatePct: 10,
    graceDay: 10,
    applyAnnualIpc: true,
    expectedIpcPct: 5,
    applyIpcToAdmin: true,
    allowAdminChanges: true,
    bankAccounts: [],
    createdAt: now,
    updatedAt: now,
    createdBy: "agent",
  };
}
