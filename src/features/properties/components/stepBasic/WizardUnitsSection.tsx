// filepath: src/features/properties/components/stepBasic/WizardUnitsSection.tsx
import { Trash2, Car, Package, Box } from "lucide-react";
import type { PropertyUnitType } from "../../../../types";
import type { WizardUnit } from "../StepBasic";

export interface WizardUnitsSectionProps {
  units: WizardUnit[];
  setUnits: (v: WizardUnit[]) => void;
}

/** Catálogo de tipos de unidad con etiqueta legible. */
const UNIT_TYPE_LABELS: Record<
  PropertyUnitType,
  { label: string; icon: typeof Car }
> = {
  parking: { label: "Garaje", icon: Car },
  storage: { label: "Depósito", icon: Package },
  other: { label: "Otro", icon: Box },
};

const genWizardId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Sección "Unidades adicionales" del step 1 del wizard de propiedad.
 * Maneja N unidades tipo parking/storage/other con etiqueta, matrícula
 * y área m². El padre pasa el estado + setter; este componente define
 * las operaciones add/remove/update internamente.
 */
export function WizardUnitsSection({
  units,
  setUnits,
}: WizardUnitsSectionProps) {
  const addUnit = (type: PropertyUnitType) => {
    setUnits([
      ...units,
      {
        id: genWizardId("wizard-unit"),
        type,
        label: "",
        folioMatricula: "",
        areaM2: "",
      },
    ]);
  };
  const removeUnit = (idx: number) => {
    setUnits(units.filter((_, i) => i !== idx));
  };
  const updateUnit = (idx: number, patch: Partial<WizardUnit>) => {
    setUnits(units.map((u, i) => (i === idx ? { ...u, ...patch } : u)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-700">
            Unidades adicionales
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Garajes, depósitos u otros con matrícula propia. Cada uno requiere
            su propio Certificado de Tradición.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addUnit("parking")}
            className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"
          >
            <Car className="w-3.5 h-3.5" />+ Garaje
          </button>
          <button
            type="button"
            onClick={() => addUnit("storage")}
            className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"
          >
            <Package className="w-3.5 h-3.5" />+ Depósito
          </button>
          <button
            type="button"
            onClick={() => addUnit("other")}
            className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"
          >
            <Box className="w-3.5 h-3.5" />+ Otro
          </button>
        </div>
      </div>

      {units.length === 0 ? (
        <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-500 text-center">
          Sin unidades adicionales. Si la propiedad solo es el apartamento/casa,
          dejá esto vacío.
        </div>
      ) : (
        <div className="space-y-3">
          {units.map((u, idx) => {
            const TypeInfo = UNIT_TYPE_LABELS[u.type];
            const Icon = TypeInfo.icon;
            return (
              <div
                key={u.id}
                className="p-4 bg-white border border-slate-200 rounded-lg space-y-3"
              >
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
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Etiqueta <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder={
                        u.type === "parking"
                          ? "Ej: Garaje 12"
                          : u.type === "storage"
                            ? "Ej: Depósito 3B"
                            : "Ej: Cuarto útil"
                      }
                      value={u.label}
                      onChange={(e) =>
                        updateUnit(idx, { label: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Matrícula
                    </label>
                    <input
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="50N-87654321"
                      value={u.folioMatricula}
                      onChange={(e) =>
                        updateUnit(idx, {
                          folioMatricula: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Área m²
                    </label>
                    <input
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="12.5"
                      inputMode="decimal"
                      value={u.areaM2}
                      onChange={(e) =>
                        updateUnit(idx, { areaM2: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
