import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
// Cargar .env.local explicitamente para que DB_USER, DB_PASSWORD, etc. esten.
loadEnv({ path: '.env.local' });
import mysql from 'mysql2/promise';
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
});
await pool.query(`DELETE FROM properties WHERE address LIKE 'TEST-OrgB-%'`);
await pool.query(`DELETE FROM profiles WHERE email = 'adminb@test.com'`);
await pool.query(`DELETE FROM organizations WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`);
console.log('CLEANUP OK');
await pool.end();
