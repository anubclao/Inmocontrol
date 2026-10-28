/**
 * Aplica la migración 017 (login_attempts.attempts) con snapshot previo.
 *
 * Por qué existe este script y no un simple `mysql < 017.sql`:
 *   Hostinger pidió conservar una copia inmediatamente anterior al cambio.
 *   Este script dumpea el esquema + filas de `login_attempts` a ./backups/
 *   ANTES de tocar nada, y solo entonces aplica el ALTER. La tabla es
 *   chica (solo rate limit, cero datos de negocio), así que el snapshot es
 *   instantáneo y sirve como rollback exacto.
 *
 * Uso (local, contra la DB del panel de Hostinger):
 *   node scripts/apply-017-migration.mjs
 *
 * Con credenciales explícitas:
 *   DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... node scripts/apply-017-migration.mjs
 *
 * Idempotente: si la columna ya existe, no hace nada (y no genera snapshot).
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import mysql from 'mysql2/promise';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'db', 'mysql', 'migrations', '017_login_attempts_attempts.sql');
const backupsDir = join(__dirname, '..', 'backups');
const DB_NAME = process.env.DB_NAME ?? 'inmocontrol';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: DB_NAME,
  multipleStatements: true,
  connectTimeout: 10_000,
});

try {
  const [tables] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'login_attempts'`,
    [DB_NAME],
  );
  if (Number(tables[0].n) === 0) {
    console.error(
      'FAIL: la tabla `login_attempts` no existe. Aplicá primero la migración 014_login_attempts.sql.',
    );
    process.exit(1);
  }

  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'login_attempts'`,
    [DB_NAME],
  );
  const hasAttempts = cols.some((c) => c.COLUMN_NAME === 'attempts');

  if (hasAttempts) {
    console.log('OK: login_attempts.attempts ya existe. Nada que hacer.');
  } else {
    // ── Snapshot previo (rollback exacto de esta tabla) ──────────────────
    if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const snapshotPath = join(backupsDir, `login_attempts_pre-017_${stamp}.sql`);

    const [createRows] = await conn.query('SHOW CREATE TABLE login_attempts');
    const createSql = createRows[0]['Create Table'];
    const [rows] = await conn.query('SELECT * FROM login_attempts');

    const lines = [
      `-- Snapshot de login_attempts previo a la migración 017`,
      `-- Generado: ${new Date().toISOString()}`,
      `-- Filas: ${rows.length}`,
      `-- Rollback: DROP TABLE login_attempts; <pegar el CREATE de abajo>; <pegar los INSERT>`,
      '',
      'DROP TABLE IF EXISTS login_attempts;',
      createSql + ';',
      '',
    ];
    for (const r of rows) {
      const vals = Object.values(r).map((v) =>
        v === null ? 'NULL' : typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`,
      );
      lines.push(`INSERT INTO login_attempts VALUES (${vals.join(', ')});`);
    }
    writeFileSync(snapshotPath, lines.join('\n'), 'utf8');
    console.log(`[migrate] Snapshot previo: ${snapshotPath} (${rows.length} filas)`);

    // ── Aplicar ──────────────────────────────────────────────────────────
    const sql = readFileSync(sqlPath, 'utf-8');
    await conn.query(sql);
    console.log('OK: migración 017 aplicada.');
  }

  // ── Verificación post-aplicación ──────────────────────────────────────
  const [after] = await conn.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'login_attempts' AND COLUMN_NAME = 'attempts'`,
    [DB_NAME],
  );
  if (after.length === 0) {
    console.error('FAIL: la columna attempts no quedó creada.');
    process.exit(1);
  }
  const col = after[0];
  console.log(
    `[verify] attempts → ${col.COLUMN_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} default=${col.COLUMN_DEFAULT}`,
  );

  const [sample] = await conn.query(
    'SELECT COALESCE(SUM(attempts),0) AS total, COUNT(*) AS filas FROM login_attempts WHERE success = 0',
  );
  console.log(
    `[verify] filas fallidas: ${sample[0].filas} · intentos acumulados: ${sample[0].total}`,
  );
  console.log(
    '\nListo. Después de desplegar el código nuevo, corré:\n' +
      '  node scripts/verify-rate-limit.mjs\n' +
      'para comprobar que el bloqueo real se dispara al 6º intento.',
  );
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('OK: la columna ya existía — nada que hacer.');
  } else {
    console.error('FAIL:', e.code, e.message);
    process.exitCode = 1;
  }
} finally {
  await conn.end();
}
