# Project Constraints & Rules — InmoControl

> Adaptado del template genérico de Karpathy. Reglas REALES del proyecto,
> no placeholders. Última revisión: 2026-07-22.

## Reglas del Proyecto (de AGENTS.md — fuente de verdad)

### Idioma y moneda
- UI en **español (es-CO)**, moneda **COP sin decimales**.
- No usar branding de Gemini / AI Studio. La app abre sin `GEMINI_API_KEY`.

### Stack y comandos
- Front: React 19 + Vite 6 + Tailwind 4.
- Estado: **Zustand** con `persist` (clave raíz `inmocontrol:v1`).
- Backend: Express + Vite middleware, un solo puerto (3000).
- Reportes: jsPDF.
- Lint: `tsc --noEmit` (sin ESLint configurado todavía).
- NO introducir dependencias nuevas sin discutir.

### Workflow del proyecto
- **No romper el monolito en un solo commit**. Partir `App.tsx` por vistas
  (una a la vez), manteniendo la app corriendo entre cada paso.
- Antes de cada cambio grande: `npm run lint` + `npm run dev` para baseline.
- Después de cada cambio: `npm run lint` + verificar que `/api/health` sigue 200.
- Comentarios: explica el "por qué", no el "qué".

### Lo que NO hacer
- ❌ No añadir `GEMINI_API_KEY` como required.
- ❌ No meter ESLint, Prettier, Vitest sin discutirlo primero.
- ❌ No crear backend con DB real hasta que el monolito esté partido.
- ❌ No usar `localStorage` directo fuera de `shared/store/`. Todo va por Zustand.

## Reglas para AI Agents (Metodología Karpathy — desde julio 2026)

### Workflow OBLIGATORIO para cualquier feature nuevo o fix grande

1. **FASE 1 — ENVIRONMENT** (5 min)
   - Leer `docs/env/ARCHITECTURE.md` + `docs/env/CONSTRAINTS.md` + `AGENTS.md`.
   - Confirmar: "Entendí el entorno. Stack: React 19 + Vite + Express + MySQL. Listo para spec."
   - **NO escribir código todavía.**

2. **FASE 2 — SPEC** (escribir ANTES de tocar código)
   - Crear `docs/specs/{nombre-feature}.md` desde el template.
   - Definir: User Story + Acceptance Criteria (numerados, testeables) +
     Edge Cases + Technical Contract (interfaces TS, endpoints, props) +
     Dependencias + Out of Scope.
   - **NO escribir código todavía.** Pedirle al user que apruebe el spec.

3. **FASE 3 — VERIFIER** (escribir DESPUÉS de spec aprobado)
   - Crear `tests/verifiers/{nombre-feature}.md` desde el template E2E.
   - Cada Acceptance Criterion → 1+ pasos del verifier (curl + checklist manual).
   - **NO escribir código todavía.** Confirmar que el verifier reproduce los
     bugs actuales (debería FALLAR contra el estado actual).

4. **FASE 4 — IMPLEMENTACIÓN** (recién ahora, después de verifier aprobado)
   - Tocar código **mínimo** para que el verifier pase.
   - **NO agregar features que no estén en el spec.**
   - **NO modificar el verifier para hacerlo pasar.** Si falla, el código está mal.

5. **FASE 5 — REFACTOR & VERIFY**
   - Correr el verifier de nuevo. Debe seguir pasando.
   - `npm run lint` debe pasar.
   - Commit solo cuando el verifier pasa 100%.

### Anti-Patrones explícitos (consecuencias vistas en prod)

- ❌ **Escribir código antes del spec** → bugs que se ven en prod (ej: phone/email
  NULL porque nadie especificó que el server espera top-level + nested).
- ❌ **Tostadas que mienten** → "guardado" cuando en realidad solo se guardó en
  localStorage. Spec DEBE definir copy exacta del toast.
- ❌ **Endpoints sin timeout** → el server se cuelga para siempre, el browser
  muestra "el botón no hace nada". Spec DEBE definir timeouts explícitos.
- ❌ **Modales que se cierran antes del POST** → el user piensa que falló. Spec
  DEBE definir loading state durante el POST.
- ❌ **Errores que devuelven HTML en vez de JSON** → el frontend tira SyntaxError
  al parsear. Spec DEBE exigir JSON en todas las respuestas, incluso errores.

### Reglas técnicas

- **TypeScript strict mode**: ON. No `any` excepto donde sea estrictamente
  necesario (wrapper de `googleapis` que no tiene tipos completos).
- **Componentes funcionales solamente** (no class components).
- **Props destructuradas en la firma de la función.**
- **Componentes bajo 200 líneas** (si crece, partir). **Excepción actual**:
  `PropertiesView.tsx` (3158 líneas) — refactor pendiente.
- **No usar `console.log` para debugging en producción**. Usar `console.warn`
  o `console.error` con contexto suficiente.
- **Errores del server: TODOS devuelven JSON, NUNCA HTML**.
  Top-level try/catch en cada handler.

### API Rules

- ✅ Todos los endpoints en `server/routes/*.ts` (uno por dominio).
- ✅ async/await (no `.then()` chains).
- ✅ Errores con try/catch + response JSON con `{ error: "..." }`.
- ✅ Endpoints POST idempotentes cuando es posible (localId del wizard).
- ✅ Timeouts en TODAS las llamadas externas (Google Drive: 8s; DB: 15s via
  AbortController en cliente).
- ✅ Top-level try/catch en cada route handler (evita que Express devuelva
  HTML 500 default).

### State Management Rules

- ✅ Zustand para estado global (propiedades, tenants, contratos, etc.).
- ✅ `persist` middleware en stores que necesitan sobrevivir refresh.
- ✅ `localStorage` SOLO desde stores de Zustand (nunca directo desde componentes).
- ❌ No Redux.

### Testing Rules

- ✅ **Spec primero, luego verifier E2E** (este es el nuevo estándar desde
  julio 2026). NO escribir tests automatizados sin un spec aprobado antes.
- ✅ Verifiers E2E = checklists + curl scripts (sin Vitest todavía).
- ✅ Si en el futuro se instala Vitest: tests unitarios para lógica pura
  (cálculos, formatters, validators). NO para UI/fluxes (eso va al verifier E2E).
- ❌ **NO modificar tests/verifiers para hacerlos pasar** (eso es trampa).
  Si falla, el código está mal.
- ❌ **NO instalar Vitest/ESLint/Prettier sin discutir** (decisión pendiente,
  per AGENTS.md).
