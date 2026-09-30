# Verifier #27: Manejo unificado de errores en el backend

> **Status**: ⏳ Pending — Karpathy FASE 3.
> **Spec**: [docs/specs/fix-issue-27-unified-error-handling.md](../../docs/specs/fix-issue-27-unified-error-handling.md)
> **NO modificar este verifier para hacerlo pasar** (AGENTS.md: si falla, el código está mal).

## Pre-requisitos

- Server corriendo: `npx tsx server.ts`
- DB: opcional (algunos checks no la necesitan)
- Shell: PowerShell

## Setup (opcional)

```powershell
# Helper para los checks
$base = "http://localhost:3001"
$cookie = $null  # Si necesitás auth, primero hacé login y guardá la cookie
```

---

## AC-1: Cero `res.status(500)` en `server/routes/*.ts`

```powershell
# Debe retornar 0 (objetivo). Antes del fix retorna 17.
$count = (Select-String -Path "server\routes\*.ts" -Pattern "res\.status\(500\)" | Measure-Object -Line).Lines
Write-Host "res.status(500) count: $count (expected: 0)"
```

- **PASS**: `$count -eq 0`
- **FAIL**: `$count -gt 0` (lista los archivos con el antipatrón restante)

## AC-2: Helper `AppError` + factories exportados desde `server/lib/errors.ts`

```powershell
# Archivo debe existir
Test-Path "server\lib\errors.ts"  # debe ser True

# Debe exportar AppError, badRequest, unauthorized, forbidden, notFound, conflict, internal, serviceUnavailable, asyncHandler
$content = Get-Content "server\lib\errors.ts" -Raw
$exports = @("AppError", "badRequest", "unauthorized", "forbidden", "notFound", "conflict", "internal", "serviceUnavailable", "asyncHandler")
foreach ($name in $exports) {
    if ($content -notmatch "export.*\b$name\b") {
        Write-Host "MISSING EXPORT: $name"
    }
}
```

- **PASS**: archivo existe y todas las exports están presentes
- **FAIL**: archivo falta o falta alguna export

### AC-2.1: `AppError` tiene `statusCode`, `code`, `expose` y `expose` default = false

```powershell
# Verificar que el constructor tiene los 4 params y que expose default es false
$content = Get-Content "server\lib\errors.ts" -Raw
$content -match "class AppError.*?statusCode.*?message.*?code.*?expose\s*=\s*false" -as [bool]  # debe ser True
```

- **PASS**: match
- **FAIL**: no match (revisar signature del constructor)

### AC-2.2: `internal()` setea `expose = false`

```powershell
$content = Get-Content "server\lib\errors.ts" -Raw
$content -match "export const internal\s*=.*?new AppError\(500.*?, false\)" -as [bool]  # debe ser True
```

- **PASS**: match
- **FAIL**: el factory `internal` no usa `expose=false`

## AC-3: `errorHandler` reconoce `AppError` y aplica `expose`

### AC-3.1: `errorHandler` importa `AppError`

```powershell
$content = Get-Content "server\lib\errorHandler.ts" -Raw
$content -match "import.*AppError.*from.*errors" -as [bool]  # debe ser True
```

- **PASS**: match
- **FAIL**: falta el import

### AC-3.2: Shape de 5xx con `expose=false` (genérico)

```powershell
# Pegale a un endpoint que devuelva 5xx (necesita DB caída o endpoint buggy)
# Ejemplo: forzar un error con body malformado a un endpoint existente
try {
    Invoke-WebRequest -Uri "$base/api/properties" -Method POST -ContentType "application/json" -Body '{"__force_500__": true}' -TimeoutSec 5
} catch {
    # WebRequest tira excepción en 4xx/5xx — leer el body
    $body = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($body)
    $json = $reader.ReadToEnd() | ConvertFrom-Json
    Write-Host "Error response: $json"
    # Esperado: { error: "Internal server error", code: "INTERNAL" }
    if ($json.error -eq "Internal server error" -and $json.code -eq "INTERNAL") {
        Write-Host "PASS: genérico"
    } else {
        Write-Host "FAIL: leak de internals: $json"
    }
}
```

