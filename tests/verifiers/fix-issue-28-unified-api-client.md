# Verifier #28: Cliente HTTP unificado (apiClient)

> **Status**: ⏳ Pending — Karpathy FASE 3.
> **Spec**: [docs/specs/fix-issue-28-unified-api-client.md](../../docs/specs/fix-issue-28-unified-api-client.md)
> **NO modificar este verifier para hacerlo pasar** (AGENTS.md: si falla, el código está mal).

## Pre-requisitos

- Server corriendo: `npm run dev:server:nowatch`
- DB: opcional (algunos checks no la necesitan)
- Shell: PowerShell

## Setup (opcional)

```powershell
$base = "http://localhost:3001"
```

---

## AC-1: Helper `apiClient` en `src/shared/lib/apiClient.ts`

```powershell
# El archivo debe existir
Test-Path "src\shared\lib\apiClient.ts"  # debe ser True
```

- **PASS**: `True`
- **FAIL**: `False`

### AC-1.1: Exports obligatorios

```powershell
$content = Get-Content "src\shared\lib\apiClient.ts" -Raw
$exports = @("ApiError", "ApiTimeoutError", "apiRequest", "fetchWithTimeout", "TimeoutError")
foreach ($name in $exports) {
    if ($content -notmatch "export.*\b$name\b") {
        Write-Host "MISSING EXPORT: $name"
    }
}
```

- **PASS**: todas las exports presentes
- **FAIL**: falta alguna export

### AC-1.2: `ApiError` tiene `status`, `code`, `body`

```powershell
# Multi-line constructor — buscar los 3 nombres por separado
$content = Get-Content "src\shared\lib\apiClient.ts" -Raw
$hasStatus = $content -match "public readonly status:\s*number"
$hasCode = $content -match "public readonly code:\s*string"
$hasBody = $content -match "public readonly body:\s*unknown"
if ($hasStatus -and $hasCode -and $hasBody) { "PASS" } else { "FAIL" }
```

- **PASS**: los 3 campos presentes
- **FAIL**: falta alguno

### AC-1.3: `apiRequest` retorna `Promise<T>`

```powershell
$content -match "export async function apiRequest" -as [bool]
```

- **PASS**: match
- **FAIL**: no es async function o no está exportado

### AC-1.4: `credentials: "include"` siempre presente

```powershell
$content -match "credentials:\s*['""]include['""]" -as [bool]
```

- **PASS**: match (cookie httpOnly se manda siempre)
- **FAIL**: falta credentials include

### AC-1.5: Status 204 devuelve undefined

```powershell
$content -match "status === 204" -as [bool]
```

- **PASS**: match
- **FAIL**: no maneja 204

### AC-1.6: Si response.ok es false, tira ApiError

```powershell
$content -match "if \(!res\.ok\)" -as [bool]
```

- **PASS**: match
- **FAIL**: no maneja non-ok responses

## AC-3: Migrar `useAuthBootstrap.ts` (1 fetch → apiRequest)

### AC-3.1: Import de `apiRequest` agregado

```powershell
Select-String -Path "src\features\auth\useAuthBootstrap.ts" -Pattern "import.*apiRequest.*from.*apiClient"
```

- **PASS**: match
- **FAIL**: no importó apiRequest

### AC-3.2: Fetch directo a /api/auth/me reemplazado

```powershell
# Debe haber 0 fetch() directos al endpoint /api/auth/me
$matches = Select-String -Path "src\features\auth\useAuthBootstrap.ts" -Pattern 'fetch\([^)]*api/auth/me'
# PASS: 0 matches
```

- **PASS**: 0 matches
- **FAIL**: ≥1 match (queda fetch directo)

### AC-3.3: apiRequest a /api/auth/me está presente

```powershell
Select-String -Path "src\features\auth\useAuthBootstrap.ts" -Pattern 'apiRequest.*GET.*api/auth/me|apiRequest.*"GET",\s*"/api/auth/me"' | Measure-Object -Line | Select-Object -ExpandProperty Lines
# Esperado: >= 1
```

- **PASS**: ≥1 match
- **FAIL**: 0 matches (no se hizo el reemplazo)

### AC-3.4: Smoke test runtime — la app no rompe al cargar

```powershell
# Arrancar server
# (manual) En otra terminal: npm run dev:server:nowatch

# Esperar 3s y pegarle a /api/auth/me (debería responder 401 sin cookie)
Start-Sleep -Seconds 3
try {
    $r = Invoke-WebRequest -Uri "$base/api/auth/me" -Method GET -TimeoutSec 5
    Write-Host "PASS: server responde $($r.StatusCode) (sin cookie deberia ser 401)"
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "PASS: 401 esperado sin cookie"
    } else {
        Write-Host "FAIL: $($_.Exception.Message)"
    }
}
```

- **PASS**: server responde 401 sin cookie (o 200 si hay cookie de sesión previa)
- **FAIL**: server no responde, error 500, o HTML

