import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
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
// Borrar en orden inverso a las FKs.
const [subs] = await pool.query(`SELECT s.id FROM saas_subscriptions s JOIN organizations o ON s.organization_id = o.id WHERE o.created_by LIKE 'signup-test-%@example.com'`);
for (const r of subs) await pool.query(`DELETE FROM saas_subscriptions WHERE id = ?`, [r.id]);
const [orgs] = await pool.query(`SELECT id FROM organizations WHERE created_by LIKE 'signup-test-%@example.com'`);
for (const r of orgs) await pool.query(`DELETE FROM organizations WHERE id = ?`, [r.id]);
const [users] = await pool.query(`SELECT id FROM profiles WHERE email LIKE 'signup-test-%@example.com'`);
for (const r of users) await pool.query(`DELETE FROM profiles WHERE id = ?`, [r.id]);
console.log('CLEANUP OK');
await pool.end();
