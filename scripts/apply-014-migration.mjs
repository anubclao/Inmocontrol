// Aplica la migración 014_login_attempts.sql contra MySQL.
// (fix-issue-rate-limit-auth-login) — idempotente.
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
  const sqlPath = path.resolve(
    "db/mysql/migrations/014_login_attempts.sql",
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`[migrate] Aplicando ${sqlPath} (${sql.length} bytes)...`);
  await pool.query(sql);

  const [rows] = await pool.query(
    `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'login_attempts'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [process.env.DB_NAME ?? "inmocontrol"],
  );
  console.log("[migrate] OK. Índices:", JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err.message);
  process.exit(1);
});