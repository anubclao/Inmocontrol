/**
 * InmoControl — Wizard de Setup de Billing
 * ============================================================================
 * Modal que se dispara automáticamente al firmar el Inventario de Colocación
 * (que crea el contrato `active` en MySQL). El objetivo es cerrar el gap
 * histórico: antes el contrato quedaba activo pero SIN `billing_policies`,
 * y el agente tenía que ir manualmente al BillingPanel a setear la policy
 * + generar la amortización (pasos que muchos se saltaban).
 *
 * Karpathy Spec (jul-2026):
 *   - AC-1: se dispara al firmar Inventario de Colocación
 *   - AC-2: 1 paso consolidado con todos los campos
 *   - AC-3: persiste policy + genera amortización al confirmar
 *   - AC-4: NO se dispara si ya hay BillingPolicy
 *   - AC-5: el user puede cancelar (queda contrato sin policy; el BillingPanel
 *           muestra banner recordatorio)
 *
 * Decisión de diseño: en vez de 3 pasos con stepper, consolido todo en 1
 * pantalla con secciones visuales (Canon · Mora · IPC · Confirmación). El
 * agente ve toda la info junta y puede ajustar antes de confirmar. Si el
 * user prefiere stepper después, es trivial partirlo en 3.
 */
import { useState, useEffect } from 'react';
import { Modal } from '../../../shared/ui';
import { Button } from '../../../shared/ui';
import { Save, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  saveBillingPolicy,
  getOrGenerateAmortization,
  getBillingPolicy,
} from '../api';
import type { BillingPolicy, Contract } from '../types';

export interface BillingSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  contract: Contract;
  /** Se llama DESPUÉS de persistir la policy + generar la amortización.
   *  El BillingPanel se monta a sí mismo o navega el padre a esa vista. */
  onSuccess?: (policy: BillingPolicy) => void;
}

