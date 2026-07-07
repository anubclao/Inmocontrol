// Borra los artefactos de build (frontend + backend compilado).
// Equivalente cross-platform a `rm -rf dist dist-server`.
import { rmSync } from 'node:fs';

const targets = ['dist', 'dist-server', 'dev-dist'];
for (const t of targets) {
  try {
    rmSync(t, { recursive: true, force: true });
    console.log(`[clean] ${t} eliminado`);
  } catch (err) {
    console.warn(`[clean] no se pudo eliminar ${t}:`, err.message);
  }
}