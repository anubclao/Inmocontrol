// Aplica la migración 003_saas_billing.sql contra MySQL usando el pool del server.
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
  multipleStatements: true, // Necesario para correr el SQL completo
  waitForConnections: true,
  connectionLimit: 2,
});

async function main() {
  const sqlPath = path.resolve('db/mysql/migrations/003_saas_billing.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[migrate] Aplicando ${sqlPath} (${sql.length} bytes)...`);

  // mysql2 con multipleStatements corre todo de una. Separamos por `;` final.
  // Pero CREATE TABLE IF NOT EXISTS + INSERT ... UNION + SELECT se ejecutan en orden.
  await pool.query(sql);

  console.log('[migrate] OK. Verificando tablas...');
  const [tables] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'saas\\_%'`,
    [process.env.DB_NAME ?? 'inmocontrol']
  );
  console.log('[migrate] Tablas saas_*:', tables);

  const [plans] = await pool.query(`SELECT id, slug, name, price_cop, max_properties FROM saas_plans ORDER BY sort_order`);
  console.log('[migrate] Planes seed insertados:');
  for (const p of plans) {
    console.log(`  - ${p.slug}: ${p.name} · $${Number(p.price_cop).toLocaleString('es-CO')} · max ${p.max_properties} inmuebles`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
