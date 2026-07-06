/**
 * InmoControl — Banner de orientación del proceso
 * ============================================================================
 * Cada módulo (Propiedades, Arrendatarios, Contratos, Billing, Finanzas,
 * Reportes) muestra este banner arriba para que el agente sepa:
 *   1. En qué paso del orden legal del proceso está parado.
 *   2. Qué se necesita antes de poder operar en este módulo.
 *   3. Qué resultado genera cuando completa la acción.
 *
 * El orden es FIJO y no se puede saltar — el sistema bloquea acciones
 * que intenten crear entidades fuera de orden (ej: no se puede crear
 * un Contrato sin antes haber firmado el Inventario de Colocación).
 */

import React from 'react';
import {
  Home,
  UserPlus,
  FileSignature,
  FileText,
  Receipt,
  Wallet,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from './index';

export type ProcessStepId =
  | 'properties'
  | 'tenants'
  | 'contracts'
  | 'billing'
  | 'finances'
  | 'reports';

interface Step {
  id: ProcessStepId;
  number: number;
  title: string;
  shortDescription: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: Step[] = [
  {
    id: 'properties',
    number: 1,
    title: 'Propiedad',
    shortDescription: 'Wizard 3 pasos + mandato firmado → status Activo',
    icon: Home,
  },
  {
    id: 'tenants',
    number: 2,
    title: 'Arrendatario + Cédula + Inv. Colocación',
    shortDescription: 'Crear tenant → cédula → firmar inventario (arrendatario + agente)',
    icon: UserPlus,
  },
  {
    id: 'contracts',
    number: 3,
    title: 'Contrato (auto-generado)',
    shortDescription: 'Se crea SOLO al firmar el Inventario de Colocación. No se crea manual.',
    icon: FileSignature,
  },
  {
    id: 'billing',
    number: 4,
    title: 'Billing',
    shortDescription: 'Parametrizar política + generar amortización. Requiere contrato activo.',
    icon: Receipt,
  },
  {
    id: 'finances',
    number: 5,
    title: 'Finanzas / Liquidación',
    shortDescription: 'Estado de cuenta del propietario. Consume datos de billing.',
    icon: Wallet,
  },
  {
    id: 'reports',
    number: 6,
    title: 'Reportes',
    shortDescription: 'Análisis consolidado. Lee de finanzas y billing.',
    icon: BarChart3,
  },
];

interface ProcessOrderBannerProps {
  /** Paso actual del proceso. El banner resalta este paso. */
  currentStep: ProcessStepId;
  /** Variante de color. default = info (azul). warn = amarillo si hay bloqueo. */
  tone?: 'info' | 'warn';
  /** Título personalizado que aparece arriba del banner. */
  title?: string;
  /** Descripción adicional específica del módulo actual. */
  description?: string;
  /** Si está colapsado por defecto. Default: false. */
  defaultCollapsed?: boolean;
}

export function ProcessOrderBanner({
  currentStep,
  tone = 'info',
  title,
  description,
  defaultCollapsed = false,
}: ProcessOrderBannerProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  const current = STEPS[currentIdx];
  const PreviousStep = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const NextStep = currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;

  const tones = {
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
  };
  const accents = {
    info: 'bg-blue-100 text-blue-700 border-blue-300',
    warn: 'bg-amber-100 text-amber-700 border-amber-300',
  };

  return (
    <div className={cn('rounded-lg border p-4', tones[tone])}>
      {/* Header siempre visible */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 font-bold text-sm',
          accents[tone],
        )}>
          {current.number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm">
              {title ?? `Paso ${current.number}: ${current.title}`}
            </h3>
            <span className="text-[10px] uppercase tracking-wider opacity-60 font-bold">
              Orden del proceso
            </span>
          </div>
          <p className="text-sm mt-1 leading-relaxed opacity-90">
            {description ?? current.shortDescription}
          </p>

          {/* Contexto rápido: anterior + próximo */}
          {(PreviousStep || NextStep) && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {PreviousStep && (
                <span className="inline-flex items-center gap-1 opacity-70">
                  <span className="font-bold">← Antes:</span>
                  <span>Paso {PreviousStep.number} ({PreviousStep.title})</span>
                </span>
              )}
              {NextStep && (
                <span className="inline-flex items-center gap-1 opacity-70">
                  <span className="font-bold">Después:</span>
                  <span>Paso {NextStep.number} ({NextStep.title}) →</span>
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
          aria-label={collapsed ? 'Expandir orden completo' : 'Colapsar orden'}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Orden completo (colapsable) */}
      {!collapsed && (
        <div className="mt-4 pt-4 border-t border-current/10">
          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {STEPS.map((s) => {
              const isCurrent = s.id === currentStep;
              const isPast = STEPS.findIndex((x) => x.id === s.id) < currentIdx;
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-start gap-2 p-2 rounded border',
                    isCurrent
                      ? 'bg-white border-current/30 font-bold shadow-sm'
                      : isPast
                      ? 'opacity-60 line-through'
                      : 'bg-white/50 border-transparent',
                  )}
                >
                  <s.icon className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold">
                      {s.number}. {s.title}
                    </div>
                    <div className="opacity-70 text-[11px] leading-snug">
                      {s.shortDescription}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Hook para que un módulo sepa si el paso anterior está cumplido. */
export function getPreviousStep(step: ProcessStepId): Step | null {
  const idx = STEPS.findIndex((s) => s.id === step);
  return idx > 0 ? STEPS[idx - 1] : null;
}

/** Hook para que un módulo sepa si el paso siguiente está disponible. */
export function getNextStep(step: ProcessStepId): Step | null {
  const idx = STEPS.findIndex((s) => s.id === step);
  return idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
}