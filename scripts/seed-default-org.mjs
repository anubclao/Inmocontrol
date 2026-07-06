import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inmocontrol',
});

const orgId = 'default_org';

// Asegurar organización
await conn.query(
  `INSERT INTO organizations (id, name, nit) VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE name = VALUES(name)`,
  [orgId, 'InmoControl Demo', '900.123.456-7']
);
console.log('Organization OK:', orgId);

// Asegurar perfil admin
const profileId = 'default_profile';
await conn.query(
  `INSERT INTO profiles (id, organization_id, display_name, email, role)
   VALUES (?, ?, ?, ?, 'admin')
   ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
  [profileId, orgId, 'Admin Demo', 'admin@inmocontrol.demo']
);
console.log('Profile OK:', profileId);

await conn.end();
console.log('Done');