# Verifier: Spec #5c — PropertiesView extract pass

> **Karpathy Verifier** para el refactor #5c. Cada AC es binario.

---

## AC-1: PropertiesView <500 líneas (target ambicioso)

```powershell
$lines = (Get-Content -Raw 'src/features/properties/PropertiesView.tsx').Split("`n").Count
Write-Host "PropertiesView.tsx: $lines líneas"
```

**Status pre-#5c:** 3091
**Status post-#5c completo (8 commits):** ~1680 esperado
**Status actual (2 commits):** 3014 (sin llegar al target aún)

---

## AC-2: `useModalsState` hook existe

```powershell
Test-Path 'src/features/properties/hooks/useModalsState.ts'
```

**Status:** ✅ PASS (Commit 1)

---

## AC-3: `usePropertyActions` hook existe

```powershell
Test-Path 'src/features/properties/hooks/usePropertyActions.ts'
```

**Status:** ⏳ Pendiente (Commits 3-4 del spec)

---

## AC-4: `InventoryModal` componente existe

```powershell
Test-Path 'src/features/properties/components/InventoryModal.tsx'
```

**Status:** ⏳ Pendiente

---

## AC-5: `CompareInventoriesModal` componente existe

```powershell
Test-Path 'src/features/properties/components/CompareInventoriesModal.tsx'
```

**Status:** ⏳ Pendiente

---

## AC-6: `ConfirmDeleteModal` componente existe

```powershell
Test-Path 'src/features/properties/components/ConfirmDeleteModal.tsx'
```

**Status:** ✅ PASS (Commit 2)

---

## AC-9: Cero cambio funcional — smoke E2E

### AC-9.1: Crear propiedad via wizard

1. Login admin.
2. Click "+ Agregar Propiedad".
3. Llenar step 1 (dirección + propietario) → "Continuar".
4. Subir 5 docs en step 2 → "Continuar".
5. Llenar inventario en step 3 → "Finalizar".
6. **Esperado**: Modal de resumen con badges correctos.

### AC-9.2: Ver detalle

1. Click en una propiedad.
2. **Esperado**: Modal de detalle con propietarios, unidades, docs.

### AC-9.3: Eliminar propiedad

1. Click en 🗑 trash de una propiedad SIN inventario.
2. **Esperado**: Modal "¿Eliminar inmueble?" aparece.
3. Click "Sí, eliminar" → toast "Inmueble eliminado".

### AC-9.4: Galería de fotos

1. Click en "📸 Fotos captación" en el detalle.
2. **Esperado**: Modal con grid de fotos + lightbox.

---

## AC-10: Type-check

```powershell
npm run lint
```

**Status:** ✅ PASS

---

## Resumen

| AC | Status |
|---|---|
| AC-1 | ⏳ Pendiente (2 commits de 8 hechos) |
| AC-2 | ✅ PASS (useModalsState) |
| AC-6 | ✅ PASS (ConfirmDeleteModal) |
| AC-10 | ✅ PASS (tsc) |

---

> **Nota**: el spec #5c plantea 8 commits. Hicimos los 2 primeros
> (los más simples y de bajo riesgo). El resto queda para el equipo
> siguiendo el mismo patrón.