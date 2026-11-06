// `npm run build` corre en dos contextos muy distintos:
//
//   1. Local / CI → hay devDependencies (vite, esbuild, typescript): se compila.
//   2. Deploy en el servidor → `npm ci --omit=dev` deja node_modules sin vite
//      ni esbuild, así que compilar es imposible. Ahí el artefacto ya viene
//      versionado en dist/ y dist-server/.
//
// Por qué existe este archivo: hPanel ejecuta `npm run build` como paso propio
// del deploy aunque el build venga en el repo. Sin este guard, el deploy muere
// con "vite: command not found" justo después de instalar solo producción.
//
// No es un no-op silencioso: si el artefacto no está, falla con mensaje claro.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ARTIFACTS = ['dist/index.html', 'dist-server/server.js'];

const hasBuildTooling =
  existsSync('node_modules/vite/package.json') &&
  existsSync('node_modules/esbuild/package.json');

if (!hasBuildTooling) {
  console.log('[build] Sin devDependencies (deploy de producción): no se compila en el servidor.');

  for (const artifact of ARTIFACTS) {
    if (!existsSync(artifact)) {
      console.error(`\n[build] Falta ${artifact} y no hay con qué generarlo.`);
      console.error('[build] → Corré `npm run build` en local y volvé a pushear.');
      process.exit(1);
    }
  }

  console.log('[build] OK — se sirve el build versionado en dist/ y dist-server/.');
  process.exit(0);
}

// Se invocan los entry points con `node` directo (no `npm run`) para no
// depender del shell ni del wrapper de npm en Windows.
const STEPS = [
  { label: 'build:client', args: ['node_modules/vite/bin/vite.js', 'build'] },
  { label: 'build:server', args: ['scripts/build-server.mjs'] },
];

for (const step of STEPS) {
  console.log(`[build] → ${step.label}`);
  const result = spawnSync(process.execPath, step.args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n[build] Falló ${step.label} (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}
