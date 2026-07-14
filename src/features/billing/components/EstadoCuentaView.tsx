/**
 * InmoControl — Estado de Cuenta mensual del PROPIETARIO.
 * ============================================================================
 * Versión mejorada de `AccountStatementView`. Reúne en una sola pantalla:
 *
 *   - Selector de periodo (YYYY-MM) con ← →
 *   - Resumen ejecutivo: ingresos + gastos + retenciones + neto + transfers + saldo
 *   - Tabla de detalle de movimientos (cargo/abono/saldo acumulado)
 *   - Lista de payouts REALES registrados al propietario (con CRUD)
 *   - Botón "Registrar transferencia" → modal simple
 *   - Botón "Descargar PDF" → genera estado de cuenta con formato del modelo
 *
 * Datos:
 *   - `getOwnerStatement(propertyId, period)` devuelve TODO lo necesario
 *     (server-side: amortización + descuentos + settlement + payouts).
 *   - `listOwnerPayouts / saveOwnerPayout / deleteOwnerPayout` para el CRUD
 *     de transferencias reales.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Wallet, TrendingUp, TrendingDown, Loader2,
  FileDown, Plus, Trash2, Banknote, Receipt, AlertCircle,
} from 'lucide-react';
import { Button, Card, Input, Modal, cn } from '../../../shared/ui';
import {
  getOwnerStatement, listOwnerPayouts, saveOwnerPayout, deleteOwnerPayout,
} from '../api';
import { addMonth, CHARGED_TO_LABELS, CHARGE_TYPE_LABELS, toPeriod } from '../types';
import { formatCurrency } from '../../../utils/calculations';
import type {
  OwnerPayout, OwnerStatement, PropertyCharge, PropertyDiscount, BankAccount,
} from '../types';
import type { Contract } from '../../contracts/contractTypes';
import type { Property } from '../../../types';
import { generateEstadoCuentaPDF, generateEstadoCuentaPdfBlob } from '../estadoCuentaPdf';
import { uploadPdfToDrive } from '../../../lib/drive/driveService';
import { computeOwnerDistribution } from '../ownerDistribution';
import { AlertTriangle, Users } from 'lucide-react';

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const DISCOUNT_TYPE_LABELS: Record<PropertyDiscount['type'], string> = {
  public_services: 'Servicios públicos',
  maintenance: 'Mantenimiento',
  repair: 'Reparación',
  tax: 'Impuestos',
  insurance: 'Póliza',
  commission: 'Comisión',
  parking: 'Parqueo',
  other: 'Otro',
};

export interface EstadoCuentaViewProps {
  property: Property;
  contract?: Contract | null;
  /** Tenant activo de la propiedad (para el detalle del estado de cuenta). */
  tenant?: { name: string; idNumber: string } | null;
  /** Cuentas bancarias configuradas (la primaria del propietario). */
  bankAccounts?: BankAccount[];
  /** Nombre del agente (para logs + PDF "Elaboró"). */
  userName: string;
  /** Mes inicial (default: mes actual). */
  initialPeriod?: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export function EstadoCuentaView({
  property, contract, tenant, bankAccounts, userName, initialPeriod, showToast,
}: EstadoCuentaViewProps) {
  const [period, setPeriod] = useState<string>(initialPeriod ?? toPeriod(new Date().toISOString()));
  const [statement, setStatement] = useState<OwnerStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getOwnerStatement(property.id, period);
      setStatement(s);
    } catch (err: any) {
      console.warn('[EstadoCuentaView] load failed:', err?.message ?? err);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [property.id, period]);

  useEffect(() => { void load(); }, [load]);

  const handleDeletePayout = useCallback(async (payout: OwnerPayout) => {
    if (!confirm(`¿Eliminar la transferencia de ${COP(payout.amount)} del ${payout.paidAt.slice(0, 10)}?`)) return;
    try {
      await deleteOwnerPayout(property.id, payout.id);
      showToast('Transferencia eliminada', 'success');
      void load();
    } catch (err: any) {
      showToast(`Error: ${err?.message ?? err}`, 'error');
    }
  }, [property.id, showToast, load]);

  const handleGeneratePdf = useCallback(async () => {
    if (!statement) return;
    setGeneratingPdf(true);
    try {
      const primaryBank = bankAccounts?.find((b) => b.isPrimary) ?? bankAccounts?.[0];
      const stmtNumber = `EC-${period.replace('-', '')}`;
      const pdfBlob = await generateEstadoCuentaPdfBlob({
        statement,
        contract: contract ?? ({
          id: '—', propertyId: property.id, tenantId: '—',
          rentAmount: statement.grossRent, adminFee: statement.grossAdmin,
          commissionPercentage: statement.settlement.commissionPct,
          insurancePercentage: 0,
          startDate: '', endDate: '',
          renewalStrategy: 'manual', inventoryEndRequired: false,
          status: 'active', createdAt: '', updatedAt: '',
        } as unknown as Contract),
        property,
        owner: {
          name: property.ownerName ?? '—',
          idNumber: property.ownerIdNumber,
        },
        // Migración 010+: pasar la lista de copropietarios al PDF para que
        // incluya la sección "Desglose por copropietario" si hay N > 1.
        owners: (property.owners as any) ?? [],
        tenant: tenant ?? { name: '—', idNumber: '—' },
        bankAccount: primaryBank,
        statementNumber: stmtNumber,
        elaboratedBy: userName,
      });

      // Subir a Google Drive → Propietario/EstadosCuenta/
      // Necesita la carpeta de la propiedad en Drive (property.driveFolderId).
      // Si no está disponible, el flujo sigue con descarga local.
      let driveLink: string | undefined;
      const propertyFolderId = property.driveFolderId ?? null;
      if (propertyFolderId) {
        const fileName = `EstadoCuenta_${stmtNumber}_${property.address?.replace(/\s+/g, '_').slice(0, 30) ?? 'inmueble'}.pdf`;
        const upRes = await uploadPdfToDrive(
          pdfBlob, propertyFolderId, 'property', 'EstadosCuenta', fileName,
        );
        if (upRes.webViewLink) {
          driveLink = upRes.webViewLink;
        } else if (upRes.skipped) {
          console.info('[EstadoCuentaView] Drive upload omitido:', upRes.reason);
        } else {
          console.warn('[EstadoCuentaView] Drive upload error:', upRes.error);
        }
      }

      // Descarga local (UX estándar — el agente ya esperaba este archivo)
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `EstadoCuenta_${stmtNumber}_${property.address?.replace(/\s+/g, '_').slice(0, 30) ?? 'inmueble'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

      showToast(
        driveLink
          ? `Estado de cuenta ${stmtNumber} generado · PDF en Drive`
          : 'PDF generado y descargado',
        'success',
      );
    } catch (err: any) {
      console.error(err);
      showToast(`Error generando PDF: ${err?.message ?? err}`, 'error');
    } finally {
      setGeneratingPdf(false);
    }
  }, [statement, period, property, tenant, bankAccounts, userName, showToast]);

  return (
    <Card>
      {/* Header con nav de período */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Estado de cuenta del propietario</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Resumen, detalle de movimientos y transferencias del período {period}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setPeriod(addMonth(period, -1))}
              className="p-1.5 hover:bg-white rounded-md transition-colors"
              title="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="px-3 text-sm font-semibold text-slate-700 tabular-nums min-w-[60px] text-center">
              {period}
            </span>
            <button
              onClick={() => setPeriod(addMonth(period, 1))}
              className="p-1.5 hover:bg-white rounded-md transition-colors"
              title="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
          <Button
            variant="outline"
            onClick={handleGeneratePdf}
            disabled={!statement || generatingPdf}
            className="gap-2"
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Descargar PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Calculando estado de cuenta…
        </div>
      ) : !statement ? (
        <div className="p-12 text-center text-sm text-slate-500">
          No hay datos para este período.
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* ── Resumen ejecutivo (4+2 tiles) ── */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Resumen ejecutivo
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Ingresos del mes"   value={statement.totalGrossIncome} tone="income" Icon={TrendingUp} />
              <Tile label="Gastos"             value={statement.totalDiscounts}    tone="discount" Icon={TrendingDown} />
              <Tile label="Retenciones"        value={statement.settlement.totalRetentions} tone="tax" Icon={AlertCircle} />
              <Tile label="Neto calculado"     value={statement.netCalculated}     tone="net" Icon={Wallet} highlight />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Tile label="Transferencias al propietario" value={statement.totalPayouts} tone="income" Icon={Banknote} />
              <Tile label="Cargos pasados al inquilino" value={statement.totalChargesToTenant ?? 0} tone="info" Icon={Receipt} />
              <Tile
                label={statement.finalBalance > 0 ? 'Saldo a favor del propietario' : statement.finalBalance < 0 ? 'Saldo en contra' : 'Saldo en cero'}
                value={Math.abs(statement.finalBalance)}
                tone={statement.finalBalance > 0 ? 'positive' : statement.finalBalance < 0 ? 'negative' : 'neutral'}
                Icon={Wallet}
                highlight
              />
            </div>
          </div>

          {/* ── Desglose por copropietario (migración 010+) ──
              Migración 010+: si la propiedad tiene N propietarios, mostramos
              el desglose del neto y las transferencias por cada uno. Si
              hay 1 solo, este bloque se omite para no duplicar info. */}
          {statement && (() => {
            const distribution = computeOwnerDistribution(
              statement.netCalculated,
              statement.totalPayouts,
              property.owners as any,
            );
            // Solo mostrar el bloque si hay N > 1
            if (distribution.items.length < 2) return null;
            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Desglose por copropietario
                  </h4>
                  {distribution.assumedDistribution && distribution.note && (
                    <div
                      className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded flex items-center gap-1"
                      title={distribution.note}
                    >
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      <span>% asumidos — configurá los % reales en el detalle de la propiedad</span>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="px-3 py-2">Propietario</th>
                        <th className="px-3 py-2 text-right">% Part.</th>
                        <th className="px-3 py-2 text-right">Neto (proporcional)</th>
                        <th className="px-3 py-2 text-right">Transferido</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {distribution.items.map((d) => (
                        <tr key={d.owner.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-2 text-xs text-slate-700">
                            <div className="font-semibold">{d.owner.name}</div>
                            {d.owner.idNumber && (
                              <div className="text-[10px] text-slate-500 font-mono">CC {d.owner.idNumber}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700 font-medium">
                            {d.pct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-blue-700 font-semibold">
                            {COP(d.netCalculated)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-emerald-700">
                            {COP(d.totalPayouts)}
                          </td>
                          <td className={`px-3 py-2 text-right text-xs tabular-nums font-bold ${
                            d.finalBalance > 0 ? 'text-emerald-700' : d.finalBalance < 0 ? 'text-red-700' : 'text-slate-700'
                          }`}>
                            {COP(d.finalBalance)}
                          </td>
                        </tr>
                      ))}
                      {/* Fila de totales (verificación) */}
                      <tr className="bg-slate-50 font-semibold text-xs">
                        <td className="px-3 py-2 text-slate-700 uppercase tracking-wider">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {distribution.items.reduce((s, d) => s + d.pct, 0).toFixed(2)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-blue-900">
                          {COP(distribution.items.reduce((s, d) => s + d.netCalculated, 0))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-900">
                          {COP(distribution.items.reduce((s, d) => s + d.totalPayouts, 0))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                          {COP(distribution.items.reduce((s, d) => s + d.finalBalance, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {distribution.assumedDistribution && distribution.note && (
                  <p className="text-[10px] text-slate-500 mt-2 italic">
                    {distribution.note}
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Detalle de movimientos ── */}
          <MovementsTable statement={statement} />

          {/* ── Transferencias reales registradas ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Transferencias reales al propietario
              </h4>
              <Button size="sm" onClick={() => setShowPayoutModal(true)} className="gap-1">
                <Plus className="w-3.5 h-3.5" />
                Registrar transferencia
              </Button>
            </div>
            {statement.payouts.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-3 px-4 bg-slate-50 rounded-lg">
                Aún no se han registrado transferencias reales para este período. El estado de cuenta
                muestra el neto teórico; cuando registres una transferencia, aparecerá acá y se
                reflejará en el saldo final.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                {statement.payouts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-3 bg-white hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-medium px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded shrink-0">
                      {p.paidAt.slice(0, 10)}
                    </span>
                    <span className="flex-1 text-sm text-slate-700 truncate">
                      {p.notes || `Transferencia${p.reference ? ` · ref: ${p.reference}` : ''}`}
                    </span>
                    <span className="text-sm font-semibold text-emerald-600 tabular-nums shrink-0">
                      {COP(p.amount)}
                    </span>
                    <button
                      onClick={() => handleDeletePayout(p)}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                      title="Eliminar transferencia"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Modal para registrar transferencia */}
      {showPayoutModal && (
        <RegistrarPayoutModal
          propertyId={property.id}
          contractId={contract?.id}
          period={period}
          bankAccounts={bankAccounts ?? []}
          userName={userName}
          onClose={() => setShowPayoutModal(false)}
          onSaved={() => { setShowPayoutModal(false); void load(); showToast('Transferencia registrada', 'success'); }}
          showToast={showToast}
        />
      )}
    </Card>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────

function Tile({ label, value, tone, Icon, highlight }: {
  label: string; value: number; tone: 'income' | 'discount' | 'tax' | 'net' | 'positive' | 'negative' | 'neutral' | 'info'; Icon: any; highlight?: boolean;
}) {
  const styles: Record<string, string> = {
    income: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    discount: 'bg-red-50 border-red-100 text-red-900',
    tax: 'bg-amber-50 border-amber-100 text-amber-900',
    net: 'bg-blue-50 border-blue-100 text-blue-900',
    positive: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    negative: 'bg-red-50 border-red-200 text-red-900',
    neutral: 'bg-slate-50 border-slate-200 text-slate-900',
    info: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  };
  const iconColors: Record<string, string> = {
    income: 'text-emerald-600',
    discount: 'text-red-600',
    tax: 'text-amber-600',
    net: 'text-blue-600',
    positive: 'text-emerald-700',
    negative: 'text-red-700',
    neutral: 'text-slate-600',
    info: 'text-indigo-600',
  };
  return (
    <div className={cn(
      'p-4 rounded-xl border',
      highlight ? 'bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none' : styles[tone],
    )}>
      <div className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-wider', highlight ? 'text-slate-300' : 'opacity-80')}>
        <Icon className={cn('w-4 h-4', highlight ? 'text-white' : iconColors[tone])} />
        {label}
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums', highlight ? 'text-white' : '')}>
        {COP(value)}
      </div>
    </div>
  );
}

function MovementsTable({ statement }: { statement: OwnerStatement }) {
  type Row = { date: string; doc: string; concept: string; cargo: number; abono?: number; obs?: string };
  let saldoAcum = 0;
  const rows: Row[] = [];

  if (statement.grossRent > 0) {
    rows.push({ date: `${statement.period}-05`, doc: `CC-${statement.period.replace('-', '')}-001`, concept: 'Canon de arrendamiento', cargo: statement.grossRent, obs: 'Cobrado al inquilino' });
  }
  if (statement.grossAdmin > 0) {
    rows.push({ date: `${statement.period}-05`, doc: `CC-${statement.period.replace('-', '')}-001`, concept: 'Cuota de administración', cargo: statement.grossAdmin, obs: 'Cobrada al inquilino' });
  }
  if (statement.grossLateFee > 0) {
    rows.push({ date: `${statement.period}-15`, doc: 'Liquidación', concept: 'Mora cobrada al inquilino', cargo: statement.grossLateFee, obs: 'Pago fuera del día de gracia' });
  }
  // Cargos al propietario: usamos `charges` (forma canónica con chargedTo) y
  // caemos a `discounts` (legacy) si la primera viene vacía.
  const chargesList = statement.charges && statement.charges.length > 0
    ? statement.charges
    : statement.discounts.map((d) => ({
        id: d.id,
        propertyId: d.propertyId,
        period: d.monthPeriod,
        type: d.type,
        description: d.description,
        amount: d.amount,
        chargedTo: 'owner' as const,
        appliesToInvoice: false,
        attachmentUrl: d.attachmentUrl,
        recordedAt: d.recordedAt,
        recordedBy: d.recordedBy,
      }));
  for (const c of chargesList) {
    const chargedTag = c.chargedTo === 'owner' ? '' : c.chargedTo === 'tenant' ? ' · al inquilino' : ' · a ambos';
    rows.push({
      date: c.recordedAt.slice(0, 10),
      doc: c.id.slice(0, 8).toUpperCase(),
      concept: `${CHARGE_TYPE_LABELS[c.type] ?? c.type}: ${c.description}${chargedTag}`,
      cargo: c.amount,
      obs: `Registrado por ${c.recordedBy}`,
    });
  }
  if (statement.settlement.commission > 0) {
    rows.push({ date: `${statement.period}-28`, doc: 'Liquidación', concept: `Comisión administración (${statement.settlement.commissionPct}%)`, cargo: statement.settlement.commission, obs: 'ET art. 468' });
  }
  if (statement.settlement.ivaOnCommission > 0) {
    rows.push({ date: `${statement.period}-28`, doc: 'Liquidación', concept: 'IVA sobre comisión (19%)', cargo: statement.settlement.ivaOnCommission, obs: 'ET art. 468' });
  }
  if (statement.settlement.retefuente > 0) {
    rows.push({ date: `${statement.period}-28`, doc: 'Liquidación', concept: 'Retención en la fuente (3.5%)', cargo: statement.settlement.retefuente, obs: 'ET art. 383' });
  }
  if (statement.settlement.gmf > 0) {
    rows.push({ date: `${statement.period}-28`, doc: 'Liquidación', concept: 'GMF (4x1000)', cargo: statement.settlement.gmf, obs: 'ET art. 871' });
  }
  if (statement.netCalculated > 0) {
    rows.push({ date: `${statement.period}-28`, doc: 'Cálculo', concept: 'Neto calculado a transferir', cargo: statement.netCalculated, obs: 'Proyectado por motor de liquidación' });
  }
  for (const p of statement.payouts) {
    rows.push({
      date: p.paidAt.slice(0, 10),
      doc: p.reference ?? p.id.slice(0, 8).toUpperCase(),
      concept: `Transferencia al propietario${p.notes ? ` — ${p.notes}` : ''}`,
      cargo: 0,
      abono: p.amount,
      obs: `Girado por ${p.recordedBy}`,
    });
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Detalle de movimientos
      </h4>
      <div className="overflow-x-auto border border-slate-100 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-2 py-2">Fecha</th>
              <th className="px-2 py-2">Soporte</th>
              <th className="px-2 py-2">Concepto</th>
              <th className="px-2 py-2 text-right">Cargo</th>
              <th className="px-2 py-2 text-right">Abono</th>
              <th className="px-2 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              saldoAcum += r.cargo - r.abono;
              return (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors" title={r.obs}>
                  <td className="px-2 py-1.5 text-xs text-slate-500 tabular-nums whitespace-nowrap">{r.date}</td>
                  <td className="px-2 py-1.5 text-xs font-mono text-slate-600 whitespace-nowrap">{r.doc}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-700">{r.concept}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-red-600">
                    {r.cargo > 0 ? COP(r.cargo) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-emerald-600">
                    {r.abono > 0 ? COP(r.abono) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums font-bold text-slate-900">
                    {COP(saldoAcum)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-bold">
              <td className="px-2 py-2 text-xs uppercase tracking-wider text-slate-700" colSpan={3}>TOTALES</td>
              <td className="px-2 py-2 text-right text-xs tabular-nums text-red-700">
                {COP(rows.reduce((s, r) => s + r.cargo, 0))}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums text-emerald-700">
                {COP(rows.reduce((s, r) => s + r.abono, 0))}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-900">
                {COP(saldoAcum)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RegistrarPayoutModal({
  propertyId, contractId, period, bankAccounts, userName,
  onClose, onSaved, showToast,
}: {
  propertyId: string;
  contractId?: string;
  period: string;
  bankAccounts: BankAccount[];
  userName: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [bankAccountId, setBankAccountId] = useState(bankAccounts.find((b) => b.isPrimary)?.id ?? bankAccounts[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const numAmount = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!numAmount || numAmount <= 0) {
      showToast('Ingresa un monto válido', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await saveOwnerPayout({
        propertyId,
        contractId,
        period,
        amount: numAmount,
        paidAt: new Date(paidAt).toISOString(),
        bankAccountId: bankAccountId || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        recordedBy: userName,
      });
      onSaved();
    } catch (err: any) {
      showToast(`Error: ${err?.message ?? err}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Registrar transferencia — ${period}`} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Fecha del giro"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
          <Input
            label="Monto (COP)"
            placeholder="$ 0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {bankAccounts.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase">Cuenta destino</label>
            <select
              className="w-full h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank} · {b.accountType === 'savings' ? 'Ahorros' : 'Corriente'} · {b.accountNumber} · {b.holderName}
                </option>
              ))}
            </select>
          </div>
        )}
        <Input
          label="Referencia / Comprobante"
          placeholder="Ej: TRF-2026-001234"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <Input
          label="Notas (opcional)"
          placeholder="Ej: Pago parcial — resto programado para día 20"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="pt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : 'Registrar transferencia'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}