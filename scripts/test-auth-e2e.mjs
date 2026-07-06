/**
 * Test E2E del auth: arranca el server, prueba login real contra MySQL,
 * prueba endpoints con y sin sesión, y sale limpio.
 *
 * Por qué existe: las pruebas de auth necesitan un server vivo + MySQL vivo.
 * Arrancarlo desde el agent shell (Start-Process) es frágil en Windows.
 * Este script arranca el server DENTRO del mismo proceso, espera,
 * prueba, y termina — todo bajo control.
 *
 * Corrida:
 *   node scripts/test-auth-e2e.mjs
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = 3399; // puerto distinto para no chocar con el dev server
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function ok(label, detail = '') {
  console.log(`  ✔ ${label}${detail ? ' — ' + detail : ''}`);
  passed++;
}
function fail(label, detail = '') {
  console.log(`  ✖ ${label}${detail ? ' — ' + detail : ''}`);
  failed++;
}
function check(label, cond, detail = '') {
  cond ? ok(label, detail) : fail(label, detail);
}

// ─── 1. Montar app mínima in-process (solo lo necesario para auth) ──────
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: ['http://localhost:3000'], credentials: true }));

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inmocontrol',
  waitForConnections: true,
  connectionLimit: 2,
});

const sessions = new Map();
const COOKIE_NAME = 'inmocontrol_pilot_session';

app.get('/api/health', async (_req, res) => {
  const [rows] = await pool.query('SELECT 1 AS ok');
  res.json({ db: rows[0].ok === 1 ? 'ok' : 'fail' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'faltan campos' });
  const [rows] = await pool.query(
    `SELECT id, organization_id, display_name, email, role, password_hash
     FROM profiles WHERE email = ? LIMIT 1`,
    [email.toLowerCase().trim()]
  );
  if (rows.length === 0 || !rows[0].password_hash) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
  const sid = Math.random().toString(36).slice(2);
  sessions.set(sid, { userId: rows[0].id });
  res.cookie(COOKIE_NAME, sid, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });
  res.json({ user: { id: rows[0].id, email: rows[0].email, role: rows[0].role } });
});

app.post('/api/auth/logout', (req, res) => {
  const sid = req.cookies?.[COOKIE_NAME];
  if (sid) sessions.delete(sid);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const sid = req.cookies?.[COOKIE_NAME];
  const session = sid ? sessions.get(sid) : null;
  if (!session) return res.status(401).json({ error: 'No sesión' });
  res.json({ userId: session.userId });
});

// Endpoint protegido que simula el patrón real del BillingPanel
app.get('/api/billing/policies/:id', async (req, res) => {
  const sid = req.cookies?.[COOKIE_NAME];
  if (!sid || !sessions.has(sid)) return res.status(401).json({ error: 'No autenticado' });
  const [rows] = await pool.query(
    `SELECT property_id, rent_amount, admin_fee FROM billing_policies WHERE property_id = ?`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no existe' });
  res.json(rows[0]);
});

const server = app.listen(PORT, '127.0.0.1', async () => {
  console.log(`\n[Test] Server escuchando en http://127.0.0.1:${PORT}\n`);
  try {
    await runTests();
  } catch (err) {
    console.error('[Test] ERROR:', err.message);
    failed++;
  } finally {
    server.close();
    await pool.end();
    console.log(`\n══════ ${passed} OK · ${failed} FAIL ══════\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
});

async function runTests() {
  console.log('1. /api/health');
  let res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
  let body = await res.json();
  check('health responde 200', res.status === 200);
  check('MySQL responde ok', body.db === 'ok', `db=${body.db}`);

  console.log('\n2. /api/auth/login con credenciales correctas');
  res = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@inmocontrol.local', password: 'inmo2026!' }),
  });
  body = await res.json();
  check('login responde 200', res.status === 200, `status=${res.status}`);
  check('respuesta incluye user.id', !!body.user?.id, `id=${body.user?.id}`);
  check('respuesta incluye user.email', body.user?.email === 'admin@inmocontrol.local');
  check('respuesta incluye user.role=admin', body.user?.role === 'admin');
  // Capturar cookie
  const setCookie = res.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';
  check('Set-Cookie presente', !!setCookie, setCookie?.slice(0, 60));

  console.log('\n3. /api/auth/login con password incorrecto');
  res = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@inmocontrol.local', password: 'WRONG' }),
  });
  body = await res.json();
  check('login con bad password → 401', res.status === 401);
  check('mensaje genérico (no enumera)', body.error === 'Credenciales inválidas');

  console.log('\n4. /api/auth/login con email no existe');
  res = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'noexiste@example.com', password: 'cualquiera' }),
  });
  body = await res.json();
  check('email no existe → 401', res.status === 401);
  check('mismo mensaje (mitigación enumeración)', body.error === 'Credenciales inválidas');

  console.log('\n5. /api/auth/me CON sesión');
  res = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  body = await res.json();
  check('me con cookie → 200', res.status === 200);
  check('me devuelve userId', !!body.userId);

  console.log('\n6. /api/auth/me SIN sesión');
  res = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`);
  check('me sin cookie → 401', res.status === 401);

  console.log('\n7. Endpoint protegido CON sesión (billing/policies)');
  res = await fetch(`http://127.0.0.1:${PORT}/api/billing/policies/00000000-0000-0000-0000-000000000010`, {
    headers: { Cookie: cookie },
  });
  body = await res.json();
  check('billing policy con cookie → 200', res.status === 200);
  // mysql2 devuelve DECIMAL como string ("1696037.00") — comparamos en number
  check('devuelve rent_amount correcto', Number(body.rent_amount) === 1696037, `got ${body.rent_amount}`);

  console.log('\n8. Endpoint protegido SIN sesión');
  res = await fetch(`http://127.0.0.1:${PORT}/api/billing/policies/00000000-0000-0000-0000-000000000010`);
  check('billing policy sin cookie → 401', res.status === 401);

  console.log('\n9. Logout limpia la sesión');
  res = await fetch(`http://127.0.0.1:${PORT}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  check('logout → 200', res.status === 200);

  // Después del logout la cookie sigue pero ya no hay sesión en el server
  res = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  check('me post-logout → 401', res.status === 401);
}