- **PASS**: body = `{"error":"Internal server error","code":"INTERNAL"}` (sin `sql`, sin `stack`, sin nombres de columnas)
- **FAIL**: cualquier otro shape, o contiene `sql`/`stack`/`Unknown column`

> **Nota**: si la implementación usa un endpoint de healthcheck de prueba (`/api/__test/error`), ese es preferible. Si no, cualquier endpoint que tire 5xx sirve.

### AC-3.3: Shape de 4xx (cliente ve mensaje custom)

```powershell
# 400: bad request con body faltante
try {
    Invoke-WebRequest -Uri "$base/api/properties" -Method POST -ContentType "application/json" -Body '{}' -TimeoutSec 5
} catch {
    $body = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($body)
    $json = $reader.ReadToEnd() | ConvertFrom-Json
    Write-Host "400 response: $json"
    # Esperado: { error: <mensaje custom del caller>, code: <code del caller> }
    if ($json.error -and $json.code) {
        Write-Host "PASS: shape correcto"
    } else {
        Write-Host "FAIL: shape incorrecto"
    }
}
```

- **PASS**: body = `{"error":"<custom msg>","code":"<custom code>"}` (mensaje legible, no leak)
- **FAIL**: HTML, JSON malformado, o falta `error`/`code`

## AC-4: Los 17 sitios refactorizados

### AC-4.1: properties.ts — 6 sitios

```powershell
# Cada uno de estos grep debe dar 0 matches
$props = @(
    @{ line = 294; pattern = 'res\.status\(500\)\.json\(\{\s*error:\s*"No se pudo validar' },
    @{ line = 463; pattern = 'res\.status\(500\)\.json\(\{\s*error:\s*"Error resolviendo' },
    @{ line = 537; pattern = 'res\.status\(500\)\.json.*?UPSERT_NO_MATCH' },
    @{ line = 672; pattern = 'res\.status\(500\)\.json.*?property_owners' },
    @{ line = 731; pattern = 'res\.status\(500\)\.json.*?property_units' },
    @{ line = 849; pattern = 'res\.status\(500\)\.json.*?Error inesperado guardando' }
)
foreach ($p in $props) {
    $found = Select-String -Path "server\routes\properties.ts" -Pattern $p.pattern
    if ($found) { Write-Host "FAIL: properties.ts patrón viejo sigue presente" } else { Write-Host "OK: properties.ts refactorizado" }
}
```

- **PASS**: 0 matches para los 6 patrones viejos
- **FAIL**: alguno sigue presente

### AC-4.2: tenants.ts — 2 sitios

```powershell
$matches = Select-String -Path "server\routes\tenants.ts" -Pattern "res\.status\(500\)"
$matches.Count | Should -BeLessOrEqual 0  # (si usás Pester) — manual: $matches -eq $null o $matches.Count -eq 0
```

- **PASS**: 0 matches
- **FAIL**: ≥1 match

### AC-4.3: saasBilling.ts — 2 sitios

```powershell
$matches = Select-String -Path "server\routes\saasBilling.ts" -Pattern "res\.status\(500\)"
# PASS: 0 matches
```

### AC-4.4: notifications.ts — 4 sitios

```powershell
$matches = Select-String -Path "server\routes\notifications.ts" -Pattern "res\.status\(500\)"
# PASS: 0 matches
```

### AC-4.5: admin.ts — 2 sitios

```powershell
$matches = Select-String -Path "server\routes\admin.ts" -Pattern "res\.status\(500\)"
# PASS: 0 matches
```

### AC-4.6: auth.ts — 1 sitio

```powershell
$matches = Select-String -Path "server\routes\auth.ts" -Pattern "res\.status\(500\)"
# PASS: 0 matches
```

