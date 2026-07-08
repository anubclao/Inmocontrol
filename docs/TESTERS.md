# Onboarding de testers en Google Drive

> Para el dev / owner que va a darle acceso a un tester nuevo. Lee esto ANTES de
> mandarle credenciales de InmoControl al tester, o el primer "Conectar Drive"
> rebota con `403 access_denied`.

## Por qué existe este paso

InmoControl usa Google OAuth (`drive.file` scope) para subir PDFs de
inventarios, cuentas de cobro y estados de cuenta al Drive del agente.

La app de OAuth está registrada en **modo "Testing"** en Google Cloud Console
(porque todavía no la hemos mandado a verificación de Google — eso tarda
semanas y solo se justifica cuando la app es pública).

**En modo Testing, Google solo permite autorizar a los emails listados
explícitamente como "Test users".** Cualquier email fuera de esa lista rebota
con:

> *Acceso bloqueado: tecnowebsupportia.com no ha completado el proceso de
> verificación de Google. En estos momentos, la app se está probando y solo
> pueden acceder a ella los testers aprobados por el desarrollador.*

(El mensaje es genérico en español — no dice "agregame como test user", lo
cual confunde. Pero la fix es siempre la misma: agregar el email abajo.)

## Pasos para agregar un nuevo tester

1. Abrí https://console.cloud.google.com/ → tu proyecto de InmoControl
   (mismo proyecto donde creaste `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`).
2. Menú izquierdo → **APIs & Services** → **OAuth consent screen**.
3. Bajá hasta la sección **"Test users"**.
4. Click **"+ ADD USERS"**.
5. Pegá el email del tester (una línea por email, hasta 100 en total).
6. **Save**. Listo. Cambio instantáneo, sin redeploy.

## Lista actual de testers autorizados

> ⚠️ Esta lista la mantenemos a mano. Actualizar cuando se sume o salga alguien.

| Email | Rol | Agregado | Notas |
|---|---|---|---|
| gbfinversionessas@gmail.com | Developer/Owner | — | Cuenta dueña del proyecto GCP |
| (vacío) | Tester 1 | — | Pendiente de sumar al primer tester real |

Para no perder trazabilidad, agregar la fila cuando se sume cada tester.

## Cómo verificar que un tester ya quedó habilitado

Después de agregarlo a Test users, pedirle que:

1. Abra Chrome con **su propio perfil** (no el del developer — ver "Errores
   comunes" abajo).
2. Vaya a https://inmocontrol.tecnowebsupportia.com.
3. Inicie sesión en InmoControl con su cuenta seed (ej. `tester1@inmocontrol.local`).
4. Vaya a **Configuración → Integraciones → Conectar Google Drive**.
5. En la pantalla de Google, **asegurarse de que la cuenta seleccionada sea
   la suya** (la que agregamos a Test users), no otra.
6. Acepte los permisos.

Si todo va bien, vuelve a InmoControl con el banner verde "Drive conectado"
y el folder ID. Si rebota con `403 access_denied`:

- Verificar que el email en Test users es **exactamente** el mismo que la
  cuenta Google con la que se está autenticando (los emails son
  case-insensitive pero cualquier typo lo mata).
- Verificar que estamos en el proyecto GCP correcto (el de InmoControl, no
  otro personal).
- Esperar 30 segundos — a veces Google cachea el consent screen.

## Errores comunes

### "Pero la cuenta que estoy usando SÍ está autorizada"

Suele pasar que el tester tiene **varias cuentas de Google** y la que tiene
sesión abierta en Chrome no es la que agregamos. Chrome muestra un popup
tipo *"¿Cambiar a un perfil de Chrome?"* — eso es la pista. Decirle que use
**el perfil de Chrome donde está logueado con la cuenta correcta**, o que
abra una ventana incógnito (`Ctrl+Shift+N`) y se loguee ahí con la cuenta
autorizada.

### "Soy el developer y no puedo conectar mi propio Drive"

Si vos mismo (dueño del proyecto GCP) no podés conectar, es porque ni tu
propia cuenta está en Test users. Sí, es un bug del setup inicial — te
olvidaste de agregarte. Fix: agregarte a vos mismo siguiendo los pasos de
arriba.

### "Un tester pudo ayer, hoy no"

Causa típica: se venció el `refresh_token` o el tester hizo "Revocar acceso"
desde https://myaccount.google.com/permissions. Pedirle que repita el flujo
de conexión.

### "Aparece un warning amarillo de 'Google no ha verificado esta app'"

**Esto es normal en modo Testing.** Los testers ven ese warning. Para
avanzar tienen que clickear "Avanzado" → "Ir a tecnowebsupportia.com (no
seguro)". No es un problema de InmoControl, es el comportamiento estándar
de Google para apps no verificadas. **Solo se va cuando se publique la app
a producción.**

## Cuándo dejar de usar Testing y pasar a Producción

Esto NO es para ahora — es nota a futuro para cuando InmoControl sea SaaS
multi-tenant y cualquier agencia pueda registrarse:

| Momento | Acción |
|---|---|
| Piloto con <100 testers manuales | Mantener Testing, agregar emails a mano |
| SaaS abierto a clientes en Colombia | Solicitar **verificación de Google** (4-6 semanas, requiere video demo, política de privacidad pública, dominio verificado) |
| SaaS B2B donde cada agencia es Google Workspace | Migrar OAuth app a **Internal** — solo users del Workspace pueden autorizar, sin verificación externa |
| Multi-tenant con cada agencia su propio Drive | Cada agencia debe registrar **su propio OAuth project** y meter sus credenciales en Settings → Integraciones (ya soportado en `notificationConfigStore`) |

**No** hay que hacer nada de esto para el piloto actual — con la lista de
Test users alcanza.

## Archivos relacionados en este repo

- `server/routes/googleAuth.ts` — los 6 endpoints OAuth (`/auth/google`,
  `/auth/google/callback`, `/upload/google-drive`, `/status/google-drive`,
  `/drive/upload-pdf`, etc.). El callback recibe `code`, intercambia por
  tokens, guarda en MySQL (`user_oauth_tokens`).
- `server/lib/googleAuth.ts` — helper `isTokenExpiringSoon` que decide cuándo
  refrescar el `access_token`.
- `src/shared/store/googleDriveStore.ts` — store Zustand del lado cliente
  con `connect()`, `disconnect()`, `getStatus()`.
- `src/lib/drive/driveService.ts` — helper `uploadPdfToDrive(blob, parentFolderId, parentKind, subfolder, fileName)` que convierte a base64 y llama a `/api/drive/upload-pdf`.

Si algo en estos archivos cambia (ej. nuevo scope, nuevo endpoint), actualizar
este doc también.