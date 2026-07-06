/**
 * InmoControl — Modal para registrar una NOVEDAD de cargo a la propiedad.
 * ============================================================================
 * Reemplaza al antiguo `DiscountFormModal` (que solo modelaba descuentos al
 * propietario) y al formulario paralelo "Registro de Novedad Contable" del
 * módulo Financiero. Es la fuente ÚNICA de novedades de gastos.
 *
 * Campos:
 *   - Tipo (servicios, mantenimiento, reparación, impuestos, póliza,
 *     comisión, parqueo, otro)
 *   - Descripción
 *   - Monto (COP)
 *   - Mes del período (YYYY-MM) — default = mes actual
 *   - A quién se imputa (chargedTo): Propietario / Inquilino / Ambos
 *     Default = `defaultChargedToFor(type)`. Siempre editable.
 *   - Si chargedTo ≠ owner: ¿aplica a la cuenta de cobro del mes?
 *     Default = true si hay contrato activo, false en otro caso.
 *   - URL del adjunto (opcional)
 *
 * El componente NO decide el destino (PDF CC vs estado de cuenta): eso lo
 * hace el cálculo del billing en backend cuando se envía la CC o se mira
 * el estado de cuenta.
 */

import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Button, Input, Modal } from '../../../shared/ui';
import { toPeriod } from '../types';
import {
  CHARGED_TO_LABELS,
  CHARGE_TYPE_LABELS,
  defaultChargedToFor,
} from '../types';
import type { ChargeType, ChargedTo, PropertyCharge } from '../types';

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const TYPE_OPTIONS = (Object.keys(CHARGE_TYPE_LABELS) as ChargeType[]).map((value) => ({
  value,
  label: CHARGE_TYPE_LABELS[value],
}));

const CHARGED_OPTIONS: { value: ChargedTo; label: string; hint: string }[] = [
  { value: 'owner',  label: CHARGED_TO_LABELS.owner,  hint: 'Aparece como descuento en el estado de cuenta del propietario' },
  { value: 'tenant', label: CHARGED_TO_LABELS.tenant, hint: 'Se suma a la cuenta de cobro del inquilino del mes' },
  { value: 'both',   label: CHARGED_TO_LABELS.both,   hint: 'Aparece en ambos documentos (ej. daño del inquilino con cargo cruzado)' },
];

export interface NovedadFormModalProps {
  propertyId: string;
  defaultPeriod?: string; // 'YYYY-MM'
  /** Default del switch ¿aplica a la CC? (true si hay contrato activo). */
  defaultAppliesToInvoice?: boolean;
  recordedBy: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<PropertyCharge, 'id' | 'recordedAt'>) => Promise<void>;
  onDelete?: (chargeId: string) => Promise<void>;
  /** Si se pasa, el modal opera en modo edición. */
  initialCharge?: PropertyCharge;
}

