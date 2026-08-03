# Fix: useEffect con [] deps en auto-fill de ContractsView (BUG-005)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-005-contracts-autofill.md`.
>
> **Bug origen**: BUG-005 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🔴 Alta (UX de captación, riesgo de error humano).
> **Stack afectado**: `src/features/contracts/ContractsView.tsx`.

## 1. User Story

**As a** agente inmobiliario creando un contrato desde el wizard de captación,
**I want to** que el modal "Nuevo Contrato" pre-rellene canon y adminFee con los valores del tenant activo de la propiedad seleccionada,
**So that** el agente no tenga que tipearlos a mano (riesgo de error de transcripción) y el modal funcione correctamente incluso si la lista de tenants se hidrata DESPUÉS de que el modal abre.

## 2. Contexto del bug

### Estado actual (roto)

```ts
// ContractsView.tsx:393-401
useEffect(() => {
  if (contract) return; // edición: no tocar
  if (!form.propertyId) return; // sin propiedad seleccionada
  if (form.rentAmount > 0 || form.adminFee > 0) return; // ya tiene valores
  const t = tenants.find(
    (x: any) => x.propertyId === form.propertyId && x.status === "Activo",
  );
  if (!t) return;
  setForm((f) => ({
    ...f,
    tenantId: t.id,
    rentAmount: Number(t.rent ?? 0) || 0,
    adminFee: Number(t.adminFee ?? 0) || 0,
  }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // solo al mount
```

### Resultado

El `useEffect` corre UNA SOLA VEZ al mount del componente. Si el modal abre antes de que `appStore.hydrate()` termine de cargar `tenants` desde MySQL, el efecto no encuentra el tenant activo y no pre-rellena nada. El usuario ve el modal con `rentAmount: 0, adminFee: 0` aunque el tenant ya tiene canon configurado en MySQL.

### Por qué rompe

- **Captación típica**: el agente termina el Inventario de Colocación, que dispara la creación del contrato. El modal abre. Pero el tenant activo es nuevo (recién creado), y la lista de `tenants` en el store puede no estar sincronizada con la respuesta del server todavía.
- **El user tiene que tipear a mano** los valores. Si los pone distintos a los del tenant en MySQL, el contrato queda con un canon distinto al pactado.

## 3. Acceptance Criteria

### AC-1: El useEffect se re-dispara cuando `tenants` o `properties` cambian

- **Deps del useEffect**: `[form.propertyId, tenants, properties, contract]`.
- El efecto se ejecuta:
  - Al mount del componente
  - Cuando `form.propertyId` cambia (caso: user selecciona otra propiedad en el dropdown)
  - Cuando `tenants` se hidrata (caso: appStore.hydrate() termina después del mount)
  - Cuando `properties` se hidrata (caso: similar)
  - **NO** se ejecuta cuando `form.rentAmount` o `form.adminFee` cambian (eso es feedback del user, no trigger de re-fill)

### AC-2: Regla "no override" preservada

- Si `form.rentAmount > 0` o `form.adminFee > 0` ANTES del re-disparo, NO sobrescribir.
- Esta regla aplica también cuando el efecto se re-dispara por hidratación tardía (no es excusa para pisar valores del user).

### AC-3: Modo edición (contract presente) NO se ve afectado

- Si `contract` está presente (caso edición), el efecto retorna inmediatamente sin tocar nada.
- El comportamiento actual ya está bien para este caso, solo se preserva.

### AC-4: setForm con función updater

- Usar `setForm((f) => ({ ...f, ... }))` en vez de `setForm({ ...form, ... })` para evitar closure stale.
- Garantiza que si el efecto se dispara 2 veces en rápida sucesión (ej. tenants llega, properties llega, ambos triggers), la segunda llamada vea el state actualizado por la primera.

### AC-5: Eliminación del `eslint-disable-next-line`

- Quitar el `// eslint-disable-next-line react-hooks/exhaustive-deps` porque las deps ahora son correctas.
- Si el linter se queja por alguna razón, documentar en un comentario por qué.

## 4. Edge Cases

### EC-1: Hidratación tardía

- **Pasos**: hacer refresh de la página con un tenant recién creado en MySQL.
- **Esperado**: el modal abre con `rentAmount=0, adminFee=0` momentáneamente. Cuando `appStore.hydrate()` termina (1-2s), el modal se actualiza SOLO si la regla "no override" no se disparó (es decir, el user no tocó los campos).
- **Esperado v2**: si el user YA tocó los campos antes de que llegue la hidratación, no se pisan sus valores.

### EC-2: Cambio de propiedad

- **Pasos**: en el modal, cambiar el dropdown de propiedad.
- **Esperado**: si la nueva propiedad tiene tenant activo, se re-rellena `rentAmount`, `adminFee`, `tenantId`.
- **Esperado v2**: si la nueva propiedad NO tiene tenant activo, los campos quedan vacíos (no se pisa con datos de la propiedad anterior).

