/**
 * Verificación REAL del rate limit de login (post-deploy).
 *
 * Por qué: la migración 017 arregla el conteo, pero el bug original era
 * invisible — los tests unitarios mockean MySQL y no prueban la restricción
 * UNIQUE. Este script habla con el server HTTP real y confirma que el bloqueo
 * se dispara al 6º intento fallido.
 *
 * Uso:
 *   node scripts/verify-rate-limit.mjs
 *   node scripts/verify-rate-limit.mjs https://inmocontrol.tecnowebsupportia.com
 *
 * Qué hace:
 *   1. Genera un email descartable (no existe en `profiles`).
 *   2. Manda 5 logins con password incorrecta → espera 401 INVALID_CREDENTIALS.
 *   3. Manda el 6º → espera 429 RATE_LIMITED.
 *   4. Control negativo: otro email distinto debe seguir dando 401 (el bloqueo
 *      es por IP+email, no global).
 *
 * No necesita credenciales de DB ni toca datos de negocio: los intentos
 * quedan en `login_attempts` y expiran solos de la ventana.
 */

const BASE = (
  process.argv[2] ||
  process.env.APP_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');

const stamp = Date.now();
const email = `rl-check-${stamp}@example.invalid`;
const emailControl = `rl-control-${stamp}@example.invalid`;
const WRONG_PASSWORD = `wrong-${stamp}-${Math.random().toString(36).slice(2)}`;

async function attempt(mail) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: mail, password: WRONG_PASSWORD }),
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  return { status: res.status, code: body.code, retryAfter: body.retryAfter };
}

function line(i, r) {
  return `  intento ${i}: ${r.status}${r.code ? ` (${r.code})` : ''}`;
}

console.log(`Verificando rate limit en ${BASE}`);
console.log(`email de prueba: ${email}\n`);

const results = [];
for (let i = 1; i <= 5; i++) {
  const r = await attempt(email);
  results.push(r);
  console.log(line(i, r));
}

const sixth = await attempt(email);
results.push(sixth);
console.log(line(6, sixth));

const control = await attempt(emailControl);
console.log(`${line(7, control).replace('intento 7', 'control (otro email)')}\n`);

const firstFiveOk = results.slice(0, 5).every((r) => r.status === 401);
const sixthBlocked = sixth.status === 429;
const controlOk = control.status === 401;

const checks = [
  ['los primeros 5 devuelven 401', firstFiveOk],
  ['el 6º devuelve 429 RATE_LIMITED', sixthBlocked],
  ['otro email sigue en 401 (no es bloqueo global)', controlOk],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${label}`);
  if (!ok) failed++;
}

if (failed === 0) {
  console.log('\nOK: el límite de intentos funciona contra el server real.');
  process.exit(0);
}

console.error(
  `\nFAIL: ${failed} verificación(es) no pasaron. ` +
    'Si el 6º devolvió 401, la migración 017 no está aplicada o el deploy no incluye el código nuevo.',
);
process.exit(1);
