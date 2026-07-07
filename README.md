# InmoControl

SaaS profesional para administración de arrendamientos inmobiliarios en Colombia. Gestión contable automatizada, liquidación mensual, y cumplimiento normativo (IVA, 4x1000, retefuente).

## Stack

- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4
- **Animaciones:** motion
- **UI:** componentes propios en `src/shared/ui/`
- **Estado:** Zustand + persist (en migración desde `localStorage` directo)
- **Backend:** Express + Vite middleware (un solo puerto, 3000)
- **Reportes:** jsPDF

## Requisitos

- Node.js >= 20
- npm >= 10

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear .env.local con tus llaves (no es obligatorio para abrir la app)
cp .env.example .env.local
# Edita .env.local con tus credenciales (MySQL, OAuth, Twilio, SMTP)

# 3. Levantar dev server
npm run dev
# → http://localhost:3000
```

## Scripts

| Comando          | Descripción                                       |
| ---------------- | ------------------------------------------------- |
| `npm run dev`    | Dev server con HMR (Vite + Express en :3000)      |
| `npm run build`  | Build de producción a `dist/`                     |
| `npm run preview`| Servir el build localmente                        |
| `npm run lint`   | Type-check con `tsc --noEmit`                     |
| `npm run clean`  | Borrar `dist/`                                    |

## Estructura

```
src/
  App.tsx                  # shell + router de vistas (en proceso de partir)
  main.tsx                 # entry point
  components/ui/           # primitives (Button, Card, Input, Modal)
  types/                   # contratos de dominio (Owner, Tenant, Property, Contract, Transaction)
  utils/                   # cálculos Colombia + validadores
  shared/                  # hooks, store, format, pdf (nuevo, en construcción)
```

> El proyecto está en proceso de refactor: `App.tsx` se va a partir por dominios (`features/auth`, `features/properties`, `features/tenants`, `features/financial`, etc.).

## Variables de entorno

| Variable         | Obligatorio | Descripción                                       |
| ---------------- | ----------- | ------------------------------------------------- |
| `APP_URL`        | No          | URL pública (para CORS y links internos).         |
| `NODE_ENV`       | No          | `production` cambia el server a servir estáticos.|

## Convenciones

- **Moneda:** siempre COP, sin decimales (`Intl.NumberFormat('es-CO')`).
- **Fechas:** `dd/mm/yy` (corto) o ISO (almacenamiento).
- **Cálculos:** todos pasan por `src/utils/calculations.ts` y `src/shared/finance/` (nuevo).
- **Persistencia:** Zustand store con middleware `persist` → clave única por dominio.

## Roadmap inmediato

- [x] Levantar dev server y validar `/api/health`
- [x] Baseline de lint
- [ ] Hooks compartidos (`useLocalStorage`, `useToast`)
- [ ] Store Zustand por dominio
- [ ] Partir `App.tsx` en `features/`
- [ ] Liquidación mensual con retefuente sobre arriendos
- [ ] Multi-tenant (`organizationId`)

---

SaaS de administración de arrendamientos para el mercado colombiano. Hecho en Colombia para Colombia.
