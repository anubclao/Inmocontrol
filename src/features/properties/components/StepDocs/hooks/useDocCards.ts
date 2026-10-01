// filepath: src/features/properties/components/StepDocs/hooks/useDocCards.ts
// Funciones puras del wizard de documentos (Step 2 del wizard de propiedad).
//
// fix-issue-07 (FASE 4 Karpathy, oct-2026): extraídas del monolito
// StepDocs.tsx (814 lineas). Testeables unitariamente sin React.
//
// NO es un React hook real (no usa useState/useEffect) — es un modulo
// de funciones puras. El nombre `useDocCards` se mantiene por consistencia
// con el spec original. Si en el futuro se agregan useState/useEffect
// genuinos, renombrar a un archivo separado.

import {
  Wallet,
  FileSignature,
  Users,
  Car,
  Package,
  Box,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { WizardOwner, WizardUnit } from "../../StepBasic";
import type {
  DocSlotKey,
  DocStorageState,
  UploadedDocsMap,
  DocSlotGroup,
  RequiredSlot,
} from "../types";

/**
 * Determina el estado real de un archivo a partir de su URL.
 *  - blob: → local (aún no se subió a Drive)
 *  - https://*.googleusercontent.com o https://drive.google.com/ → en Drive
 *  - cualquier otra cosa → local (asumimos fallback)
 */
export function getDocStorageState(url: string): DocStorageState {
  if (!url) return "pending";
  if (url.startsWith("blob:")) return "local";
  // FIX #18: testear solo el path (sin query params como ?usp=drivesdk).
  // Antes la regex testeaba desde el inicio hasta el final del string,
  // fallando si Drive agregaba query params.
  const pathOnly = url.split("?")[0];
  if (/^https:\/\/(drive|docs)\.google\.com\//.test(pathOnly)) return "drive";
  if (/^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(pathOnly))
    return "drive";
  return "local";
}

/** Etiqueta humana para mostrar al usuario en cards / toasts / logs. */
export function labelForKey(
  key: string,
  owners: WizardOwner[],
  units: WizardUnit[],
): string {
  if (key === "predial") return "Impuesto Predial";
  if (key === "mandato") return "Contrato de Mandato (multi-firmado)";
  if (key === "certificado_tradicion:main")
    return "Certificado de Tradición (unidad principal)";
  if (key.startsWith("cedula:")) {
    const id = key.slice("cedula:".length);
    const o = owners.find((x) => x.id === id);
    return o?.name ? `Cédula de ${o.name}` : "Cédula";
  }
  if (key.startsWith("rut:")) {
    const id = key.slice("rut:".length);
    const o = owners.find((x) => x.id === id);
    return o?.name ? `RUT de ${o.name}` : "RUT";
  }
  if (key.startsWith("certificado_tradicion:")) {
    const id = key.slice("certificado_tradicion:".length);
    const u = units.find((x) => x.id === id);
    return u ? `Certificado de ${u.label}` : "Certificado de Tradición";
  }
  return key;
}

/** Helper: cantidad de archivos en un slot (0 si el slot no existe o está vacío). */
export function countInSlot(map: UploadedDocsMap, slotKey: string): number {
  const arr = map[slotKey];
  return Array.isArray(arr) ? arr.length : 0;
}

/** Helper: ícono según slotKey. Accede a `units` para devolver el
 *  icono específico del tipo de unidad (Car/Package/Box) en lugar de
 *  FileText genérico. Paridad exacta con la versión original que vivía
 *  dentro del componente StepDocs con acceso a units por closure. */
export function iconForKey(
  key: string,
  group: DocSlotGroup | string,
  unitId: string | undefined,
  units: WizardUnit[],
): LucideIcon {
  if (key === "predial") return Wallet;
  if (key === "mandato") return FileSignature;
  if (key.startsWith("cedula:") || key.startsWith("rut:")) return Users;
  if (key.startsWith("certificado_tradicion:")) {
    if (group === "unit" && unitId) {
      const u = units.find((x) => x.id === unitId);
      if (u?.type === "parking") return Car;
      if (u?.type === "storage") return Package;
      if (u?.type === "other") return Box;
    }
    return FileText;
  }
  return FileText;
}

/**
 * Cards que se renderizan en el paso 2. Cada card tiene su slotKey, ícono
 * y validación de "qué falta para activar la propiedad al 100%".
 */
export function buildRequiredSlots(
  owners: WizardOwner[],
  units: WizardUnit[],
): RequiredSlot[] {
  const slots: RequiredSlot[] = [];

  // Por cada propietario: CC + RUT (RUT opcional)
  for (const o of owners) {
    if (!o.name.trim()) continue; // owners sin nombre no tienen docs
    slots.push({
      slotKey: `cedula:${o.id}`,
      group: "owner",
      ownerId: o.id,
      required: true,
      helpText: o.idNumber ? `Cédula: ${o.idNumber}` : "Cédula pendiente",
    });
    slots.push({
      slotKey: `rut:${o.id}`,
      group: "owner",
      ownerId: o.id,
      required: false,
      helpText: "RUT (opcional)",
    });
  }

  // Unidad principal: Certificado de Tradición
  slots.push({
    slotKey: "certificado_tradicion:main",
    group: "unit",
    required: true,
    helpText: "Matrícula del inmueble principal",
  });

  // Cada unidad adicional: Certificado
  for (const u of units) {
    if (!u.label.trim()) continue;
    slots.push({
      slotKey: `certificado_tradicion:${u.id}`,
      group: "unit",
      unitId: u.id,
      required: true,
      helpText: u.folioMatricula
        ? `Matrícula: ${u.folioMatricula}`
        : `Matrícula de ${u.label}`,
    });
  }

  // Predial (a nivel de propiedad)
  slots.push({
    slotKey: "predial",
    group: "property",
    required: false,
    helpText: "Predial del año en curso",
  });

  // Mandato (a nivel de propiedad, multi-firmado)
  slots.push({
    slotKey: "mandato",
    group: "property",
    required: true,
    helpText: "Firmado por todos los propietarios",
  });

  return slots;
}

/** Re-export de `DocSlotKey` para que el barrel `StepDocs/index.tsx`
 *  pueda re-exportarlo desde un solo lugar si lo necesita. */
export type { DocSlotKey };
