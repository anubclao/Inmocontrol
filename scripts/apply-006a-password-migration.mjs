// Aplica la migración 006_password_hash.sql contra MySQL.
// (BUG-035) — Agrega password_hash a profiles para el piloto con auth simple.
// Idempotente: chequea si la columna ya existe antes de agregarla.
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "inmocontrol",
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 2,
});

async function main() {
  // Pre-check: ¿la columna password_hash ya existe en profiles?
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'profiles'
       AND COLUMN_NAME = 'password_hash'`,
    [process.env.DB_NAME ?? "inmocontrol"],
  );

  if (cols.length > 0) {
    console.log(
      "[migrate] La columna profiles.password_hash ya existe. Migration 006 ya aplicada (idempotente).",
    );
    await pool.end();
    return;
  }

  const sqlPath = path.resolve("db/mysql/migrations/006_password_hash.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`[migrate] Aplicando ${sqlPath} (${sql.length} bytes)...`);
  await pool.query(sql);

  console.log("[migrate] OK. Columna profiles.password_hash agregada.");

  // Verificar
  const [verify] = await pool.query(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'profiles'
       AND COLUMN_NAME = 'password_hash'`,
    [process.env.DB_NAME ?? "inmocontrol"],
  );
  console.log("[migrate] Verificación:", verify[0]);

  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err.message);
  process.exit(1);
});
