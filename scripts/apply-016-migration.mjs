// apply-016-migration.mjs
// Aplica la migración 016_org_invitations.sql a la DB.
// Idempotente: usa CREATE TABLE IF NOT EXISTS.
// Loggea OK al final y exit code 0 si todo sale bien.
//
// Uso: node scripts/apply-016-migration.mjs
//
// Spec: docs/specs/saas_user_mgmt.md
// Migration: db/mysql/migrations/016_org_invitations.sql

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadEnv } from "dotenv";
import "dotenv/config";

// Cargar .env.local (la app usa este, no .env)
loadEnv({ path: ".env.local" });

import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "..",
  "db",
  "mysql",
  "migrations",
  "016_org_invitations.sql",
);
const sql = readFileSync(migrationPath, "utf8");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
  multipleStatements: true, // necesario para ejecutar el .sql completo
});

console.log("[apply-016] Connecting to MySQL...");
const conn = await pool.getConnection();
try {
  console.log("[apply-016] Running migration...");
  await conn.query(sql);
  console.log("[apply-016] OK — tabla org_invitations lista (o ya existía)");
} catch (e) {
  console.error("[apply-016] ERROR:", e.message);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
