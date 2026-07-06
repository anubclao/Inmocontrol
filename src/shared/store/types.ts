import type { Transaction } from '../../types';

/**
 * Modelo del store para transacciones financieras.
 *
 * Shape: una Transaction plana por movimiento (NO agrupada por contrato/período).
 * Coincide con el formato que el monolito de App.tsx ya guardaba en localStorage
 * bajo la clave 'financialRecords'.
 *
 * Si en el futuro queremos agrupar (FinancialRecord = { contractId, period, transactions[] })
 * se hace como vista derivada en `shared/finance/`, no en el store.
 */
export type FinancialRecord = Transaction;
