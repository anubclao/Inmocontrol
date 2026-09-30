import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Anubclao2026",
  database: "inmocontrol",
});

console.log("=== TENANT CREADO (AC-3) ===");
const [t] = await c.query(
  `SELECT id, name, document_id, property_id, status, tenant_drive_folder_id, phone, email
     FROM tenants WHERE name LIKE 'TEST-TENANT-AC3-%' ORDER BY created_at DESC LIMIT 1`,
);
console.log(JSON.stringify(t, null, 2));

console.log("\n=== OAUTH TOKENS (¿hay token del usuario piloto?) ===");
const [tok] = await c.query(
  `SELECT user_id, provider, drive_folder_id, expiry_date
     FROM user_oauth_tokens`,
);
console.log(JSON.stringify(tok, null, 2));

console.log("\n=== PROPIEDADES DEL TENANT (drive folders) ===");
const [p] = await c.query(
  `SELECT id, address, status, drive_folder_id, drive_folder_path
     FROM properties WHERE id = ?`,
  [t[0]?.property_id],
);
console.log(JSON.stringify(p, null, 2));

await c.end();
