// filepath: src/features/tenants/hooks/createTenantSubmit.ts
// Lógica del POST a /api/tenants + flip de status de la propiedad. Extraída
// del hook useCreateTenant para mantener ese hook <200 líneas.
//
// FIX 2026-07-22: NO cerrar el modal inmediatamente. Si lo cerramos
// antes de que el POST termine y el server tarda (ej: Drive está
// lento), el usuario ve el modal desaparecer y piensa "no se guardó"
// cuando en realidad el request sigue corriendo.
//
// BUG-023: el PATCH a la propiedad puede fallar. Antes era fire-and-forget
// y dejaba el tenant creado en MySQL pero la propiedad sin actualizar.
// Ahora esperamos el resultado del PATCH y mostramos error si falla.

import { formatIdNumber, formatTenantName } from "../../../utils/validators";
import type { CreateTenantForm } from "./useCreateTenant";

export interface SubmitDeps {
  form: CreateTenantForm;
  properties: any[];
  propertyIdsWithActiveTenant: Set<string>;
  onAddTenant: (tenant: any) => void;
  onUpdateProperty: (id: string, updates: any) => Promise<boolean>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export interface SubmitResult {
  ok: boolean;
  /** Si el modal puede cerrarse. False = el agente debe reintentar. */
  canClose: boolean;
}

/** POST a /api/tenants + flip del status de la propiedad a "En Colocación".
 *
 *  Maneja los 3 casos de error conocidos:
 *  - 409: duplicado (server detecta que la propiedad ya tiene tenant activo)
 *  - PATCH a propiedad falla (BUG-023): tenant creado pero propiedad sin
 *    actualizar — el modal sigue abierto para que el agente reintente
 *  - Timeout 15s: el server tardó demasiado (Drive lento)
 *
 *  Devuelve `ok=true, canClose=true` solo en el happy path.
 *  Devuelve `ok=false, canClose=true` cuando hay un error "esperado"
 *  (duplicado, validación) y el modal puede cerrarse.
 *  Devuelve `ok=false, canClose=false` cuando el tenant SÍ se creó pero
 *  el PATCH a propiedad falló (BUG-023): el modal debe seguir abierto
 *  para que el agente decida. */
export const submitCreateTenant = async (
  deps: SubmitDeps,
): Promise<SubmitResult> => {
  const {
    form,
    properties,
    propertyIdsWithActiveTenant,
    onAddTenant,
    onUpdateProperty,
    showToast,
  } = deps;

  const selectedProperty = properties.find(
    (p: any) => p.id === form.propertyId,
  );
  const rentValue =
    parseFloat(String(form.rent ?? "").replace(/[^0-9]/g, "")) || 0;
  const today = new Date().toISOString().split("T")[0];

  // Pre-check local antes de pegar al server (UX: feedback instantáneo).
  if (propertyIdsWithActiveTenant.has(form.propertyId)) {
    showToast(
      "Este inmueble ya tiene un arrendatario activo. Finaliza ese contrato primero.",
      "error",
    );
    return { ok: false, canClose: true };
  }

  try {
    // Timeout agresivo: si el server no responde en 15s, abortamos.
    // El server tiene 8s de timeout en Drive + 1-2s en DB → 15s es
    // generoso. Si pasa, el modal sigue abierto con error claro.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: form.propertyId,
          propertyDriveFolderId: selectedProperty?.driveFolderId || null,
          propertyAddress: selectedProperty?.address,
          name: formatTenantName(form.name),
          idNumber: formatIdNumber(form.idNumber),
          email: form.email,
          phone: form.phone,
          rent: rentValue,
          adminFee:
            parseFloat(String(form.adminFee ?? "").replace(/[^0-9]/g, "")) || 0,
          leaseStartDate: today,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await res.json();
    if (!res.ok) {
      // 409 = el server detectó el duplicado (defensa en profundidad)
      if (res.status === 409) {
        showToast(
          data.error || "Este inmueble ya tiene un arrendatario activo",
          "error",
        );
      } else {
        showToast(data.error || "Error al crear arrendatario", "error");
      }
      return { ok: false, canClose: true };
    }

    // Guardar también en el store (Zustand) para la UI local
    onAddTenant({
      id: data.tenantId,
      name: formatTenantName(form.name),
      idNumber: formatIdNumber(form.idNumber),
      email: form.email,
      phone: form.phone,
      propertyId: form.propertyId,
      rent: rentValue,
      status: "Activo",
      leaseStartDate: today,
      tenantDriveFolderId: data.tenantDriveFolderId || null,
    });

    // Status "En Colocación": ya tiene arrendatario pero el inventario de
    // colocación todavía no está firmado. Pasará a "Arrendado" cuando se
    // firme el Inventario de Colocación (en el wizard de StepInventory).
    const propUpdate: any = { status: "En Colocación" };
    if (data.propertyDriveFolderId && !selectedProperty?.driveFolderId) {
      propUpdate.driveFolderId = data.propertyDriveFolderId;
    }
    const propertyUpdated = await onUpdateProperty(form.propertyId, propUpdate);
    if (!propertyUpdated) {
      // BUG-023: el tenant SÍ se creó en MySQL pero la propiedad quedó sin
      // actualizar. Mostramos error para que el user lo note. El modal
      // sigue abierto para que pueda decidir si reintenta o cancela.
      showToast(
        "Inquilino creado pero la propiedad no se pudo actualizar a 'En Colocación'. Reintentá desde el módulo Propiedades.",
        "error",
      );
      return { ok: false, canClose: false };
    }
    showToast(
      (data.message || "Arrendatario creado") +
        " — completa el Inventario de Colocación para activar la propiedad",
    );
    return { ok: true, canClose: true };
  } catch (err: any) {
    console.error(err);
    if (err?.name === "AbortError") {
      showToast(
        "El servidor tardó demasiado. Reintentá en unos segundos.",
        "error",
      );
    } else {
      showToast("Error de conexión con el servidor", "error");
    }
    return { ok: false, canClose: true };
  }
};
