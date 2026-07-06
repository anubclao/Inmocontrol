import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calculator, FileDown, Info, CheckCircle2, AlertCircle, TrendingDown, TrendingUp, Wallet, Shield } from 'lucide-react';
import { Card, Button, Input, Modal } from '../../shared/ui';
import {
  calculateMonthlySettlement,
  formatCurrency,
  RETEFUENTE_THRESHOLD_COP,
  UVT_2026,
  type SettlementInputs,
  type SettlementResult,
  type OwnerTaxType,
  type TenantTaxType,
} from '../../utils/calculations';
import { generateLiquidacionPDF } from './liquidacionPdf';

interface LiquidacionMensualProps {
  propertyId: string;
  property: { address: string; owner: string; ownerIdNumber?: string; tenantName?: string; tenantIdNumber?: string };
  financialRecords: any[];          // transacciones del periodo (sirve para autocompletar)
  initialPeriod?: string;            // YYYY-MM
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onClose: () => void;
}

/**
 * Pantalla de liquidación mensual: muestra el cálculo paso a paso
 * con trazabilidad legal. El usuario puede ajustar inputs y ver el
 * resultado en tiempo real. Al confirmar, genera el PDF.
 */
export function LiquidacionMensual({
  property, financialRecords, initialPeriod, showToast, onClose,
}: LiquidacionMensualProps) {
  const defaultPeriod = initialPeriod ?? new Date().toISOString().slice(0, 7);

  // Autocompletar desde los registros financieros del periodo
  const presets = useMemo(() => {
    const periodRecords = financialRecords.filter((r: any) =>
      r.date && String(r.date).slice(0, 7) === defaultPeriod
    );
    const canon = periodRecords
      .filter((r: any) => r.category === 'Canon de Arrendamiento' && r.type === 'Ingreso')
      .reduce((acc: number, r: any) => acc + r.amount, 0);
    const admin = periodRecords
      .filter((r: any) => r.category === 'Administración PH' && r.type === 'Ingreso')
      .reduce((acc: number, r: any) => acc + r.amount, 0);
    const otros = periodRecords
      .filter((r: any) => r.type === 'Ingreso' && !['Canon de Arrendamiento', 'Administración PH'].includes(r.category))
      .reduce((acc: number, r: any) => acc + r.amount, 0);
    const gastos = periodRecords
      .filter((r: any) => r.type === 'Egreso')
      .reduce((acc: number, r: any) => acc + r.amount, 0);
    return { canon, admin, otros, gastos };
  }, [financialRecords, defaultPeriod]);

  const [inputs, setInputs] = useState<SettlementInputs>({
    canon: presets.canon || 1_696_037,
    administracionPH: presets.admin || 250_000,
    otrosIngresos: presets.otros,
    gastosOperativos: presets.gastos,
    comisionPct: 8,
    seguroPct: 0,
    ownerTaxType: 'natural',
    tenantTaxType: 'natural',
    period: defaultPeriod,
    closed: false,
  });

  const [generating, setGenerating] = useState(false);

  // Recalcular cuando cambian los presets
  useEffect(() => {
    setInputs((prev) => ({
      ...prev,
      canon: presets.canon || prev.canon,
      administracionPH: presets.admin || prev.administracionPH,
      otrosIngresos: presets.otros,
      gastosOperativos: presets.gastos,
      period: defaultPeriod,
    }));
  }, [presets.canon, presets.admin, presets.otros, presets.gastos, defaultPeriod]);

  const result: SettlementResult = useMemo(
    () => calculateMonthlySettlement(inputs),
    [inputs],
  );

  const retefuenteMessage = inputs.ownerTaxType === 'juridica'
    ? `Persona jurídica: aplica 11% sobre el canon (sin umbral)`
    : inputs.canon > RETEFUENTE_THRESHOLD_COP
      ? `Supera ${RETEFUENTE_THRESHOLD_COP / UVT_2026} UVT (${formatCurrency(RETEFUENTE_THRESHOLD_COP)}) → aplica 3.5%`
      : `No supera ${RETEFUENTE_THRESHOLD_COP / UVT_2026} UVT (${formatCurrency(RETEFUENTE_THRESHOLD_COP)}) → NO aplica retefuente`;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateLiquidacionPDF(inputs, result, property);
      showToast('Liquidación generada correctamente', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al generar el PDF', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Liquidación Mensual — ${property.address}`} size="full">
      <div className="space-y-6">
        {/* Header con periodo y propietario */}
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1 grid grid-cols-2 gap-3">
            <Input
              label="Periodo (YYYY-MM)"
              value={inputs.period}
              onChange={(e) => setInputs({ ...inputs, period: e.target.value })}
            />
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo contribuyente propietario</label>
              <select
                className="w-full h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                value={inputs.ownerTaxType}
                onChange={(e) => setInputs({ ...inputs, ownerTaxType: e.target.value as OwnerTaxType })}
              >
                <option value="natural">Persona natural</option>
                <option value="juridica">Persona jurídica</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Columna izquierda: inputs ── */}
          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-blue-600" />
                Ingresos
              </h3>
              <CurrencyInput
                label="Canon de arrendamiento"
                value={inputs.canon}
                onChange={(v) => setInputs({ ...inputs, canon: v })}
              />
              <CurrencyInput
                label="Administración PH (reembolso)"
                value={inputs.administracionPH}
                onChange={(v) => setInputs({ ...inputs, administracionPH: v })}
              />
              <CurrencyInput
                label="Otros ingresos"
                value={inputs.otrosIngresos}
                onChange={(v) => setInputs({ ...inputs, otrosIngresos: v })}
              />
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-600" />
                Descuentos fijos
              </h3>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Comisión inmobiliaria (%)</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min={0} max={30} step={0.5}
                    className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={inputs.comisionPct}
                    onChange={(e) => setInputs({ ...inputs, comisionPct: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="text-xs text-slate-500">% del canon</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Seguro (%)</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min={0} max={20} step={0.1}
                    className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={inputs.seguroPct}
                    onChange={(e) => setInputs({ ...inputs, seguroPct: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="text-xs text-slate-500">% del canon</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                Gastos operativos
              </h3>
              <CurrencyInput
                label="Gastos del periodo"
                value={inputs.gastosOperativos}
                onChange={(v) => setInputs({ ...inputs, gastosOperativos: v })}
              />
            </Card>
          </div>

          {/* ── Columna central: cálculo paso a paso ── */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Saldo a transferir al propietario</p>
                  <motion.p
                    key={result.totales.saldoTransferir}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-4xl font-black text-emerald-400 mt-2"
                  >
                    {formatCurrency(result.totales.saldoTransferir)}
                  </motion.p>
                  <p className="text-xs text-slate-400 mt-1">Periodo {result.period}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-emerald-400 opacity-30" />
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-bold text-sm flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4 text-blue-600" />
                Cálculo paso a paso
              </h3>
              <div className="space-y-2">
                <SettlementLine
                  icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
                  label="Ingresos brutos"
                  detail={`${formatCurrency(inputs.canon)} + ${formatCurrency(inputs.otrosIngresos)}`}
                  amount={result.totales.ingresosBrutos}
                  tone="income"
                />
                {inputs.administracionPH > 0 && (
                  <SettlementLine
                    icon={<Info className="w-4 h-4 text-blue-600" />}
                    label="+ Administración PH (reembolso)"
                    detail="Pasa íntegra al propietario"
                    amount={inputs.administracionPH}
                    tone="info"
                  />
                )}
                <SettlementLine
                  icon={<TrendingDown className="w-4 h-4 text-red-600" />}
                  label="− Comisión administración"
                  detail={`${inputs.comisionPct}% × ${formatCurrency(inputs.canon)}`}
                  amount={-result.trace.comision}
                  tone="discount"
                />
                <SettlementLine
                  icon={<TrendingDown className="w-4 h-4 text-red-600" />}
                  label="− IVA sobre comisión (19%)"
                  detail={`Base: ${formatCurrency(result.trace.comision)}`}
                  amount={-result.trace.ivaSobreComision}
                  tone="discount"
                  legalRef="ET art. 468"
                />
                {result.trace.seguro > 0 && (
                  <SettlementLine
                    icon={<Shield className="w-4 h-4 text-red-600" />}
                    label={`− Seguro (${inputs.seguroPct}%)`}
                    detail={`${inputs.seguroPct}% × ${formatCurrency(inputs.canon)}`}
                    amount={-result.trace.seguro}
                    tone="discount"
                  />
                )}
                {result.trace.retefuenteApplied && (
                  <SettlementLine
                    icon={<TrendingDown className="w-4 h-4 text-red-600" />}
                    label="− Retención en la fuente"
                    detail={retefuenteMessage}
                    amount={-result.trace.retefuente}
                    tone="tax"
                    legalRef="ET art. 383"
                  />
                )}
                {!result.trace.retefuenteApplied && inputs.ownerTaxType === 'natural' && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-500">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                    {retefuenteMessage}
                  </div>
                )}
                <SettlementLine
                  icon={<TrendingDown className="w-4 h-4 text-red-600" />}
                  label="− GMF (4x1000)"
                  detail={`Base: ${formatCurrency(result.trace.baseGmf)} (ingresos − descuentos fijos)`}
                  amount={-result.trace.gmf}
                  tone="fee"
                  legalRef="ET art. 871"
                />
                {result.totales.gastosOperativos > 0 && (
                  <SettlementLine
                    icon={<TrendingDown className="w-4 h-4 text-amber-600" />}
                    label="− Gastos operativos"
                    detail="Reparaciones, servicios, predial, etc."
                    amount={-result.totales.gastosOperativos}
                    tone="expense"
                  />
                )}
                <div className="pt-3 border-t-2 border-dashed border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">Saldo a transferir</span>
                    <span className="font-black text-2xl text-emerald-600">
                      {formatCurrency(result.totales.saldoTransferir)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Resumen de totales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryTile label="Ingresos" value={result.totales.ingresosBrutos + inputs.administracionPH} tone="income" />
              <SummaryTile label="Comisiones" value={result.totales.comisiones} tone="discount" />
              <SummaryTile label="Impuestos" value={result.totales.impuestos} tone="tax" />
              <SummaryTile label="Saldo neto" value={result.totales.saldoTransferir} tone="net" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <div className="flex-1" />
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="gap-2"
          >
            <FileDown className="w-4 h-4" />
            {generating ? 'Generando PDF…' : 'Generar Liquidación PDF'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CurrencyInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      <input
        type="text"
        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
        value={value === 0 ? '' : value.toLocaleString('es-CO')}
        onChange={(e) => {
          const clean = e.target.value.replace(/[^0-9]/g, '');
          onChange(parseInt(clean || '0', 10));
        }}
        placeholder="0"
      />
    </div>
  );
}

function SettlementLine({
  icon, label, detail, amount, tone, legalRef,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  amount: number;
  tone: 'income' | 'discount' | 'tax' | 'fee' | 'expense' | 'info' | 'net';
  legalRef?: string;
}) {
  const colors = {
    income: 'text-emerald-700',
    discount: 'text-red-600',
    tax: 'text-red-600',
    fee: 'text-red-600',
    expense: 'text-amber-700',
    info: 'text-blue-700',
    net: 'text-emerald-700',
  }[tone];
  return (
    <div className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-900">{label}</p>
          {legalRef && (
            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">
              {legalRef}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <span className={`font-bold tabular-nums shrink-0 ${colors}`}>
        {amount < 0 ? '−' : '+'} {formatCurrency(Math.abs(amount))}
      </span>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'income' | 'discount' | 'tax' | 'net' }) {
  const styles = {
    income: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    discount: 'bg-red-50 border-red-100 text-red-900',
    tax: 'bg-amber-50 border-amber-100 text-amber-900',
    net: 'bg-blue-50 border-blue-100 text-blue-900',
  }[tone];
  return (
    <div className={`p-3 rounded-lg border ${styles}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-black tabular-nums">{formatCurrency(value)}</p>
    </div>
  );
}
