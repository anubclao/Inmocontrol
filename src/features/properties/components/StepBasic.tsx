// filepath: src/features/properties/components/StepBasic.tsx
import { Button } from "../../../shared/ui";
import {
  // FIX #10: importar también previewAddressFormat para mostrarlo como hint
  // al lado del input, sin mutar lo que el usuario tipea.
  previewAddressFormat,
  isValidCHIP,
  isValidEmail,
  isValidColombianPhone,
} from "../../../utils/validators";
import { PROPERTY_TYPES, type PropertyType } from "../inventoryConfig";
import type { PropertyUnitType } from "../../../types";
import { WizardOwnersSection } from "./stepBasic/WizardOwnersSection";
import { WizardUnitsSection } from "./stepBasic/WizardUnitsSection";

/** Owner en el wizard (puede tener id temporal `wizard-X` antes del primer POST). */
export interface WizardOwner {
  /** id real (UUID) si ya fue persistido, o `wizard-<ts>-<n>` mientras está en el wizard. */
  id: string;
  name: string;
  idNumber: string;
  phone: string;
  email: string;
  ownershipPct: string; // string en el form (input number), se parsea al mandar
}

export interface WizardUnit {
  id: string;
  type: PropertyUnitType;
  label: string;
  folioMatricula: string;
  areaM2: string;
}

export interface StepBasicProps {
  address: string;
  setAddress: (v: string) => void;
  chip: string;
  setChip: (v: string) => void;
  folio: string;
  setFolio: (v: string) => void;
  propertyType: PropertyType;
  setPropertyType: (v: PropertyType) => void;
  // N propietarios
  owners: WizardOwner[];
  setOwners: (v: WizardOwner[]) => void;
  // N unidades adicionales
  units: WizardUnit[];
  setUnits: (v: WizardUnit[]) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
  onContinue: () => void;
  /** Persiste el progreso del paso 1 (datos básicos) sin avanzar. El padre
   *  ya hace autosave en localStorage; este botón es un "checkpoint" explícito
   *  que muestra confirmación al usuario. */
  onSaveDraft: () => void;
}

export function StepBasic({
  address,
  setAddress,
  chip,
  setChip,
  folio,
  setFolio,
  propertyType,
  setPropertyType,
  owners,
  setOwners,
  units,
  setUnits,
  showToast,
  onContinue,
  onSaveDraft,
}: StepBasicProps) {
  const validate = () => {
    if (!address || !chip || !folio) {
      showToast("Por favor complete dirección, CHIP y folio", "error");
      return;
    }
    if (!isValidCHIP(chip)) {
      showToast(
        "El CHIP debe iniciar con AAA y tener entre 10 y 11 caracteres (Ej: AAA0148LYN)",
        "error",
      );
      return;
    }
    // Al menos 1 propietario con nombre
    const validOwners = owners.filter((o) => o.name.trim().length > 0);
    if (validOwners.length === 0) {
      showToast("Agregá al menos un propietario con nombre", "error");
      return;
    }
    // Si hay % de participación definido en alguno, validar que la suma sea ~100
    const definedPcts = owners
      .map((o) => Number(o.ownershipPct))
      .filter((n) => !isNaN(n) && n > 0);
    if (definedPcts.length > 0) {
      const sum = definedPcts.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        showToast(
          `Los % de participación suman ${sum.toFixed(2)}% — deberían sumar 100% (o dejá todos vacíos)`,
          "error",
        );
        return;
      }
    }
    // FIX 2026-08-05: validar formato de email y teléfono ANTES de continuar.
    // Antes se aceptaba "anubclao@gmail" (sin TLD) y teléfonos con formato libre.
    // Campos vacíos son válidos (no todos los owners tienen email/phone).
    for (const o of validOwners) {
      if (o.phone.trim() && !isValidColombianPhone(o.phone)) {
        showToast(
          `Teléfono "${o.phone}" no tiene formato de celular colombiano (10 dígitos, empieza con 3). Ej: 3001234567`,
          "error",
        );
        return;
      }
      if (o.email.trim() && !isValidEmail(o.email)) {
        showToast(
          `Email "${o.email}" no tiene formato válido. Ej: usuario@dominio.com`,
          "error",
        );
        return;
      }
    }
    onContinue();
  };

  return (
    <div className="p-8">
      <h3 className="font-bold text-lg mb-6">1. Datos Básicos y Validación</h3>
      <div className="space-y-6">
        {/* ── Datos básicos de la propiedad ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tipo de Inmueble <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as PropertyType)}
            >
              {PROPERTY_TYPES.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Dirección (Secretaría del Hábitat){" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Ej: calle 145 # 13-45"
              // FIX #10: NO mutar el input. El usuario tipea "calle 93" y ve
              // "calle 93", no "CL 93" (eso rompía la edición).
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            {/* Preview formateado (solo display) */}
            {address.trim() && address !== previewAddressFormat(address) && (
              <p className="text-[10px] text-slate-500 mt-1">
                Formato Secretaría del Hábitat:{" "}
                <span className="font-mono">
                  {previewAddressFormat(address)}
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              CHIP Catastral <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Ej: AAA0148LYN"
              value={chip}
              onChange={(e) =>
                setChip(e.target.value.toUpperCase().replace(/\s+/g, ""))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Folio de Matrícula (unidad principal){" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="50N-12345678"
              value={folio}
              onChange={(e) => setFolio(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs font-bold text-blue-400 uppercase mb-2">
            Previsualización Legal
          </p>
          <p className="text-sm font-mono text-blue-900">
            {address || "DIRECCIÓN PENDIENTE"}
          </p>
        </div>

        {/* ── Sección: Propietarios (N) ── */}
        <WizardOwnersSection
          owners={owners}
          setOwners={setOwners}
          showToast={showToast}
        />

        {/* ── Sección: Unidades adicionales (N) ── */}
        <WizardUnitsSection units={units} setUnits={setUnits} />

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => {
              // El padre (PropertiesView) muestra el toast honesto
              // "Avance guardado en el servidor (MySQL). Estado: Pendiente hasta
              // subir el Mandato." tras llamar a ensurePropertyPersisted().
              // NO mostramos un toast mentiroso acá (sería el segundo toast
              // contradictorio — fix de bug reportado el 2026-08-05).
              onSaveDraft();
            }}
          >
            💾 Guardar avance (este equipo)
          </Button>
          <Button className="flex-1" onClick={validate}>
            Continuar a Documentación
          </Button>
        </div>
      </div>
    </div>
  );
}
