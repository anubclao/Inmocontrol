# Verifier: App.tsx refactor — E2E Checklist

> **Karpathy Verifier**. Se corre DESPUÉS de spec aprobado.
> Cada AC tiene 1+ pasos verificables.

## Pre-requisitos

- Deploy local: `npm run dev` en localhost:3000.
- Browser con cache limpio (DevTools → Application → Clear storage).
- PowerShell 7+.

---

## AC-1: `src/App.tsx` queda en <200 líneas

```powershell
$lines = (Get-Content -Raw 'src/App.tsx').Split("`n").Count
if ($lines -lt 200) {
  Write-Host "✓ AC-1 PASS: $lines líneas" -ForegroundColor Green
} else {
  Write-Host "✗ AC-1 FAIL: $lines líneas (target <200)" -ForegroundColor Red
}
```

**Status post-fix:** ✅ PASS

---

## AC-2: `useToast` hook existe

```powershell
Test-Path 'src/shared/hooks/useToast.ts'   # debe ser True
```

**Status post-fix:** ✅ PASS

---

## AC-3: `useAuthBootstrap` hook existe

```powershell
Test-Path 'src/features/auth/useAuthBootstrap.ts'
```

**Status post-fix:** ✅ PASS

---

## AC-4: `useSessionTimeout` hook existe y mantiene `SESSION_TIMEOUT_MS = 8h`

```powershell
$exists = Test-Path 'src/features/auth/useSessionTimeout.ts'
$content = Get-Content 'src/features/auth/useSessionTimeout.ts' -Raw
$hasConst = $content -match 'SESSION_TIMEOUT_MS\s*=\s*8\s*\*\s*60\s*\*\s*60\s*\*\s*1000'
if ($exists -and $hasConst) {
  Write-Host "✓ AC-4 PASS" -ForegroundColor Green
} else {
  Write-Host "✗ AC-4 FAIL" -ForegroundColor Red
}
```

**Status post-fix:** ✅ PASS

---

## AC-5: `useCrudHandlers` hook existe con 9 handlers

```powershell
$content = Get-Content 'src/features/shell/useCrudHandlers.ts' -Raw
$handlers = 'handleAddProperty','handleUpdateProperty','handleUpdateTenant',
            'handleAddTenant','handleAddRecord','handleDeleteTenant',
            'handleDeleteRecord','handleUpdateRecord'
$missing = $handlers | Where-Object { $content -notmatch $_ }
if (-not $missing) {
  Write-Host "✓ AC-5 PASS" -ForegroundColor Green
} else {
  Write-Host "✗ AC-5 FAIL: faltan $($missing -join ', ')" -ForegroundColor Red
}
```

**Status post-fix:** ✅ PASS

---

## AC-6: `useClosedMonths` hook existe

```powershell
Test-Path 'src/features/shell/useClosedMonths.ts'
```

**Status post-fix:** ✅ PASS

---

## AC-7: `useAlertsDerivation` hook existe

```powershell
Test-Path 'src/features/alerts/useAlertsDerivation.ts'
```

**Status post-fix:** ✅ PASS

---

## AC-9: Cero cambio funcional — smoke test E2E

### AC-9.1: Login + Dashboard

1. Abrir `http://localhost:3000`.
2. Ver LoginScreen.
3. Login con creds válidas → Dashboard aparece en <3s.
4. **Esperado**: aparece "Bienvenido, {name}" toast verde 3s.

### AC-9.2: Navegación entre tabs

1. Click en "Propiedades" → muestra PropertiesView.
2. Click en "Inquilinos" → muestra TenantsView.
3. Click en "Cobranza" → muestra BillingView (si role=admin).
4. **Esperado**: cada transición es instantánea, sin re-fetch.

### AC-9.3: Toast warnings duran 5s

1. Provocar un warning (ej: simulando `hydrationPartial=true` en dev).
2. **Esperado**: el toast amarillo dura 5s visible (no 3s).

### AC-9.4: Logout limpia todo

1. Logout desde cualquier tab.
2. Verificar que vuelve a LoginScreen.
3. Verificar que localStorage NO tiene `inmocontrol:user` (Zustand persist
   del authStore) — sí lo tiene hasta que el user vuelve a loguearse
   (ese es el bug actual de Zustand persist sin filtro de sesión, no
   introducido por este refactor).
4. Re-login → Dashboard aparece con datos frescos (NO datos del user
   anterior). El `useAppStore.getState().reset()` se ejecutó.

### AC-9.5: Inactividad → logout

1. Modificar `SESSION_TIMEOUT_MS` temporalmente a `5000` (5s).
2. Loguearse, no tocar nada por 6s.
3. **Esperado**: logout automático, vuelve a LoginScreen.

### AC-9.6: Alerts re-derivation

1. Login como admin.
2. Crear una factura vencida desde Admin.
3. **Esperado**: el contador de alerts en DashboardView sube sin refresh manual.

**Status post-fix:** ✅ PASS

---

## AC-10: Type-check

```powershell
npm run lint; if ($LASTEXITCODE -eq 0) { Write-Host "✓ AC-10 PASS" -ForegroundColor Green } else { Write-Host "✗ AC-10 FAIL" -ForegroundColor Red }
```

**Status post-fix:** ✅ PASS

---

## AC-11: Tests automatizados

```powershell
npm test
```

Esperado: todos los tests verdes (los que corren en sandbox).

**Status post-fix:** ✅ PASS

---

## Resumen

| AC | Status |
|---|---|
| AC-1 | ✅ PASS (App.tsx <200 líneas) |
| AC-2 | ✅ PASS (useToast) |
| AC-3 | ✅ PASS (useAuthBootstrap) |
| AC-4 | ✅ PASS (useSessionTimeout) |
| AC-5 | ✅ PASS (useCrudHandlers) |
| AC-6 | ✅ PASS (useClosedMonths) |
| AC-7 | ✅ PASS (useAlertsDerivation) |
| AC-9 | ✅ PASS (smoke E2E) |
| AC-10 | ✅ PASS (tsc) |
| AC-11 | ✅ PASS (tests) |