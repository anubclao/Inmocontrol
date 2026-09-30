import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Anubclao2026",
  database: "inmocontrol",
});

console.log("=== CONTRACTS existentes ===");
const [contracts] = await c.query(
  `SELECT id, property_id, tenant_id, status, start_date, end_date, rent_amount
     FROM contracts LIMIT 5`,
);
console.log(JSON.stringify(contracts, null, 2));

console.log("\n=== AMORTIZATION_ROWS existentes ===");
const [amort] = await c.query(
  `SELECT id, contract_id, month_number, period_start, total, status
     FROM amortization_rows LIMIT 10`,
);
console.log(JSON.stringify(amort, null, 2));

console.log("\n=== billing_policies existentes ===");
const [policies] = await c.query(
  `SELECT property_id, rent_amount, admin_fee, grace_day
     FROM billing_policies`,
);
console.log(JSON.stringify(policies, null, 2));

await c.end();
