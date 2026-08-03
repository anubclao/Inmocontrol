// Aplica la migración 002_add_status_en_colocacion.sql contra MySQL.
// (BUG-035) — Agrega el status "En Colocación" al CHECK constraint de
// properties.status. Idempotencia: si la constraint ya existe, aborta
// con un mensaje claro (no la dropea para no perder datos).
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 2,
});

async function main() {
  // Pre-check: ¿la constraint 'properties_chk_status' ya existe?
  const [existing] = await pool.query(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'properties'
       AND CONSTRAINT_NAME = 'properties_chk_status'`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );

  if (existing.length > 0) {
    console.log('[migrate] La constraint properties_chk_status ya existe. Migration 002 ya aplicada (idempotente).');
    await pool.end();
    return;
  }

  // Antes de dropear la constraint vieja, mostrarla para que el operador
  // vea qué se va a reemplazar.
  const [oldChk] = await pool.query(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'properties'
       AND CONSTRAINT_TYPE = 'CHECK'`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );
  if (oldChk.length > 0) {
    console.log('[migrate] Constraints CHECK existentes en properties:', oldChk.map((r) => r.CONSTRAINT_NAME));
  } else {
    console.log('[migrate] No hay CHECK constraints en properties — se asume que el schema usa otra convención. La migration intentará dropear properties_chk_1 y fallará silenciosamente si no existe.');
  }

  const sqlPath = path.resolve('db/mysql/migrations/002_add_status_en_colocacion.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[migrate] Aplicando ${sqlPath} (${sql.length} bytes)...`);

  try {
    await pool.query(sql);
    console.log('[migrate] OK. CHECK constraint actualizado con "En Colocación".');
  } catch (err) {
    if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.log('[migrate] La constraint properties_chk_1 no existe — probablemente el schema ya está actualizado. Si necesitás correr esto igual, editá la migration para skipear el DROP.');
    } else {
      throw err;
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
