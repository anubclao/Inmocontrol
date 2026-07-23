import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, FileText, Calendar, AlertTriangle, CheckCircle, Eye, ClipboardCheck, Clock, X, Edit, Download } from 'lucide-react';
import { Button, Card, Input, Modal } from '../../shared/ui';
import { useContractStore } from './contractStore';
import { useAppStore } from '../../shared/store/appStore';
import { deriveContractStatus, type Contract, type ContractStatus, type RenewalStrategy } from './contractTypes';
import { generateContractPdf } from './contractPdf';
import { Role, can } from '../auth/permissions';
import { formatCurrency } from '../../utils/calculations';
import { createContractServer, updateContractServer } from './contractApi';
import { ProcessOrderBanner } from '../../shared/ui/ProcessOrderBanner';

export interface ContractsViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  properties: any[];
  tenants: any[];
  role: Role | null;
  onStartInventoryEnd: (contract: Contract) => void;
}

export function ContractsView({ showToast, properties: propsProperties, tenants: propsTenants, role, onStartInventoryEnd }: ContractsViewProps) {
  const { contracts, addContract, updateContract, setStatus } = useContractStore();
  // Leemos del store de Zustand primero (datos del seed), con fallback a las
  // props que pasa App.tsx. Esto evita el bug de "N/A" cuando el modal se
  // abre antes de que App.tsx termine de hidratar el useState desde
  // localStorage.
  const storeProperties = useAppStore((s) => s.properties);
  const storeTenants = useAppStore((s) => s.tenants);
  const properties = storeProperties.length > 0 ? storeProperties : propsProperties;
  const tenants = storeTenants.length > 0 ? storeTenants : propsTenants;
  const [filter, setFilter] = useState<'all' | ContractStatus>('all');
  const [editing, setEditing] = useState<Contract | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Contract | null>(null);

  const enriched = useMemo(() => contracts.map((c) => ({ contract: c, info: deriveContractStatus(c) })), [contracts]);

  const filtered = useMemo(() => {
    if (filter === 'all') return enriched;
    return enriched.filter((e) => e.info.status === filter);
  }, [enriched, filter]);

  const stats = useMemo(() => ({
    total: contracts.length,
    active: enriched.filter((e) => e.info.status === 'active').length,
    expiring: enriched.filter((e) => e.info.status === 'expiring').length,
    expired: enriched.filter((e) => e.info.status === 'expired').length,
    needsInventory: enriched.filter((e) => e.info.needsInventoryEnd).length,
  }), [contracts, enriched]);

  const propertyName = (id: string) => properties.find((p: any) => p.id === id)?.address ?? 'N/A';
  const tenantName = (id: string) => tenants.find((t: any) => t.id === id)?.name ?? 'N/A';

  const handleDownloadPdf = async (contract: Contract) => {
    const property = properties.find((p: any) => p.id === contract.propertyId);
    const tenant = tenants.find((t: any) => t.id === contract.tenantId);
    if (!property || !tenant) {
      showToast('No se puede generar el PDF: faltan datos del inmueble o inquilino', 'error');
      return;
    }
    try {
      await generateContractPdf({
        contract,
        property: { address: property.address, owner: property.owner, chip: property.chip, ownerIdNumber: property.ownerIdNumber },
        tenant: { name: tenant.name, documentId: tenant.documentId, email: tenant.email, phone: tenant.phone },
      });
      showToast('PDF del contrato generado', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al generar el PDF del contrato', 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Contratos de Arrendamiento</h2>
          <p className="text-slate-500 text-sm">Vigencia, vencimientos e Inventarios Finales</p>
        </div>
        {/*
          IMPORTANTE: el botón "Nuevo Contrato" está OCULTO a propósito.
          El contrato NO se crea manualmente desde acá. Se genera
          AUTOMÁTICAMENTE al firmar el Inventario de Colocación (en el
          módulo de Arrendatarios). El orden legal del proceso es:
            1. Propiedad con mandato firmado (status=Activo)
            2. Crear tenant (status=En Colocación)
            3. Subir cédula del tenant
            4. Firmar Inventario de Colocación (arrendatario + agente)
               → AQUÍ se crea el contrato (status=active) y la propiedad
                 pasa a "Arrendado"
            5. Recién con contrato activo se puede operar billing/recibos
          Permitir crear contratos desde acá violaría ese orden: el
          contrato existiría sin que el arrendatario haya firmado el
          inventario, lo cual es ilegal y operativamente confuso.
        */}
      </div>

      {/* Banner explicando el nuevo orden — mismo ProcessOrderBanner que los otros módulos */}
      <ProcessOrderBanner
        currentStep="contracts"
        title="Paso 3 (automático): Contrato generado al firmar Inventario de Colocación"
        description="Los contratos NO se crean manualmente desde acá. Se generan automáticamente al firmar el Inventario de Colocación del arrendatario (paso 2/3). Esto garantiza que el contrato siempre exista junto con un arrendamiento legalmente cerrado. Desde este módulo podés consultar los contratos existentes y editar fechas o condiciones especiales."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile label="Total" value={stats.total} icon={<FileText className="w-4 h-4" />} />
        <StatTile label="Vigentes" value={stats.active} icon={<CheckCircle className="w-4 h-4" />} tone="ok" />
        <StatTile label="Por vencer" value={stats.expiring} icon={<Clock className="w-4 h-4" />} tone="warn" />
        <StatTile label="Vencidos" value={stats.expired} icon={<X className="w-4 h-4" />} tone="bad" />
        <StatTile label="Req. Inv. Final" value={stats.needsInventory} icon={<ClipboardCheck className="w-4 h-4" />} tone="warn" />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'active', 'expiring', 'expired', 'terminated', 'draft'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-bold uppercase rounded-full whitespace-nowrap transition-all ${
              filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f === 'all' ? 'Todos' : f === 'active' ? 'Vigentes' : f === 'expiring' ? 'Por vencer' : f === 'expired' ? 'Vencidos' : f === 'terminated' ? 'Terminados' : 'Borrador'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-700">No hay contratos {filter !== 'all' ? filter : ''}</h3>
          <p className="text-sm text-slate-500 mt-1">Crea uno para empezar a gestionar vigencias.</p>
          {can(role, 'canAddProperty') && (
            <Button className="mt-4 gap-2" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" />Crear primer contrato
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ contract, info }) => (
            <ContractRow
              key={contract.id}
              contract={contract}
              info={info}
              propertyName={propertyName(contract.propertyId)}
              tenantName={tenantName(contract.tenantId)}
              onView={() => setViewing(contract)}
              onEdit={() => setEditing(contract)}
              onStartInventoryEnd={() => onStartInventoryEnd(contract)}
              onTerminate={() => { setStatus(contract.id, 'terminated'); showToast('Contrato terminado anticipadamente'); }}
              onDownloadPdf={() => handleDownloadPdf(contract)}
            />
          ))}
          {/* `key` consumido por React, no se pasa al componente */}
        </div>
      )}

      {/* Modales */}
      {creating && (
        <ContractForm
          onClose={() => setCreating(false)}
          onSave={async (c) => {
            // Persistir primero en MySQL — si el server rechaza, NO creamos
            // el contrato local (queda fantasma). Razón: el billing necesita
            // el contrato en MySQL para que la FK de amortization_rows resuelva.
            try {
              const created = await createContractServer(c);
              addContract(created);
              setCreating(false);
              showToast('Contrato creado');
            } catch (err: any) {
              console.error('[ContractsView] createContract failed:', err);
              showToast(
                err?.message ?? 'No se pudo crear el contrato en el servidor',
                'error',
              );
            }
          }}
          properties={properties}
          tenants={tenants}
        />
      )}
      {editing && (
        <ContractForm
          contract={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            try {
              const updated = await updateContractServer(c.id, c);
              updateContract(c.id, updated);
              setEditing(null);
              showToast('Contrato actualizado');
            } catch (err: any) {
              console.error('[ContractsView] updateContract failed:', err);
              showToast(
                err?.message ?? 'No se pudo actualizar el contrato en el servidor',
                'error',
              );
            }
          }}
          properties={properties}
          tenants={tenants}
        />
      )}
      {viewing && (
        <ContractDetail
          contract={viewing}
          onClose={() => setViewing(null)}
          propertyName={propertyName(viewing.propertyId)}
          tenantName={tenantName(viewing.tenantId)}
          onDownloadPdf={() => handleDownloadPdf(viewing)}
        />
      )}
    </motion.div>
  );
}

