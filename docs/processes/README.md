# Procesos de Negocio — InmoControl

> Catálogo de **workflows agenticos** por proceso de negocio. Un proceso
> = N features relacionadas + invariantes cross-cutting compartidos
> (timeouts, toasts honestos, Drive fallback, JSON errors, etc.).
>
> Adoptado el 2026-08-03 junto con la metodología Karpathy (Spec + Verifier
> + Environment). Cada feature nuevo o fix grande DEBE referenciar el
> proceso al que pertenece. Si el proceso no existe todavía, se crea
> primero el workflow antes de tocar código.
>
> Última revisión: 2026-08-03.

## Cómo se relaciona con la skill Karpathy

| Capa Karpathy | Archivo | Qué cubre |
|---|---|---|
| Environment | `docs/env/ARCHITECTURE.md` + `docs/env/CONSTRAINTS.md` + `AGENTS.md` | Stack real + reglas duras |
| **Proceso** | `docs/processes/{CODIGO}.md` (este catálogo) | **Workflow narrativo por proceso de negocio** |
| Spec | `docs/specs/{feature}.md` | Detalle técnico de UN feature dentro del proceso |
| Verifier | `tests/verifiers/{feature}.md` | E2E checklist binario del feature |

Una feature SIEMPRE referencia su proceso padre. Un proceso SIN specs
puntuales todavía es válido (es el "qué debe poder hacer el sistema").

## Orden de implementación (por dependencias técnicas)

| # | Código | Proceso | Estado | Depende de |
|---|---|---|---|---|
| 1 | `DRIVE-OPS` | Operaciones de Drive | ⏳ draft | — |
| 2 | `NOTIFY` | Notificaciones multicanal | ⏳ draft | — |
| 3 | `PROP-CAPT` | Captación de propiedad | ⏳ draft | `DRIVE-OPS` |
| 4 | `PROP-DOCS` | 5 docs legales del propietario | ⏳ draft | `PROP-CAPT`, `DRIVE-OPS` |
| 5 | `INV-CAPT` | Inventario de captación | ⏳ draft | `PROP-CAPT`, `DRIVE-OPS` |
| 6 | `TENANT-ONB` | Onboarding de inquilino | ⏳ draft | `PROP-CAPT`, `DRIVE-OPS` |
| 7 | `CONTRACT-GEN` | Contrato de arrendamiento | ⏳ draft | `TENANT-ONB`, `PROP-CAPT` |
| 8 | `INV-COLOC` | Inventario de colocación (2 firmas) | ⏳ draft | `TENANT-ONB`, `INV-CAPT` |
| 9 | `ACTA-ENTREGA` | Acta de entrega del inmueble | ⏳ draft | `INV-COLOC`, `DRIVE-OPS` |
| 10 | `BILL-INVOICE` | Cuenta de cobro mensual | ⏳ draft | `TENANT-ONB`, `CONTRACT-GEN` |
| 11 | `BILL-PAY` | Cobranza / pagos | ⏳ draft | `BILL-INVOICE` |
| 12 | `BILL-OWNER` | Estado de cuenta al propietario | ⏳ draft | `BILL-INVOICE`, `BILL-PAY` |
| 13 | `REPORTS` | Reportes consolidados | ⏳ draft | `BILL-*`, `INV-*` |
| 14 | `SAAS-BILL` | SaaS billing | ⏳ draft | — (independiente) |

`AUTH` queda fuera (Fase 3 del proyecto, diferido per decisión del usuario).

## Cross-cutting invariants (compartidos por TODOS los procesos)

Estos invariantes viven acá (no se duplican por proceso). Cada workflow
los referencia por nombre en su sección "Contratos cross-cutting".

### TOAST-001 — Tostadas honestas

- **Nunca** decir "guardado" si solo se guardó en localStorage.
- **Nunca** decir "subido a Drive" si el archivo está solo en `blob:` URL.
- Cada proceso define en su sección §6 las **tostadas exactas** que usa.

### JSON-001 — Errores siempre JSON

- Todo endpoint devuelve JSON, **incluso errores**. NUNCA HTML.
- Top-level try/catch en cada handler.
- Shape: `{ error: string, code?: string, details?: any }`.

