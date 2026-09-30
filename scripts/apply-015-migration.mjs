// Aplica el patrón de saas_multitenant.md a todos los routers restantes.
// Para cada ocurrencia de:
//     const orgId = await ensureDefaultOrg();
// lo reemplaza por:
//     // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
//     const _ctx = await getOrgIdForRequest(req);
//     if (_ctx.isLegacySession) {
//       return res.status(401).json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
//     }
//     const orgId = _ctx.orgId;
//
// Y al inicio del archivo, agrega el import de getOrgIdForRequest.

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const FILES = [
  "server/routes/billing.ts",
  "server/routes/financialRecords.ts",
  "server/routes/inventories.ts",
  "server/routes/saasBilling.ts",
];

for (const path of FILES) {
  let src = readFileSync(path, "utf8");
  const before = src;

  // 1) Agregar el import si no está.
  if (
    !src.includes("from '../lib/orgContext.js'") &&
    !src.includes('from "../lib/orgContext.js"')
  ) {
    // Detectar el import de pool/db y agregar el import del helper después.
    const importRegex = /import pool[^;]+from\s+['"]\.\.\/db\.js['"];?/;
    if (importRegex.test(src)) {
      src = src.replace(importRegex, (m) => {
        return `${m}\n// FIX 2026-09-25 (saas_multitenant.md): usar getOrgIdForRequest en vez de\n// ensureDefaultOrg() para que el orgId venga del req.user, no del primero\n// de la tabla. ensureDefaultOrg() se mantiene para bootstrap/tests.\nimport { getOrgIdForRequest } from "../lib/orgContext.js";`;
      });
    }
  }

  // 2) Reemplazar cada uso de ensureDefaultOrg en routers autenticados.
  // El patrón es: const orgId = await ensureDefaultOrg();
  // Lo reemplazo solo si está dentro de un asyncHandler/router handler.
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)const orgId = await ensureDefaultOrg\(\);/);
    if (match) {
      const indent = match[1];
      out.push(
        `${indent}// FIX 2026-09-25 (saas_multitenant.md): orgId del request.`,
      );
      out.push(`${indent}const _ctx = await getOrgIdForRequest(req);`);
      out.push(`${indent}if (_ctx.isLegacySession) {`);
      out.push(
        `${indent}  return res.status(401).json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });`,
      );
      out.push(`${indent}}`);
      out.push(`${indent}const orgId = _ctx.orgId;`);
    } else {
      out.push(line);
    }
  }
  src = out.join("\n");

  if (src !== before) {
    writeFileSync(path, src, "utf8");
    console.log(`OK — ${path}`);
  } else {
    console.log(`SKIP — ${path} (sin cambios)`);
  }
}
