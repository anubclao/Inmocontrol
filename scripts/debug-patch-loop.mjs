// Debug: simular la lógica del loop PATCH (con aliases)
const allowed = ['address', 'chip', 'folio', 'owner_name', 'owner_id_number', 'owner_phone', 'owner_email', 'status', 'property_type', 'mandato_pdf_url', 'mandato_signed_at', 'drive_folder_id', 'drive_folder_path', 'inventory_pdf_url'];
const fieldAliases = {
  'mandato_pdf_url':   ['mandato_pdf_url', 'mandatoPdfUrl', 'mandatePdfUrl'],
  'mandato_signed_at': ['mandato_signed_at', 'mandatoSignedAt', 'mandateSignedAt'],
  'drive_folder_id':   ['drive_folder_id', 'driveFolderId'],
  'drive_folder_path': ['drive_folder_path', 'driveFolderPath'],
  'inventory_pdf_url': ['inventory_pdf_url', 'inventoryPdfUrl'],
  'property_type':     ['property_type', 'propertyType'],
  'owner_name':        ['owner_name', 'ownerName'],
  'owner_id_number':   ['owner_id_number', 'ownerIdNumber'],
  'owner_phone':       ['owner_phone', 'ownerPhone'],
  'owner_email':       ['owner_email', 'ownerEmail'],
};

const reqBody = { mandateSignedAt: '2026-06-25T22:11:44.456Z' };
const updates = [];
const values = [];

console.log('Testing loop logic with aliases...');
for (const f of allowed) {
  const keys = fieldAliases[f] ?? [f, f.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
  let value;
  for (const k of keys) {
    if (reqBody[k] !== undefined) { value = reqBody[k]; break; }
  }
  if (value !== undefined) {
    updates.push(`${f} = ?`);
    values.push(value);
    console.log(`  MATCHED: f=${f}, keys tried=${JSON.stringify(keys)}, value=${value}`);
  }
}
console.log(`\nupdates.length = ${updates.length}`);
console.log('updates:', updates);

console.log('\n--- Testing with multiple fields ---');
const mixedBody = { mandatePdfUrl: 'http://drive/x', mandateSignedAt: '2026-06-25T22:11:44Z', status: 'Activo' };
const updates2 = [];
for (const f of allowed) {
  const keys = fieldAliases[f] ?? [f, f.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
  let value;
  for (const k of keys) {
    if (mixedBody[k] !== undefined) { value = mixedBody[k]; break; }
  }
  if (value !== undefined) {
    updates2.push(`${f} = ?`);
    values.push(value);
    console.log(`  MATCHED: f=${f}, value=${value}`);
  }
}
console.log(`updates2.length = ${updates2.length}`);