// Guard de pre-deploy: el servidor de Hostinger ya NO compila.
// `dist/` y `dist-server/` viajan en el commit, así que si se pushea sin
// recompilar, el deploy "sale bien" y sigue sirviendo el bundle anterior
// en silencio. Este script convierte ese fallo silencioso en un error duro.
//
// Uso:
//   npm run predeploy-check
//   BUILD_MAX_AGE_MINUTES=60 npm run predeploy-check   (relajar la ventana)
//   BUILD_MAX_AGE_MINUTES=0  npm run predeploy-check   (sin ventana; solo
//                                                      existencia + código nuevo)
//
// También sirve como hook pre-push de Git (ver DEPLOY.md).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS = [
  { path: 'dist-server/server.js', label: 'bundle del servidor' },
  { path: 'dist/index.html', label: 'frontend compilado' },
];

// Fuentes que obligan a recompilar. Se compara su mtime contra el artefacto.
const SOURCE_DIRS = ['src', 'server'];
const SOURCE_FILES = ['server.ts', 'vite.config.ts', 'index.html', 'package.json'];

const MAX_AGE_MINUTES = Number(process.env.BUILD_MAX_AGE_MINUTES ?? 15);
const MAX_AGE_MS = MAX_AGE_MINUTES * 60 * 1000;

const errors = [];

function fail(msg, hint) {
  errors.push({ msg, hint });
}

// ─── 1. Los artefactos existen ───────────────────────────────────────────
for (const artifact of ARTIFACTS) {
  if (!existsSync(artifact.path)) {
    fail(
      `Falta ${artifact.path} (${artifact.label}).`,
      'Corré `npm run build` antes de pushear.',
    );
  }
}

if (errors.length === 0) {
  const oldestArtifact = Math.min(
    ...ARTIFACTS.map((a) => statSync(a.path).mtimeMs),
  );

  // ─── 2. Ningún artefacto es más viejo que la ventana permitida ─────────
  // 0 = sin ventana (el hook pre-push lo usa así: no tiene sentido bloquear
  // el push de un README por no recompilar, pero sí bloquear código sin build).
  if (MAX_AGE_MINUTES > 0) {
    const ageMinutes = (Date.now() - oldestArtifact) / 60000;
    if (ageMinutes > MAX_AGE_MINUTES) {
      fail(
        `El build tiene ${ageMinutes.toFixed(0)} min (límite ${MAX_AGE_MINUTES} min).`,
        'Corré `npm run build` antes de pushear, o subí BUILD_MAX_AGE_MINUTES si es intencional.',
      );
    }
  }

  // ─── 3. El build no quedó atrás de los últimos cambios de código ───────
  const newestSource = findNewestSourceModified();
  if (newestSource && newestSource.mtimeMs > oldestArtifact) {
    fail(
      `Hay cambios sin compilar: ${newestSource.path} es más nuevo que el build.`,
      'Corré `npm run build` y volvé a intentar.',
    );
  }

  // ─── 4. El index.html apunta a assets que realmente existen ────────────
  for (const missing of findMissingAssets()) {
    fail(
      `dist/index.html referencia ${missing}, que no existe en dist/.`,
      'El frontend quedó a medio compilar: borrá `dist/` y corré `npm run build`.',
    );
  }
}

if (errors.length > 0) {
  console.error('\n[predeploy-check] BLOQUEADO — no pushees todavía.\n');
  for (const { msg, hint } of errors) {
    console.error(`  ✗ ${msg}`);
    if (hint) console.error(`    → ${hint}`);
  }
  console.error('');
  process.exit(1);
}

const age = ((Date.now() - statSync('dist-server/server.js').mtimeMs) / 60000).toFixed(1);
console.log(`[predeploy-check] OK — artefactos al día (${age} min de antigüedad).`);
console.log('[predeploy-check] Recordá: el servidor hace `npm ci --omit=dev`, no compila.');

// ─── Helpers ────────────────────────────────────────────────────────────

function findNewestSourceModified() {
  let newest = null;

  const consider = (filePath) => {
    if (!existsSync(filePath)) return;
    const { mtimeMs } = statSync(filePath);
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path: filePath, mtimeMs };
  };

  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|css|html|json)$/.test(entry.name)) continue;
      consider(full);
    }
  };

  for (const dir of SOURCE_DIRS) walk(dir);
  for (const file of SOURCE_FILES) consider(file);

  return newest;
}

function findMissingAssets() {
  const html = readFileSync('dist/index.html', 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1]);
  return refs.filter((ref) => !existsSync(join('dist', ref)));
}