### TIMEOUT-001 — Timeouts explícitos

- **Google Drive** (server): 8s por llamada (`withTimeout`).
- **MySQL** (server): conexión del pool con `connectionLimit=10`.
- **Fetch cliente**: 15s via `AbortController` (helper compartido).
- Si se cumple un timeout, el server responde igual (sin Drive / sin DB),
  loguea warning, y el cliente muestra toast "El servidor tardó demasiado".

### DRIVE-FALLBACK-001 — Drive no rompe el flujo

- Si Drive está desconectado o timeout, el flujo **sigue funcionando**
  (descarga local + persistencia MySQL). La subida a Drive se reintenta
  al finalizar o cuando Drive vuelva.
- Cada PDF / upload tiene un **badge explícito** en la UI:
  - 🟢 En Drive (verde) si la URL es `https://drive.google.com/...`
  - 🟠 Pendiente → Drive (amber) si la URL es `blob:` (local)
  - ⚪ Vacío si no hay archivo.

### PERSIST-001 — Wizard persiste temprano, no solo al finalizar

- En wizard property, "Continuar a Documentación" pre-crea la fila en
  MySQL con `status='Pendiente'`. Lo mismo aplica a cualquier wizard que
  tenga uploads intermedios.
- Razón: si el browser se cierra, el draft no se pierde.

### IDEMPOTENT-001 — POSTs idempotentes

- Todo POST que pueda dispararse 2 veces (ej: doble click en "Guardar")
  debe ser idempotente. Convención actual: `localId` del wizard.

### RACE-001 — Concurrencia controlada

- Si dos requests compiten por el mismo recurso (ej: `invoice_number`),
  usar UNIQUE constraint en DB + retry transparente en el server.
- El frontend no debe asumir el orden de respuestas.

### SECURITY-001 — Auth + autorización

- Endpoints privados: `requireAuth` (sesión httpOnly).
- OAuth callback: NO requiere auth (usuario no logueado todavía).
- Testers de OAuth: ver `docs/TESTERS.md` antes de aprobar tester nuevo.

### AUDIT-001 — Trazabilidad

- Toda acción crítica loggea en `property_actions` con sufijo descriptivo.
- Borrados suaves (`status='Inactivo'`) en vez de DELETE físico, excepto
  cuando hay 0 referencias (en cuyo caso DELETE físico + limpieza de
  carpeta Drive vacía).

## Convenciones de naming

| Capa | Convención | Ejemplo |
|---|---|---|
| Proceso | `MAYUSCULAS-GUION` | `BILL-INVOICE`, `PROP-CAPT` |
| Spec puntual | `snake_case` + sufijo | `wizard_property.md`, `fix-bug-019-hydrate-timeouts.md` |
| Verifier | mismo nombre que su spec | `tests/verifiers/wizard_property.md` |
| Endpoint | `/api/{dominio}/{recurso}` | `/api/properties`, `/api/billing/invoices/send` |
| Columna DB | `snake_case` inglés | `inventory_captacion_pdf_url` (no español) |
| UI | español (es-CO) | "Cuenta de cobro", no "Invoice" |
| Storage | ISO `YYYY-MM-DD` | `2026-08-03` |

## Cómo agregar un proceso nuevo

1. Copiar `docs/processes/TEMPLATE_process-workflow.md`.
2. Asignar código siguiendo el orden de dependencias de la tabla arriba.
3. Definir actores, flujo narrativo, edge cases, cross-cutting contracts.
4. Agregar fila a la tabla de orden arriba con su `Depende de`.
5. Abrir PR con solo docs — sin código hasta aprobación.

## Cómo agregar una feature a un proceso existente

1. Crear `docs/specs/{nombre}.md` desde `docs/specs/TEMPLATE_feature-spec.md`.
2. En la sección §1 (User Story) referenciar el proceso padre:
   > **Proceso padre:** `PROP-CAPT` — ver `docs/processes/PROP-CAPT.md`.
3. Seguir el flujo Karpathy normal (spec → verifier → implementación → verify).

## Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-08-03 | Catálogo inicial con 14 procesos + cross-cutting invariants | Agent + user |