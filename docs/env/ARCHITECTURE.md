# Environment & Architecture — InmoControl

> Adaptado del template genérico de Karpathy Web Agent (Next.js) a
> InmoControl (React 19 + Vite + Express + MySQL). Última revisión: 2026-07-22.

## Tech Stack Real

- **Frontend:** React 19 + Vite 6 + TailwindCSS 4
- **Language:** TypeScript (~5.8)
- **State Management:** Zustand (con `persist` middleware → localStorage)
- **Backend:** Express 4 (un solo puerto, sirve también el frontend estático)
- **DB:** MySQL 8 / MariaDB 11 (Hostinger shared)
- **Auth:** Sesiones httpOnly con `cookie-parser` (modo piloto single-tenant)
- **Drive integration:** `googleapis` SDK (OAuth con refresh tokens)
- **PDF:** `jspdf` para PDFs cliente, `pdf` server-side (sin uso actual)
- **Notifications:** `twilio` (WhatsApp), `nodemailer` (email)
- **Reports:** jspdf + plantillas propias
- **PWA:** `vite-plugin-pwa` + workbox
- **Deploy:** Hostinger Node.js Premium (auto-deploy on push a main)

## Directory Structure (real)

```
/
├── server/                       ← Express backend
│   ├── server.ts                 ← entry point + middleware + routes
│   ├── db.ts                     ← mysql2 pool + ensureDefaultOrg
│   ├── routes/                   ← endpoints REST
│   │   ├── properties.ts
│   │   ├── tenants.ts
│   │   ├── inventories.ts
│   │   ├── contracts.ts
│   │   ├── billing.ts
│   │   ├── notifications.ts
│   │   ├── googleAuth.ts
│   │   ├── saasBilling.ts
│   │   └── ...
│   ├── lib/                      ← server-side utilities
│   │   └── googleAuth.ts
│   └── seed/                     ← seed scripts
├── src/                          ← React frontend
│   ├── App.tsx                   ← shell + router
│   ├── main.tsx                  ← entry
│   ├── features/                 ← vistas agrupadas por dominio
│   │   ├── properties/
│   │   │   ├── PropertiesView.tsx     ← monolito actual (3158 líneas)
│   │   │   ├── components/
│   │   │   │   ├── StepBasic.tsx
│   │   │   │   ├── StepDocs.tsx
│   │   │   │   └── StepInventory.tsx
│   │   │   └── types.ts
│   │   ├── tenants/
│   │   │   └── TenantsView.tsx
│   │   ├── contracts/
│   │   │   ├── ContractsView.tsx
│   │   │   └── contractApi.ts
│   │   ├── billing/
│   │   │   ├── views/BillingPanel.tsx
│   │   │   └── ...
│   │   ├── alerts/, auth/, dashboard/, financial/, reports/, settings/
│   ├── shared/
│   │   ├── hooks/                ← useLocalStorage, useToasts
│   │   ├── store/                ← Zustand stores (appStore, etc.)
│   │   ├── ui/                   ← Button, Card, Input, Modal primitives
│   │   ├── format/               ← currency, date, id, chip
│   │   └── validators/           ← (migrado de utils/validators)
│   ├── lib/
│   │   ├── drive/                ← Google Drive service
│   │   ├── pdf/                  ← jsPDF helpers
│   │   └── ...
│   ├── types/                    ← contratos de dominio
│   └── utils/                    ← legacy (migrar a shared/)
├── db/
│   └── mysql/
│       ├── schema-hostinger.sql  ← schema canónico para Hostinger
│       ├── schema-completo.sql
│       └── migrations/           ← 002-010 numerados
├── docs/                         ← esta carpeta
│   ├── env/                      ← environment docs
│   ├── specs/                    ← feature specs (Karpathy methodology)
│   └── TESTERS.md                ← lista de testers OAuth
├── tests/                        ← tests automatizados
│   ├── numeroALetras.test.ts
│   ├── settlement.test.ts
│   └── verifiers/                ← E2E checklists (Karpathy verifiers)
├── scripts/                      ← build, seed, debug scripts
│   ├── dev-all.mjs
│   ├── build-server.mjs
│   ├── seed-pilot.mjs
│   ├── debug-prod-properties.ps1
│   └── ...
├── AGENTS.md                     ← reglas del proyecto + metodología Karpathy
└── package.json
```

## Key Architectural Patterns

1. **Pool MySQL compartido** (`server/db.ts`): una sola instancia `mysql2/promise.createPool`.
   - Autocommit ON por default → cada `pool.query()` se commitea solo.
   - NO usar `getConnection()` para transacciones manuales (decisión consciente del proyecto).
   - Si necesitás atomicidad multi-statement, envolver en `pool.query` calls separados
     con manejo de error en cascada.
2. **Drive con timeout**: todas las llamadas a `oauth2Client.refreshAccessToken()` y `drive.files.*`
   van envueltas en `withTimeout(8s, ...)` (helper en cada route file). Si Drive está
   lento/caído, el server responde igual y loguea warning.
3. **Routes devuelven JSON siempre** (incluso errores). NUNCA HTML (Express default
   error page). Top-level try/catch en cada handler.
4. **Zustand con persist**: el store se guarda en localStorage. **Cuidado con el
   draft del wizard** — la autosave es por state, NO por MySQL. Solo el `Finalizar`
   persiste a MySQL (excepto en Option B donde `Continuar a Documentación` ya
   pre-crea la propiedad).
5. **Wizard = monolito temporal**: `PropertiesView.tsx` es 3158 líneas y contiene
   los 3 steps + el handler de upload + el finalize. Refactor pendiente (Fase 2).
6. **Migraciones SQL idempotentes**: cada `00X_*.sql` se puede aplicar varias veces
   sin romper. Numerar secuencialmente.
7. **Drive folder structure** (decisión cerrada en AGENTS.md):
   ```
   Mi unidad / InmoControl/                  ← creado por OAuth una vez
   └── {dirección del inmueble}/              ← por propiedad
       ├── Propietario/                        ← 5 docs legales
       ├── Inventarios/                        ← PDFs de inventarios
       └── {nombre} ({cédula})/                ← por inquilino
           ├── Cedula/
           ├── Contrato/
           └── Recibos/
   ```

## Build & Run

```bash
npm install            # instalar deps
npm run dev            # http://localhost:3000 (Vite) + :3001 (Express)
npm run build          # build cliente (dist/) + server (dist-server/server.js)
npm run start          # NODE_ENV=production node dist-server/server.js
npm run lint           # tsc --noEmit
npm run test           # node --test (pocos tests automatizados hoy)
```

## Where to Look (quick map for AI agents)

| Si querés... | Andá a... |
|---|---|
| Cambiar un endpoint | `server/routes/*.ts` (uno por dominio) |
| Cambiar la UI de un wizard | `src/features/{domain}/{Domain}View.tsx` o `components/` |
| Cambiar el schema DB | `db/mysql/migrations/00X_*.sql` (crear nueva, no editar existentes) |
| Cambiar el formateo de moneda/fecha | `src/shared/format/` |
| Cambiar cómo se sube a Drive | `src/lib/drive/driveService.ts` o `server/routes/googleAuth.ts` |
| Cambiar la lógica de cálculo financiero | `src/features/billing/` o `src/utils/calculations.ts` |
| Ver reglas del proyecto | `AGENTS.md` (este archivo es la fuente de verdad) |
| Ver cómo se hace un feature | `docs/specs/{name}.md` |
| Ver cómo se testea un feature | `tests/verifiers/{name}.md` |
