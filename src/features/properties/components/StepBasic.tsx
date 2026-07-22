import { Button } from '../../../shared/ui';
import { formatAddress, isValidCHIP } from '../../../utils/validators';
import { PROPERTY_TYPES, type PropertyType } from '../inventoryConfig';
import { Plus, Trash2, Car, Package, Box, User, Phone, Mail, IdCard, Percent } from 'lucide-react';
import type { PropertyUnitType } from '../../../types';

/** Owner en el wizard (puede tener id temporal `wizard-X` antes del primer POST). */
export interface WizardOwner {
  /** id real (UUID) si ya fue persistido, o `wizard-<ts>-<n>` mientras está en el wizard. */
  id: string;
  name: string;
  idNumber: string;
  phone: string;
  email: string;
  ownershipPct: string; // string en el form (input number), se parsea al mandar
}

export interface WizardUnit {
  id: string;
  type: PropertyUnitType;
  label: string;
  folioMatricula: string;
  areaM2: string;
}

export interface StepBasicProps {
  address: string;
  setAddress: (v: string) => void;
  chip: string;
  setChip: (v: string) => void;
  folio: string;
  setFolio: (v: string) => void;
  propertyType: PropertyType;
  setPropertyType: (v: PropertyType) => void;
  // N propietarios
  owners: WizardOwner[];
  setOwners: (v: WizardOwner[]) => void;
  // N unidades adicionales
  units: WizardUnit[];
  setUnits: (v: WizardUnit[]) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onContinue: () => void;
  /** Persiste el progreso del paso 1 (datos básicos) sin avanzar. El padre
   *  ya hace autosave en localStorage; este botón es un "checkpoint" explícito
   *  que muestra confirmación al usuario. */
  onSaveDraft: () => void;
}

/** Catálogo de tipos de unidad con etiqueta legible. */
const UNIT_TYPE_LABELS: Record<PropertyUnitType, { label: string; icon: typeof Car }> = {
  parking: { label: 'Garaje', icon: Car },
  storage: { label: 'Depósito', icon: Package },
  other:   { label: 'Otro',    icon: Box },
};

