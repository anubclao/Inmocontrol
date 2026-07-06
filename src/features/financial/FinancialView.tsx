import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { motion } from 'motion/react';
import {
  Edit, Trash2, Wallet, FileText, AlertCircle, ClipboardCheck, CheckCircle,
  ChevronRight, Plus, Calculator,
} from 'lucide-react';
import { Button, Card, Input, Modal } from '../../shared/ui';
import { ProcessOrderBanner } from '../../shared/ui/ProcessOrderBanner';
import { formatCurrency } from '../../utils/calculations';
import { Role } from '../auth/permissions';
import { LiquidacionMensual } from './LiquidacionMensual';
import {
  addPropertyCharge,
  removePropertyCharge,
  listPropertyCharges,
  logAction,
} from '../billing/api';
import { NovedadFormModal } from '../billing/components/NovedadFormModal';
import type { PropertyCharge } from '../billing/types';

export interface FinancialViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  financialRecords: any[];
  properties: any[];
  onAddRecord: (record: any) => void;
  onDeleteRecord: (id: string) => void;
  onUpdateRecord: (record: any) => void;
  onCloseMonth: (propertyId: string, month: string) => void;
  onOpenMonth: (propertyId: string, month: string) => void;
  closedMonths: string[];
  openedMonths: string[];
  role: Role | null;
}

const MONTH_FORMATTER = (d: Date) => d.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