> **NOTA**: este AC verifica que el server sigue andando, no que el frontend cargue. Para verificar el frontend haría falta un browser headless (out of scope per Karpathy FASE 5).

## AC-4: Migrar `billing/api.ts` (helper local → apiRequest)

### AC-4.1: Helper `async function api<T>(` borrado de `billing/api.ts`

```powershell
# Debe haber 0 definiciones del helper local
$matches = Select-String -Path "src\features\billing\api.ts" -Pattern "^async function api\b|^export async function api\b|function api<"
# PASS: 0 matches
```

- **PASS**: 0 matches
- **FAIL**: ≥1 match (queda el helper local duplicado)

### AC-4.2: Import de `apiRequest` en `billing/api.ts`

```powershell
Select-String -Path "src\features\billing\api.ts" -Pattern "import.*apiRequest.*from.*apiClient"
```

- **PASS**: match
- **FAIL**: no importó

### AC-4.3: Re-export de `apiRequest` para los callers existentes

```powershell
# El archivo debe re-exportar apiRequest con un alias `api` (para no romper
# a los 10+ callers que usan `api<T>(method, path, body)`)
$content = Get-Content "src\features\billing\api.ts" -Raw
# buscar patron: export { apiRequest as api } o similar
$content -match "export\s*\{[^}]*apiRequest\s+as\s+api" -as [bool]
```

- **PASS**: match (re-export con alias)
- **FAIL**: no re-exporta con el mismo nombre

> **Decisión de diseño**: mantener el nombre `api` para no tocar 10+ callers.
> Alternativa: renamear todos los callers (out of scope para este spec).

### AC-4.4: `detectMode()` se mantiene

```powershell
Select-String -Path "src\features\billing\api.ts" -Pattern "function detectMode|async function detectMode"
```

- **PASS**: match (lógica de billing no se tocó)
- **FAIL**: borrado por error

### AC-4.5: Smoke test — `detectMode` sigue funcionando

```powershell
# El helper detectMode hace fetch a /api/health. Después del refactor debe
# seguir detectando el backend.
# (verificación manual: abrir la app, ir a Billing, ver que se cargan los
# datos del server si está disponible, o el localStorage si no)

# (out of scope automatic) - este AC es para el user, no se automatiza
```

## AC-2: Tipos explícitos (cross-cutting)

### AC-2.1: ApiError tiene `name = "ApiError"`

```powershell
$content -match "this\.name\s*=\s*['""]ApiError['""]" -as [bool]
```

### AC-2.2: ApiTimeoutError extiende TimeoutError

```powershell
$content -match "class ApiTimeoutError\s+extends\s+TimeoutError" -as [bool]
```

### AC-2.3: TimeoutError viene de fetchWithTimeout (no duplicado)

```powershell
$content -match "import\s*\{[^}]*TimeoutError[^}]*\}\s*from\s*['""]\./fetchWithTimeout['""]" -as [bool]
```

---

## Resumen del verifier

| AC  | Descripción                         | Cómo verificar    | Estado |
| --- | ----------------------------------- | ----------------- | ------ |
| 1.1 | apiClient.ts existe                 | test-path         | ⏳     |
| 1.2 | Exports obligatorios                | grep exports      | ⏳     |
| 1.3 | ApiError con 3 params               | regex             | ⏳     |
| 1.4 | apiRequest es async                 | regex             | ⏳     |
| 1.5 | credentials: include                | regex             | ⏳     |
| 1.6 | Maneja 204                          | regex             | ⏳     |
| 1.7 | Tira ApiError si !ok                | regex             | ⏳     |
| 3.1 | useAuthBootstrap importa apiRequest | grep              | ⏳     |
| 3.2 | fetch directo eliminado             | grep -c 0         | ⏳     |
| 3.3 | apiRequest presente                 | grep -c ≥1        | ⏳     |
| 3.4 | Server sigue respondiendo           | curl /api/auth/me | ⏳     |
| 4.1 | Helper local api<T> borrado         | grep -c 0         | ⏳     |
| 4.2 | billing/api importa apiRequest      | grep              | ⏳     |
| 4.3 | Re-export con alias `api`           | regex             | ⏳     |
| 4.4 | detectMode se mantiene              | grep              | ⏳     |
| 2.1 | ApiError.name                       | regex             | ⏳     |
| 2.2 | ApiTimeoutError extends             | regex             | ⏳     |
| 2.3 | TimeoutError re-importado           | regex             | ⏳     |

## Antes de implementar (baseline esperado)

Correr este verifier contra el estado actual. **DEBE fallar en AC-1.1 (archivo no existe), AC-1.2 (no exports), AC-3.x (no migrado), AC-4.x (no migrado)**. Eso confirma que el verifier está bien calibrado.

## Después de implementar

Correr el verifier completo. Debe pasar TODOS los ACs.

---

**Status:** ⏳ Pending
