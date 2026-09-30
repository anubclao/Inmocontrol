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
try {
  const [orgInv] = await pool.query(
    `SELECT id FROM org_invitations WHERE email LIKE 'user-mgmt-test-%@example.com' OR email = 'cross-org@example.com'`
  );
  for (const r of orgInv) await pool.query(`DELETE FROM org_invitations WHERE id = ?`, [r.id]);
} catch (e) {
  // Tabla no existe todavia (migracion 016 no aplicada) -- ignorar
  if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
}
const [users] = await pool.query(
  `SELECT id FROM profiles WHERE email LIKE 'user-mgmt-test-%@example.com' OR email = 'cross-org@example.com'`
);
for (const r of users) await pool.query(`DELETE FROM profiles WHERE id = ?`, [r.id]);
console.log('CLEANUP OK');
await pool.end();
