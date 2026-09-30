import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Anubclao2026",
  database: "inmocontrol",
});

console.log("=== user_oauth_tokens COMPLETO (sin filtrar) ===");
const [rows] = await c.query(
  `SELECT user_id, provider,
          LENGTH(access_token) AS access_token_len,
          LENGTH(refresh_token) AS refresh_token_len,
          drive_folder_id,
          expiry_date,
          created_at
     FROM user_oauth_tokens`,
);
console.log(JSON.stringify(rows, null, 2));

await c.end();
