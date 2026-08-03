// Diagnóstico: muestra qué user_id tiene tokens en user_oauth_tokens
// y la lista de usuarios que pueden loguearse (deberían coincidir 1:1).
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: +process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

console.log("\n=== USER_OAUTH_TOKENS (Drive del usuario) ===");
const [tokens] = await conn.query(
  `SELECT user_id, provider, drive_folder_id,
          LEFT(access_token, 25) AS atk_prefix,
          expiry_date,
          CASE WHEN refresh_token IS NULL THEN 'NO_REFRESH' ELSE 'has_refresh' END AS rt,
          updated_at
   FROM user_oauth_tokens
   ORDER BY updated_at DESC`,
);
console.table(tokens);

console.log("\n=== PROFILES (usuarios que pueden loguearse) ===");
const [profiles] = await conn.query(
  `SELECT id, email, display_name, role
   FROM profiles
   ORDER BY email`,
);
console.table(profiles);

console.log("\n=== ANÁLISIS ===");
const tokenUsers = new Set(tokens.map((t) => t.user_id));
const profileIds = new Set(profiles.map((p) => p.id));
const profileEmails = new Set(profiles.map((p) => p.email));

for (const tu of tokenUsers) {
  if (tu === "default_user") {
    console.log(
      `⚠️  Tokens guardados como "default_user" (literal). NO matchea con ningún profile_id ni email.`,
    );
    console.log(
      `    → El backend hardcodea userId='default_user' en TODOS los routes de Drive.`,
    );
  } else if (profileIds.has(tu)) {
    console.log(`✅  user_id "${tu}" → coincide con un profile.id`);
  } else if (profileEmails.has(tu)) {
    console.log(`✅  user_id "${tu}" → coincide con un profile.email`);
  } else {
    console.log(`❌  user_id "${tu}" → NO existe en profiles (huérfano)`);
  }
}

await conn.end();
