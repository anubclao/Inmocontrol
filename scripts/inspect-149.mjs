import mysql from 'mysql2/promise';

const c = await mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: 'inmocontrol',
});

const [props] = await c.query(
  "SELECT id, address, status, mandato_pdf_url, mandato_signed_at FROM properties WHERE address LIKE '%CL 149 54 16%'"
);
console.log('PROPERTY:', JSON.stringify(props, null, 2));

if (props.length > 0) {
  const id = props[0].id;
  const [docs] = await c.query(
    'SELECT doc_type, file_url, file_name FROM property_documents WHERE property_id = ?',
    [id]
  );
  console.log('DOCS:', JSON.stringify(docs, null, 2));
}

await c.end();