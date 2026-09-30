# Verifier: POST /api/billing/amortization/generate valida FK de contract

> **Karpathy Verifier** — Agosto 2026. Cada Acceptance Criterion de
> `docs/specs/fix-bug-036-amortization-contract-fk-validation.md` se
> traduce a pasos verificables.
> **NO modificar este archivo para hacer pasar los checks** — si un
> check falla, el código está mal.

## Cómo ejecutar

### Pre-requisitos

- App productiva: `https://inmocontrol.tecnowebsupportia.com`
- PowerShell 7+
- O local: `npm run dev` y usar `http://localhost:3001/api/...`

### Convención de resultado

- ✅ **PASS** — comportamiento exacto del spec
- ❌ **FAIL** — comportamiento difiere (adjuntar output real)
- ⚠️ **SKIP** — no verificable ahora (motivo)

---

## Acceptance Criteria

### AC-1: contract.id inexistente → 400 JSON con `code: CONTRACT_NOT_FOUND`

**Pasos:**

```powershell
$body = @"
{
  "contract": {
    "id": "contract-doesnotexist-99999",
    "propertyId": "prop-alsofake",
    "startDate": "2026-08-01",
    "endDate": "2027-08-01",
    "monthlyRent": 1000000,
    "monthlyAdmin": 0,
    "depositAmount": 1000000,
    "durationMonths": 12,
    "status": "active"
  },
  "policy": {
    "propertyId": "prop-alsofake",
    "rentAmount": 1000000,
    "adminFee": 0,
    "lateFeeMidPct": 5,
    "lateFeeLatePct": 10,
    "graceDay": 5,
    "applyAnnualIpc": false,
    "expectedIpcPct": 0,
    "applyIpcToAdmin": false,
    "allowAdminChanges": true,
    "bankAccounts": []
  }
}
"@

$res = Invoke-WebRequest "http://localhost:3001/api/billing/amortization/generate" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
Write-Host "Status: $($res.StatusCode)"
Write-Host "Body: $($res.Content)"
```

**Esperado:**
- Status: **400**
- Body: JSON con `{ error: "...", code: "CONTRACT_NOT_FOUND", contractId: "contract-doesnotexist-99999" }`
- Body NO contiene `Cannot add or update a child row` (mensaje técnico MySQL).

**Status:** ⏳ Pending

---

### AC-2: contract.organization_id distinto al orgId actual → 403 JSON con `CONTRACT_WRONG_ORG`

**Pasos:**

```powershell
# 1. Insertar un contrato con organization_id distinto al default_org
# (Solo si tenés acceso a phpMyAdmin o un test seed multi-tenant)
$body = @"
{
  "contract": {
    "id": "<UUID de contrato en OTRO org>",
    "organizationId": "other_org_fake",
    "propertyId": "<UUID de propiedad en otro org>",
    "startDate": "2026-08-01",
    "endDate": "2027-08-01",
    "monthlyRent": 1000000,
    "durationMonths": 12,
    "status": "active"
  },
  "policy": { ... }
}
"@

$res = Invoke-WebRequest "http://localhost:3001/api/billing/amortization/generate" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
```

**Esperado:**
- Status: **403**
- Body: JSON con `{ error: "...", code: "CONTRACT_WRONG_ORG" }`

**Status:** ⏳ Pending (requiere seed multi-tenant para reproducir)

---

### AC-3: contract.propertyId inexistente → 400 JSON con `PROPERTY_NOT_FOUND`

**Pasos:**

1. Crear un contrato real en MySQL apuntando a una propiedad que NO existe.
2. Llamar a `/api/billing/amortization/generate` con ese contrato.

```powershell
# Seed en MySQL (via phpMyAdmin):
INSERT INTO contracts (id, organization_id, property_id, start_date, end_date, monthly_rent, monthly_admin, deposit_amount, duration_months, created_by)
VALUES ('test-contract-orphaned', 'default_org', 'prop-doesnotexist', '2026-08-01', '2027-08-01', 1000000, 0, 1000000, 12, 'test');

# Llamada:
$body = @{ ... contract = @{ id = 'test-contract-orphaned'; propertyId = 'prop-doesnotexist'; ... }; policy = ... } | ConvertTo-Json -Depth 5
$res = Invoke-WebRequest "http://localhost:3001/api/billing/amortization/generate" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 15
```

**Esperado:**
- Status: **400**
- Body: JSON con `{ error: "...", code: "PROPERTY_NOT_FOUND" }`

**Cleanup:** `DELETE FROM contracts WHERE id = 'test-contract-orphaned';`

**Status:** ⏳ Pending

---

### AC-4: Todos los errores son JSON (BUG-029 compliance)

**Pasos:**

1. Repetir AC-1 y AC-3.
2. Inspeccionar `Content-Type` de la response.

**Esperado:**
- `Content-Type: application/json` (NO `text/html`).

**Status:** ⏳ Pending

---

### AC-5: Happy path no se afecta

**Pasos:**

1. Crear propiedad + contrato reales en MySQL (via wizard property + tenant flow).
2. Llamar a `/api/billing/amortization/generate`.
3. Verificar status 200 + body con array de `amortization_rows`.

**Esperado:**
- Status: **200**
- Body: array con 12 filas (para contrato de 12 meses).
- `amortization_rows` en MySQL tiene las 12 filas.

**Status:** ⏳ Pending

---

## Resumen de ejecución

| Check | Status | Notas |
|-------|--------|-------|
| AC-1 | ⏳ | — |
| AC-2 | ⏳ | — |
| AC-3 | ⏳ | — |
| AC-4 | ⏳ | — |
| AC-5 | ⏳ | — |

**Veredicto final:**
- ✅ ALL PASS → listo para commit + push
- ❌ N FAIL → volver a Fase 4 (implementación). **NO tocar este verifier.**

## Historial de ejecuciones

| Fecha | Commit deployado | Pass / Total | Notas |
|-------|------------------|--------------|-------|
| (pendiente primera ejecución) | — | 0/5 | spec+verifier aprobados, falta impl |