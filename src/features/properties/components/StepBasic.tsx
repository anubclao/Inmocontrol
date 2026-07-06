import { Button } from '../../../shared/ui';
import { formatAddress, isValidCHIP } from '../../../utils/validators';
import { PROPERTY_TYPES, type PropertyType } from '../inventoryConfig';

export interface StepBasicProps {
  address: string;
  setAddress: (v: string) => void;
  chip: string;
  setChip: (v: string) => void;
  folio: string;
  setFolio: (v: string) => void;
  owner: string;
  setOwner: (v: string) => void;
  propertyType: PropertyType;
  setPropertyType: (v: PropertyType) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onContinue: () => void;
}

export function StepBasic({ address, setAddress, chip, setChip, folio, setFolio, owner, setOwner, propertyType, setPropertyType, showToast, onContinue }: StepBasicProps) {
  const validate = () => {
    if (!address || !chip || !folio || !owner) {
      showToast('Por favor complete todos los campos obligatorios', 'error');
      return;
    }
    if (!isValidCHIP(chip)) {
      showToast('El CHIP debe iniciar con AAA y tener entre 10 y 11 caracteres (Ej: AAA0148LYN)', 'error');
      return;
    }
    onContinue();
  };

  return (
    <div className="p-8">
      <h3 className="font-bold text-lg mb-6">1. Datos Básicos y Validación</h3>
      <div className="space-y-6">
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
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre Propietario <span className="text-red-500">*</span></label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Ej: Tatiana Prieto"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dirección (Secretaría del Hábitat) <span className="text-red-500">*</span></label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Ej: calle 145 # 13-45"
              value={address}
              onChange={(e) => setAddress(formatAddress(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">CHIP Catastral <span className="text-red-500">*</span></label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Ej: AAA0148LYN"
              value={chip}
              onChange={(e) => setChip(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Folio de Matrícula <span className="text-red-500">*</span>
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
        <Button className="w-full" onClick={validate}>Continuar a Documentación</Button>
      </div>
    </div>
  );
}
