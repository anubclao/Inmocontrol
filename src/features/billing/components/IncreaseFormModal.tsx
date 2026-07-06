/**
 * InmoControl — Modal para registrar un aumento al inquilino.
 *
 * Tipos:
 *   - admin_change: cambio de administración (monto es el NUEVO valor de admin)
 *   - ipc_annual:   IPC anual (monto es el % a aplicar al canon y admin)
 *
 * El campo `effectiveFrom` es 'YYYY-MM' desde cuándo aplica.
 */

import React, { useState } from 'react';
import { Button, Input, Modal, cn } from '../../../shared/ui';
import { toPeriod } from '../types';
import type { RentIncrease } from '../types';

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

export interface IncreaseFormModalProps {
  propertyId: string;
  contractId: string;
  defaultPeriod?: string;
  recordedBy: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<RentIncrease, 'id' | 'recordedAt'>) => Promise<void>;
}

export function IncreaseFormModal({
  propertyId, contractId, defaultPeriod, recordedBy, isOpen, onClose, onSubmit,
}: IncreaseFormModalProps) {
  const [type, setType] = useState<'admin_change' | 'ipc_annual'>('ipc_annual');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    defaultPeriod ?? toPeriod(new Date().toISOString())
  );
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setType('ipc_annual');
    setDescription('');
    setAmount(0);
    setEffectiveFrom(defaultPeriod ?? toPeriod(new Date().toISOString()));
  };

  const handleSubmit = async () => {
    if (!description || amount <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        propertyId,
        contractId,
        type,
        description,
        amount,
        effectiveFrom,
        recordedBy,
      });
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registrar aumento al inquilino" size="md">
      <div className="space-y-4">
        {/* Tipo */}
        <div className="grid grid-cols-2 gap-3">
          <TypeCard
            selected={type === 'ipc_annual'}
            onClick={() => setType('ipc_annual')}
            title="IPC anual"
            hint="Aplicar % al canon y admin"
          />
          <TypeCard
            selected={type === 'admin_change'}
            onClick={() => setType('admin_change')}
            title="Cambio de administración"
            hint="Nuevo valor de cuota PH"
          />
        </div>

        <Input
          label="Descripción"
          placeholder={type === 'ipc_annual' ? 'IPC 2026 (DANE)' : 'Cambio extraordinario de administración'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={type === 'ipc_annual' ? '% IPC' : 'Nueva admin (COP)'}
            type="number"
            min={0}
            step={type === 'ipc_annual' ? 0.1 : 10000}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
          />
          <Input
            label="Aplica desde (YYYY-MM)"
            placeholder="2026-07"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>

        {type === 'ipc_annual' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
            Se aplicará un <span className="font-bold">{amount || 0}%</span> de incremento al canon desde
            el período <span className="font-semibold">{effectiveFrom}</span>. La amortización existente
            se actualizará la próxima vez que se regenere.
          </div>
        )}
        {type === 'admin_change' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
            La administración cambiará a <span className="font-bold tabular-nums">{COP(amount || 0)}</span> desde
            el período <span className="font-semibold">{effectiveFrom}</span>.
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !description || amount <= 0}>
            {submitting ? 'Guardando…' : 'Registrar aumento'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TypeCard({
  selected, onClick, title, hint,
}: { selected: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left p-3 rounded-lg border-2 transition-all',
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-200 bg-white hover:border-slate-300'
      )}
    >
      <div className="font-semibold text-sm text-slate-900">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
    </button>
  );
}