function StatTile({ label, value, icon, tone = 'neutral' }: { label: string; value: number; icon: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const colors = {
    ok: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    warn: 'bg-amber-50 border-amber-100 text-amber-900',
    bad: 'bg-red-50 border-red-100 text-red-900',
    neutral: 'bg-slate-50 border-slate-100 text-slate-900',
  }[tone];
  return (
    <div className={`p-3 rounded-lg border ${colors}`}>
      <div className="flex items-center gap-2 opacity-70 mb-1">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

function ContractRow({
  contract, info, propertyName, tenantName,
  onView, onEdit, onStartInventoryEnd, onTerminate, onDownloadPdf,
}: {
  contract: Contract;
  info: ReturnType<typeof deriveContractStatus>;
  propertyName: string;
  tenantName: string;
  onView: () => void;
  onEdit: () => void;
  onStartInventoryEnd: () => void;
  onTerminate: () => void;
  onDownloadPdf: () => void;
  key?: React.Key;
}) {
  const statusBadge = {
    active: { label: 'Vigente', bg: 'bg-emerald-100', text: 'text-emerald-700' },
    expiring: { label: `Vence en ${info.daysToEnd}d`, bg: 'bg-amber-100', text: 'text-amber-700' },
    expired: { label: 'Vencido', bg: 'bg-red-100', text: 'text-red-700' },
    terminated: { label: 'Terminado', bg: 'bg-slate-200', text: 'text-slate-700' },
    draft: { label: 'Borrador', bg: 'bg-slate-100', text: 'text-slate-600' },
  }[info.status];

  return (
    <Card className={`p-4 ${info.needsInventoryEnd ? 'border-amber-300 bg-amber-50/30' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-slate-900 truncate">{propertyName}</h3>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusBadge.bg} ${statusBadge.text}`}>
              {statusBadge.label}
            </span>
            {info.isNoticeDue && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Preaviso pendiente
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Inquilino: <span className="font-bold">{tenantName}</span> · Canon: <span className="font-bold">{formatCurrency(contract.rentAmount)}</span>
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <Calendar className="w-3 h-3" />
            {new Date(contract.startDate).toLocaleDateString('es-CO')} → {new Date(contract.endDate).toLocaleDateString('es-CO')}
          </p>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap">
          {info.needsInventoryEnd && (
            <Button
              size="sm"
              className="gap-2 bg-amber-500 hover:bg-amber-600"
              onClick={onStartInventoryEnd}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Iniciar Inv. Final
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onDownloadPdf} className="text-blue-600 border-blue-200 hover:bg-blue-50" aria-label="Descargar Contrato PDF">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={onView}><Eye className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={onEdit}><Edit className="w-3.5 h-3.5" /></Button>
          {info.status === 'active' && (
            <Button size="sm" variant="ghost" className="text-red-600" onClick={onTerminate}>
              Terminar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ContractForm({
  contract, onClose, onSave, properties, tenants,
}: {
  contract?: Contract;
  onClose: () => void;
  onSave: (c: Contract) => void;
  properties: any[];
  tenants: any[];
}) {
  const [form, setForm] = useState<Contract>(contract ?? {
    id: `contract-${Date.now()}`,
    propertyId: properties.find((p: any) => p.status !== 'Arrendado')?.id ?? '',
    tenantId: tenants[0]?.id ?? '',
    // BUG HISTÓRICO: estos defaults estaban hardcodeados (1_696_037 / 250_000)
    // y generaban desfase con el canon real del tenant. Ahora arrancan en 0
    // y se autocompletan abajo cuando el usuario elige un inquilino + propiedad.
    rentAmount: 0,
    adminFee: 0,
    commissionPct: 8,
    insurancePct: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split('T')[0]; })(),
    status: 'draft',
    renewalStrategy: 'manual',
    inventoryEndRequired: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  /**
   * Si el usuario eligió un tenant que ya tiene canon + adminFee cargados,
   * prellenamos los campos del contrato para evitar el bug histórico donde
   * el contrato arrancaba con valores fantasma ($1.696.037 / $250.000) y el
   * canon del tenant quedaba desfasado.
   *
   * NO pisamos si el form ya tiene un rentAmount válido (>0) — eso es la
   * señal de que el usuario ya tocó el campo y no queremos sobrescribir.
   */
  const onTenantChange = (tenantId: string) => {
    const t = tenants.find((x: any) => x.id === tenantId);
    setForm((f) => ({
      ...f,
      tenantId,
      rentAmount: f.rentAmount > 0 ? f.rentAmount : Number(t?.rent ?? 0) || 0,
      adminFee: f.adminFee > 0 ? f.adminFee : Number(t?.adminFee ?? 0) || 0,
    }));
  };

  /**
   * FIX Karpathy (jul-2026): al elegir una PROPIEDAD en el select, autollenar
   * el tenant activo + canon + adminFee. Antes solo se autollenaba al cambiar
   * el tenant (onTenantChange), pero la realidad operativa es: el agente
   * primero elige la propiedad y los valores deberían venir solos.
   *
   * Mismo patrón de "no pisar" que onTenantChange: si el form ya tiene un
   * rentAmount o adminFee válido (>0), respetamos la edición del usuario.
   */
  const onPropertyChange = (propertyId: string) => {
    const t = tenants.find((x: any) => x.propertyId === propertyId && x.status === 'Activo');
    setForm((f) => ({
      ...f,
      propertyId,
      tenantId: t?.id ?? f.tenantId,
      rentAmount: f.rentAmount > 0 ? f.rentAmount : Number(t?.rent ?? 0) || 0,
      adminFee: f.adminFee > 0 ? f.adminFee : Number(t?.adminFee ?? 0) || 0,
    }));
  };

  /**
   * FIX Karpathy (jul-2026): auto-fill al mount del modal. Si el form se
   * inicializa con una propiedad que tiene tenant activo (caso normal del
   * constructor en línea 326-344), queremos que los campos lleguen
   * pre-llenados, NO en cero. NO se dispara cuando es edición de un
   * contract existente (ya viene con sus valores).
   */
  useEffect(() => {
    if (contract) return; // edición: no tocar
    if (!form.propertyId) return; // sin propiedad seleccionada
    if (form.rentAmount > 0 || form.adminFee > 0) return; // ya tiene valores
    const t = tenants.find((x: any) => x.propertyId === form.propertyId && x.status === 'Activo');
    if (!t) return;
    setForm((f) => ({
      ...f,
      tenantId: t.id,
      rentAmount: Number(t.rent ?? 0) || 0,
      adminFee: Number(t.adminFee ?? 0) || 0,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // solo al mount

  const handleSave = () => {
    if (!form.propertyId) { alert('Selecciona una propiedad'); return; }
    if (!form.tenantId) { alert('Selecciona un inquilino'); return; }
    if (form.rentAmount <= 0) { alert('El canon debe ser mayor a 0'); return; }
    onSave({ ...form, updatedAt: new Date().toISOString() });
  };

  return (
    <Modal isOpen onClose={onClose} title={contract ? 'Editar Contrato' : 'Nuevo Contrato'} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Propiedad</label>
            <select className="w-full mt-1 h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm" value={form.propertyId} onChange={(e) => onPropertyChange(e.target.value)}>
              <option value="">Seleccionar…</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Inquilino</label>
            <select className="w-full mt-1 h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm" value={form.tenantId} onChange={(e) => onTenantChange(e.target.value)}>
              <option value="">Seleccionar…</option>
              {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput label="Canon mensual" value={form.rentAmount} onChange={(v) => setForm({ ...form, rentAmount: v })} />
          <CurrencyInput label="Administración PH" value={form.adminFee} onChange={(v) => setForm({ ...form, adminFee: v })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Comisión (%)</label>
            <input type="number" min={0} max={30} step={0.5} className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Seguro (%)</label>
            <input type="number" min={0} max={20} step={0.1} className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" value={form.insurancePct} onChange={(e) => setForm({ ...form, insurancePct: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha inicio" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Input label="Fecha fin" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Renovación</label>
            <select className="w-full mt-1 h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm" value={form.renewalStrategy} onChange={(e) => setForm({ ...form, renewalStrategy: e.target.value as RenewalStrategy })}>
              <option value="manual">Manual</option>
              <option value="auto">Automática</option>
              <option value="none">No renovar</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Estado inicial</label>
            <select className="w-full mt-1 h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContractStatus })}>
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.inventoryEndRequired} onChange={(e) => setForm({ ...form, inventoryEndRequired: e.target.checked })} />
          Exigir Inventario Final al terminar el contrato
        </label>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Notas / cláusulas</label>
          <textarea className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" rows={3} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}

function ContractDetail({ contract, onClose, propertyName, tenantName, onDownloadPdf }: { contract: Contract; onClose: () => void; propertyName: string; tenantName: string; onDownloadPdf: () => void }) {
  const info = deriveContractStatus(contract);
  return (
    <Modal isOpen onClose={onClose} title="Detalle del Contrato" size="md">
      <div className="space-y-3 text-sm">
        <Row label="Propiedad" value={propertyName} />
        <Row label="Inquilino" value={tenantName} />
        <Row label="Canon" value={formatCurrency(contract.rentAmount)} />
        <Row label="Administración" value={formatCurrency(contract.adminFee)} />
        <Row label="Comisión" value={`${contract.commissionPct}%`} />
        <Row label="Inicio" value={new Date(contract.startDate).toLocaleDateString('es-CO')} />
        <Row label="Fin" value={new Date(contract.endDate).toLocaleDateString('es-CO')} />
        <Row label="Días para vencer" value={`${info.daysToEnd}`} highlight={info.daysToEnd < 90} />
        <Row label="Renovación" value={contract.renewalStrategy} />
        <Row label="Req. Inv. Final" value={contract.inventoryEndRequired ? 'Sí' : 'No'} />
        {contract.notes && <Row label="Notas" value={contract.notes} />}
      </div>
      <Button className="w-full mt-6 gap-2" onClick={onDownloadPdf}>
        <Download className="w-4 h-4" /> Descargar Contrato PDF
      </Button>
    </Modal>
  );
}

function Row({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2">
      <span className="text-slate-500 text-xs font-bold uppercase">{label}</span>
      <span className={`font-medium ${highlight ? 'text-amber-700' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function CurrencyInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
      <input
        type="text"
        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
        value={value === 0 ? '' : value.toLocaleString('es-CO')}
        onChange={(e) => onChange(parseInt(e.target.value.replace(/[^0-9]/g, '') || '0', 10))}
      />
    </div>
  );
}
