import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Card, Button, Input } from '../../../shared/ui';
import { PROPERTY_TYPES, getPropertyTypeConfig, resolveAreas, type PropertyType } from '../inventoryConfig';
import type { Inventory } from '../inventoryTypes';

interface AreaConfigPanelProps {
  propertyType: PropertyType;
  counters: Record<string, number>;
  customAreas: { id: string; label: string }[];
  onPropertyTypeChange: (t: PropertyType) => void;
  onCountersChange: (c: Record<string, number>) => void;
  onCustomAreasChange: (next: { id: string; label: string }[]) => void;
  onStart: () => void;
  onCancel?: () => void;
  /** Persiste el estado del inventario sin empezar a evaluar áreas. El padre
   *  ya hace autosave en IndexedDB en cada cambio; este botón da feedback
   *  explícito al agente. */
  onSaveDraft?: () => void;
}

/**
 * Pantalla de configuración: tipo de inmueble + contadores (alcobas, baños, etc).
 * Muestra preview de las áreas resultantes antes de empezar.
 */
export function AreaConfigPanel({
  propertyType, counters, customAreas,
  onPropertyTypeChange, onCountersChange, onCustomAreasChange,
  onStart, onCancel, onSaveDraft,
}: AreaConfigPanelProps) {
  const config = getPropertyTypeConfig(propertyType);
  const resolved = resolveAreas(config, counters, customAreas);

  // Estado local del input "Otros" para no rerenderizar en cada tecla
  const [newCustomLabel, setNewCustomLabel] = useState('');

  const setCounter = (key: string, value: number) => {
    const def = config.multiCounters.find((c) => c.key === key);
    if (!def) return;
    const clamped = Math.max(def.min, Math.min(def.max, value));
    onCountersChange({ ...counters, [key]: clamped });
  };

  const addCustomArea = () => {
    const label = newCustomLabel.trim();
    if (!label) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onCustomAreasChange([...customAreas, { id, label }]);
    setNewCustomLabel('');
  };

  const removeCustomArea = (id: string) => {
    onCustomAreasChange(customAreas.filter((c) => c.id !== id));
  };

  return (
    <Card className="p-8">
      <h3 className="font-bold text-lg mb-2">3. Configuración del Inventario</h3>
      <p className="text-sm text-slate-500 mb-6">
        Define el tipo de inmueble y la cantidad de áreas. Esto determina qué se va a inventariar.
      </p>

      <div className="space-y-6">
        {/* Tipo de inmueble */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo de inmueble</label>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
            {PROPERTY_TYPES.map((pt) => (
              <button
                key={pt.id}
                type="button"
                onClick={() => onPropertyTypeChange(pt.id)}
                className={`px-3 py-2.5 rounded-lg text-sm font-bold border transition-all ${
                  propertyType === pt.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contadores dinámicos */}
        {config.multiCounters.length > 0 && (
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cantidades</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
              {config.multiCounters.map((counter) => {
                const value = counters[counter.key] ?? counter.default;
                return (
                  <div key={counter.key} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <label className="text-xs font-bold text-slate-600">{counter.label}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setCounter(counter.key, value - 1)}
                        disabled={value <= counter.min}
                        className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-500 hover:text-slate-900 hover:border-slate-400 disabled:opacity-30"
                      >−</button>
                      <span className="flex-1 text-center font-bold text-slate-900">{value}</span>
                      <button
                        type="button"
                        onClick={() => setCounter(counter.key, value + 1)}
                        disabled={value >= counter.max}
                        className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-500 hover:text-slate-900 hover:border-slate-400 disabled:opacity-30"
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom areas ("Otros") */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Otras áreas (personalizadas)
          </label>
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Nombre del área (ej: Cuarto de Estudio, Bodega Interior, Mezzanine...)"
              value={newCustomLabel}
              onChange={(e) => setNewCustomLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomArea(); } }}
            />
            <Button type="button" onClick={addCustomArea} disabled={!newCustomLabel.trim()}>
              <Plus className="w-4 h-4 mr-1" /> Agregar
            </Button>
          </div>
          {customAreas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {customAreas.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 pl-3 pr-1 py-1 bg-blue-50 border border-blue-200 rounded-full text-sm"
                >
                  <span className="font-semibold text-blue-900">{c.label}</span>
                  <button
                    type="button"
                    onClick={() => removeCustomArea(c.id)}
                    className="p-1 hover:bg-blue-100 rounded-full text-blue-600"
                    title="Eliminar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            Usa "Otros" para áreas que no estén en el listado del tipo de inmueble. Se agregarán al final del inventario.
          </p>
        </div>

        {/* Preview de áreas */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Áreas a inventariar ({resolved.length})
          </label>
          <div className="mt-2 p-4 bg-blue-50 rounded-lg border border-blue-100 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {resolved.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <div className={`w-1.5 h-1.5 rounded-full ${a.id.startsWith('custom-') ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <span className="text-slate-700">{a.label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Sugerido: {config.recommendedPhotos} fotos por área.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {onCancel && (
            <Button variant="outline" className="flex-1" onClick={onCancel}>Atrás</Button>
          )}
          {onSaveDraft && (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={onSaveDraft}
            >
              💾 Guardar borrador
            </Button>
          )}
          <Button className="flex-1" onClick={onStart}>
            Empezar Inventario ({resolved.length} áreas)
          </Button>
        </div>
      </div>
    </Card>
  );
}
