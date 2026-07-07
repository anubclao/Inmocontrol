// Bundlea server.ts y todas sus dependencias (incluyendo lógica compartida
// en src/features/billing y src/utils) en un único archivo JS para deploy.
// Usa esbuild (ya disponible como dep transitiva de vite).
//
// Output: dist-server/server.js (single file, listo para `node` directo).

import { build } from 'esbuild';
import { existsSync } from 'node:fs';

const ENTRY = 'server.ts';
const OUTFILE = 'dist-server/server.js';
const OUTDIR = 'dist-server';

if (!existsSync(ENTRY)) {
  console.error(`[build:server] No encuentro ${ENTRY} (cwd: ${process.cwd()})`);
  process.exit(1);
}

try {
  const result = await build({
    entryPoints: [ENTRY],
    outfile: OUTFILE,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    // Mantenemos los imports externos (no se bundlean) — son deps de npm
    // que se instalan via npm install en el server.
    packages: 'external',
    // Banner solo con createRequire (server.ts ya declara __filename/__dirname).
    banner: {
      js: "import { createRequire as __cR } from 'module';\nconst require = __cR(import.meta.url);\n",
    },
    sourcemap: false,
    minify: false,
    logLevel: 'info',
    metafile: true,
    // Resuelve los `.js` que aparecen en server.ts (import './server/db.js')
    // apuntando al .ts original — esbuild lo maneja solo.
    resolveExtensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
  });

  if (result.errors.length > 0) {
    console.error('[build:server] errores:', result.errors);
    process.exit(1);
  }

  console.log(`[build:server] OK → ${OUTFILE}`);
  console.log(`[build:server] Output dir: ${OUTDIR}/`);
} catch (err) {
  console.error('[build:server] falló:', err);
  process.exit(1);
}