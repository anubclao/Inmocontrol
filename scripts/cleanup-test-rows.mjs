import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Anubclao2026",
  database: "inmocontrol",
});

const [p] = await c.query("DELETE FROM properties WHERE address LIKE 'TEST%'");
const [t] = await c.query("DELETE FROM tenants WHERE name LIKE 'TEST-TENANT%'");
const [i] = await c.query("DELETE FROM inventories WHERE id LIKE 'inv-ac%'");
const [bp] = await c.query(
  "DELETE FROM billing_policies WHERE created_by = 'test-verifier'",
);

console.log("Filas TEST eliminadas:");
console.log(`  properties:      ${p.affectedRows}`);
console.log(`  tenants:         ${t.affectedRows}`);
console.log(`  inventories:     ${i.affectedRows}`);
console.log(`  billing_policies: ${bp.affectedRows}`);

await c.end();
