import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Anubclao2026",
  database: "inmocontrol",
});

const [ac15a] = await c.query(
  `SELECT pd.id, pd.doc_type, pd.owner_id, pd.file_url, pd.uploaded_at
     FROM property_documents pd
     JOIN properties p ON pd.property_id = p.id
    WHERE p.address LIKE 'TEST AC-15.A-%'
    ORDER BY pd.uploaded_at DESC
    LIMIT 5`,
);
console.log("property_documents con TEST AC-15.A:");
console.log(JSON.stringify(ac15a, null, 2));
console.log("");

const [anyBlob] = await c.query(
  `SELECT pd.id, p.address, pd.file_url
     FROM property_documents pd
     JOIN properties p ON pd.property_id = p.id
    WHERE pd.file_url LIKE 'blob:%'`,
);
console.log("CUALQUIER fila con blob URL en property_documents:");
console.log(JSON.stringify(anyBlob, null, 2));
console.log("");

const [allProps] = await c.query(
  `SELECT id, address, status FROM properties WHERE address LIKE 'TEST%' ORDER BY created_at DESC LIMIT 10`,
);
console.log("Propiedades TEST recientes:");
console.log(JSON.stringify(allProps, null, 2));

await c.end();
