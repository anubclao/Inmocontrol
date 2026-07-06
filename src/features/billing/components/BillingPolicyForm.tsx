/**
 * InmoControl — Form para parametrizar la BillingPolicy de una propiedad.
 *
 * Edita los campos:
 *  - Canon mensual
 *  - Administración PH
 *  - % mora día 11-20 (mid)
 *  - % mora día 21-30 (late)
 *  - Día de gracia
 *  - IPC anual (sí/no + % esperado)
 *  - IPC aplica a admin (sí/no)
 *  - Permitir cambios de admin (sí/no)
 *
 * El componente es controlado — el padre pasa `value` + `onChange`.
 * El botón "Guardar" lo maneja el BillingPanel padre (porque también
 * necesita persistir vía api.ts).
 */

import React from 'react';
import { Card, Input, cn } from '../../../shared/ui';
import type { BillingPolicy } from '../types';

export interface BillingPolicyFormProps {
  value: BillingPolicy;
  onChange: (next: BillingPolicy) => void;
  disabled?: boolean;
}

export function BillingPolicyForm({ value, onChange, disabled }: BillingPolicyFormProps) {
  const update = (patch: Partial<BillingPolicy>) => onChange({ ...value, ...patch });

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="font-bold text-slate-900 text-lg">Política de facturación</h3>
        <p className="text-sm text-slate-500 mt-1">
          Define cómo se calculan cánones, administración y mora para esta propiedad.
        </p>
      </div>

      {/* Canon + Admin */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Canon mensual (COP)"
          type="number"
          min={0}
          step={50000}
          value={value.rentAmount}
          disabled={disabled}
          onChange={(e) => update({ rentAmount: Number(e.target.value) || 0 })}
        />
        <Input
          label="Administración PH (COP)"
          type="number"
          min={0}
          step={10000}
          value={value.adminFee}
          disabled={disabled}
          onChange={(e) => update({ adminFee: Number(e.target.value) || 0 })}
        />
      </div>

      {/* Mora */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Reglas de mora
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Día sin mora"
            type="number"
            min={1}
            max={28}
            value={value.graceDay}
            disabled={disabled}
            onChange={(e) => update({ graceDay: Number(e.target.value) || 10 })}
          />
          <Input
            label="% mora día 11-20"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={value.lateFeeMidPct}
            disabled={disabled}
            onChange={(e) => update({ lateFeeMidPct: Number(e.target.value) || 0 })}
          />
          <Input
            label="% mora día 21-30"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={value.lateFeeLatePct}
            disabled={disabled}
            onChange={(e) => update({ lateFeeLatePct: Number(e.target.value) || 0 })}
          />
        </div>
      </fieldset>

      {/* IPC */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Incremento anual (IPC)
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <Toggle
            label="Aplicar IPC anual"
            checked={value.applyAnnualIpc}
            disabled={disabled}
            onChange={(v) => update({ applyAnnualIpc: v })}
          />
          <Input
            label="% IPC esperado"
            type="number"
            min={0}
            max={50}
            step={0.1}
            value={value.expectedIpcPct}
            disabled={disabled || !value.applyAnnualIpc}
            onChange={(e) => update({ expectedIpcPct: Number(e.target.value) || 0 })}
          />
          <Toggle
            label="IPC también a admin"
            checked={value.applyIpcToAdmin}
            disabled={disabled || !value.applyAnnualIpc}
            onChange={(v) => update({ applyIpcToAdmin: v })}
          />
        </div>
      </fieldset>

      {/* Cambios admin */}
      <Toggle
        label="Permitir cambios de administración en cualquier mes"
        checked={value.allowAdminChanges}
        disabled={disabled}
        onChange={(v) => update({ allowAdminChanges: v })}
      />
    </Card>
  );
}

function Toggle({
  label, checked, onChange, disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn(
      'flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors',
      checked ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:bg-slate-50',
      disabled && 'opacity-50 cursor-not-allowed'
    )}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500/20"
      />
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </label>
  );
}