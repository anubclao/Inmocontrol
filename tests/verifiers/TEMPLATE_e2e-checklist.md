# Verifier: [Nombre del Feature] — E2E Checklist

> **Metodología Karpathy (Agent Skill)**: este verifier se escribe DESPUÉS
> de que el spec esté aprobado. Cada Acceptance Criterion del spec debe
> tener 1+ pasos verificables acá. **NO modificar este archivo para hacer
> que los checks pasen** (eso es trampa). Si un check falla, el código
> está mal.

## Cómo ejecutar

### Pre-requisitos

- Hostinger deploy debe estar completo (verificar en hPanel → Despliegues).
- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- phpMyAdmin accesible: `https://auth-db1569.hstgr.io`
- PowerShell 7+ en Windows
- Browser con DevTools abierto (F12 → Console)

### Convención de resultado

Cada check devuelve:
- ✅ **PASS** — el comportamiento es exactamente el del spec
- ❌ **FAIL** — el comportamiento difiere (reportar el output real)
- ⚠️ **SKIP** — no se puede verificar ahora (motivo al lado)

---

## Acceptance Criteria

### AC-1: [texto exacto del spec]

**Pasos:**
1. [Acción concreta — ej: abrir el wizard, llenar step 1, click "Continuar a Documentación"]
2. [Acción — ej: abrir phpMyAdmin, ejecutar `SELECT * FROM properties WHERE address = 'TEST';`]

**Resultado esperado:**
- [Output exacto — ej: aparece una fila con `status='Pendiente'`, `organization_id` no NULL]

**Resultado real:**
- [Llenar después de ejecutar]

**Status:** ⏳ Pending / ✅ PASS / ❌ FAIL

---

### AC-2: [texto exacto del spec]

**Pasos:**
1. [...]
2. [...]

**Resultado esperado:**
- [...]

**Resultado real:**
- [...]

**Status:** ⏳ Pending / ✅ PASS / ❌ FAIL

---

## Edge Cases

### EC-1: [Drive caído]

**Pasos:**
1. [Cómo simular Drive caído — ej: desconectar WiFi brevemente, o usar DevTools → Network → Block request URL para `googleapis.com`]
2. [Acción del user]
3. [Verificación]

**Resultado esperado:**
- [Output exacto]

**Resultado real:**
- [...]

**Status:** ⏳ Pending / ✅ PASS / ❌ FAIL

---

### EC-2: [Server timeout]

**Pasos:**
1. [Cómo simular — ej: matar el server brevemente]
2. [Acción]

**Resultado esperado:**
- [Output]

**Resultado real:**
- [...]

**Status:** ⏳ Pending

---

## Curl Scripts (parte del verifier)

```powershell
# Guardar como tests/verifiers/{name}/run-checks.ps1
# Cada test debe imprimir PASS/FAIL y el output relevante

# Test 1: Health check
$health = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/health" -UseBasicParsing -TimeoutSec 10
if ($health.StatusCode -eq 200) { Write-Host "✓ Health check PASS" } else { Write-Host "✗ Health check FAIL: $($health.StatusCode)" -ForegroundColor Red }
Write-Host $health.Content

# Test 2: POST /api/properties con body válido
$body = @{...} | ConvertTo-Json
$res = Invoke-WebRequest -Uri "https://inmocontrol.tecnowebsupportia.com/api/properties" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 30
# ... validar response ...
```

## Resumen de ejecución

Después de correr todos los checks:

| AC | Status | Notas |
|----|--------|-------|
| AC-1 | ⏳ | — |
| AC-2 | ⏳ | — |
| EC-1 | ⏳ | — |

**Veredicto final:**
- ✅ ALL PASS → listo para commit
- ❌ N FAIL → volver a Fase 4 (implementación), NO tocar este verifier

## Historial de ejecuciones

| Fecha | Commit deployado | Resultado | Notas |
|-------|------------------|-----------|-------|
| 2026-07-22 | (aún no deployado) | ⏳ | primera ejecución baseline |
