import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Anubclao2026",
  database: "inmocontrol",
});

const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ADMIN_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01";
const PROP_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10";

// Cleanup cualquier row previa
await c.query("DELETE FROM properties WHERE id = ?", [PROP_B]);
await c.query("DELETE FROM profiles WHERE id = ?", [ADMIN_B]);
await c.query("DELETE FROM organizations WHERE id = ?", [ORG_B]);

// Crear Org B
await c.query(
  `INSERT INTO organizations (id, name, nit, created_by) VALUES (?, ?, NULL, ?)`,
  [ORG_B, "Org B Test", "test-verifier"],
);

// Crear admin user para Org B
const passwordHash = await bcrypt.hash("test1234", 10);
await c.query(
  `INSERT INTO profiles (id, organization_id, display_name, email, role, password_hash, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [
    ADMIN_B,
    ORG_B,
    "Admin Org B",
    "adminb@test.com",
    "admin",
    passwordHash,
    "test-verifier",
  ],
);

// Crear una property de Org B (para los tests de aislamiento)
await c.query(
  `INSERT INTO properties (id, address, status, organization_id, owner_name, created_by)
   VALUES (?, ?, ?, ?, ?, ?)`,
  [
    PROP_B,
    "TEST-OrgB-Property",
    "Pendiente",
    ORG_B,
    "Owner B",
    "test-verifier",
  ],
);

console.log("OK — Org B creada:");
console.log("  orgId:    ", ORG_B);
console.log("  adminId:  ", ADMIN_B);
console.log("  propertyId:", PROP_B);
console.log("  login:    adminb@test.com / test1234");

await c.end();
