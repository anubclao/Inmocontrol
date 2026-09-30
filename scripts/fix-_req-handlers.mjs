// FIX puntual: handlers con _req (no usan request) deben usar ensureDefaultOrg
// en vez de getOrgIdForRequest(req).
import { readFileSync, writeFileSync } from "node:fs";

const path = "server/routes/saasBilling.ts";
let src = readFileSync(path, "utf8");

// 1) Renombrar _req → req en estos 5 endpoints (siguen la convención del archivo).
// 2) Reemplazar el bloque getOrgIdForRequest por ensureDefaultOrg.

const lines = src.split("\n");
const out = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];

  // Detectar el patrón: ...asyncHandler(async (_req, res) => {
  // Y reescribir el bloque que sigue.
  const handlerMatch = line.match(
    /^(\s*)router\.(get|post|put|patch|delete)\((.+),\s*asyncHandler\(async \(_req, res\)/,
  );
  if (handlerMatch) {
    const indent = handlerMatch[1];
    // Cambiar _req por req en esta línea.
    out.push(line.replace("(_req, res)", "(req, res)"));
    i++;
    // Buscar el bloque getOrgIdForRequest y reemplazarlo por ensureDefaultOrg.
    while (i < lines.length) {
      const l = lines[i];
      if (l.includes("getOrgIdForRequest(req)")) {
        // Reemplazar el bloque de 6 líneas.
        out.push(
          `${indent}  // FIX 2026-09-25 (saas_multitenant.md): handler con request disponible.`,
        );
        out.push(`${indent}  const ctx = await getOrgIdForRequest(req);`);
        out.push(`${indent}  if (ctx.isLegacySession) {`);
        out.push(
          `${indent}    return res.status(401).json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });`,
        );
        out.push(`${indent}  }`);
        out.push(`${indent}  const orgId = ctx.orgId;`);
        // Skip las 5 líneas que matchean: _ctx, isLegacySession, body, return, closing }
        i += 5;
      } else if (l.trim() === "}" && lines[i - 1].trim() === "}") {
        // Final del handler.
        out.push(l);
        i++;
        break;
      } else {
        out.push(l);
        i++;
      }
    }
  } else {
    out.push(line);
    i++;
  }
}

writeFileSync(path, out.join("\n"), "utf8");
console.log("OK — fixed _req handlers in saasBilling.ts");
