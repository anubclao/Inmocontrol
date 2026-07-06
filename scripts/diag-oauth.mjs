import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mysql from 'mysql2/promise';

const db = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inmocontrol',
});

const [cols] = await db.query(
  "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_oauth_tokens' ORDER BY ORDINAL_POSITION"
);
console.log('--- schema user_oauth_tokens ---');
console.table(cols);

const [rows] = await db.query(
  "SELECT id, user_id, provider, LEFT(access_token, 25) AS access_token_prefix, LEFT(refresh_token, 20) AS refresh_token_prefix, expiry_date, drive_folder_id, created_at, updated_at FROM user_oauth_tokens"
);
console.log('--- filas ---');
console.table(rows);

const [props] = await db.query(
  "SELECT id, address, drive_folder_id, drive_folder_path FROM properties ORDER BY created_at DESC LIMIT 5"
);
console.log('--- últimas 5 propiedades ---');
console.table(props);

await db.end();