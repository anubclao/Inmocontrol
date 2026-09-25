/**
 * slotKeyHelpers — funciones puras para parsear/construir slot keys
 * del wizard de captación. Extraídas del monolito PropertiesView.tsx
 * en el Commit 3 del refactor #5 (spec #5, verifier #5).
 *
 * Un `slotKey` identifica cada slot de documento legal de una propiedad:
 *   - "predial"                     → Impuesto Predial (1 por propiedad)
 *   - "mandato"                     → Contrato de Mandato
 *   - "certificado_tradicion:main"  → Certificado unidad principal
 *   - "cedula:<ownerId>"            → CC de cada propietario
 *   - "rut:<ownerId>"               → RUT de cada propietario
 *   - "certificado_tradicion:<unitId>" → Certificado por unidad adicional
 *
 * Funciones puras (sin React, sin IO): testeables con `npm test`.
 */

import type { WizardOwner, WizardUnit } from "../components/StepBasic";
import type { PropertyOwner, PropertyUnit } from "../../../types";

/** Item con id + nombre (usado para owners). Acepta ambas shapes: Wizard/Property. */
export interface OwnerLike {
  id: string;
  name?: string;
}

/** Item con id + label (usado para units). Acepta ambas shapes: Wizard/Property. */
export interface UnitLike {
  id: string;
  label?: string;
}

export type SlotOwner = WizardOwner | PropertyOwner | OwnerLike;
export type SlotUnit = WizardUnit | PropertyUnit | UnitLike;

/**
 * Normaliza un texto para usarlo como nombre de archivo:
 *  - Quita tildes y eñes
 *  - Reemplaza espacios y caracteres no-alfanuméricos por `_`
 *  - Colapsa múltiples `_` en uno
 *  - Trim de `_` al inicio/final
 *
 * Ejemplos:
 *   normalizeFilename("Cédula de Tatiana")   → "Cedula_de_Tatiana"
 *   normalizeFilename("Carta 1/2.pdf")        → "Carta_1_2_pdf"
 */
export function normalizeFilename(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar diacríticos
    .replace(/ñ/gi, "n") // ñ/Ñ → n
    .replace(/[^a-zA-Z0-9]+/g, "_") // no-alfanumérico → _
    .replace(/_+/g, "_") // colapsar __
    .replace(/^_|_$/g, ""); // trim _
}

/**
 * Etiqueta humana de un slotKey para mostrar al usuario. Usada en handlers
 * que vienen del flujo de file upload (donde ya no tenemos el contexto de
 * owners/units a mano).
 */
export function slotKeyToLabel(
  slotKey: string,
  owners?: ReadonlyArray<SlotOwner>,
  units?: ReadonlyArray<SlotUnit>,
): string {
  if (slotKey === "predial") return "Impuesto Predial";
  if (slotKey === "mandato") return "Contrato de Mandato";
  if (slotKey === "certificado_tradicion:main")
    return "Certificado de Tradición";
  if (slotKey.startsWith("cedula:")) {
    const id = slotKey.slice("cedula:".length);
    const o = owners?.find?.((x) => x.id === id);
    return o?.name ? `Cédula de ${o.name}` : "Cédula";
  }
  if (slotKey.startsWith("rut:")) {
    const id = slotKey.slice("rut:".length);
    const o = owners?.find?.((x) => x.id === id);
    return o?.name ? `RUT de ${o.name}` : "RUT";
  }
  if (slotKey.startsWith("certificado_tradicion:")) {
    const id = slotKey.slice("certificado_tradicion:".length);
    const u = units?.find?.((x) => x.id === id);
    return u?.label ? `Certificado de ${u.label}` : "Certificado de Tradición";
  }
  return slotKey;
}

/**
 * Genera el nombre del archivo PDF para un slotKey, incluyendo el nombre
 * del owner o unit asociado. Se usa al subir a Drive para que el archivo
 * quede "bautizado" con info legible (no como "cedula_uuid.pdf").
 * Siempre termina en `.pdf`.
 */
export function slotKeyToFilename(
  slotKey: string,
  owners?: ReadonlyArray<SlotOwner>,
  units?: ReadonlyArray<SlotUnit>,
): string {
  // Casos directos: a nivel de propiedad (sin owner/unit).
  if (slotKey === "predial") return "Predial.pdf";
  if (slotKey === "mandato") return "Contrato_Mandato.pdf";
  if (slotKey === "certificado_tradicion:main")
    return "Certificado_Unidad_Principal.pdf";

  if (slotKey.startsWith("cedula:")) {
    const id = slotKey.slice("cedula:".length);
    const o = owners?.find?.((x) => x.id === id);
    return o?.name ? `Cedula_${normalizeFilename(o.name)}.pdf` : "Cedula.pdf";
  }
  if (slotKey.startsWith("rut:")) {
    const id = slotKey.slice("rut:".length);
    const o = owners?.find?.((x) => x.id === id);
    return o?.name ? `RUT_${normalizeFilename(o.name)}.pdf` : "RUT.pdf";
  }
  if (slotKey.startsWith("certificado_tradicion:")) {
    const id = slotKey.slice("certificado_tradicion:".length);
    const u = units?.find?.((x) => x.id === id);
    return u?.label
      ? `Certificado_${normalizeFilename(u.label)}.pdf`
      : "Certificado_Tradicion.pdf";
  }
  return `${normalizeFilename(slotKey)}.pdf`;
}