export function NovedadFormModal({
  propertyId, defaultPeriod, defaultAppliesToInvoice,
  recordedBy, isOpen, onClose, onSubmit, onDelete, initialCharge,
}: NovedadFormModalProps) {
  const [type, setType] = useState<ChargeType>(initialCharge?.type ?? 'public_services');
  const [description, setDescription] = useState(initialCharge?.description ?? '');
  const [amount, setAmount] = useState<number>(initialCharge?.amount ?? 0);
  const [period, setPeriod] = useState<string>(
    initialCharge?.period ?? defaultPeriod ?? toPeriod(new Date().toISOString()),
  );
  const [chargedTo, setChargedTo] = useState<ChargedTo>(
    initialCharge?.chargedTo ?? defaultChargedToFor(initialCharge?.type ?? 'public_services'),
  );
  const [appliesToInvoice, setAppliesToInvoice] = useState<boolean>(
    initialCharge?.appliesToInvoice ?? (defaultAppliesToInvoice ?? true),
  );
  const [attachmentUrl, setAttachmentUrl] = useState(initialCharge?.attachmentUrl ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Si el agente cambia el tipo y el chargedTo todavía es "default", lo
  // actualizo también así no queda desfasado (ej: pone "reparación" pero
  // sigue diciendo "owner"). Si ya fue override manual, no toco nada.
  useEffect(() => {
    if (!initialCharge) {
      const defaultCt = defaultChargedToFor(type);
      // Solo re-sincronizamos si el valor actual coincide con el default
      // del tipo anterior (es decir, no hubo override manual).
      // Para mantenerlo simple, siempre seteamos el nuevo default al
      // cambiar tipo. El usuario puede volver a overridear si quiere.
      setChargedTo(defaultCt);
      // Auto-ajustar appliesToInvoice: si el cargo va al inquilino, sí
      // aplica a la CC por default.
      setAppliesToInvoice(defaultCt !== 'owner');
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setType('public_services');
    setDescription('');
    setAmount(0);
    setPeriod(defaultPeriod ?? toPeriod(new Date().toISOString()));
    setChargedTo(defaultChargedToFor('public_services'));
    setAppliesToInvoice(defaultAppliesToInvoice ?? true);
    setAttachmentUrl('');
  };

  const handleSubmit = async () => {
    if (!description || amount <= 0) return;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return;
    setSubmitting(true);
    try {
      await onSubmit({
        propertyId,
        period,
        type,
        description,
        amount,
        chargedTo,
        appliesToInvoice: chargedTo === 'owner' ? false : appliesToInvoice,
        attachmentUrl: attachmentUrl || undefined,
        recordedBy,
      });
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialCharge || !onDelete) return;
    if (!confirm(`¿Eliminar la novedad de ${COP(initialCharge.amount)} (${initialCharge.description})?`)) return;
    setSubmitting(true);
    try {
      await onDelete(initialCharge.id);
      onClose();
    } catch (err) {
      // el padre muestra el toast
    } finally {
      setSubmitting(false);
    }
  };

  const showInvoiceToggle = chargedTo !== 'owner';
  const chargedHint = CHARGED_OPTIONS.find((o) => o.value === chargedTo)?.hint;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialCharge ? 'Editar novedad de cargo' : 'Registrar novedad de cargo'}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Tipo
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ChargeType)}
            className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <Input
          label="Descripción"
          placeholder="Ej: Pago de energía mes de junio"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Monto (COP)"
            type="number"
            min={0}
            step={10000}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
          />
          <Input
            label="Período (YYYY-MM)"
            placeholder="2026-06"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            A quién se imputa
          </label>
          <div className="mt-2 space-y-2">
            {CHARGED_OPTIONS.map((o) => {
              const selected = o.value === chargedTo;
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => {
                    setChargedTo(o.value);
                    if (o.value === 'owner') setAppliesToInvoice(false);
                    else setAppliesToInvoice((cur) => cur || true);
                  }}
                  className={`
                    w-full text-left px-3 py-2 rounded-lg border transition-all
                    ${selected
                      ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                      : 'border-slate-200 bg-white hover:border-slate-300'}
                  `}
                >
                  <div className="flex items-start gap-2">
                    <span className={`
                      inline-flex items-center justify-center w-4 h-4 mt-0.5 rounded-full border-2
                      ${selected ? 'border-blue-500 bg-blue-500' : 'border-slate-300 bg-white'}
                    `}>
                      {selected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </span>
                    <div className="flex-1">
                      <div className={`text-sm font-medium ${selected ? 'text-blue-900' : 'text-slate-800'}`}>
                        {o.label}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{o.hint}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {chargedHint && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{chargedHint}</span>
            </div>
          )}
        </div>

        {showInvoiceToggle && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={appliesToInvoice}
              onChange={(e) => setAppliesToInvoice(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-slate-800">
                Aplicar a la cuenta de cobro de {period}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Si lo dejás desactivado, el cargo queda registrado pero no se suma al subtotal de la CC (útil para cargos que aplican a un periodo ya cerrado).
              </div>
            </div>
          </label>
        )}

        <Input
          label="URL adjunto (opcional)"
          placeholder="https://..."
          value={attachmentUrl}
          onChange={(e) => setAttachmentUrl(e.target.value)}
        />

        <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
          {chargedTo === 'owner' && (
            <>Se descontará <span className="font-bold text-slate-900 tabular-nums">{COP(amount || 0)}</span> del estado de cuenta del propietario en el período <span className="font-semibold">{period}</span>.</>
          )}
          {chargedTo === 'tenant' && (
            <>Se sumará <span className="font-bold text-slate-900 tabular-nums">{COP(amount || 0)}</span> a la cuenta de cobro del inquilino de {period}{appliesToInvoice ? '' : ' (no aplica a la factura, queda como histórico)'}.</>
          )}
          {chargedTo === 'both' && (
            <>Aparecerá como cargo al propietario y al inquilino: <span className="font-bold text-slate-900 tabular-nums">{COP(amount || 0)}</span> en {period}.</>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          {initialCharge && onDelete && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={submitting}
              className="mr-auto !text-red-600 !border-red-200 hover:!bg-red-50"
            >
              Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !description || amount <= 0}>
            {submitting ? 'Guardando…' : initialCharge ? 'Guardar cambios' : 'Registrar novedad'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
