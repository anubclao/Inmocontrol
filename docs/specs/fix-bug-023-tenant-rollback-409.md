# Fix: TenantsView handleConfirmAndCreate sin rollback en 409 (BUG-023)

> **Karpathy Spec** — Agosto 2026. Define QUÉ debe hacer el fix.
> NO incluye código de implementación. Una vez aprobado, sigue
> `tests/verifiers/fix-bug-023-tenant-rollback-409.md`.
>
> **Bug origen**: BUG-023 en [docs/bugs/BUGS.md](../bugs/BUGS.md).
> **Severidad**: 🟡 Media.
> **Stack afectado**: `src/features/tenants/TenantsView.tsx`.

## 1. User Story

**As a** operador de InmoControl,
**I want to** que si la creación del tenant en MySQL funciona pero el PATCH a la propiedad falla, vea el error y pueda reintentar SIN que el modal se haya cerrado ni los datos se hayan reseteado,
**So that** no quede un tenant creado en MySQL pero la propiedad sin actualizar (estado inconsistente que el user no detecta).

## 2. Contexto del bug

### Estado actual (`TenantsView.tsx:426-446`)

```ts
const handleConfirmAndCreate = async () => {
  // Paso 1: crear tenant
  const res = await fetch('/api/tenants', {...});
  const data = await res.json();
  if (!res.ok) { showToast(...); return; }   // OK, falla antes de avanzar

  // Paso 2: actualizar propiedad
  onAddTenant({...});                          // ← state local actualizado
  onUpdateProperty(form.propertyId, propUpdate);  // ← PATCH puede fallar

  // Paso 3: cleanup
  showToast('Arrendatario creado...');
  setForm({ ... });                            // ← form reseteado
  setIsCreateModalOpen(false);                 // ← modal cerrado
};
```

### Resultado

Si `onUpdateProperty` falla (PATCH devuelve 500):

- Tenant YA creado en MySQL.
- onAddTenant YA actualizó el state local.
- PATCH falló → user no se entera (toast dice "creado OK").
- Modal YA cerrado.
- Form YA reseteado.
- Propiedad sigue con status "Activo" (no se cambió a "En Colocación").

**Estado inconsistente silencioso.**

## 3. Acceptance Criteria

### AC-1: Hacer el property update ANTES de cerrar el modal

```ts
const handleConfirmAndCreate = async () => {
  // Paso 1: crear tenant
  const res = await fetch('/api/tenants', {...});
  const data = await res.json();
  if (!res.ok) { showToast(...); return; }

  // Paso 2: actualizar propiedad (PUEDE FALLAR)
  try {
    await onUpdateProperty(form.propertyId, propUpdate);
  } catch (propErr) {
    // El tenant YA se creó en MySQL. Decisión: continuar o rollback.
    // Por ahora: log + warning toast + seguir. El user puede reintentar
    // el PATCH desde el módulo Properties.
    console.error('[tenant] tenant created but property update failed:', propErr);
    showToast(
      'Inquilino creado pero no se pudo actualizar la propiedad. Reintentá desde Properties.',
      'warning',
    );
    // NO cerrar el modal todavía
    return;
  }

  // Paso 3: solo si todo OK → state local + cerrar modal
  onAddTenant({...});
  showToast('Inquilino creado...');
  setForm({ ... });
  setIsCreateModalOpen(false);
};
```

### AC-2: `onUpdateProperty` debe devolver `Promise<boolean>`

- En `appStore.updateProperty`, ya devuelve `Promise<void>` con catch silencioso.
- Cambiar a `Promise<boolean>`:
  ```ts
  updateProperty: async (id, patch) => {
    try {
      await apiCall('PATCH', `/api/properties/${id}`, patch);
      set((s) => ({ properties: s.properties.map(p => p.id === id ? { ...p, ...patch } : p) }));
      return true;
    } catch (err: any) {
      console.error('[store] updateProperty failed:', err);
      set({ error: err?.message });
      return false;  // ← false en error
    }
  },
  ```

### AC-3: El caller maneja el boolean

```ts
const success = await onUpdateProperty(form.propertyId, propUpdate);
if (!success) {
  // El tenant YA se creó. Mostrar warning + no cerrar modal.
  showToast('Inquilino creado pero no se pudo actualizar la propiedad. Reintentá desde Properties.', 'warning');
  return;
}
// OK, cerrar modal y cleanup
onAddTenant({...});
showToast('Inquilino creado...');
setForm({ ... });
setIsCreateModalOpen(false);
```

### AC-4: Warning toast (no error)

- El tenant SÍ se creó (no es un error total).
- Usar `type: 'warning'` (amber) con el copy "se creó pero...".
- El user puede reintentar el PATCH desde Properties sin perder el tenant.

## 4. Edge Cases

### EC-1: Tenant creation OK + Property update OK (caso normal)

- Ambos booleanos true.
- Modal cierra, form resetea, toast de éxito.

### EC-2: Tenant creation FALLA (e.g. 409 duplicado)

- Early-return en paso 1.
- Modal queda abierto, form intacto.
- Toast de error del paso 1.

### EC-3: Tenant creation OK + Property update FALLA

- Toast warning.
- Modal queda abierto.
- Form intacto.
- Tenant en MySQL pero propiedad sin actualizar.

### EC-4: `onAddTenant` mismo cambia (e.g. un futuro move a async)

- Asumimos que `onAddTenant` es sincrónico al state local (lo es hoy).
- No es foco de este fix.

## 5. Technical Contract

### Antes (sin chequeo)

```
1. POST /api/tenants → 200
2. onAddTenant(state)
3. onUpdateProperty(...)  ← puede fallar silencioso
4. showToast('OK')
5. setForm({})
6. setIsCreateModalOpen(false)
```

### Después (con chequeo)

```
1. POST /api/tenants → 200
2. const ok = await onUpdateProperty(...)
3. if (!ok) {
     showToast('warning: tenant creado pero property update falló')
     return (modal queda abierto, form intacto)
   }
4. onAddTenant(state)
5. showToast('OK')
6. setForm({})
7. setIsCreateModalOpen(false)
```

## 6. Tostadas exactas (copy approved — NO improvisar)

| Trigger                  | Tipo    | Copy exacto                                                                                          |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------- |
| Tenant + Property OK     | success | `Arrendatario creado — completa el Inventario de Colocación para activar la propiedad` (sin cambios) |
| Tenant OK, Property FAIL | warning | `Inquilino creado pero no se pudo actualizar la propiedad. Reintentá desde Properties.`              |

## 7. Out of Scope

- Rollback del tenant en MySQL si el PATCH falla (sería DELETE adicional).
- Reintento automático del PATCH.
- Confirmación visual de "property updateada" separada del tenant.

## 8. Dependencias

- `appStore.updateProperty` signature change: `Promise<void>` → `Promise<boolean>`.
- `TenantsView.tsx:426-446` modificado.

## 9. Effort

- Cambiar signature de `updateProperty`: 5 min.
- Wrap con try/catch en `handleConfirmAndCreate`: 10 min.
- Test manual: 15 min.
- **Total: 30 min**

---

**Pendiente de aprobación del usuario.**
