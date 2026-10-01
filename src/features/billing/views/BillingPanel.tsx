/**
 * InmoControl — Panel de detalle de billing para UNA propiedad.
 *
 * Secciones:
 *   1. Header + selector de contrato
 *   2. Form de BillingPolicy (canon, admin, mora, IPC)
 *   3. Tabla de amortización con flujo de cuenta de cobro
 *   4. Estado de cuenta del propietario
 *   5. Novedades de cargos
 *   6. Aumentos al inquilino
 *   7. Histórico (timeline)
 *
 * Refactor #12: los handlers se extrajeron a `hooks/useBillingActions` y
 * `hooks/useBillingInvoice`. Las secciones se extrajeron a `sections/`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Save,
  RefreshCw,
  Loader2,
  FileSignature,
  AlertTriangle,
} from "lucide-react";
import { Button, Card } from "../../../shared/ui";
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
  getOrGenerateAmortization,
  listInvoices,
  listPropertyCharges,
  listRentIncreases,
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
import { toPeriod } from "../types";
import { Header } from "./billingPanel/sections/Header";
import { ChargesSection } from "./billingPanel/sections/ChargesSection";
import { IncreasesSection } from "./billingPanel/sections/IncreasesSection";
import { useBillingActions } from "./billingPanel/hooks/useBillingActions";
import { useBillingInvoice } from "./billingPanel/hooks/useBillingInvoice";

export interface BillingPanelProps {
  property: Property;
  contracts: Contract[];
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
  // ── State ──
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<BillingPolicy | null>(null);
  const [policyDraft, setPolicyDraft] = useState<BillingPolicy | null>(null);
  const [rows, setRows] = useState<AmortizationRow[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(
    null,
  );
  const [hasPersistedPolicy, setHasPersistedPolicy] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showNovedadModal, setShowNovedadModal] = useState(false);
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);
  const [payingRow, setPayingRow] = useState<AmortizationRow | null>(null);
  const [invoiceLookup, setInvoiceLookup] = useState<
    Record<string, RentInvoice | null>
  >({});
  const [charges, setCharges] = useState<PropertyCharge[]>([]);
  const [increases, setIncreases] = useState<RentIncrease[]>([]);

  const propertyContracts = useMemo(
    () => contracts.filter((c) => c.propertyId === property.id),
    [contracts, property.id],
  );
  const currentPeriod = useMemo(() => toPeriod(new Date().toISOString()), []);

  const refreshInvoiceLookup = useCallback(async () => {
    try {
      const list = await listInvoices(property.id);
      const map: Record<string, RentInvoice | null> = {};
      for (const inv of list) {
        map[inv.period] = inv;
      }
      setInvoiceLookup(map);
    } catch (err: any) {
      console.warn("[BillingPanel] refreshInvoiceLookup:", err?.message ?? err);
    }
  }, [property.id]);

  // ── Hooks extraídos (refactor #12) ──
  const actions = useBillingActions({
    property,
    selectedContract,
    policy,
    userName,
    showToast,
  });

  const invoice = useBillingInvoice({
    property,
    selectedContract,
    policy,
    tenants,
    userName,
    showToast,
    onRowsUpdate: setRows,
    setPayingRow,
    refreshInvoiceLookup,
  });

  // ── Carga inicial ──
  useEffect(() => {
    if (propertyContracts.length > 0 && !selectedContract) {
      setSelectedContract(propertyContracts[0]);
    }
  }, [property.id, propertyContracts, selectedContract]);

  const refreshBillingData = useCallback(async () => {
    if (!selectedContract) return;
    setLoading(true);
    try {
      const [existingPolicy, cList, iList] = await Promise.all([
        getBillingPolicy(property.id),
        listPropertyCharges(property.id),
        listRentIncreases(property.id),
      ]);
      if (!existingPolicy) {
        console.warn(
          `[BillingPanel] No se encontró policy persistida para property=${property.id}.`,
        );
      }
      const effectivePolicy = existingPolicy ?? null;
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
    void refreshBillingData();
  }, [selectedContract?.id, refreshBillingData]);

  // ── Sin contratos ──
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
                {c.startDate} → {c.endDate} · {c.rentAmount}
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
          {!hasPersistedPolicy && selectedContract && (
            <BillingSetupWizard
              isOpen={showSetupWizard}
              onClose={() => setShowSetupWizard(false)}
              showToast={showToast}
              contract={selectedContract}
              onSuccess={async () => {
                setShowSetupWizard(false);
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
              <button
                type="button"
                onClick={() => void refreshBillingData()}
                disabled={loading}
                className="px-2.5 py-1.5 text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                title="Volver a consultar la policy al servidor"
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

          <BillingPolicyForm
            value={policyDraft}
            onChange={setPolicyDraft}
            disabled={actions.saving}
          />

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => void actions.handleRegenerate()}
              disabled={actions.generating}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${actions.generating ? "animate-spin" : ""}`}
              />
              Regenerar amortización
            </Button>
            <Button
              onClick={() => void actions.handleSavePolicy(policyDraft)}
              disabled={actions.saving}
            >
              <Save className="w-4 h-4 mr-2" />
              {actions.saving ? "Guardando…" : "Guardar política"}
            </Button>
          </div>

          <AmortizationTable
            rows={rows}
            onPay={setPayingRow}
            onSend={invoice.handleSendInvoice}
            invoiceLookup={invoiceLookup}
            loading={loading}
          />

          <EstadoCuentaView
            property={property}
            contract={selectedContract}
            tenant={
              tenants.find(
                (t) => t.propertyId === property.id && t.status === "Activo",
              ) ?? null
            }
            bankAccounts={policy?.bankAccounts ?? []}
            userName={userName}
            initialPeriod={currentPeriod}
            showToast={showToast}
          />

          <ChargesSection
            charges={charges}
            onAdd={() => setShowNovedadModal(true)}
          />

          <IncreasesSection
            increases={increases}
            onAdd={() => setShowIncreaseModal(true)}
          />

          <ActionTimeline propertyId={property.id} />
        </>
      )}

      <PaymentModal
        row={payingRow}
        policy={policy}
        onClose={() => setPayingRow(null)}
        onConfirm={async (day, total) => await invoice.handlePay(day, total)}
      />

      <NovedadFormModal
        propertyId={property.id}
        recordedBy={userName}
        defaultPeriod={currentPeriod}
        defaultAppliesToInvoice={propertyContracts.length > 0}
        isOpen={showNovedadModal}
        onClose={() => setShowNovedadModal(false)}
        onSubmit={actions.handleAddCharge}
        onDelete={actions.handleRemoveCharge}
      />

      {selectedContract && (
        <IncreaseFormModal
          propertyId={property.id}
          contractId={selectedContract.id}
          recordedBy={userName}
          defaultPeriod={currentPeriod}
          isOpen={showIncreaseModal}
          onClose={() => setShowIncreaseModal(false)}
          onSubmit={actions.handleAddIncrease}
        />
      )}
    </div>
  );
}
