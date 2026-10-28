// dotenv se carga en server/db.ts (ANTES de crear el pool) porque los imports
// de ES modules se hoistean y un pool sin env cargado no leería DB_PASSWORD.

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { errorHandler } from "./server/lib/errorHandler";
import { fileURLToPath } from "url";

import entitiesRouter from "./server/routes/entities.js";
import billingRouter from "./server/routes/billing.js";
// BUG-028: banksRouter consolidado en billingRouter — ver routes/billing.ts
// sección "Bank Accounts". Mantener un solo router en /api/billing evita
// colisiones silenciosas cuando se agregan paths nuevos.
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

  // ─── Request log (solo /api) ────────────────────────────────────────
  // Antes logueaba TODO, incluidos los assets estáticos de `dist/`: cada carga
  // de la app generaba decenas de líneas y en Hostinger eso infla los archivos
  // de log del panel (I/O y disco en un plan compartido). El interés real está
  // en las rutas de API; el detalle de assets no aporta nada.
  app.use((req, res, next) => {
    // El path se captura ACÁ: Express reescribe `req.url` durante el dispatch
    // del router y el callback de `finish` puede verlo ya recortado (`/me` en
    // vez de `/api/auth/me`).
    const reqPath = req.path;
    if (!reqPath.startsWith("/api")) return next();
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const cookiePresent = req.headers.cookie ? "yes" : "no";
      console.log(
        `[req] ${req.method} ${reqPath} → ${res.statusCode} (${ms}ms, cookie=${cookiePresent}, len=${res.getHeader("content-length") ?? "?"})`,
      );
    });
    next();
  });

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

  // BUG-028: bank-accounts e insurance-policies están consolidadas en
  // billingRouter (no más routers paralelos con el mismo path). Un solo
  // router montado en /api/billing, sin ambigüedad.
  app.use("/api/billing", billingRouter);

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

  // Middleware central de errores (BUG-029 fix).
  // Captura cualquier error de next(err) o asyncHandler, devuelve JSON consistente.
  app.use(errorHandler);

  httpServer = app.listen(PORT, HOST, () => {
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

/** Instancia HTTP, para poder cerrarla en un shutdown ordenado. */
let httpServer: import("http").Server | null = null;
let shuttingDown = false;

/**
 * Cierre ordenado.
 *
 * Hostinger manda SIGTERM al redeployar o al detener la app por inactividad.
 * Antes solo escuchábamos SIGINT (Ctrl+C local), así que en producción el
 * pool de MySQL se cerraba de golpe y las conexiones quedaban colgadas del
 * lado del servidor de base de datos.
 */
async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${reason} — cerrando ordenadamente...`);

  // Red de seguridad: si algo del cierre se cuelga (una query en vuelo, un
  // socket que no suelta), no dejamos el proceso zombi.
  const force = setTimeout(() => {
    console.error("[server] cierre forzado tras 8s");
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, 8_000);
  force.unref();

  try {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
      console.log("[server] HTTP cerrado");
    }
    await pool.end().catch(() => {});
    console.log("[server] pool de MySQL cerrado");
  } catch (err: any) {
    console.error("[server] error durante el cierre:", err?.message ?? err);
  }

  clearTimeout(force);
  process.exit(exitCode);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

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
    "[server] UNCAUGHT EXCEPTION — el proceso sale para que el supervisor lo reinicie:",
    err?.message ?? err,
  );
  if (err?.stack) console.error(err.stack);

  // Auditoría Hostinger (oct-2026): antes NO salíamos. Quedarse vivo con la
  // memoria en estado inconsistente es peor que reiniciar: el proceso sigue
  // atendiendo requests con estado roto y el panel de Hostinger no se entera
  // (nunca ve un exit). Hostinger reinicia solo cuando el proceso termina.
  void shutdown("uncaughtException", 1);
});

startServer().catch((err) => {
  console.error("[server] Error fatal en startServer():", err);
  process.exit(1);
});
