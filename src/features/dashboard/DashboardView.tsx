// filepath: src/features/dashboard/DashboardView.tsx
import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { motion } from 'motion/react';
import {
  Wallet, TrendingUp, ClipboardCheck, Bell, ArrowUpRight, Download, Plus,
  AlertTriangle, Crown,
} from 'lucide-react';
import { Button, Card, Modal } from '../../shared/ui';
import { formatCurrency } from '../../utils/calculations';
import { can, Role } from '../auth/permissions';
import { selectVisibleAlerts, useAlertsStore } from '../alerts/alertsStore';
import { useSaasBillingStore, selectPlanUsage } from '../saasBilling/saasBillingStore';
import { AlertsModalBody } from './components/AlertsModalBody';

export interface DashboardViewProps {
  onNewCapture: () => void;
  onNavigateToAlerts: () => void;
  properties: any[];
  tenants: any[];
  financialRecords: any[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  role: Role | null;
}

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
