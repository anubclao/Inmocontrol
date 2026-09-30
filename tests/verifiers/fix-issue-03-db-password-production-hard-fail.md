# Verifier #3: DB_PASSWORD production hard-fail

```powershell
$env:NODE_ENV = "production"
$env:DB_PASSWORD = ""
node dist-server/server.js
# Esperado: process exit con mensaje "DB_PASSWORD no configurado..."
# Si arranca MySQL → FAIL (se está escapando del check)
```

**Status:** ⏳ Pending