/** Helper: fecha actual en ISO (YYYY-MM-DD). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BillingSetupWizard({
  isOpen, onClose, showToast, contract, onSuccess,
}: BillingSetupWizardProps) {
  const [saving, setSaving] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [form, setForm] = useState<BillingPolicy>(() => ({
    propertyId: contract.propertyId,
    rentAmount: Number(contract.rentAmount ?? 0),
    adminFee: Number(contract.adminFee ?? 0),
    lateFeeMidPct: 5,
    lateFeeLatePct: 10,
    graceDay: 10,
    applyAnnualIpc: true,
    expectedIpcPct: 5.4, // IPC colombiano promedio
    applyIpcToAdmin: true,
    allowAdminChanges: true,
    bankAccounts: [],
    createdAt: todayIso(),
    updatedAt: todayIso(),
    createdBy: '',
  }));

  // FIX Karpathy AC-4: si la propiedad ya tiene policy, NO abrir el wizard.
  // Chequeamos al mount del modal. Si existe, mostramos mensaje y cerramos.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await getBillingPolicy(contract.propertyId);
        if (cancelled) return;
        if (existing) {
          setAlreadyExists(true);
          showToast('Esta propiedad ya tiene política de facturación.', 'success');
          onClose();
        }
      } catch (e) {
        console.warn('[BillingSetupWizard] check existing policy failed:', e);
        // Si falla el check, dejamos al user continuar (no bloqueamos).
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /** Valida el form antes de enviar. Devuelve string con mensaje de error o null. */
  function validate(): string | null {
    if (form.rentAmount < 0) return 'El canon no puede ser negativo';
    if (form.adminFee < 0) return 'La administración no puede ser negativa';
    if (form.graceDay < 1 || form.graceDay > 28) return 'El día de gracia debe estar entre 1 y 28';
    if (form.lateFeeMidPct < 0 || form.lateFeeMidPct > 50) return 'Mora día 11-20 debe estar entre 0 y 50%';
    if (form.lateFeeLatePct < 0 || form.lateFeeLatePct > 50) return 'Mora día 21-30 debe estar entre 0 y 50%';
    if (form.applyAnnualIpc && (form.expectedIpcPct < 0 || form.expectedIpcPct > 20)) {
      return 'El IPC esperado debe estar entre 0 y 20%';
    }
    return null;
  }

  const handleConfirm = async () => {
    const err = validate();
    if (err) {
      showToast(err, 'error');
      return;
    }
    setSaving(true);
    try {
      // FIX Karpathy (jul-2026): bug histórico. `saveBillingPolicy` usa
      // `tryBackendOrFallback` que silenciosamente cae al cache local si
      // el server falla (ej: el INSERT tenía una columna inexistente
      // que tiraba 500). El cliente mostraba "✓ Billing configurado"
      // aunque el server NUNCA hubiera persistido la policy — toast
      // mentiroso clásico. Ahora: pegamos directamente al server
      // (bypaseando el fallback) para que el éxito sea REAL.
      // Si el server falla, el modal NO se cierra y el agente puede
      // reintentar. El fallback local solo se usa para modo offline
      // intencional (futuro, fuera de scope).
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let serverOk = false;
      try {
        const res = await fetch(`/api/billing/policies/${encodeURIComponent(form.propertyId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error ?? `HTTP ${res.status}`);
        }
        serverOk = true;
      } finally {
        clearTimeout(timeoutId);
      }
      if (!serverOk) {
        throw new Error('El servidor no confirmó el guardado.');
      }
      // 2) Generar (o refrescar) la amortización (best-effort: si falla,
      // el BillingPanel la puede regenerar con "Regenerar amortización").
      let rows: Awaited<ReturnType<typeof getOrGenerateAmortization>> = [];
      try {
        rows = await getOrGenerateAmortization(contract, form);
      } catch (e: any) {
        console.warn('[BillingSetupWizard] amortization failed (no fatal):', e);
        // No bloqueamos: la policy SÍ está guardada. El toast menciona esto.
      }
      showToast(
        `✓ Billing configurado. ${rows.length > 0 ? `${rows.length} mes${rows.length === 1 ? '' : 'es'} de amortización generados.` : 'Generá la amortización desde el panel.'}`,
        'success',
      );
      onSuccess?.(form);
      onClose();
    } catch (e: any) {
      // FIX Karpathy: toast honesto. NO cerramos el modal — el agente puede reintentar.
      console.error('[BillingSetupWizard] save failed:', e);
      const isAbort = e?.name === 'AbortError';
      showToast(
        isAbort
          ? 'El servidor tardó demasiado. Reintentá en unos segundos.'
          : `Error al guardar: ${e?.message ?? 'desconocido'}. Reintentá en unos segundos.`,
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  // Si detectamos que ya existe policy, mostramos loading mientras se cierra
  if (alreadyExists) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Política de facturación" size="md">
        <div className="p-6 flex items-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Esta propiedad ya tiene política. Cerrando…</span>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurar facturación de la propiedad" size="lg">
      <div className="space-y-5">
        {/* Banner informativo */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Esta propiedad quedó arrendada.</strong> El contrato se creó
            al firmar el Inventario de Colocación, pero <strong>falta la política
            de facturación</strong> para empezar a operar el billing (cuentas de
            cobro, pagos, estado de cuenta del propietario). Configurala ahora —
            toma 30 segundos y te queda todo listo.
          </div>
        </div>

        {/* ── Sección 1: Canon y administración ── */}
        <section>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Canon y administración
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Canon mensual (COP)
              </label>
              <input
                type="number"
                min={0}
                step={50000}
                className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={form.rentAmount}
                onChange={(e) => setForm({ ...form, rentAmount: Number(e.target.value) || 0 })}
                data-testid="wizard-rent"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Pre-llenado desde el contrato: ${form.rentAmount.toLocaleString('es-CO')}
              </p>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Administración PH (COP)
              </label>
              <input
                type="number"
                min={0}
                step={10000}
                className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={form.adminFee}
                onChange={(e) => setForm({ ...form, adminFee: Number(e.target.value) || 0 })}
                data-testid="wizard-admin"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Pre-llenado desde el contrato: ${form.adminFee.toLocaleString('es-CO')}
              </p>
            </div>
          </div>
        </section>

        {/* ── Sección 2: Reglas de mora ── */}
        <section>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Reglas de mora
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Día de gracia
              </label>
              <input
                type="number"
                min={1}
                max={28}
                className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={form.graceDay}
                onChange={(e) => setForm({ ...form, graceDay: Number(e.target.value) || 10 })}
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Antes de este día = sin mora</p>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Mora día 11-20 (%)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={form.lateFeeMidPct}
                onChange={(e) => setForm({ ...form, lateFeeMidPct: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Mora día 21-30 (%)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={form.lateFeeLatePct}
                onChange={(e) => setForm({ ...form, lateFeeLatePct: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </section>

        {/* ── Sección 3: IPC anual ── */}
        <section>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Incremento anual (IPC)
          </h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.applyAnnualIpc}
                onChange={(e) => setForm({ ...form, applyAnnualIpc: e.target.checked })}
                data-testid="wizard-ipc-toggle"
              />
              Aplicar IPC anual al canon
            </label>
            {form.applyAnnualIpc && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">
                    IPC esperado (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                    value={form.expectedIpcPct}
                    onChange={(e) => setForm({ ...form, expectedIpcPct: Number(e.target.value) || 0 })}
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Referencial — el real se ajusta contra el DANE
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm self-end pb-2">
                  <input
                    type="checkbox"
                    checked={form.applyIpcToAdmin}
                    onChange={(e) => setForm({ ...form, applyIpcToAdmin: e.target.checked })}
                  />
                  Aplicar IPC también a la administración
                </label>
              </div>
            )}
          </div>
        </section>

        {/* ── Resumen visual ── */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
          <p className="font-bold text-slate-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Resumen
          </p>
          <p className="text-slate-600">
            Canon ${form.rentAmount.toLocaleString('es-CO')} + Admin ${form.adminFee.toLocaleString('es-CO')}
            {' = '}<strong>${(form.rentAmount + form.adminFee).toLocaleString('es-CO')}</strong>/mes
          </p>
          <p className="text-slate-600">
            Mora después del día {form.graceDay}: {form.lateFeeMidPct}% (medio) / {form.lateFeeLatePct}% (tarde)
          </p>
          {form.applyAnnualIpc && (
            <p className="text-slate-600">
              IPC anual: {form.expectedIpcPct}%{form.applyIpcToAdmin ? ' (también a admin)' : ''}
            </p>
          )}
        </div>

        {/* ── Acciones ── */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Más tarde
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleConfirm}
            disabled={saving}
            data-testid="wizard-confirm"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Guardar y generar amortización
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
