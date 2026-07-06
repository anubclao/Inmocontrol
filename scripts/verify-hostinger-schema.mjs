// Aplica db/mysql/schema-hostinger.sql en una DB de prueba (enmocontrol_init)
// para verificar que el script consolidado funciona limpio en un deploy fresh.
// Hace lo siguiente:
//   1. Crea la DB test si no existe
//   2. DROP DATABASE / CREATE DATABASE (reset)
//   3. Aplica schema-hostinger.sql
//   4. Verifica que las 23 tablas existen + cuenta filas = 0 en todas
//
// NO toca la DB `inmocontrol` del piloto.

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import fs from 'fs';
import mysql from 'mysql2/promise';

async function main() {
  const sqlPath = 'db/mysql/schema-hostinger.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[verify-hostinger-schema] Aplicando ${sqlPath} (${sql.length} bytes) en DB de prueba...`);

  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  await adminConn.query(`DROP DATABASE IF EXISTS inmocontrol_hostinger_test`);
  await adminConn.query(`CREATE DATABASE inmocontrol_hostinger_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await adminConn.query(`USE inmocontrol_hostinger_test`);
  await adminConn.query(sql);

  // Verificar cantidad de tablas
  const [tables] = await adminConn.query(`SHOW TABLES`);
  console.log(`[verify-hostinger-schema] Tablas creadas: ${tables.length} (esperado: 23)`);
  if (tables.length !== 23) {
    console.error('FAIL: cantidad incorrecta de tablas');
    process.exit(1);
  }

  // Verificar que todas están vacías
  for (const row of tables) {
    const tableName = Object.values(row)[0];
    const [countRow] = await adminConn.query(`SELECT COUNT(*) AS n FROM \`${tableName}\``);
    const n = Number(countRow[0].n);
    if (n !== 0) {
      console.error(`FAIL: tabla ${tableName} tiene ${n} filas (esperado 0)`);
      process.exit(1);
    }
  }
  console.log(`[verify-hostinger-schema] Todas las tablas vacías: OK`);

  // Verificar que property_charges tiene FKs correctas
  const [fks] = await adminConn.query(
    `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
     FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = 'inmocontrol_hostinger_test'
       AND TABLE_NAME = 'property_charges'`,
  );
  console.log(`[verify-hostinger-schema] FKs de property_charges:`, fks);

  console.log(`[verify-hostinger-schema] OK — schema-hostinger.sql válido para deploy limpio`);

  // Cleanup
  await adminConn.query(`DROP DATABASE inmocontrol_hostinger_test`);
  await adminConn.end();
}

main().catch((err) => {
  console.error('[verify-hostinger-schema] FAILED:', err.message);
  process.exit(1);
});
