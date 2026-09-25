/**
 * allDocsComplete — verifica si una propiedad tiene todos los documentos
 * obligatorios + mandato firmado.
 *
 * Migración 010+: itera por cada owner y por cada unit, además de los
 * docs a nivel de propiedad (Predial + Certificado principal + Mandato).
 *
 * Extraído de `PropertiesView.tsx` al refactor #5b. Función pura, sin
 * dependencias de React. Se usa tanto en PropertiesView (para validar
 * el botón de estado) como en PropertyDetailModal (para colorear
 * las opciones).
 */

export function allDocsComplete(p: any): boolean {
  if (!p) return false;
  if (!p.mandatePdfUrl) return false;
  // Predial es opcional, no bloquea.
  const hasMainCert =
    !!p.documents_property?.certificado_tradicion ||
    !!p.documents?.["Certificado de Tradición"];
  if (!hasMainCert) return false;
  // CC por cada owner con nombre
  const owners = p.owners ?? [];
  for (const o of owners) {
    if (!o.name?.trim()) continue;
    if (!o.documents?.cedula) return false;
  }
  // Cert por cada unit con label
  const units = p.units ?? [];
  for (const u of units) {
    if (!u.label?.trim()) continue;
    if (!u.documents?.certificado_tradicion) return false;
  }
  return true;
}