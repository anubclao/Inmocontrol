// filepath: src/features/contracts/components/ContractForm.tsx
/**
 * ContractForm — form de creación/edición de contrato.
 * Sale de ContractsView.tsx como parte del refactor #13.
 *
 * El state + handlers de autofill se extrajeron a `hooks/useContractForm`
 * para mantener este componente en < 250 líneas (restricción dura AGENTS.md).
 */
import { Button, Input, Modal } from "../../../shared/ui";
import {
  type Contract,
  type ContractStatus,
  type RenewalStrategy,
} from "../contractTypes";
import { CurrencyInput } from "./CurrencyInput";
import { useContractForm } from "./hooks/useContractForm";

export interface ContractFormProps {
  contract?: Contract;
  onClose: () => void;
  onSave: (c: Contract) => void;
  properties: any[];
  tenants: any[];
}

export function ContractForm({
  contract,
  onClose,
  onSave,
  properties,
  tenants,
}: ContractFormProps) {
  const { form, setForm, onTenantChange, onPropertyChange } = useContractForm({
    contract,
    properties,
    tenants,
  });

  const handleSave = () => {
    if (!form.propertyId) {
      alert("Selecciona una propiedad");
      return;
    }
    if (!form.tenantId) {
      alert("Selecciona un inquilino");
      return;
    }
    if (form.rentAmount <= 0) {
      alert("El canon debe ser mayor a 0");
      return;
    }
    onSave({ ...form, updatedAt: new Date().toISOString() });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={contract ? "Editar Contrato" : "Nuevo Contrato"}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Propiedad
            </label>
            <select
              className="w-full mt-1 h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm"
              value={form.propertyId}
              onChange={(e) => onPropertyChange(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {properties.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Inquilino
            </label>
            <select
              className="w-full mt-1 h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm"
              value={form.tenantId}
              onChange={(e) => onTenantChange(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {tenants.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput
            label="Canon mensual"
            value={form.rentAmount}
            onChange={(v) => setForm({ ...form, rentAmount: v })}
          />
          <CurrencyInput
            label="Administración PH"
            value={form.adminFee}
            onChange={(v) => setForm({ ...form, adminFee: v })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Comisión (%)
            </label>
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              value={form.commissionPct}
              onChange={(e) =>
                setForm({
                  ...form,
                  commissionPct: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Seguro (%)
            </label>
            <input
              type="number"
              min={0}
              max={20}
              step={0.1}
              className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              value={form.insurancePct}
              onChange={(e) =>
                setForm({
                  ...form,
                  insurancePct: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha inicio"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
          <Input
            label="Fecha fin"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Renovación
            </label>
            <select
              className="w-full mt-1 h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm"
              value={form.renewalStrategy}
              onChange={(e) =>
                setForm({
                  ...form,
                  renewalStrategy: e.target.value as RenewalStrategy,
                })
              }
            >
              <option value="manual">Manual</option>
              <option value="auto">Automática</option>
              <option value="none">No renovar</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Estado inicial
            </label>
            <select
              className="w-full mt-1 h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as ContractStatus })
              }
            >
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.inventoryEndRequired}
            onChange={(e) =>
              setForm({ ...form, inventoryEndRequired: e.target.checked })
            }
          />
          Exigir Inventario Final al terminar el contrato
        </label>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">
            Notas / cláusulas
          </label>
          <textarea
            className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
