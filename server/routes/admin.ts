/**
 * InmoControl — Endpoints administrativos (bootstrap / seed).
 * ============================================================================
 * SOLO para uso del piloto single-tenant en producción inicial.
 *
 * El endpoint `POST /api/admin/seed` corre el seed del piloto. Está
 * protegido con un token en header para que un visitante casual no
 * pueda invocarlo accidentalmente. Sin ese token el endpoint responde
 * 401 incluso si la URL es correcta.
 *
 * El seed es idempotente: si la DB ya tiene un admin user, retorna
 * `alreadySeeded=true` sin tocar nada.
 *
 * REMOCIÓN POST-PILOTO:
 *   Una vez que el SaaS multi-cliente esté en marcha, este endpoint se
 *   debe BORRAR. En su lugar, el create-tenant flow debe crear la
 *   organización via sign-up, no via este bootstrap.
 *
 * Variables:
 *   ADMIN_SEED_TOKEN   — token compartido en header X-Admin-Seed-Token.
 *                        Default si no está seteado: el endpoint rechaza
 *                        todo (mode 503) hasta que se configure.
 */

import { Router } from "express";
import { runPilotSeed } from "../seed/pilotSeed.js";
// fix-issue-27: helper tipado para tirar errores que el errorHandler procesa.
import { internal } from "../lib/errors.js";

const router = Router();

router.post("/seed", async (req, res) => {
  const expected = process.env.ADMIN_SEED_TOKEN;
  if (!expected) {
    return res.status(503).json({
      ok: false,
      code: "ADMIN_SEED_TOKEN_NOT_CONFIGURED",
      error:
        "Server admin no configuró ADMIN_SEED_TOKEN. Definilo en el panel de Hostinger antes de invocar.",
    });
  }
  const provided = req.headers["x-admin-seed-token"];
  if (typeof provided !== "string" || provided !== expected) {
    return res.status(401).json({
      ok: false,
      code: "INVALID_TOKEN",
      error: "Falta o es incorrecto el header X-Admin-Seed-Token.",
    });
  }

  try {
    const result = await runPilotSeed();
    return res.status(200).json({
      ok: true,
      alreadySeeded: result.alreadySeeded,
      stages: result.stages,
      admin: result.admin,
      message: result.alreadySeeded
        ? "DB ya tiene admin — seed no ejecutado."
        : "Seed del piloto completado.",
    });
  } catch (err: any) {
    // fix-issue-27: loguear contexto completo (incluye sql/mysqlCode) ANTES
    // de propagar. El errorHandler ahora sanitiza: el cliente NO ve el
    // `sql` ni el `mysqlCode` (seguridad), solo el shape `{ error, code }`.
    console.error("[admin/seed] failed:", err);
    throw internal("SEED_ERROR");
  }
});

router.get("/seed/status", async (_req, res) => {
  // Endpoint util para verificar el estado sin ejecutar.
  // Lee si hay admin user y devuelve contexto.
  // (Solo informativo — no requiere token.)
  // Import dinâmico de pool para evitar ciclo si el server está sin DB.
  try {
    const { default: pool } = await import("../db.js");
    const [rows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM organizations) AS orgs,
         (SELECT COUNT(*) FROM properties) AS properties,
         (SELECT COUNT(*) FROM profiles WHERE role='admin') AS admins,
         (SELECT COUNT(*) FROM tenants WHERE status='Activo') AS tenants,
         (SELECT COUNT(*) FROM contracts WHERE status='active') AS contracts,
         (SELECT COUNT(*) FROM amortization_rows) AS amort_rows`,
    );
    return res.json({ ok: true, counts: rows[0] });
  } catch {
    // fix-issue-27: shape uniforme. errorHandler sanitiza el mensaje.
    throw internal();
  }
});

export default router;