export function FinancialView({
  showToast, financialRecords, properties,
  onAddRecord, onDeleteRecord, onUpdateRecord,
  onCloseMonth, onOpenMonth,
  closedMonths, openedMonths,
  role,
}: FinancialViewProps) {
  const [liquidacionOpen, setLiquidacionOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [filterPropertyId, setFilterPropertyId] = useState('');
  const [type, setType] = useState<'Ingreso' | 'Egreso'>('Egreso');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [recordToDelete, setRecordToDelete] = useState<any>(null);
  const [baseValue, setBaseValue] = useState('');
  const [increase, setIncrease] = useState('');
  const [viewDate, setViewDate] = useState(new Date());
  // ─── Estado del modal unificado de Novedades (Fase 12+) ───
  const [novedadPropertyId, setNovedadPropertyId] = useState('');
  const [novedadOpen, setNovedadOpen] = useState(false);
  const [novedadChargesByProp, setNovedadChargesByProp] = useState<Record<string, PropertyCharge[]>>({});

  const currentMonth = MONTH_FORMATTER(viewDate);
  const getPreviousMonth = (date: Date) => {
    const prev = new Date(date);
    prev.setMonth(prev.getMonth() - 1);
    return MONTH_FORMATTER(prev);
  };

  const isMonthOpened = (propId: string, month: string) => openedMonths.includes(`${propId}-${month}`);
  const isMonthClosed = (propId: string, month: string) => closedMonths.includes(`${propId}-${month}`);
  const isCurrentViewOpened = filterPropertyId ? isMonthOpened(filterPropertyId, currentMonth) : false;
  const isCurrentViewClosed = filterPropertyId ? isMonthClosed(filterPropertyId, currentMonth) : false;

  const filteredRecords = financialRecords.filter((r: any) => {
    const recordDate = new Date(r.date);
    const matchesProperty = filterPropertyId ? r.propertyId === filterPropertyId : true;
    const matchesMonth = recordDate.getMonth() === viewDate.getMonth() && recordDate.getFullYear() === viewDate.getFullYear();
    return matchesProperty && matchesMonth;
  });

  const handleAddRecord = () => {
    if (!selectedPropertyId) {
      showToast('Seleccione un inmueble', 'error');
      return;
    }
    const recordMonth = MONTH_FORMATTER(viewDate);
    if (!isMonthOpened(selectedPropertyId, recordMonth)) {
      showToast(`El mes de ${recordMonth} no ha sido abierto para este inmueble.`, 'error');
      return;
    }
    if (isMonthClosed(selectedPropertyId, recordMonth)) {
      showToast(`El mes de ${recordMonth} está cerrado para este inmueble. No se pueden agregar más registros.`, 'error');
      return;
    }

    let finalAmount = parseFloat(amount.replace(/[^0-9]/g, '')) || 0;
    let finalDescription = description;

    if (category === 'Administración PH') {
      const base = parseFloat(baseValue.replace(/[^0-9]/g, '')) || 0;
      const inc = parseFloat(increase.replace(/[^0-9]/g, '')) || 0;
      finalAmount = base + inc;
      finalDescription = `Administración PH (Base: ${formatCurrency(base)} + Inc: ${formatCurrency(inc)}) - ${description}`;
    } else {
      finalDescription = `${category}: ${description}`;
    }

    if (finalAmount <= 0 || !description || !selectedPropertyId) {
      showToast('Por favor complete los campos obligatorios', 'error');
      return;
    }

    onAddRecord({
      propertyId: selectedPropertyId,
      date: viewDate.toISOString().split('T')[0],
      type,
      amount: finalAmount,
      description: finalDescription,
    });

    showToast('Registro contable guardado correctamente');
    setCategory('');
    setAmount('');
    setDescription('');
    setSelectedPropertyId('');
    setBaseValue('');
    setIncrease('');
  };

  const handleUpdateRecord = () => {
    if (!editingRecord.amount || !editingRecord.description) {
      showToast('Por favor complete los campos obligatorios', 'error');
      return;
    }
    onUpdateRecord(editingRecord);
    setEditingRecord(null);
  };

  // ─── Handlers para el modal unificado de Novedades ──────────────────
  const openNovedad = (propertyId: string) => {
    setNovedadPropertyId(propertyId);
    setNovedadOpen(true);
  };
  const closeNovedad = () => {
    setNovedadOpen(false);
    setNovedadPropertyId('');
  };
  const handleSaveNovedad = async (data: Omit<PropertyCharge, 'id' | 'recordedAt'>) => {
    try {
      const created = await addPropertyCharge(data.propertyId, data);
      setNovedadChargesByProp((prev) => ({
        ...prev,
        [data.propertyId]: [created, ...(prev[data.propertyId] ?? [])],
      }));
      await logAction(
        data.propertyId, 'discount_registered',
        `Novedad de ${formatCurrency(data.amount)} (${data.description}) en ${data.period} — ${data.chargedTo}`,
        role ?? 'agente',
      );
      showToast(`Novedad de ${formatCurrency(data.amount)} registrada`, 'success');
      closeNovedad();
    } catch (err: any) {
      showToast(`Error: ${err?.message ?? err}`, 'error');
    }
  };
  const handleDeleteNovedad = async (propertyId: string, chargeId: string) => {
    try {
      await removePropertyCharge(propertyId, chargeId);
      setNovedadChargesByProp((prev) => ({
        ...prev,
        [propertyId]: (prev[propertyId] ?? []).filter((c) => c.id !== chargeId),
      }));
      showToast('Novedad eliminada', 'success');
    } catch (err: any) {
      showToast(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const totalIncome = filteredRecords.filter((r: any) => r.type === 'Ingreso').reduce((acc: number, r: any) => acc + r.amount, 0);
  const totalExpense = filteredRecords.filter((r: any) => r.type === 'Egreso').reduce((acc: number, r: any) => acc + r.amount, 0);
  const balance = totalIncome - totalExpense;

  const generatePDF = () => {
    setIsGenerating(true);
    showToast('Generando estado de cuenta...');
    try {
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42);
      doc.text('ESTADO DE CUENTA - INMOCONTROL', 20, 20);
      const prop = properties.find((p: any) => p.id === filterPropertyId);
      if (prop) {
        doc.setFontSize(14);
        doc.text(`Inmueble: ${prop.address}`, 20, 35);
      }
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, 45);

      let y = 60;
      doc.setFillColor(248, 250, 252);
      doc.rect(20, y, 170, 10, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('CONCEPTO', 25, y + 7);
      doc.text('VALOR', 160, y + 7);
      y += 15;
      doc.setFont('helvetica', 'normal');
      filteredRecords.forEach((record: any) => {
        doc.setTextColor(record.type === 'Ingreso' ? 16 : 239, record.type === 'Ingreso' ? 185 : 68, record.type === 'Ingreso' ? 129 : 68);
        doc.text(record.description, 25, y);
        doc.text(`${record.type === 'Egreso' ? '-' : ''}${formatCurrency(record.amount)}`, 160, y);
        y += 10;
      });
      doc.setDrawColor(226, 232, 240);
      doc.line(20, y, 190, y);
      y += 15;
      doc.setFontSize(16);
      doc.setTextColor(16, 185, 129);
      doc.setFont('helvetica', 'bold');
      doc.text('SALDO NETO', 25, y);
      doc.text(formatCurrency(balance), 160, y);
      doc.save(`Estado_Cuenta_${prop ? prop.address.replace(/\s+/g, '_') : 'Consolidado'}.pdf`);
      showToast('PDF generado con éxito');
    } catch {
      showToast('Error al generar el PDF', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-8"
    >
      {/* ── Banner de orientación: este módulo depende de billing ── */}
      <ProcessOrderBanner
        currentStep="finances"
        title="Paso 5: Liquidación mensual al propietario"
        description="Acá se genera el estado de cuenta del propietario para cada mes: ingresos brutos (canon + administración cobrados al inquilino), descuentos (servicios, mantenimiento, impuestos, comisión), y neto a pagar. Consume los datos que se cargaron en el módulo Billing (paso 4). Si no hay amortización ni pagos generados en Billing, este módulo no va a tener datos para mostrar."
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Módulo Financiero</h2>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Periodo: <span className="text-blue-600 font-bold">{currentMonth}</span>
            </p>
            <div className="flex gap-1">
              <button onClick={() => setViewDate(new Date())} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors mr-1">Hoy</button>
              <button onClick={() => { const prev = new Date(viewDate); prev.setMonth(prev.getMonth() - 1); setViewDate(prev); }} className="p-1 hover:bg-slate-100 rounded transition-colors">
                <ChevronRight className="w-4 h-4 rotate-180 text-slate-400" />
              </button>
              <button onClick={() => { const next = new Date(viewDate); next.setMonth(next.getMonth() + 1); setViewDate(next); }} className="p-1 hover:bg-slate-100 rounded transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          {filterPropertyId && (
            <>
              {isCurrentViewClosed ? (
                <Button variant="outline" disabled className="gap-2 bg-emerald-50 text-emerald-700 border-emerald-200 opacity-100">
                  <CheckCircle className="w-4 h-4" />Mes Cerrado
                </Button>
              ) : !isCurrentViewOpened ? (
                <Button
                  variant="outline"
                  className="gap-2 bg-blue-50 text-blue-700 border-blue-200"
                  onClick={() => {
                    const prevMonth = getPreviousMonth(viewDate);
                    const hasPreviousRecords = financialRecords.some((r: any) => {
                      const rDate = new Date(r.date);
                      return r.propertyId === filterPropertyId && rDate.getTime() < new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getTime();
                    });
                    if (hasPreviousRecords && !isMonthClosed(filterPropertyId, prevMonth)) {
                      showToast(`Debe cerrar el mes anterior (${prevMonth}) antes de abrir uno nuevo`, 'error');
                    } else {
                      onOpenMonth(filterPropertyId, currentMonth);
                    }
                  }}
                >
                  <Plus className="w-4 h-4" />Abrir Mes de este Inmueble
                </Button>
              ) : (
                <Button variant="outline" className="gap-2 text-slate-600" onClick={() => onCloseMonth(filterPropertyId, currentMonth)}>
                  <CheckCircle className="w-4 h-4" />Cerrar Mes de este Inmueble
                </Button>
              )}
            </>
          )}
          <Button variant="outline" className="gap-2" onClick={generatePDF} disabled={isGenerating}>
            {isGenerating ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> : <FileText className="w-4 h-4" />}
            {isGenerating ? 'Generando...' : 'Generar Estado de Cuenta PDF'}
          </Button>
          {filterPropertyId && (
            <Button
              variant="outline"
              className="gap-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              onClick={() => setLiquidacionOpen(true)}
            >
              <Calculator className="w-4 h-4" />
              Liquidar Mes
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <h3 className="font-bold text-lg">Cálculo de Estado de Cuenta</h3>
            <select className="text-xs font-bold bg-slate-100 border-none rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20" value={filterPropertyId} onChange={(e) => setFilterPropertyId(e.target.value)}>
              <option value="">Todos los Inmuebles</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
          </div>
          <div className="space-y-4">
            {filteredRecords.map((record: any, i: number) => (
              <div key={i} className={`group flex justify-between items-center p-3 rounded-lg ${record.type === 'Ingreso' ? 'bg-emerald-50/50' : 'bg-red-50/50'}`}>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-900">{record.description}</span>
                  <span className="text-[10px] text-slate-500">{record.date}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-bold ${record.type === 'Ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {record.type === 'Egreso' ? '-' : ''}{formatCurrency(record.amount)}
                  </span>
                  {!isMonthClosed(record.propertyId, MONTH_FORMATTER(viewDate)) && isMonthOpened(record.propertyId, MONTH_FORMATTER(viewDate)) && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingRecord(record)} className="p-1 text-slate-400 hover:text-blue-600 transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setRecordToDelete(record)} className="p-1 text-slate-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filteredRecords.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                <Wallet className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No hay registros para este criterio.</p>
              </div>
            )}
            <div className="mt-6 pt-6 border-t-2 border-dashed border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-slate-900">Saldo Neto</span>
                <span className={`text-2xl font-black ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(balance)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className={`p-6 ${selectedPropertyId && (!isMonthOpened(selectedPropertyId, MONTH_FORMATTER(viewDate)) || isMonthClosed(selectedPropertyId, MONTH_FORMATTER(viewDate))) ? 'opacity-50 pointer-events-none' : ''}`}>
            <h3 className="font-bold mb-4">Registro de Novedad Contable</h3>
            {selectedPropertyId && !isMonthOpened(selectedPropertyId, MONTH_FORMATTER(viewDate)) && (
              <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                Debe abrir el mes de {MONTH_FORMATTER(viewDate)} para este inmueble antes de registrar novedades.
              </div>
            )}
            {selectedPropertyId && isMonthClosed(selectedPropertyId, MONTH_FORMATTER(viewDate)) && (
              <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium">
                El mes de {MONTH_FORMATTER(viewDate)} está cerrado para este inmueble. No se pueden registrar nuevas novedades.
              </div>
            )}
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <button onClick={() => setType('Ingreso')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${type === 'Ingreso' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Ingreso</button>
                <button onClick={() => setType('Egreso')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${type === 'Egreso' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}>Egreso</button>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Inmueble</label>
                <select className="w-full h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Categoría</label>
                  <select
                    className="w-full h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                    value={category}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCategory(val);
                      if (val === 'Administración PH') { setBaseValue('150000'); setIncrease('10000'); }
                    }}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="Administración PH">Administración PH</option>
                    <option value="Servicios Públicos">Servicios Públicos</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="Canon de Arrendamiento">Canon de Arrendamiento</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
                {category === 'Administración PH' ? (
                  <Input label="Valor Base" placeholder="$ 0" value={baseValue} onChange={(e) => setBaseValue(e.target.value)} />
                ) : (
                  <Input label="Valor" placeholder="$ 0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                )}
              </div>
              {category === 'Administración PH' && (
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Incremento" placeholder="$ 0" value={increase} onChange={(e) => setIncrease(e.target.value)} />
                  <div className="flex items-end pb-2">
                    <div className={`w-full p-2 border rounded-lg flex items-center gap-2 ${new Date().getDate() <= 5 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                      <AlertCircle className={`w-4 h-4 ${new Date().getDate() <= 5 ? 'text-emerald-600' : 'text-red-600'}`} />
                      <span className={`text-[10px] font-bold uppercase leading-tight ${new Date().getDate() <= 5 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {new Date().getDate() <= 5 ? 'Alerta: Descuento por pronto pago disponible hasta el día 5' : 'Alerta: Plazo de descuento por pronto pago vencido (Día 5)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <Input label="Descripción" placeholder="Ej: Cambio de grifería cocina" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="p-8 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-all cursor-pointer">
                <Plus className="w-8 h-8 mb-2" />
                <span className="text-xs font-bold uppercase">Adjuntar Factura/Recibo</span>
              </div>
              <Button className="w-full" onClick={handleAddRecord}>Registrar Movimiento</Button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-white px-2 text-slate-500">o usá el formulario unificado</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                disabled={!selectedPropertyId}
                onClick={() => openNovedad(selectedPropertyId)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Registrar novedad de cargo (sistema unificado)
              </Button>
            </div>
          </Card>

          <Card className="p-6 bg-emerald-50 border-emerald-100">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <ClipboardCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-bold text-emerald-900">Validación Secretaría del Hábitat</h4>
                <p className="text-sm text-emerald-700 mt-1">
                  Todos los movimientos contables están siendo auditados y preparados para el reporte anual de la Secretaría.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal isOpen={!!editingRecord} onClose={() => setEditingRecord(null)} title="Editar Novedad Contable">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</label>
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <button onClick={() => setEditingRecord({ ...editingRecord, type: 'Ingreso' })} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${editingRecord?.type === 'Ingreso' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Ingreso</button>
                <button onClick={() => setEditingRecord({ ...editingRecord, type: 'Egreso' })} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${editingRecord?.type === 'Egreso' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}>Egreso</button>
              </div>
            </div>
            <Input label="Valor" value={editingRecord ? formatCurrency(editingRecord.amount) : ''} onChange={(e) => setEditingRecord({ ...editingRecord, amount: parseFloat(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />
          </div>
          <Input label="Descripción" value={editingRecord?.description || ''} onChange={(e) => setEditingRecord({ ...editingRecord, description: e.target.value })} />
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingRecord(null)}>Cancelar</Button>
            <Button onClick={handleUpdateRecord}>Guardar Cambios</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!recordToDelete} onClose={() => setRecordToDelete(null)} title="Confirmar Eliminación">
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-100 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-900">¿Está seguro de eliminar este registro?</p>
              <p className="text-xs text-red-700 mt-1">Esta acción no se puede deshacer y afectará el saldo del mes.</p>
            </div>
          </div>
          {recordToDelete && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-600">{recordToDelete.description}</span>
                <span className={`text-xs font-bold ${recordToDelete.type === 'Ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {recordToDelete.type === 'Egreso' ? '-' : ''}{formatCurrency(recordToDelete.amount)}
                </span>
              </div>
            </div>
          )}
          <div className="pt-4 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setRecordToDelete(null)}>Cancelar</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => { onDeleteRecord(recordToDelete.id); setRecordToDelete(null); }}>Eliminar Registro</Button>
          </div>
        </div>
      </Modal>

      {liquidacionOpen && filterPropertyId && (
        <LiquidacionMensual
          propertyId={filterPropertyId}
          property={{
            address: properties.find((p: any) => p.id === filterPropertyId)?.address ?? '',
            owner: properties.find((p: any) => p.id === filterPropertyId)?.owner ?? '',
            ownerIdNumber: properties.find((p: any) => p.id === filterPropertyId)?.ownerIdNumber,
          }}
          financialRecords={financialRecords}
          showToast={showToast}
          onClose={() => setLiquidacionOpen(false)}
        />
      )}

      {/* ─── Modal unificado de Novedades ─── */}
      {novedadOpen && novedadPropertyId && (
        <NovedadFormModal
          propertyId={novedadPropertyId}
          recordedBy={role ?? 'agente'}
          defaultPeriod={`${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`}
          defaultAppliesToInvoice={true}
          isOpen={novedadOpen}
          onClose={closeNovedad}
          onSubmit={handleSaveNovedad}
          onDelete={(chargeId) => handleDeleteNovedad(novedadPropertyId, chargeId)}
        />
      )}
    </motion.div>
  );
}
