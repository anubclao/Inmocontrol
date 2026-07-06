/**
 * InmoControl — Conexión a MySQL (server-side)
 * ============================================================================
 * Pool de conexiones con mysql2/promise. Lee credenciales de .env (con fallback
 * a defaults razonables para dev local).
 *
 * IMPORTANTE: dotenv se carga AQUÍ y no en server.ts porque ES modules
 * hoistean los imports — el pool se crearía antes de que dotenv corra en
 * el entry point, quedándose con `process.env.DB_PASSWORD` vacío.
 *
 * Variables:
 *   DB_HOST     default: 127.0.0.1
 *   DB_PORT     default: 3306
 *   DB_USER     default: root
 *   DB_PASSWORD default: '' (vacío, MySQL local en Windows suele ser esto)
 *   DB_NAME     default: inmocontrol
 *   DB_LIMIT    default: 10
 *
 * Si MySQL no responde, los endpoints devuelven 503 — el cliente puede hacer
 * fallback al modo demo (localStorage).
 */

// Cargar .env ANTES de cualquier otro import que pueda leer process.env.
// Usamos una IIFE para asegurar el orden en ES modules.
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_LIMIT ?? 10),
  queueLimit: 0,
  dateStrings: true,    // devuelve DATE/DATETIME como string ISO en lugar de Date
  decimalNumbers: true, // DECIMAL → number (no string)
});

export default pool;

/**
 * Verifica conexión. Usado por /api/health cuando ?db=1.
 * Si falla, devuelve { ok: false, error }.
 */
export async function checkDb(): Promise<{ ok: boolean; error?: string; version?: string }> {
  try {
    const [rows] = await pool.query('SELECT VERSION() AS v');
    const v = (rows as any[])[0]?.v;
    return { ok: true, version: v };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Asegura que existe una organización por defecto. Si no hay ninguna, crea una
 * llamada 'InmoControl Default'. Devuelve el id.
 *
 * TODO (multi-tenant real): derivar la org del usuario autenticado.
 */
export async function ensureDefaultOrg(): Promise<string> {
  const [rows] = await pool.query(
    'SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1'
  );
  const list = rows as any[];
  if (list.length > 0) return list[0].id;

  const id = cryptoRandomUUID();
  await pool.query(
    `INSERT INTO organizations (id, name, nit, created_by)
     VALUES (?, ?, ?, ?)`,
    [id, 'InmoControl Default', null, 'system']
  );
  return id;
}

function cryptoRandomUUID(): string {
  // Node 18+ tiene crypto.randomUUID() global
  return (globalThis as any).crypto.randomUUID();
}