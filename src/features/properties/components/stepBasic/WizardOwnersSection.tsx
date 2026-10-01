// filepath: src/features/properties/components/stepBasic/WizardOwnersSection.tsx
import { Plus, Trash2, User, Phone, Mail, IdCard, Percent } from "lucide-react";
import { Button } from "../../../../shared/ui";
import type { WizardOwner } from "../StepBasic";

export interface WizardOwnersSectionProps {
  owners: WizardOwner[];
  setOwners: (v: WizardOwner[]) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

const genWizardId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Sección "Propietarios" del step 1 del wizard de propiedad.
 * Maneja N propietarios con nombre, cédula, teléfono, email y % de
 * participación. El padre pasa el estado + setter; este componente define
 * las operaciones add/remove/update internamente.
 */
export function WizardOwnersSection({
  owners,
  setOwners,
  showToast,
}: WizardOwnersSectionProps) {
  const addOwner = () => {
    setOwners([
      ...owners,
      {
        id: genWizardId("wizard-owner"),
        name: "",
        idNumber: "",
        phone: "",
        email: "",
        ownershipPct: "",
      },
    ]);
  };
  const removeOwner = (idx: number) => {
    if (owners.length === 1) {
      showToast("Tiene que haber al menos un propietario", "error");
      return;
    }
    setOwners(owners.filter((_, i) => i !== idx));
  };
  const updateOwner = (idx: number, patch: Partial<WizardOwner>) => {
    setOwners(owners.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-700">
            Propietarios <span className="text-red-500">*</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {owners.length === 1
              ? "1 propietario registrado. Agregá más si la propiedad tiene varios dueños."
              : `${owners.length} propietarios registrados. Cada uno firma el Contrato de Mandato (PDF multi-firmado).`}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={addOwner}
          className="gap-1.5 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar propietario
        </Button>
      </div>

      {owners.map((o, idx) => (
        <div
          key={o.id}
          className="p-4 bg-white border border-slate-200 rounded-lg space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold">
                {idx + 1}
              </div>
              <p className="text-xs font-bold text-slate-700">
                Propietario {idx + 1}
                {idx === 0 && (
                  <span className="ml-1 text-[9px] text-slate-400 font-normal">
                    (principal)
                  </span>
                )}
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
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Nombre completo <span className="text-red-500">*</span>
              </label>
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
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Cédula
              </label>
              <div className="relative">
                <IdCard className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="Ej: 1.023.456.789"
                  value={o.idNumber}
                  onChange={(e) =>
                    updateOwner(idx, { idNumber: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Teléfono
              </label>
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
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Email
              </label>
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
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                % de participación (opcional)
              </label>
              <div className="relative">
                <Percent className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="Ej: 50.00 (dejar vacío si no se va a repartir)"
                  inputMode="decimal"
                  value={o.ownershipPct}
                  onChange={(e) =>
                    updateOwner(idx, { ownershipPct: e.target.value })
                  }
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Si hay 2+ dueños y definís %, la suma tiene que ser 100. Si los
                dejás vacíos, se asume 100% al primer propietario.
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
