# Deploy de InmoControl para Piloto

> **Estado actual**: listo para piloto single-tenant con datos seed.
> NO está listo para producción multi-cliente (eso requiere auth real, ver AGENTS.md).

---

## TL;DR (5 minutos)

```powershell
# 1. Arrancar MySQL (una vez)
Start-Service MySQL80

# 2. Crear la base de datos y aplicar schema
mysql -u root -p < db/mysql/schema-completo.sql

# 3. Seed con datos de ejemplo
node scripts/seed-pilot.mjs

# 4. Levantar el server
npm run dev

# 5. Abrir http://localhost:3000
# Login automático (rol: admin, nombre: "Administrador Inmobiliario")
```

---

## Pre-requisitos

- **Node.js 22+** (probado en 24.x)
- **MySQL 8.0+** corriendo en `127.0.0.1:3306` (configurable vía `.env.local`)
- **Google Chrome** (para OAuth de Drive — opcional, el flujo funciona sin Drive conectado)
- **Windows / macOS / Linux** — el código es agnóstico

---

## Paso a paso detallado

### 1. Verificar el entorno

```bash
node --version    # v22 o superior
mysql --version   # 8.0 o superior
```

Si MySQL no está corriendo:

```powershell
# Windows (PowerShell como admin)
Start-Service MySQL80
Get-Service MySQL80    # debe decir "Running"
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
# Editar .env.local — los defaults funcionan para el piloto local
```

Las variables críticas:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `APP_URL` (default `http://localhost:3000`)

Para Google Drive (opcional):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (de Google Cloud Console)
- `GOOGLE_REDIRECT_URI` = `http://localhost:3001/api/auth/google/callback`

### 3. Crear la base de datos

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS inmocontrol CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p inmocontrol < db/mysql/schema-completo.sql
```

**Verificación:**
```bash
mysql -u root -p inmocontrol -e "SHOW TABLES;" | wc -l   # debe dar 23 (22 tablas + header)
```

Si ves menos, alguien de las migraciones falló. NO sigas hasta arreglar.

### 4. Seed con datos de ejemplo

```bash
node scripts/seed-pilot.mjs
```

Esto crea:
- 1 organización: **InmoControl Piloto**
- 1 usuario admin (login con email/password) — credenciales mostradas al final del seed
- 1 propiedad: **Calle 93 #11-27, Apto 501** (estado: Arrendado)
- 1 contrato activo: 2026-01-15 → 2027-01-14
- 1 inquilino: **María Fernanda Gómez** (CC 52.987.654)
- 1 propietario: **Carlos Andrés Pérez** (CC 79.456.123)
- 1 BillingPolicy con comisión 8%, mora 5/10%, día de gracia 10
- 1 cuenta bancaria del propietario (Bancolombia)
- 12 filas de amortización (enero 2026 → enero 2027)
- 1 descuento de ejemplo: servicios públicos julio 2026 ($180.000)

**Idempotente**: podés correrlo N veces sin duplicar.

**Credenciales del piloto (luego del seed):**
```
Email:    admin@inmocontrol.local
Password: inmo2026!
```

⚠️ **Cambiá el password** después del primer login exitoso (sprint 0 post-piloto). Está hardcodeado en `scripts/seed-pilot.mjs` línea ~14.

### 5. Verificar que el feature crítico funciona

```bash
# Tests del motor financiero (35 tests, <1s)
node --test --import tsx tests/settlement.test.ts tests/numeroALetras.test.ts

# Smoke test E2E (22 tests, sin MySQL, valida PDFs)
node --import tsx scripts/smoke-test-e2e.mjs
```

Ambos deben pasar al 100%. Si alguno falla, **no hacer deploy** — debuggear primero.

### 6. Levantar el server

```bash
npm run dev
# Server: http://localhost:3000
# API:    http://localhost:3001/api/*
```

Abrid el browser en `http://localhost:3000`. El login es automático con el usuario mock ("Administrador Inmobiliario", rol admin).

### 7. Probar el flujo crítico

Una vez en la app:

