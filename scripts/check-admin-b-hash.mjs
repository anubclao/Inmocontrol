import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Anubclao2026",
  database: "inmocontrol",
});

const [rows] = await c.query(
  `SELECT id, email, role, password_hash FROM profiles WHERE email = 'adminb@test.com'`,
);
console.log("Admin B:", rows[0]);

if (rows[0]) {
  const match = await bcrypt.compare("test1234", rows[0].password_hash);
  console.log('Password "test1234" matchea?', match);
  const m2 = await bcrypt.compare("inmo2026!", rows[0].password_hash);
  console.log('Password "inmo2026!" matchea?', m2);
}

await c.end();
