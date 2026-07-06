/**
 * Backup automatizado de MySQL para el piloto InmoControl.
 *
 * Estrategia simple:
 *   - mysqldump completo de la DB `inmocontrol`
 *   - Comprimido con gzip
 *   - Guardado en ./backups/ con timestamp YYYY-MM-DD-HHMM.sql.gz
 *   - Rotación: conserva los últimos 14 backups (≈2 semanas de cobertura
 *     si corres diario), borra los más viejos automáticamente.
 *
 * NO sube a S3 ni a ningún servicio externo — eso se agrega en sprint 0
 * post-piloto. Para el piloto, el backup local en la misma máquina es
 * suficiente (no es producción).
 *
 * Corrida:
 *   node scripts/backup-db.mjs
 *
 * Cron sugerido (Linux):
 *   0 3 * * * cd /path/to/inmocontrol && node scripts/backup-db.mjs >> logs/backup.log 2>&1
 *
 * Task Scheduler (Windows):
 *   Crear tarea básica → diaria 03:00 → acción: node "D:\...\backup-db.mjs"
 *
 * Restaurar (en caso de desastre):
 *   gunzip backups/inmocontrol_2026-07-02-0300.sql.gz
 *   mysql -u root -p inmocontrol < backups/inmocontrol_2026-07-02-0300.sql
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = path.resolve('./backups');
const RETENTION_DAYS = 14;
const TIMESTAMP = new Date().toISOString().replace(/T/, '-').replace(/:/g, '').slice(0, 16);
const FILENAME = `inmocontrol_${TIMESTAMP}.sql.gz`;
const FULL_PATH = path.join(BACKUP_DIR, FILENAME);

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1';
const DB_PORT = process.env.DB_PORT ?? '3306';
const DB_USER = process.env.DB_USER ?? 'root';
const DB_PASSWORD = process.env.DB_PASSWORD ?? '';
const DB_NAME = process.env.DB_NAME ?? 'inmocontrol';

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`[backup] Creado directorio ${BACKUP_DIR}`);
  }
}

function runMysqldump() {
  const cmd = [
    'mysqldump',
    `--host=${DB_HOST}`,
    `--port=${DB_PORT}`,
    `--user=${DB_USER}`,
    DB_PASSWORD ? `--password=${DB_PASSWORD}` : '',
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--default-character-set=utf8mb4',
    DB_NAME,
    '| gzip -9',
    `> "${FULL_PATH}"`,
  ].filter(Boolean).join(' ');

  console.log(`[backup] Ejecutando mysqldump → ${FILENAME}`);
  console.log(`[backup] cmd: ${cmd.replace(/--password=[^ ]+/, '--password=***')}`);

  try {
    execSync(cmd, { stdio: 'inherit', shell: true });
  } catch (err) {
    console.error('[backup] mysqldump falló:', err.message);
    throw err;
  }
}

function rotate() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUP_DIR);
  let removed = 0;
  for (const f of files) {
    if (!f.startsWith('inmocontrol_') || !f.endsWith('.sql.gz')) continue;
    const fullPath = path.join(BACKUP_DIR, f);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
      removed++;
      console.log(`[backup] Rotación: borrado ${f}`);
    }
  }
  return removed;
}

function verify() {
  const stat = fs.statSync(FULL_PATH);
  if (stat.size < 100) {
    throw new Error(`Backup ${FILENAME} demasiado pequeño (${stat.size} bytes). Posible fallo silencioso.`);
  }
  console.log(`[backup] OK: ${FILENAME} (${(stat.size / 1024).toFixed(1)} KB)`);
}

console.log('═══════════════════════════════════════════════════');
console.log(`  InmoControl — backup MySQL`);
console.log(`  DB: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
console.log(`  Timestamp: ${TIMESTAMP}`);
console.log(`  Retención: ${RETENTION_DAYS} días`);
console.log('═══════════════════════════════════════════════════\n');

try {
  ensureDir();
  runMysqldump();
  verify();
  const removed = rotate();
  const remaining = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('inmocontrol_')).length;
  console.log(`\n[backup] Listo. ${remaining} backups en disco, ${removed} borrados por antigüedad.`);
  console.log(`[backup] Para restaurar: gunzip ${FILENAME} | mysql -u root -p ${DB_NAME}`);
  process.exit(0);
} catch (err) {
  console.error('\n[backup] FAILED:', err.message);
  process.exit(1);
}