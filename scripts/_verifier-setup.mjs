import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
// Cargar .env.local explicitamente para que DB_USER, DB_PASSWORD, etc. esten.
loadEnv({ path: '.env.local' });
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
});
const hash = await bcrypt.hash('test1234', 10);
await pool.query(`DELETE FROM properties WHERE address LIKE 'TEST-OrgB-%'`);
await pool.query(`DELETE FROM profiles WHERE email = 'adminb@test.com'`);
await pool.query(`DELETE FROM organizations WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`);
await pool.query(`INSERT INTO organizations (id, name, created_by) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Org B Test', 'test-verifier')`);
await pool.query(`INSERT INTO profiles (id, organization_id, display_name, email, role, password_hash, created_by) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Admin Org B', 'adminb@test.com', 'admin', ?, 'test-verifier')`, [hash]);
await pool.query(`INSERT INTO properties (id, address, status, organization_id, owner_name, created_by) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10', 'TEST-OrgB-Property', 'Pendiente', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Owner B', 'test-verifier')`);
console.log('SETUP OK');
await pool.end();
