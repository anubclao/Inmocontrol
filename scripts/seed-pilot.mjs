/**
 * InmoControl — Seed del Piloto (CLI wrapper).
 *
 * Carga .env.local y llama al módulo compartido `server/seed/pilotSeed.ts`.
 *
 * USO:
 *   node scripts/seed-pilot.mjs
 *
 * Idempotente: si ya hay un admin user, no hace nada.
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

import { runPilotSeed } from '../server/seed/pilotSeed.ts';

(async () => {
  const startedAt = Date.now();
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  InmoControl · Seed Piloto');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  DB: ${process.env.DB_HOST ?? '127.0.0.1'}:${process.env.DB_PORT ?? 3306}`);
  console.log(`  DB name: ${process.env.DB_NAME ?? 'inmocontrol'}`);
  console.log(`  PILOT_EMAIL: ${process.env.PILOT_EMAIL ?? '(default)'}`);
  console.log('');
  try {
    const result = await runPilotSeed();

    if (result.alreadySeeded) {
      console.log('⚠ La DB ya tiene un admin user registrado. Seed idempotente — no se hicieron cambios.');
      console.log(`  Admin existente: ${result.admin.email} (id=${result.admin.id})`);
    } else {
      console.log(`✔ Seed OK en ${Date.now() - startedAt}ms — stages: ${result.stages.join(', ')}`);
      console.log(`  Admin nuevo: ${result.admin.email} (id=${result.admin.id})`);
      console.log('');
      console.log('Credenciales del piloto:');
      console.log(`  Email:    ${process.env.PILOT_EMAIL ?? 'admin@inmocontrol.local'}`);
      console.log(`  Password: ${process.env.PILOT_PASSWORD ? '(oculto — ver env var)' : 'inmo2026! (default)'}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('  Seed FAILED');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error(err.message);
    if (err.sql) console.error('SQL:', err.sql);
    if (err.code) console.error('Code:', err.code);
    console.error(err);
    process.exit(1);
  }
})();
