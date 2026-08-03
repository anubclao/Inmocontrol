// server/lib/withTransaction.ts
// Wrapper de transacciones para mysql2.
//
// Por qué existe: varios handlers de billing.ts y properties.ts hacen
// múltiples queries que DEBEN ser atómicas (o todas, o ninguna). Sin esto,
// si la 2da query falla después de que la 1ra commiteó, el sistema queda
// en estado inconsistente. El bug arquetipo es BUG-008: marcar el pago
// actualiza amortization_rows (commit 1) y después marca el invoice
// (commit 2). Si el commit 2 falla, la amortización aparece pagada pero
// el invoice no — y la UI miente.
//
// Patrón:
//
//   const result = await withTransaction(async (conn) => {
//     await conn.query(...);
//     await conn.query(...);
//     return value;
//   });
//
// Si fn lanza o commit falla, hace rollback y re-throw. La conexión se
// libera siempre (en el finally).
//
// Si la operación NO necesita ser atómica con nada más (ej. un SELECT
// suelto), usar `pool.query` directo. Este wrapper es solo para los
// casos donde hay >1 query que debe ser all-or-nothing.

import type { PoolConnection } from "mysql2/promise";
import pool from "../db.js";

export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let result: T;
    try {
      result = await fn(conn);
    } catch (err) {
      // Rollback silencioso: si falla el rollback también, no podemos
      // hacer mucho (la conexión se libera igual y el server sigue).
      try {
        await conn.rollback();
      } catch (rbErr: any) {
        console.error(
          "[withTransaction] rollback failed (best-effort):",
          rbErr?.message,
        );
      }
      throw err;
    }
    await conn.commit();
    return result;
  } finally {
    conn.release();
  }
}
