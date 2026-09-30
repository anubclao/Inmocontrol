import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Anubclao2026",
  database: "inmocontrol",
});

console.log("=== INVENTORIES para propiedad TEST-AC1-184704 ===");
const [rows] = await c.query(
  `SELECT id, property_id, phase, signed_at, created_at
     FROM inventories WHERE property_id = ?`,
  ["b099cb97-b0c9-442d-8227-43b20efb7590"],
);
console.log(JSON.stringify(rows, null, 2));
console.log(`Total filas: ${rows.length}`);

await c.end();
