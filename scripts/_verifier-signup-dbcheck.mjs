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
const [orgs] = await pool.query(`SELECT id, name, created_by FROM organizations WHERE created_by = ?`, ['signup-test-1@example.com']);
const [users] = await pool.query(`SELECT id, organization_id, email, role, display_name FROM profiles WHERE email = ?`, ['signup-test-1@example.com']);
const [subs] = await pool.query(`SELECT s.id, s.organization_id, s.status, s.current_period_start, s.current_period_end, p.slug FROM saas_subscriptions s JOIN saas_plans p ON s.plan_id = p.id JOIN organizations o ON s.organization_id = o.id WHERE o.created_by = ?`, ['signup-test-1@example.com']);
console.log(JSON.stringify({ orgs, users, subs }));
await pool.end();
