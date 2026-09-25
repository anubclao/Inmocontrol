/**
 * useClosedMonths — state local de meses cerrados / abiertos.
 *
 * Decisión consciente: NO persistimos. El cierre de mes es operacional
 * y se reaplica al recargar el browser. Migrar a Zustand persist es
 * spec futuro (fuera de scope de #app-refactor).
 */
import { useCallback, useState } from 'react';
import type { ToastType } from '../../shared/hooks/useToast';

type ShowToast = (message: string, type?: ToastType) => void;

export function useClosedMonths(showToast: ShowToast) {
  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [openedMonths, setOpenedMonths] = useState<string[]>([]);

  const handleCloseMonth = useCallback(
    (propertyId: string, month: string) => {
      setClosedMonths((prev) => [...prev, `${propertyId}-${month}`]);
      showToast(
        `Mes de ${month} cerrado correctamente para este inmueble`,
      );
    },
    [showToast],
  );

  const handleOpenMonth = useCallback(
    (propertyId: string, month: string) => {
      setOpenedMonths((prev) => [...prev, `${propertyId}-${month}`]);
      showToast(
        `Mes de ${month} abierto correctamente para este inmueble`,
      );
    },
    [showToast],
  );

  return {
    closedMonths,
    openedMonths,
    handleCloseMonth,
    handleOpenMonth,
  };
}