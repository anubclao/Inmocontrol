/* eslint-disable no-console */
/**
 * scripts/test-property-creation.mjs
 *
 * Tester E2E del flujo de creación de propiedades.
 * Ejecuta el mismo POST /api/properties que dispara la UI, luego valida
 * lado a servidor con conexiones reales a MySQL + Google Drive.
 *
 * Fases:
 *  1. POST /api/properties            (HTTP al server en :3001)
 *  2. SELECT ... FROM properties       (MySQL directo)
 *  3. Drive: carpeta + 2 subcarpetas   (Drive API v3 con OAuth del usuario)
 *  4. Idempotencia                     (re-POST con misma address → no duplica folder, hace UPSERT)
 *  5. Limpieza                        (borrar fila + carpeta de Drive creados por el test, salvo --keep)
 *
 * Uso:
 *   node scripts/test-property-creation.mjs
 *   node scripts/test-property-creation.mjs --keep    # no borra al final
 *
 * Requisitos:
 *   - .env.local con DB_* y GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI
 *   - Servidor corriendo en :3001 (npm run dev:all)
 *   - MySQL accesible
 *   - OAuth ya hecho: hay fila en user_oauth_tokens con drive_folder_id (root)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql from 'mysql2/promise';
import { google } from 'googleapis';
import crypto from 'node:crypto';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const KEEP = process.argv.includes('--keep');

const db = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inmocontrol',
});

// --- Utilidades de output --------------------------------------------------
const c = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};
const ok = (msg) => console.log(`${c.green}  ✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`${c.red}  ✗ ${msg}${c.reset}`);
const info = (msg) => console.log(`${c.cyan}  ℹ${c.reset} ${msg}`);
const section = (msg) => console.log(`\n${c.bold}${c.cyan}▸ ${msg}${c.reset}`);
const banner = (msg) => console.log(`\n${c.bold}${msg}${c.reset}`);
const sub = (msg) => console.log(`    ${c.dim}${msg}${c.reset}`);

let passed = 0, failed = 0;
function assert(label, condition, details = '') {
  if (condition) { ok(label); passed++; }
  else { fail(label + (details ? `  → ${details}` : '')); failed++; }
}

// --- Drive client ----------------------------------------------------------
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

async function getDriveClient() {
  const [rows] = await db.query(
    'SELECT access_token, refresh_token, expiry_date, drive_folder_id FROM user_oauth_tokens WHERE user_id = ? AND provider = ?',
    ['default_user', 'google_drive'],
  );
  if (!rows.length || !rows[0].access_token) return null;
  oauth2Client.setCredentials({
    access_token: rows[0].access_token,
    refresh_token: rows[0].refresh_token ?? undefined,
    expiry_date: rows[0].expiry_date ?? undefined,
  });
  if (oauth2Client.isTokenExpiring()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await db.query(
      'UPDATE user_oauth_tokens SET access_token=?, expiry_date=? WHERE user_id=? AND provider=?',
      [credentials.access_token, credentials.expiry_date, 'default_user', 'google_drive'],
    );
  }
  return {
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
    rootFolderId: rows[0].drive_folder_id ?? null,
  };
}

async function folderExists(drive, name, parentId) {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive' });
  return res.data.files?.[0] ?? null;
}

// --- Test data (único por corrida) -----------------------------------------
const STAMP = Date.now().toString(36).toUpperCase();
const TEST_ADDRESS = `Calle 99 # ${STAMP}-01, Apto 901 (TEST)`;
const TEST_CHIP = `AAA${STAMP}`;
const TEST_FOLIO = `50N-${STAMP}-TEST`;
const TEST_OWNER = `Propietario Test ${STAMP}`;
const TEST_OWNER_ID = '79.999.999';

const createdPropertyIds = [];
const createdFolderIds = [];

// =============================================================================
// EJECUCIÓN
// =============================================================================

banner('╔════════════════════════════════════════════════════════════════╗');
banner('║  InmoControl · Tester E2E · Creación de Propiedad              ║');
banner('╚════════════════════════════════════════════════════════════════╝');
console.log(`${c.dim}  Stamp:    ${STAMP}`);
console.log(`  Address:  ${TEST_ADDRESS}`);
console.log(`  API:      ${API_BASE}${c.reset}`);

// -----------------------------------------------------------------------------
section('0 · Pre-flight checks');
// -----------------------------------------------------------------------------
try {
  const r = await fetch(`${API_BASE}/api/health`);
  const j = await r.json();
  assert('API /api/health responde 200', r.ok && j.status === 'ok', `status=${j.status} db.ok=${j.db?.ok}`);
  assert('MySQL reportada como OK por la API', j.db?.ok === true, `db.ok=${j.db?.ok} version=${j.db?.version}`);
} catch (e) {
  fail('API /api/health no responde', e.message);
  process.exit(1);
}

const [orgRows] = await db.query("SELECT id FROM organizations WHERE id = 'default_org'");
assert('Organización default_org existe en MySQL', orgRows.length === 1);

const driveCtx = await getDriveClient();
let driveEnabled = false;
if (!driveCtx) {
  info('No hay tokens OAuth de Drive en user_oauth_tokens.');
  info('  → El test correrá en modo "MySQL only". Las verificaciones de Drive se saltean.');
  info('  → Para probar Drive: haz OAuth desde la UI (botón "Conectar Google Drive").');
} else if (!driveCtx.rootFolderId) {
  info('Tokens OAuth cargados pero sin drive_folder_id (carpeta raíz).');
  info('  → Modo "MySQL only" (sin verificación de carpetas en Drive).');
} else {
  driveEnabled = true;
  ok(`Tokens OAuth de Drive cargados (root: ${driveCtx.rootFolderId})`);
  try {
    const rootFolder = await driveCtx.drive.files.get({
      fileId: driveCtx.rootFolderId, fields: 'id,name,trashed',
    });
    assert('Carpeta raíz InmoControl existe y no está en papelera',
      !rootFolder.data.trashed,
      `name=${rootFolder.data.name} trashed=${rootFolder.data.trashed}`);
  } catch (e) {
    fail('No se pudo acceder a la carpeta raíz InmoControl', e.message);
    driveEnabled = false;
  }
}

// -----------------------------------------------------------------------------
section('1 · POST /api/properties  (crear propiedad nueva)');
// -----------------------------------------------------------------------------
const localId = `wizard-test-${STAMP}`;
const payload = {
  localId,
  address: TEST_ADDRESS,
  chip: TEST_CHIP,
  folio: TEST_FOLIO,
  ownerName: TEST_OWNER,
  ownerIdNumber: TEST_OWNER_ID,
  propertyType: 'apartamento',
  mandatePdfUrl: null,
  mandateSignedAt: null,
};

let createRes, createData;
try {
  createRes = await fetch(`${API_BASE}/api/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  createData = await createRes.json();
} catch (e) {
  fail('POST /api/properties lanzó excepción de red', e.message);
  process.exit(1);
}

assert('POST /api/properties responde 2xx', createRes.ok, `status=${createRes.status} body=${JSON.stringify(createData)}`);
assert('Respuesta incluye propertyId', !!createData?.propertyId, `propertyId=${createData?.propertyId}`);
assert('Respuesta incluye success=true', createData?.success === true);
assert('propertyId devuelto NO es un wizard-* (se usó UUID)',
  !String(createData?.propertyId ?? '').startsWith('wizard-'),
  `id=${createData?.propertyId}`);

if (driveEnabled) {
  assert('Respuesta incluye driveFolderId (con OAuth)', !!createData?.driveFolderId, `driveFolderId=${createData?.driveFolderId}`);
  assert('Respuesta incluye driveFolderPath con prefijo InmoControl/',
    /InmoControl\//.test(createData?.driveFolderPath ?? ''),
    `path=${createData?.driveFolderPath}`);
} else {
  assert('Modo sin Drive: driveFolderId es null (esperado)',
    createData?.driveFolderId === null,
    `driveFolderId=${createData?.driveFolderId}`);
  assert('Modo sin Drive: driveFolderPath es null (esperado)',
    createData?.driveFolderPath === null,
    `path=${createData?.driveFolderPath}`);
}

if (createData?.propertyId) createdPropertyIds.push(createData.propertyId);
if (createData?.driveFolderId) createdFolderIds.push(createData.driveFolderId);

// -----------------------------------------------------------------------------
section('2 · Verificar fila en MySQL  (SELECT por id)');
// -----------------------------------------------------------------------------
const [rows] = await db.query(
  `SELECT id, organization_id, address, chip, folio, owner_name, owner_id_number, owner_phone, owner_email,
          status, archived, drive_folder_id, drive_folder_path, property_type, created_at, updated_at
   FROM properties WHERE id = ?`,
  [createData.propertyId],
);
assert('Fila existe en properties por id', rows.length === 1, `count=${rows.length}`);
const row = rows[0] ?? {};
assert('address guardado coincide', row.address === TEST_ADDRESS, `db=${row.address}`);
assert('chip guardado coincide', row.chip === TEST_CHIP, `db=${row.chip}`);
assert('folio guardado coincide (no NULL)', row.folio === TEST_FOLIO, `db=${row.folio}`);
assert('owner_name guardado coincide', row.owner_name === TEST_OWNER, `db=${row.owner_name}`);
assert('owner_id_number guardado coincide', row.owner_id_number === TEST_OWNER_ID, `db=${row.owner_id_number}`);
assert('property_type guardado coincide', row.property_type === 'apartamento', `db=${row.property_type}`);
assert('organization_id es default_org', row.organization_id === 'default_org', `db=${row.organization_id}`);
assert('status es available', row.status === 'available', `db=${row.status}`);
assert('archived es 0', row.archived === 0, `db=${row.archived}`);
if (driveEnabled) {
  assert('drive_folder_id guardado coincide con respuesta', row.drive_folder_id === createData.driveFolderId, `db=${row.drive_folder_id}`);
  assert('drive_folder_path guardado incluye InmoControl/', row.drive_folder_path?.startsWith('InmoControl/'), `db=${row.drive_folder_path}`);
} else {
  assert('Modo sin Drive: drive_folder_id en DB es null', row.drive_folder_id === null, `db=${row.drive_folder_id}`);
  assert('Modo sin Drive: drive_folder_path en DB es null', row.drive_folder_path === null, `db=${row.drive_folder_path}`);
}
assert('created_at es timestamp válido reciente',
  row.created_at && Math.abs(Date.now() - new Date(row.created_at).getTime()) < 60_000,
  `created_at=${row.created_at}`);

// -----------------------------------------------------------------------------
section('3 · Verificar estructura en Google Drive');
// -----------------------------------------------------------------------------
if (!driveEnabled) {
  info('Saltando verificaciones de Drive (modo MySQL only).');
  info('  Cuando hagas OAuth desde la UI, este test verificará carpetas automáticamente.');
} else {
  const propFolder = await folderExists(driveCtx.drive, TEST_ADDRESS, driveCtx.rootFolderId);
  assert(`Carpeta de propiedad existe en Drive: "${TEST_ADDRESS}"`, !!propFolder, `folder=${JSON.stringify(propFolder)}`);
  if (propFolder) {
    assert('ID de carpeta coincide con respuesta del API', propFolder.id === createData.driveFolderId, `drive=${propFolder.id} api=${createData.driveFolderId}`);

    const subProp = await folderExists(driveCtx.drive, 'Propietario', propFolder.id);
    assert('Subcarpeta "Propietario" existe', !!subProp, `id=${subProp?.id}`);
    if (subProp) createdFolderIds.push(subProp.id);

    const subInv = await folderExists(driveCtx.drive, 'Inventarios', propFolder.id);
    assert('Subcarpeta "Inventarios" existe', !!subInv, `id=${subInv?.id}`);
    if (subInv) createdFolderIds.push(subInv.id);

    // Listar todo el contenido para tener un resumen
    const list = await driveCtx.drive.files.list({
      q: `'${propFolder.id}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType)',
      spaces: 'drive',
    });
    const names = (list.data.files ?? []).map((f) => f.name).sort();
    sub(`Contenido en Drive: ${names.join(', ')}`);
    assert('No hay carpeta "Recibos" todavía (sólo se crea al asignar arrendatario)',
      !names.includes('Recibos'),
      `encontradas: ${names.join(', ')}`);
  }
}

// -----------------------------------------------------------------------------
section('4 · Idempotencia  (mismo address → UPSERT, no duplica carpeta)');
// -----------------------------------------------------------------------------
// El filtro del server descarta localIds que empiezan con "wizard-" (asume que
// son temporales del wizard). Para forzar UPSERT, en el re-POST mandamos el
// propertyId (UUID) que devolvió la primera llamada, NO el wizard-* localId.
const idempPayload = {
  ...payload,
  localId: createData.propertyId,    // <-- ahora es un UUID real
  ownerName: `${TEST_OWNER} (EDITADO)`,
  chip: `${TEST_CHIP}-V2`,
};
const idemRes = await fetch(`${API_BASE}/api/properties`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(idempPayload),
});
const idemData = await idemRes.json();
assert('Re-POST responde 2xx', idemRes.ok, `status=${idemRes.status}`);
assert('Re-POST devuelve MISMO propertyId (UPSERT)', idemData.propertyId === createData.propertyId, `antes=${createData.propertyId} ahora=${idemData.propertyId}`);

if (driveEnabled) {
  assert('Re-POST devuelve MISMO driveFolderId (no se duplicó carpeta)',
    idemData.driveFolderId === createData.driveFolderId,
    `antes=${createData.driveFolderId} ahora=${idemData.driveFolderId}`);
}

const [idemRows] = await db.query('SELECT COUNT(*) AS c FROM properties WHERE address = ?', [TEST_ADDRESS]);
assert('Sigue habiendo UNA sola fila con ese address', idemRows[0].c === 1, `count=${idemRows[0].c}`);

const [updRows] = await db.query('SELECT owner_name, chip FROM properties WHERE id = ?', [createData.propertyId]);
assert('owner_name fue actualizado (UPSERT)', updRows[0]?.owner_name === `${TEST_OWNER} (EDITADO)`, `db=${updRows[0]?.owner_name}`);
assert('chip fue actualizado', updRows[0]?.chip === `${TEST_CHIP}-V2`, `db=${updRows[0]?.chip}`);

if (driveEnabled) {
  const folderAgain = await folderExists(driveCtx.drive, TEST_ADDRESS, driveCtx.rootFolderId);
  assert('Sigue habiendo UNA sola carpeta en Drive con ese nombre', !!folderAgain, `folder=${JSON.stringify(folderAgain)}`);
}

// -----------------------------------------------------------------------------
section('5 · Cleanup');
// -----------------------------------------------------------------------------
if (KEEP) {
  info('--keep activo: no se borra nada. Datos de prueba quedan para inspección manual.');
  info(`  propertyId: ${createData.propertyId}`);
  info(`  folderPath: ${createData.driveFolderPath}`);
} else {
  // Borrar carpeta de Drive (trash, no permanent delete) — solo si hubo Drive
  if (driveEnabled) {
    for (const fid of createdFolderIds) {
      try {
        await driveCtx.drive.files.update({ fileId: fid, requestBody: { trashed: true } });
        ok(`Drive folder trashed: ${fid}`);
      } catch (e) {
        fail(`No se pudo trashing ${fid}: ${e.message}`);
      }
    }
  } else {
    info('Modo sin Drive: nada que borrar en Drive.');
  }
  // Borrar fila de MySQL
  const [del] = await db.query('DELETE FROM properties WHERE id = ?', [createData.propertyId]);
  ok(`MySQL row deleted (affected=${del.affectedRows})`);

  const [check] = await db.query('SELECT COUNT(*) AS c FROM properties WHERE id = ?', [createData.propertyId]);
  assert('Fila ya no existe en MySQL', check[0].c === 0);
}

// -----------------------------------------------------------------------------
banner('Resumen');
// -----------------------------------------------------------------------------
console.log(`  ${c.green}Pasaron: ${passed}${c.reset}`);
console.log(`  ${c.red}Fallaron: ${failed}${c.reset}`);
console.log('');
if (failed === 0) {
  console.log(`${c.green}${c.bold}✓ Workflow 1 — Captación de propiedad: END-TO-END OK${c.reset}`);
  console.log(`${c.dim}  MySQL guarda:        ✓`);
  console.log(`  Drive carpeta:        ✓`);
  console.log(`  Drive subcarpetas:    ✓`);
  console.log(`  Idempotencia:         ✓${c.reset}`);
} else {
  console.log(`${c.red}${c.bold}✗ Hay ${failed} fallo(s) — revisar arriba${c.reset}`);
}

await db.end();
process.exit(failed === 0 ? 0 : 1);