## AC-5: Shape uniforme (sin campos extra)

```powershell
# Forzar un 500 y verificar que NO tiene sql, mysqlCode, hint, ok
try {
    Invoke-WebRequest -Uri "$base/api/properties" -Method POST -ContentType "application/json" -Body '{"__force_500__": true}' -TimeoutSec 5
} catch {
    $body = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($body)
    $json = $reader.ReadToEnd() | ConvertFrom-Json
    $json | Get-Member -MemberType NoteProperty | ForEach-Object { Write-Host "Field: $($_.Name)" }
    # Esperado: solo "error" y "code"
    # FAIL si aparece: sql, mysqlCode, hint, ok, stack
}
```

- **PASS**: solo `error` y `code`
- **FAIL**: cualquier otro campo en el body

## AC-6: Logs uniformes

```powershell
# Arrancar el server y observar el formato de log
# Trigger manual: hacer una request que tire 500
# Esperado en consola: una línea con formato:
#   [errorHandler] POST /api/properties → 500 (code=INTERNAL, msg=..., stack=presente|ausente)

# (manual) Arrancar en otra terminal:
#   npx tsx server.ts
# Trigger:
Invoke-WebRequest -Uri "$base/api/properties" -Method POST -ContentType "application/json" -Body '{"__force_500__": true}' -TimeoutSec 5

# Verificar que la salida del server tiene UNA línea con [errorHandler] y NO 2 o más
# (antes: [POST /api/properties] UNHANDLED: ... + [errorHandler] ... = doble log)
```

- **PASS**: 1 línea `[errorHandler] METHOD /path → 500 (...)` por error
- **FAIL**: 0 líneas, 2+ líneas, o el log expone el stack al stdout del cliente

## AC-7: Callers del frontend no dependen de campos eliminados

```powershell
# Buscar dependencias de campos que se van a eliminar
$patterns = @("body\.hint", "body\.sql", "body\.mysqlCode", "body\.stack")
$totalMatches = 0
foreach ($p in $patterns) {
    $found = Select-String -Path "src" -Pattern $p -Recurse
    $totalMatches += ($found | Measure-Object -Line).Lines
    if ($found) { Write-Host "MATCH ($p): $($found | ForEach-Object { $_.Path } | Sort-Object -Unique | Join-String -Separator ', ')" }
}
# PASS: 0 matches (no hay callers que dependan de los campos eliminados)
# FAIL: ≥1 match (abrir issue aparte para actualizar el caller)
```

---

## Resumen del verifier

| AC  | Descripción                                      | Cómo verificar           | Estado |
| --- | ------------------------------------------------ | ------------------------ | ------ |
| 1   | 0 `res.status(500)`                              | grep                     | ⏳     |
| 2   | `AppError` + factories en `server/lib/errors.ts` | test-path + grep         | ⏳     |
| 3   | `errorHandler` aplica `expose`                   | curl + shape             | ⏳     |
| 4   | 17 sitios refactorizados                         | grep por archivo         | ⏳     |
| 5   | Shape `{ error, code }` solo                     | curl + Get-Member        | ⏳     |
| 6   | 1 línea de log uniforme                          | observación manual       | ⏳     |
| 7   | Frontend no depende de campos eliminados         | grep recursivo en `src/` | ⏳     |

## Antes de implementar (baseline esperado)

Correr este verifier contra el estado actual (sin fix). **DEBE fallar en AC-1, AC-2, AC-4 (parcial) y AC-5**. Eso confirma que el verifier está bien calibrado y no es complaciente.

Si pasa en AC-1 sin tocar nada, hay un bug en el verifier (o el grep está mal). **No es trampa** — es un check de cordura.

## Después de implementar

Correr el verifier completo. Debe pasar TODOS los ACs. Si alguno falla, el código está mal — NO modificar el verifier.

---

**Status**: ⏳ Pending