const genWizardId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export function StepBasic({
  address, setAddress,
  chip, setChip,
  folio, setFolio,
  propertyType, setPropertyType,
  owners, setOwners,
  units, setUnits,
  showToast, onContinue, onSaveDraft,
}: StepBasicProps) {
  const validate = () => {
    if (!address || !chip || !folio) {
      showToast('Por favor complete dirección, CHIP y folio', 'error');
      return;
    }
    if (!isValidCHIP(chip)) {
      showToast('El CHIP debe iniciar con AAA y tener entre 10 y 11 caracteres (Ej: AAA0148LYN)', 'error');
      return;
    }
    // Al menos 1 propietario con nombre
    const validOwners = owners.filter((o) => o.name.trim().length > 0);
    if (validOwners.length === 0) {
      showToast('Agregá al menos un propietario con nombre', 'error');
      return;
    }
    // Si hay % de participación definido en alguno, validar que la suma sea ~100
    const definedPcts = owners
      .map((o) => Number(o.ownershipPct))
      .filter((n) => !isNaN(n) && n > 0);
    if (definedPcts.length > 0) {
      const sum = definedPcts.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        showToast(
          `Los % de participación suman ${sum.toFixed(2)}% — deberían sumar 100% (o dejá todos vacíos)`,
          'error',
        );
        return;
      }
    }
    onContinue();
  };

  const addOwner = () => {
    setOwners([...owners, { id: genWizardId('wizard-owner'), name: '', idNumber: '', phone: '', email: '', ownershipPct: '' }]);
  };
  const removeOwner = (idx: number) => {
    if (owners.length === 1) {
      showToast('Tiene que haber al menos un propietario', 'error');
      return;
    }
    setOwners(owners.filter((_, i) => i !== idx));
  };
  const updateOwner = (idx: number, patch: Partial<WizardOwner>) => {
    setOwners(owners.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const addUnit = (type: PropertyUnitType) => {
    setUnits([...units, { id: genWizardId('wizard-unit'), type, label: '', folioMatricula: '', areaM2: '' }]);
  };
  const removeUnit = (idx: number) => {
    setUnits(units.filter((_, i) => i !== idx));
  };
  const updateUnit = (idx: number, patch: Partial<WizardUnit>) => {
    setUnits(units.map((u, i) => (i === idx ? { ...u, ...patch } : u)));
  };

  return (
    <div className="p-8">
      <h3 className="font-bold text-lg mb-6">1. Datos Básicos y Validación</h3>
      <div className="space-y-6">
        {/* ── Datos básicos de la propiedad ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo de Inmueble <span className="text-red-500">*</span></label>
            <select
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as PropertyType)}
            >
              {PROPERTY_TYPES.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dirección (Secretaría del Hábitat) <span className="text-red-500">*</span></label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Ej: calle 145 # 13-45"
              value={address}
              onChange={(e) => setAddress(formatAddress(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">CHIP Catastral <span className="text-red-500">*</span></label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Ej: AAA0148LYN"
              value={chip}
              onChange={(e) => setChip(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Folio de Matrícula (unidad principal) <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="50N-12345678"
              value={folio}
              onChange={(e) => setFolio(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs font-bold text-blue-400 uppercase mb-2">Previsualización Legal</p>
          <p className="text-sm font-mono text-blue-900">{address || 'DIRECCIÓN PENDIENTE'}</p>
        </div>

        {/* ── Sección: Propietarios ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700">Propietarios <span className="text-red-500">*</span></p>
              <p className="text-xs text-slate-500 mt-0.5">
                {owners.length === 1
                  ? '1 propietario registrado. Agregá más si la propiedad tiene varios dueños.'
                  : `${owners.length} propietarios registrados. Cada uno firma el Contrato de Mandato (PDF multi-firmado).`}
              </p>
            </div>
            <Button variant="outline" onClick={addOwner} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              Agregar propietario
            </Button>
          </div>

          {owners.map((o, idx) => (
            <div key={o.id} className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </div>
                  <p className="text-xs font-bold text-slate-700">
                    Propietario {idx + 1}
                    {idx === 0 && <span className="ml-1 text-[9px] text-slate-400 font-normal">(principal)</span>}
                  </p>
                </div>
                {owners.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOwner(idx)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Quitar propietario"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Nombre completo <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="Ej: Tatiana Prieto"
                      value={o.name}
                      onChange={(e) => updateOwner(idx, { name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Cédula</label>
                  <div className="relative">
                    <IdCard className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="Ej: 1.023.456.789"
                      value={o.idNumber}
                      onChange={(e) => updateOwner(idx, { idNumber: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Teléfono</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="Ej: 300 123 4567"
                      value={o.phone}
                      onChange={(e) => updateOwner(idx, { phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="ejemplo@correo.com"
                      value={o.email}
                      onChange={(e) => updateOwner(idx, { email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">% de participación (opcional)</label>
                  <div className="relative">
                    <Percent className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="Ej: 50.00 (dejar vacío si no se va a repartir)"
                      inputMode="decimal"
                      value={o.ownershipPct}
                      onChange={(e) => updateOwner(idx, { ownershipPct: e.target.value })}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Si hay 2+ dueños y definís %, la suma tiene que ser 100. Si los dejás vacíos, se asume 100% al primer propietario.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Sección: Unidades adicionales ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700">Unidades adicionales</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Garajes, depósitos u otros con matrícula propia. Cada uno requiere su propio Certificado de Tradición.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addUnit('parking')}
                className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"
              >
                <Car className="w-3.5 h-3.5" />
                + Garaje
              </button>
              <button
                type="button"
                onClick={() => addUnit('storage')}
                className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"
              >
                <Package className="w-3.5 h-3.5" />
                + Depósito
              </button>
              <button
                type="button"
                onClick={() => addUnit('other')}
                className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"
              >
                <Box className="w-3.5 h-3.5" />
                + Otro
              </button>
            </div>
          </div>

          {units.length === 0 ? (
            <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-500 text-center">
              Sin unidades adicionales. Si la propiedad solo es el apartamento/casa, dejá esto vacío.
            </div>
          ) : (
            <div className="space-y-3">
              {units.map((u, idx) => {
                const TypeInfo = UNIT_TYPE_LABELS[u.type];
                const Icon = TypeInfo.icon;
                return (
                  <div key={u.id} className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                          <Icon className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold text-slate-700">
                          {TypeInfo.label} {idx + 1}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeUnit(idx)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Quitar unidad"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1 md:col-span-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Etiqueta <span className="text-red-500">*</span></label>
                        <input
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          placeholder={u.type === 'parking' ? 'Ej: Garaje 12' : u.type === 'storage' ? 'Ej: Depósito 3B' : 'Ej: Cuarto útil'}
                          value={u.label}
                          onChange={(e) => updateUnit(idx, { label: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Matrícula</label>
                        <input
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          placeholder="50N-87654321"
                          value={u.folioMatricula}
                          onChange={(e) => updateUnit(idx, { folioMatricula: e.target.value.toUpperCase() })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Área m²</label>
                        <input
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          placeholder="12.5"
                          inputMode="decimal"
                          value={u.areaM2}
                          onChange={(e) => updateUnit(idx, { areaM2: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => {
              onSaveDraft();
              showToast('✓ Avance guardado en este navegador. Se sube al servidor al finalizar el wizard.', 'success');
            }}
          >
            💾 Guardar avance (este equipo)
          </Button>
          <Button
            className="flex-1"
            onClick={validate}
          >
            Continuar a Documentación
          </Button>
        </div>
      </div>
    </div>
  );
}
