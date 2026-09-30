# Verifier #1: requireAuth en router de properties

## AC-1 a AC-5: endpoints sin sesión → 401

```powershell
# Sin cookie de sesión
$res = Invoke-WebRequest "http://localhost:3001/api/properties" -UseBasicParsing -TimeoutSec 5
# Esperado: 401, body { error: "No autenticado", code: "NO_SESSION" }

$res = Invoke-WebRequest "http://localhost:3001/api/properties/fake-id" -UseBasicParsing -TimeoutSec 5
# Esperado: 401

$body = '{"address":"X"}'
$res = Invoke-WebRequest "http://localhost:3001/api/properties" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 5
# Esperado: 401
```

**Status:** ⏳ Pending