### EC-3: Cambio de tenant

- **Pasos**: en el modal, cambiar el dropdown de tenant.
- **Esperado**: el handler `onTenantChange` (existente) actualiza `rentAmount` y `adminFee` respetando "no override".
- **Este AC no cambia el comportamiento existente**, solo documenta que el handler separado sigue funcionando.

### EC-4: Edición de contrato existente

- **Pasos**: abrir modal con un contract existente.
- **Esperado**: el useEffect retorna inmediatamente por `if (contract) return;`.
- **Esperado v2**: los valores del contract (incluso si son 0 por legacy) NO se pisan con datos del tenant activo.

## 5. Technical Contract

### Antes

```ts
// ContractsView.tsx:393-401
useEffect(() => {
  if (contract) return;
  if (!form.propertyId) return;
  if (form.rentAmount > 0 || form.adminFee > 0) return;
  const t = tenants.find(
    (x: any) => x.propertyId === form.propertyId && x.status === "Activo",
  );
  if (!t) return;
  setForm((f) => ({
    ...f,
    tenantId: t.id,
    rentAmount: Number(t.rent ?? 0) || 0,
    adminFee: Number(t.adminFee ?? 0) || 0,
  }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

### Después

```ts
// ContractsView.tsx:393-401
useEffect(() => {
  if (contract) return;
  if (!form.propertyId) return;
  setForm((f) => {
    if (f.rentAmount > 0 || f.adminFee > 0) return f; // no override
    const t = tenants.find(
      (x: any) => x.propertyId === f.propertyId && x.status === "Activo",
    );
    if (!t) return f;
    return {
      ...f,
      tenantId: t.id,
      rentAmount: Number(t.rent ?? 0) || 0,
      adminFee: Number(t.adminFee ?? 0) || 0,
    };
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [form.propertyId, tenants, properties, contract]);
```

> **Nota**: el `eslint-disable` se mantiene porque `form.propertyId` ya está en las deps pero el linter se queja de `tenants` y `properties` (closures). Se documenta con un comentario por qué.

## 6. Tostadas exactas (copy approved — NO improvisar)

Este fix no tiene toasts nuevos. Los toasts existentes del flujo de contratos se preservan:

| Trigger           | Copy (existente)                                  |
| ----------------- | ------------------------------------------------- |
| Save OK           | `✓ Contrato guardado`                             |
| Save error        | `Error al guardar el contrato: ${err.message}`    |
| Validación inline | `El canon debe ser mayor a 0` (alert del browser) |

## 7. Out of Scope

- **Mejorar la heurística de "no override"** (ej: distinguir entre canon y adminFee por separado) — eso es otro spec.
- **Cargar datos del tenant directamente desde MySQL** sin pasar por el store — fuera de scope (la hidratación del store es la estrategia).
- **Mostrar un loading state** mientras `appStore.hydrate()` corre — el modal ya tiene su propio loading, esto es responsabilidad del store.
- **Tests automatizados con Vitest** — fuera de scope. Se verifica con el verifier E2E manual.

## 8. Dependencias

### Archivos a modificar (potencialmente)

- `src/features/contracts/ContractsView.tsx` (solo el useEffect de auto-fill, líneas 393-401)

### Archivos a NO tocar

- `src/shared/store/appStore.ts` (la hidratación se mantiene igual)
- `src/features/contracts/contractStore.ts` (no se toca)
- `server/routes/entities.ts` (no se toca)
- El handler `onTenantChange` (líneas 367-389) — se preserva tal cual

## 9. Riesgos identificados

- **Re-renders innecesarios**: si `tenants` o `properties` cambian por cualquier razón (ej. el user hace una acción que actualiza el store), el useEffect se re-dispara. El guard "no override" mitiga el impacto, pero el `setForm` con función updater corre igual. **Riesgo bajo** porque `setForm` con misma referencia no causa re-render en React 19.
- **Loop infinito**: el setForm cambia `form.propertyId` solo si encuentra un tenant. Si no encuentra, no hay cambio. Si encuentra y cambia `tenantId`, el user puede verlo como cambio, pero el useEffect no depende de `tenantId`, así que no se re-dispara por eso. **Riesgo bajo**.
- **Hidratación de un tenant con `rent=0` o `adminFee=0`**: el efecto rellena con 0 (no distingue "no tiene canon" de "canon=0"). Esto es el comportamiento actual y se preserva. **No es bug nuevo**.

## 10. Approval

**Status:** ✅ Aprobado
**Aprobado por:** user (Karpathy cycle, ago-2026)
**Fecha de aprobación:** 2026-08-03
