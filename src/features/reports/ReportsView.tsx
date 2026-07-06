import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { motion } from 'motion/react';
import { Download, FileText } from 'lucide-react';
import { Button, Card, Input } from '../../shared/ui';
import { ProcessOrderBanner } from '../../shared/ui/ProcessOrderBanner';
import { formatCurrency } from '../../utils/calculations';
import { Role } from '../auth/permissions';

export interface ReportsViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  financialRecords: any[];
  properties: any[];
  role: Role | null;
}

export function ReportsView({ showToast, financialRecords, properties }: ReportsViewProps) {
  const [filter, setFilter] = useState('');

  const filteredRecords = financialRecords.filter((r: any) => {
    const property = properties.find((p: any) => p.id === r.propertyId);
    return (
      r.description.toLowerCase().includes(filter.toLowerCase()) ||
      property?.address.toLowerCase().includes(filter.toLowerCase()) ||
      property?.owner.toLowerCase().includes(filter.toLowerCase())
    );
  });

  const totalIncome = financialRecords
    .filter((r: any) => r.type === 'Ingreso')
    .reduce((acc: number, r: any) => acc + r.amount, 0);
  const activeContracts = properties.filter((p: any) => p.status === 'Activo').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* ── Banner de orientación: este módulo consume datos consolidados ── */}
      <ProcessOrderBanner
        currentStep="reports"
        title="Paso 6: Reportes y análisis consolidado"
        description="Acá se ven los reportes ejecutivos: contratos activos, ingresos esperados, cartera en mora, etc. Los datos que muestra vienen de los pasos anteriores (Billing + Finanzas). Si los reportes están vacíos, es porque los módulos anteriores no tienen datos — revisá que haya contratos activos con amortización generada y pagos registrados."
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">Reportes y Secretaría del Hábitat</h2>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none gap-2" onClick={() => showToast('Exportando CSV...')}>
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
          <Button className="flex-1 sm:flex-none gap-2" onClick={() => showToast('Generando reporte para Secretaría...')}>
            <FileText className="w-4 h-4" />
            Reporte Anual Hábitat
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-l-4 border-l-blue-500">
          <h4 className="text-xs font-bold text-slate-400 uppercase">Total Contratos Activos</h4>
          <p className="text-3xl font-bold mt-2">{activeContracts}</p>
          <p className="text-xs text-slate-500 mt-1">Vigencia 2026</p>
        </Card>
        <Card className="p-6 border-l-4 border-l-emerald-500">
          <h4 className="text-xs font-bold text-slate-400 uppercase">Recaudo Mensual</h4>
          <p className="text-3xl font-bold mt-2">{formatCurrency(totalIncome)}</p>
          <p className="text-xs text-emerald-600 mt-1">98% Efectividad</p>
        </Card>
        <Card className="p-6 border-l-4 border-l-amber-500">
          <h4 className="text-xs font-bold text-slate-400 uppercase">Alertas de Secretaría</h4>
          <p className="text-3xl font-bold mt-2">0</p>
          <p className="text-xs text-slate-500 mt-1">Cumplimiento 100%</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold">Histórico de Estados de Cuenta</h3>
          <Input
            placeholder="Filtrar por inmueble o propietario..."
            className="w-full sm:w-64"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px]">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th className="px-6 py-3">Inmueble</th>
                <th className="px-6 py-3">Propietario</th>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3">Descripción</th>
                <th className="px-6 py-3">Monto</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map((record: any) => {
                const property = properties.find((p: any) => p.id === record.propertyId);
                return (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium">{property?.address || '---'}</td>
                    <td className="px-6 py-4">{property?.owner || '---'}</td>
                    <td className="px-6 py-4">{record.date}</td>
                    <td className="px-6 py-4">{record.description}</td>
                    <td className={`px-6 py-4 font-bold ${record.type === 'Ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {record.type === 'Egreso' ? '-' : ''}{formatCurrency(record.amount)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-600"
                        onClick={() => {
                          try {
                            const doc = new jsPDF();
                            doc.setFontSize(18);
                            doc.text('Comprobante Contable - Inmocontrol', 20, 20);
                            doc.setFontSize(12);
                            doc.text(`Fecha: ${record.date}`, 20, 35);
                            doc.text(`Inmueble: ${property?.address}`, 20, 45);
                            doc.text(`Descripción: ${record.description}`, 20, 55);
                            doc.text(`Monto: ${formatCurrency(record.amount)}`, 20, 65);
                            doc.save(`Comprobante_${record.id}.pdf`);
                            showToast('PDF generado');
                          } catch {
                            showToast('Error al generar PDF', 'error');
                          }
                        }}
                      >
                        Ver PDF
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
}
