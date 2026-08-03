// dotenv se carga en server/db.ts (ANTES de crear el pool) porque los imports
// de ES modules se hoistean y un pool sin env cargado no leería DB_PASSWORD.

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import entitiesRouter from "./server/routes/entities.js";
import billingRouter from "./server/routes/billing.js";
import banksRouter from "./server/routes/banks.js";
import googleAuthRouter from "./server/routes/googleAuth.js";
import authRouter from "./server/routes/auth.js";
import tenantsRouter from "./server/routes/tenants.js";
import propertiesRouter from "./server/routes/properties.js";
import inventoriesRouter from "./server/routes/inventories.js";
import financialRecordsRouter from "./server/routes/financialRecords.js";
import notificationsRouter from "./server/routes/notifications.js";
import saasBillingRouter from "./server/routes/saasBilling.js";
import adminRouter from "./server/routes/admin.js";
import pool, { checkDb } from "./server/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  // Puerto único para producción (Hostinger shared asigna PORT via env).
  // En dev: Vite corre en 3000 y server en 3001, Vite hace proxy de /api/*.
  // En prod: server.ts sirve TANTO el frontend estático (dist/) COMO /api/*.
  const PORT = Number(
    process.env.PORT ?? (process.env.NODE_ENV === "production" ? 3000 : 3001),
  );
  const HOST = process.env.HOST ?? "0.0.0.0";

  // Configure CORS — acepta peticiones del frontend en puerto 3000
  const allowedOrigins = [
    process.env.APP_URL,
    process.env.SHARED_APP_URL,
    "http://localhost:3000",
  ].filter(Boolean) as string[];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.indexOf(origin) !== -1 ||
          process.env.NODE_ENV !== "production"
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-goog-api-key"],
    }),
  );

  app.use(express.json({ limit: "15mb" })); // PDFs en base64 pueden ser grandes
  app.use(cookieParser()); // necesario para sesiones httpOnly de /api/auth/*

  // ─── API routes ─────────────────────────────────────────────────────
  app.get("/api/health", async (req, res) => {
    const dbStatus = await checkDb();
    res.json({
      status: dbStatus.ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      db: dbStatus,
    });
  });

  // Auth (público — login + me)
  app.use("/api/auth", authRouter);

  // Bootstrap admin (público pero protegido por header token).
  // SOLO para el piloto single-tenant. Ver server/routes/admin.ts.
  app.use("/api/admin", adminRouter);

  app.use("/api/entities", entitiesRouter);
  app.use("/api/billing", billingRouter);

  // Bank accounts e insurance policies viven bajo /api/billing/* también
  app.use("/api/billing", banksRouter);

  // Google OAuth + Google Drive upload
  app.use("/api", googleAuthRouter);

  // Arrendatarios (MySQL + Drive)
  app.use("/api/tenants", tenantsRouter);

  // Propiedades (MySQL + Drive)
  app.use("/api/properties", propertiesRouter);

  // Registros financieros (MySQL)
  app.use("/api/financial-records", financialRecordsRouter);

  // Notificaciones (Twilio WhatsApp — ver `.env.example` para vars)
  app.use("/api/notifications", notificationsRouter);

  // SaaS Billing (Fase 8) — planes, subscripción, métodos de pago, facturas
  app.use("/api/saas-billing", saasBillingRouter);

  // Inventarios (MySQL + Drive)
  app.use("/api/inventories", inventoriesRouter);

  // ─── Production: servir archivos estáticos ──────────────────────────
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false }));
    app.get(["/sw.js", "/sw.js.map"], (_req, res) => {
      res.set("Cache-Control", "no-store");
      res.sendFile(path.join(distPath, "sw.js"));
    });
    app.get("/manifest.webmanifest", (_req, res) => {
      res.set("Content-Type", "application/manifest+json");
      res.sendFile(path.join(distPath, "manifest.webmanifest"));
    });
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ─── Error handlers (4 args = error middleware) — DEBEN ir al final ────
  // Silenciar BadRequestError "request aborted" — ocurre cuando el cliente
  // cancela un fetch con AbortController (ej: cierre rápido del wizard).
  // Estos NO son errores reales, son cancelaciones legítimas.
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (
        err &&
        (err.type === "aborted" ||
          err.message === "request aborted" ||
          err.code === "ECONNABORTED")
      ) {
        // 499 = "Client closed request" (nginx convention). Solo respondemos para
        // cerrar la conexión limpio — sin log.
        if (!res.headersSent) res.status(499).end();
        return;
      }
      next(err);
    },
  );

  // Fallback: cualquier otro error no manejado
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("[server] Unhandled error:", err);
      if (!res.headersSent)
        res.status(500).json({ error: err.message ?? "Internal server error" });
    },
  );

  app.listen(PORT, HOST, () => {
    console.log(
      `[server] Listening on http://${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`,
    );
    checkDb().then((s) => {
      if (s.ok) {
        console.log(`[db] MySQL OK — ${s.version}`);
      } else {
        console.warn(`[db] MySQL NO disponible: ${s.error}`);
        console.warn(`[db] Los endpoints devolverán 503 hasta que se conecte.`);
      }
    });
  });
}

// Cleanup al cerrar
process.on("SIGINT", async () => {
  console.log("\nCerrando pool de MySQL...");
  await pool.end().catch(() => {});
  process.exit(0);
});

// ─── Safety nets — NUNCA dejar que un error asíncrono mate el proceso ───
// Sin estos handlers, una query MySQL mal armada (ej: ER_BAD_FIELD_ERROR
// por schema drift) se convierte en unhandledRejection y Node tira el
// proceso entero. Express solo captura errores SINCRONICOS del middleware.
// Los rechazos de promesas (lo que más usa mysql2) se escapan por aquí.
// Ver: https://nodejs.org/api/process.html#warning-using-uncaughtexception
process.on("unhandledRejection", (reason: any) => {
  console.error(
    "[server] UNHANDLED REJECTION (no mató el proceso):",
    reason?.message ?? reason,
  );
  if (reason?.stack) console.error(reason.stack);
  if (reason?.sql) console.error("  sql:", reason.sql);
});

process.on("uncaughtException", (err: any) => {
  console.error(
    "[server] UNCAUGHT EXCEPTION (no mató el proceso):",
    err?.message ?? err,
  );
  if (err?.stack) console.error(err.stack);
  // No exit — solo loguear. Para errores fatales de verdad (OOM, etc.),
  // Node va a cerrar el proceso igual cuando intente usarlos.
});

startServer().catch((err) => {
  console.error("[server] Error fatal en startServer():", err);
  process.exit(1);
});
