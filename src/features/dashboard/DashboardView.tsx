import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet, TrendingUp, ClipboardCheck, Bell, ArrowUpRight, Download, Plus,
  AlertTriangle, Clock, FileX, DollarSign, X, ExternalLink, Inbox,
  Crown,
} from 'lucide-react';
import { Button, Card, Modal } from '../../shared/ui';
import { formatCurrency } from '../../utils/calculations';
import { can, Role } from '../auth/permissions';
import { selectVisibleAlerts, useAlertsStore } from '../alerts/alertsStore';
import {
  ALERT_CATEGORY_LABEL,
  type Alert,
  type AlertCategory,
  type AlertSeverity,
} from '../alerts/types';
import { useSaasBillingStore, selectPlanUsage } from '../saasBilling/saasBillingStore';

export interface DashboardViewProps {
  onNewCapture: () => void;
  onNavigateToAlerts: () => void;
  properties: any[];
  tenants: any[];
  financialRecords: any[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  role: Role | null;
}

const CATEGORY_ICON: Record<AlertCategory, any> = {
  mora: DollarSign,
  vencimiento: Clock,
  preaviso: AlertTriangle,
  documento: FileX,
  pago: Bell,
};

const SEVERITY_BADGE: Record<AlertSeverity, { label: string; cls: string }> = {
  critical: { label: 'Crítica', cls: 'bg-red-100 text-red-700 border-red-200' },
  warning: { label: 'Alerta', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  info: { label: 'Info', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
};

export function DashboardView({
  onNewCapture, onNavigateToAlerts, properties, tenants, financialRecords, showToast, role,
}: DashboardViewProps) {
  const totalIncome = financialRecords
    .filter((r: any) => r.type === 'Ingreso')
    .reduce((acc: number, r: any) => acc + r.amount, 0);
  const totalExpense = financialRecords
    .filter((r: any) => r.type === 'Egreso')
    .reduce((acc: number, r: any) => acc + r.amount, 0);
  const balance = totalIncome - totalExpense;

  // ── Alertas reales (derivadas, filtradas por dismissed) ──
  const visibleAlerts = useAlertsStore(selectVisibleAlerts);
  const allCount = useAlertsStore((s) => s.alerts.length);
  const pendingCount = visibleAlerts.length;
  const dismissedCount = useAlertsStore((s) => s.dismissed.length);

  // ── Plan usage (Fase 8) — banner cuando cerca del límite ──
  const saasState = useSaasBillingStore();
  const planUsage = selectPlanUsage(saasState, properties.length, 1);

  const [alertsModalOpen, setAlertsModalOpen] = useState(false);

  const generateDashboardPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.text('RESUMEN GENERAL - INMOCONTROL', 20, 20);
      doc.setFontSize(12);
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, 30);
      doc.text(`Propiedades: ${properties.length}`, 20, 45);
      doc.text(`Inquilinos Activos: ${tenants.length}`, 20, 55);
      doc.text(`Ingresos Totales: ${formatCurrency(totalIncome)}`, 20, 70);
      doc.text(`Egresos Totales: ${formatCurrency(totalExpense)}`, 20, 80);
      doc.text(`Saldo Neto: ${formatCurrency(balance)}`, 20, 90);
      doc.text(`Alertas pendientes: ${pendingCount}`, 20, 100);
      doc.save('Resumen_General_Inmocontrol.pdf');
      showToast('Reporte exportado correctamente');
    } catch {
      showToast('Error al generar el reporte', 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Resumen General</h2>
          <p className="text-slate-500 text-sm">Resumen general de la plataforma.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none gap-2" onClick={generateDashboardPDF}>
            <Download className="w-4 h-4" />
            Exportar Reporte
          </Button>
          {can(role, 'canAddProperty') && (
            <Button className="flex-1 sm:flex-none gap-2" onClick={onNewCapture}>
              <Plus className="w-4 h-4" />
              Nueva Captación
            </Button>
          )}
        </div>
      </div>

      {/* ── Plan limits banner (Fase 8) ── */}
      {planUsage.isNearPropertyLimit && (
        <div className={`p-3 rounded-xl border flex items-start gap-3 ${
          planUsage.isAtPropertyLimit
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {planUsage.isAtPropertyLimit ? (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          ) : (
            <Crown className="w-5 h-5 text-amber-600 shrink-0" />
          )}
          <div className="flex-1 text-sm">
            <p className={`font-semibold ${planUsage.isAtPropertyLimit ? 'text-red-900' : 'text-amber-900'}`}>
              {planUsage.isAtPropertyLimit
                ? `Llegaste al límite de tu plan (${planUsage.propertiesLimit} inmuebles)`
                : `Estás cerca del límite de tu plan: ${planUsage.propertiesUsed} / ${planUsage.propertiesLimit} inmuebles`}
            </p>
            <p className={`text-xs ${planUsage.isAtPropertyLimit ? 'text-red-700' : 'text-amber-700'} mt-0.5`}>
              {planUsage.isAtPropertyLimit
                ? 'Actualizá tu plan en Configuración → Facturación y Plan para seguir agregando inmuebles.'
                : 'Considerá subir de plan antes de llegar al tope.'}
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              +12.5%
            </span>
          </div>
          <p className="text-sm text-slate-500 font-medium">Ingresos Totales</p>
          <h3 className="text-2xl font-bold mt-1">{formatCurrency(totalIncome)}</h3>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-red-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">Egresos Totales</p>
          <h3 className="text-2xl font-bold mt-1">{formatCurrency(totalExpense)}</h3>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <ClipboardCheck className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">Saldo a Transferir</p>
          <h3 className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(balance)}</h3>
        </Card>

        {/* ── Alertas Pendientes (REAL, clickable) ── */}
        <button
          type="button"
          onClick={() => setAlertsModalOpen(true)}
          className="text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl"
        >
          <Card className={`p-6 h-full ${pendingCount > 0 ? 'border-amber-200' : ''}`}>
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 rounded-lg ${pendingCount > 0 ? 'bg-amber-50' : 'bg-slate-100'}`}>
                <Bell className={`w-5 h-5 ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
              </div>
              {pendingCount > 0 && (
                <span className="w-6 h-6 bg-amber-500 text-white text-[11px] flex items-center justify-center rounded-full font-bold">
                  {pendingCount}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 font-medium">Alertas Pendientes</p>
            <h3 className={`text-2xl font-bold mt-1 ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {pendingCount > 0 ? 'Acción Requerida' : 'Todo al día'}
            </h3>
            <p className="text-xs text-slate-400 mt-2">
              {pendingCount > 0 ? 'Click para ver detalle' : dismissedCount > 0 ? `${dismissedCount} descartada(s)` : 'Sin alertas activas'}
            </p>
          </Card>
        </button>
      </div>

      {/* Modal de alertas pendientes (drill-down desde el card) */}
      <Modal
        isOpen={alertsModalOpen}
        onClose={() => setAlertsModalOpen(false)}
        title={`Alertas Pendientes (${pendingCount})`}
        size="lg"
      >
        <AlertsModalBody
          visibleAlerts={visibleAlerts}
          allCount={allCount}
          onDismiss={(id) => {
            useAlertsStore.getState().dismiss(id);
            showToast('Alerta descartada');
          }}
          onClearDismissed={() => {
            useAlertsStore.getState().clearDismissed();
            showToast('Alertas descartadas restauradas');
          }}
          onNavigateToAlerts={() => {
            setAlertsModalOpen(false);
            onNavigateToAlerts();
          }}
        />
      </Modal>
    </motion.div>
  );
}

interface AlertsModalBodyProps {
  visibleAlerts: Alert[];
  allCount: number;
  onDismiss: (id: string) => void;
  onClearDismissed: () => void;
  onNavigateToAlerts: () => void;
}

function AlertsModalBody({ visibleAlerts, allCount, onDismiss, onClearDismissed, onNavigateToAlerts }: AlertsModalBodyProps) {
  const dismissedCount = useAlertsStore((s) => s.dismissed.length);

  if (allCount === 0) {
    return (
      <div className="py-12 text-center">
        <div className="inline-flex p-4 bg-emerald-50 rounded-full mb-4">
          <ClipboardCheck className="w-8 h-8 text-emerald-600" />
        </div>
        <h4 className="font-bold text-slate-900 text-lg">Sin alertas activas</h4>
        <p className="text-sm text-slate-500 mt-1">
          No hay mora, vencimientos próximos ni documentos pendientes. El sistema
          seguirá monitoreando y te avisará cuando algo cambie.
        </p>
        <p className="text-xs text-slate-400 mt-4">
          Las alertas se derivan en tiempo real de contratos, facturas y propiedades.
        </p>
      </div>
    );
  }

  if (visibleAlerts.length === 0) {
    return (
      <div className="py-10 text-center space-y-3">
        <div className="inline-flex p-4 bg-slate-100 rounded-full">
          <Inbox className="w-8 h-8 text-slate-400" />
        </div>
        <h4 className="font-bold text-slate-900">Todo descartado</h4>
        <p className="text-sm text-slate-500">
          Hay {allCount} alerta(s) pero todas están marcadas como descartadas.
        </p>
        <Button variant="outline" onClick={onClearDismissed}>Restaurar todas</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Mostrando {visibleAlerts.length} de {allCount} alerta(s) activa(s)
          {dismissedCount > 0 && ` · ${dismissedCount} descartada(s)`}
        </span>
        <button
          type="button"
          onClick={onNavigateToAlerts}
          className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
        >
          Ver todas en Alertas <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
        {visibleAlerts.map((alert) => {
          const Icon = CATEGORY_ICON[alert.category] ?? Bell;
          const badge = SEVERITY_BADGE[alert.severity];
          return (
            <div
              key={alert.id}
              className="flex items-start gap-3 p-4 bg-white hover:bg-slate-50 transition-colors"
            >
              <div className={`p-2 rounded-lg shrink-0 ${
                alert.severity === 'critical' ? 'bg-red-50' :
                alert.severity === 'warning' ? 'bg-amber-50' : 'bg-sky-50'
              }`}>
                <Icon className={`w-4 h-4 ${
                  alert.severity === 'critical' ? 'text-red-600' :
                  alert.severity === 'warning' ? 'text-amber-600' : 'text-sky-600'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-slate-900 truncate">{alert.title}</h4>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase">
                    {ALERT_CATEGORY_LABEL[alert.category]}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{alert.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(alert.id)}
                title="Descartar alerta"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center pt-2">
        <p className="text-xs text-slate-400">
          Las alertas se recalculan automáticamente al cambiar contratos o facturas.
        </p>
        <Button variant="outline" size="sm" onClick={onNavigateToAlerts} className="gap-1">
          Ir a Alertas <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
