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
for (const t of ['organizations', 'profiles', 'saas_subscriptions', 'saas_plans']) {
  const [cols] = await pool.query(`SHOW COLUMNS FROM ${t}`);
  console.log(`=== ${t} ===`);
  for (const c of cols) console.log(`  ${c.Field} (${c.Type}) ${c.Null === 'NO' ? 'NOT NULL' : ''} ${c.Key ? `[${c.Key}]` : ''}`);
}
await pool.end();