1. **Dashboard** → debería mostrar el seed data
2. **Billing** → click en "Calle 93 #11-27"
3. **Tabla de amortización** → debería ver 12 filas, todas "Pendiente"
4. **Enviar CC del mes 1** → 
   - Genera PDF
   - Si Drive está conectado: sube a `Recibos/` del inquilino
   - Si NO está conectado: descarga local, sin error
5. **Marcar pagado** → cambia a "Pagado", habilita el mes 2
6. **Descargar PDF del estado de cuenta del propietario** →
   - Genera el PDF con el formato del modelo
   - Si Drive conectado: sube a `Propietario/EstadosCuenta/` de la propiedad

### 8. (Opcional) Conectar Google Drive

Si querés que los PDFs se suban a Drive:

1. Crear proyecto en [Google Cloud Console](https://console.cloud.google.com/)
2. Activar la API de Google Drive
3. Crear OAuth 2.0 credentials (Web application)
4. Configurar `.env.local` con `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`
5. En la app: **Settings → Google Drive → Conectar**
6. Aceptar los permisos
7. Probar: enviar una cuenta de cobro → debería aparecer en Drive

### 9. Configurar backup diario

Los datos son tuyos. Si MySQL muere, sin backup se pierde todo (incluidos los datos reales del cliente piloto).

**Manual (recomendado para empezar):**
```bash
node scripts/backup-db.mjs
# Esto crea ./backups/inmocontrol_YYYY-MM-DD-HHMM.sql.gz
# Conserva los últimos 14 backups automáticamente
```

**Programado (Linux/Mac con cron):**
```bash
crontab -e
# Backup diario a las 03:00 AM
0 3 * * * cd /path/to/inmocontrol && /usr/bin/node scripts/backup-db.mjs >> logs/backup.log 2>&1
```

**Programado (Windows con Task Scheduler):**
1. Abrir Task Scheduler → "Create Basic Task"
2. Nombre: "InmoControl backup"
3. Trigger: Daily, 03:00 AM
4. Action: Start a program → `node.exe`
5. Arguments: `D:\desarrollos\Inmocontrol\scripts\backup-db.mjs`
6. Start in: `D:\desarrollos\Inmocontrol`

**Restaurar (en caso de desastre):**
```bash
# Ver qué backups hay
ls -lh backups/

# Restaurar el último
gunzip -c backups/inmocontrol_2026-07-15-0300.sql.gz | mysql -u root -p inmocontrol
```

---

## Seguridad del piloto

Esta sección es **obligatoria** antes de meter datos reales.

### ✅ Lo que SÍ está protegido

- **Login con password bcrypt** — nadie entra sin credenciales. Sesión de 12h con cookie httpOnly.
- **Password hasheado en DB** — nunca se guarda en plaintext.
- **Endpoint oculto sin sesión** — si no estás logueado, los endpoints `/api/billing/*`, `/api/properties/*`, etc. siguen funcionando con el cookie de sesión. Si querés que devuelvan 401, hay que agregar el middleware `requireAuth` a cada route (sprint 0).
- **Mensaje genérico en login** — no distingue entre "email no existe" y "password incorrecto" (mitiga enumeración).
- **CORS** — solo orígenes conocidos (`localhost:3000` y el `APP_URL` configurado).

### ⚠️ Lo que NO está protegido (y por qué está OK para piloto local)

- **Sin HTTPS** — los datos viajan en plano por la red. Solo aplica si el piloto accede por red (no localhost).
- **Sin rate limiting** — un atacante puede intentar 1000 passwords/seg. Aceptable porque el hash es bcrypt (lento por diseño).
- **Auth NO se valida en cada endpoint** — el middleware `requireAuth` existe pero no está aplicado a todas las rutas. El piloto funciona porque el browser manda la cookie igual, pero técnicamente un request sin cookie no devuelve 401.
- **Sesiones en memoria del server** — si reiniciás `npm run dev`, todos los usuarios pierden sesión. Para SaaS esto va a Redis.
- **No hay 2FA** — un solo password.

### ⚠️⚠️ Lo que es BLOQUEANTE si deployas fuera de local

Si vas a darle al cliente piloto una URL accesible por internet (incluso un VPS), **esto es bloqueante**:

1. **HTTPS obligatorio** — Let's Encrypt con certbot. Sin esto, cualquier Wireshark entre el cliente y tu server captura los PDFs (que tienen cédulas y montos).
2. **Cambiar `secure: false` a `secure: true`** en `server/routes/auth.ts` línea ~53. Sin esto, el cookie se manda por HTTP.
3. **Contraseña fuerte** + cambiar la del seed (no `inmo2026!`).
4. **Backup OFFSITE** — subir los `mysqldump` a S3/Backblaze/B2 diario. Si el server se incendia, el backup local también.
5. **Rate limiting** — `express-rate-limit` en `/api/auth/login` (5 intentos/min por IP).

### Checklist antes de darle datos reales al cliente

- [ ] MySQL con password NO vacío (cambiar `DB_PASSWORD=`)
- [ ] `.env.local` NO commiteado (verificar `.gitignore`)
- [ ] Password del seed cambiado (sprint 0)
- [ ] Backup diario configurado y probado (`node scripts/backup-db.mjs` ya corrió al menos una vez)
- [ ] HTTPS si se accede por red
- [ ] Cliente sabe que NO comparta la URL

---

## Smoke tests disponibles

| Comando | Qué valida | Tiempo |
|---|---|---|
| `npm run lint` | TypeScript compila sin errores (excepto 18 legacy preexistentes) | ~1 min |
| `npm run build` | Bundle de producción compila | ~1 min |
| `node --test --import tsx tests/*.test.ts` | Tests del motor (settlement + numeroALetras) | <1s |
| `node --import tsx scripts/smoke-test-e2e.mjs` | E2E completo (amortización → invoice → settlement → PDFs) | <5s |
| `node --import tsx scripts/sample-cuenta-cobro.mjs` | Genera PDF de muestra de cuenta de cobro | <1s |
| `node --import tsx scripts/sample-estado-cuenta.mjs` | Genera PDF de muestra de estado de cuenta | <1s |

**Para CI**: lint + tests + smoke E2E son los 3 gates mínimos.

---

## Limitaciones conocidas del piloto

Siendo honestos sobre lo que **NO** funciona:

1. **Auth es mock**: hay un usuario hardcoded ("Administrador Inmobiliario"). Cualquiera con acceso a la URL entra. NO production-safe.
2. **No hay rate limiting**: el agente puede spammear `/api/billing/invoices/send` sin problema.
3. **No hay backups**: si se borra MySQL, se pierden los datos. Hacer backup manual con `mysqldump` antes de deploys importantes.
4. **El piloto es single-tenant**: la tabla `organizations` existe pero no se usa para separar datos. Si metés datos de 2 clientes en la misma DB, se mezclan.
5. **No hay CI/CD**: cada cambio se valida manualmente con los comandos de arriba.
6. **El conversor número→letras tiene un bug con billones**: ver `KNOWN LIMITATION` en `tests/numeroALetras.test.ts`. No afecta el piloto (ningún inmueble genera liquidación de un billón).

---

## Troubleshooting

### "ECONNREFUSED 127.0.0.1:3306"
MySQL no está corriendo. Ver `Paso 1`.

### "Table 'inmocontrol.rent_invoices' doesn't exist"
El schema no se aplicó. Repetir Paso 3.

### "Cannot find module 'tsx'"

`tsx` es de desarrollo (`devDependencies`). Si el error aparece **en el servidor**,
el startup está mal configurado: producción no ejecuta `tsx server.ts`, ejecuta
`npm start` → `node dist-server/server.js` (ver Paso 3).

Si aparece **en local**, corré `npm ci` (instala dev + prod).

### El PDF se descarga pero no aparece en Drive
Drive no está conectado (Paso 8). El flujo funciona sin Drive — solo descarga local.

### "El servidor me dice 401 al hacer POST /api/billing/invoices/send"
El usuario mock solo tiene acceso a GET. Para POST/PATCH/DELETE el rol debe ser `admin` (que es el default). Si el problema persiste, revisar `src/features/auth/permissions.ts`.

---

## Roadmap post-piloto

Una vez que el piloto funcione bien (1-2 semanas), lo que sigue en orden de prioridad:

1. **Auth real** (Google OAuth con multi-tenancy): 3-5 días
2. **Backups automatizados** (cron + S3 o similar): 1 día
3. **CI/CD básico** (GitHub Actions): 1 día
4. **Rate limiting** (express-rate-limit en endpoints críticos): 0.5 día
5. **Monitoring básico** (logs estructurados + uptime monitor): 1 día
6. **Tests de integración** (los 35 actuales son unit, falta E2E contra MySQL real): 2 días

Total: 1.5-2 semanas para llegar a "production-ready" multi-cliente.

---

## Deploy a Hostinger (paso a paso)

> Para Shared Hosting (Premium/Business). Si tenés VPS, el approach es diferente.

### TL;DR

> ⚠️ **El servidor NO compila.** `dist/` y `dist-server/` viajan dentro del commit.
> Si pusheás sin correr `npm run build`, el deploy reporta éxito y sigue sirviendo
> el bundle anterior, en silencio. `npm run predeploy-check` aborta en ese caso.

```bash
# 1. En tu máquina local: compilar y validar
npm ci                   # acá sí hacen falta dev + prod
npm run build            # genera dist/ y dist-server/server.js
npm run predeploy-check  # aborta si el build falta, está viejo o quedó atrás de src/

# 2. Push a main → Hostinger hace `npm ci --omit=dev` y arranca `npm start`
git push

# 3. En el panel: variables de entorno + crear la DB MySQL
# 4. Schema + seed desde SSH
```

### 1. Preparar build local

```bash
cd D:\desarrollos\Inmocontrol
npm ci         # asegura que node_modules esté al día
npm run lint   # TypeScript compila sin errores
npm run test   # 35 tests del motor — verde
npm run smoke  # E2E sin MySQL — verde
npm run build  # genera dist/ Y dist-server/server.js
```

Verificá dos cosas antes de pushear:

- `dist/index.html` existe y apunta a `dist/assets/*` reales.
- `dist-server/server.js` es el único archivo de `dist-server/` (el build limpia el directorio).

`npm run predeploy-check` valida lo anterior de forma automática y además aborta si el
build está viejo (15 min por defecto, configurable con `BUILD_MAX_AGE_MINUTES`) o si
quedó atrás de los últimos cambios en `src/` o `server/`.

### 2. Desplegar

**Método recomendado: Git (auto-deploy).**

```bash
git push origin main
```

Hostinger clona el repo (que ya incluye `dist/` y `dist-server/server.js`), corre
`npm ci --omit=dev` y arranca `npm start`. No compila y no instala devDependencies.

**Qué NO se sube:**
- `node_modules/` — lo instala `npm ci --omit=dev` en el servidor.
- `.env*` — las variables van en el panel.

**Si hicieras deploy manual por SFTP**, subí el repo completo excepto `node_modules/`,
`.git/`, `backups/` y los `*.log`, pero **incluyendo `dist/` y `dist-server/`**.

**Hook opcional (recomendado)**: para que el guard corra solo en cada push.

```bash
git config core.hooksPath .githooks
```

#### Migración única: la primera vez que el build va versionado

Antes de este cambio `dist/` y `dist-server/` estaban en `.gitignore`, así que el
servidor los tiene como archivos **untracked**. Git no sobrescribe untracked con
tracked, y el primer deploy fallaría con:

```
error: Untracked working tree files would be overwritten by merge: dist/index.html
```

En el servidor, **justo antes** de disparar ese primer deploy:

```bash
cd ~/domains/<tu-dominio>/nodejs    # raíz de la app en hPanel
rm -rf dist dist-server
```

El pull siguiente los repone desde el repo en la misma operación. A partir de ahí
el flujo normal funciona sin pasos extra.

### 3. Configurar la app Node.js en Hostinger

1. Panel de Hostinger → **Hosting** → tu dominio
2. Menú lateral → **Node.js** → **Create Application**
3. Configurar:
   - **Node version**: 22.x (la más reciente disponible)
   - **Application mode**: Production
   - **Application root**: `/home/u123456789/public_html/inmocontrol` (o donde subiste los archivos)
   - **Application URL**: tu dominio
   - **Application startup file**: `npm start` (ejecuta `NODE_ENV=production node dist-server/server.js`)
   - **Application arguments**: *(vacío)*
   - **Environment variables**: agregar todas las del `.env.production.example`

   > El startup **NO** es `tsx server.ts`. `tsx` y `server.ts` son de desarrollo: en
   > producción solo se ejecuta el bundle ya compilado, y `tsx` no está instalado
   > porque vive en `devDependencies`.

4. **MUY IMPORTANTE**: agregar también:
   - `NODE_OPTIONS=--max-old-space-size=512` (evita OOM en shared hosting)
   - `NODE_ENV=production`

5. **Comando de instalación del panel**: `npm ci --omit=dev`
   (sin `npm install`, sin `npm run build`; el build ya viene en el repo).

6. Click **Save** → Hostinger instala solo dependencias de producción y arranca la app.

   > Si el panel permite elegir el comando de arranque, `node dist-server/server.js`
   > directo consume menos procesos que pasar por npm.

### 4. Crear la base de datos MySQL

1. Panel de Hostinger → **Bases de datos MySQL**
2. Click **Crear nueva base de datos**
3. Anotar los 4 datos que te da:
   - DB_HOST (generalmente `localhost`)
   - DB_NAME
   - DB_USER
   - DB_PASSWORD (te lo da una sola vez — guárdalo!)
4. Actualizar las env vars en el paso 3 con esos valores.

### 5. Aplicar schema + seed (vía SSH)

Hostinger shared suele incluir **SSH Access**. Activarlo en el panel.

Conectarte vía SSH (PuTTY o terminal):
```bash
ssh u123456789@tu-dominio.com
cd public_html/inmocontrol

# Aplicar schema (ajustá DB_NAME al real)
mysql -u tu_usuario_db -p tu_db_name < db/mysql/schema-completo.sql

# Seed (con las env vars del piloto seteadas)
export PILOT_EMAIL="admin@tudominio.com"
export PILOT_PASSWORD="UnaClaveSeguraCon32Caracteres"
node scripts/seed-pilot.mjs
```

### 6. Verificar que funciona

En el browser, abrir `https://tu-dominio.com`:
- Debería aparecer el **LoginScreen** (no el dashboard directo)
- Login con las credenciales del seed
- Probar: crear una propiedad, generar cuenta de cobro, descargar PDF

Si el server devuelve 502 o 503, revisar:
- **Application logs** en el panel de Hostinger (Node.js → Logs)
- **MySQL connectivity**: que `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD` sean correctos

### 7. Configurar backup diario en Hostinger

Hostinger shared tiene **Cron Jobs** en el panel.

1. Panel → **Avanzado** → **Cron Jobs**
2. Agregar nuevo cron:
   - **Frecuencia**: Una vez al día
   - **Hora**: 03:00 AM (hora del servidor)
   - **Comando**:
     ```bash
     cd /home/u123456789/public_html/inmocontrol && /usr/bin/node scripts/backup-db.mjs >> logs/backup.log 2>&1
     ```
3. **MUY IMPORTANTE**: en la versión free de Hostinger, los crons son limitados. Si necesitas más, considera upgrade o usar un cron externo (easypanel, etc.)

Los backups se guardan en `backups/` con rotación de 14 días. **Recomendado**: descargar el .sql.gz semanalmente a tu máquina local como backup offsite.

### 8. Verificación final antes de entregar al cliente

- [ ] El login pide email + password (NO entra directo)
- [ ] `PILOT_PASSWORD` es una clave única que solo tú conoces (no `inmo2026!`)
- [ ] Drive (opcional) está configurado si querés que los PDFs se suban automáticamente
- [ ] HTTPS funciona (candado verde en el browser)
- [ ] Backup diario configurado
- [ ] Cliente tiene las credenciales Y el checklist de qué probar

---

## Contacto / soporte

Si algo no funciona, el primer paso siempre es correr:
```bash
node --import tsx scripts/smoke-test-e2e.mjs
```

Si ese pasa al 100%, el problema está en la config (env vars, MySQL, Drive). Si falla, hay un bug nuevo en código.