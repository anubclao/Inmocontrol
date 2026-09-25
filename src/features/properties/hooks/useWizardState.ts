/**
 * useWizardState — extrae la state machine del wizard de captación.
 *
 * El wizard de captación tiene 3 pasos secuenciales:
 *   1 → Datos básicos (address, chip, folio, propietario, unidades)
 *   2 → 5 documentos legales (CC, Certificado, Predial, RUT, Mandato)
 *   3 → Inventario de captación + finalizar
 *
 * Commit 1 del refactor de `PropertiesView.tsx` (spec #5, verifier #5).
 * Solo encapsula el `step` actual + las transiciones explícitas
 * (`goNext`, `goBack`, `reset`, `setStep`). El resto del state del wizard
 * (uploadedDocs, wizardInventory, finalizeSummary, etc.) queda en el
 * componente hasta commits posteriores.
 *
 * Cero cambio funcional: el comportamiento de cada transición es idéntico.
 */

import { useCallback, useState } from 'react';

export type WizardStepNumber = 1 | 2 | 3;

export interface UseWizardStateReturn {
  /** Paso actual del wizard (1, 2 o 3). */
  step: WizardStepNumber;
  /** Avanza al siguiente paso (1→2→3). No hace nada si ya está en 3. */
  goNext: () => void;
  /** Retrocede al paso anterior (3→2→1). No hace nada si ya está en 1. */
  goBack: () => void;
  /** Vuelve al paso 1 (usado al descartar borrador o tras finalizar). */
  reset: () => void;
  /** Salto explícito a un paso concreto (usado al restaurar borrador). */
  setStep: (n: WizardStepNumber) => void;
}

/**
 * Hook de la state machine del wizard.
 *
 * Uso en `PropertiesView.tsx`:
 *   const { step, goNext, goBack, reset, setStep } = useWizardState(1);
 */
export function useWizardState(
  initial: WizardStepNumber = 1,
): UseWizardStateReturn {
  const [step, setStepInternal] = useState<WizardStepNumber>(initial);

  const goNext = useCallback(() => {
    setStepInternal((s) => (s < 3 ? ((s + 1) as WizardStepNumber) : s));
  }, []);

  const goBack = useCallback(() => {
    setStepInternal((s) => (s > 1 ? ((s - 1) as WizardStepNumber) : s));
  }, []);

  const reset = useCallback(() => setStepInternal(1), []);

  const setStep = useCallback((n: WizardStepNumber) => setStepInternal(n), []);

  return { step, goNext, goBack, reset, setStep };
}