# Feature: [Nombre del Feature — ej: wizard_property]

> **Metodología Karpathy (Agent Skill)**: este spec se escribe ANTES de
> tocar código. Define QUÉ debe hacer el feature. NO incluir código de
> implementación. Cuando esté aprobado, sigue `tests/verifiers/{name}.md`.

## 1. User Story

**As a** [rol del usuario — ej: agente inmobiliario],
**I want to** [acción concreta — ej: crear una propiedad en 3 pasos],
**So that** [beneficio medible — ej: la propiedad queda persistida en MySQL y Drive desde el paso 1, no solo al finalizar].

## 2. Acceptance Criteria

Cada criterio debe ser BINARIO (pasa o no pasa) y VERIFICABLE por el verifier
E2E. Numerados para referencia cruzada.

- **AC-1**: [Comportamiento exacto esperado — ej: "Click en 'Continuar a Documentación' muestra toast 'Avance guardado en el servidor' Y crea una fila en `properties` con `status='Pendiente'`"]
- **AC-2**: [...]
- **AC-3**: [Edge case — ej: "Si Drive está caído, el POST responde en <10s con `driveFolderId: null` y la propiedad igual se guarda"]
- **AC-4**: [...]

## 3. Edge Cases (qué pasa si...)

### Error States
- ¿Drive API timeout/falla? → [comportamiento exacto]
- ¿MySQL timeout? → [comportamiento exacto]
- ¿Body del POST mal formado? → [status code + body exacto]
- ¿Network offline del cliente? → [UI state]

### Empty States
- ¿Sin documentos subidos? → [UI badge + state]
- ¿Sin propietarios? → [validación + mensaje]
- ¿Sin número de cédula? → [validación]

### Loading States
- ¿Durante el POST? → [modal abierto + spinner + "Guardando..."]
- ¿Durante upload a Drive? → [progress por archivo]
- ¿Durante validación? → [botón disabled]

### Edge Cases del flujo
- ¿User cierra el browser a mitad del wizard? → [recuperación del draft]
- ¿User hace "Atrás" después de "Continuar"? → [state preservation]
- ¿User hace clic 2 veces en "Guardar"? → [doble POST prevention]

## 4. Technical Contract

### Endpoint(s) del servidor

```typescript
// POST /api/properties
interface CreatePropertyRequest {
  localId?: string;            // "wizard-X" para INSERT, UUID para UPSERT
  address: string;
  chip: string;                // AAA + 7-8 chars
  folio: string;
  ownerName: string;
  ownerIdNumber?: string;
  ownerPhone?: string;         // ← IMPORTANTE: top-level, no solo en owners[]
  ownerEmail?: string;         // ← IMPORTANTE: top-level, no solo en owners[]
  propertyType: PropertyType;
  status?: 'Pendiente' | 'Activo';
  mandatePdfUrl?: string;
  mandateSignedAt?: string;
  owners?: Array<{
    id?: string;
    name: string;
    idNumber?: string;
    phone?: string;
    email?: string;
    ownershipPct?: number;
    position: number;
  }>;
  units?: Array<{...}>;
  documents?: Record<string, string | { primary: string; extras: string[] }>;
}

interface CreatePropertyResponse {
  success: true;
  propertyId: string;          // UUID real
  driveFolderId: string | null;
  driveFolderPath: string | null;
  message: string;
}
```

### Componentes del cliente (props)

```typescript
interface StepBasicProps {
  address: string;
  chip: string;
  folio: string;
  // ... todos los props
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onContinue: () => Promise<void>;   // ← async, espera el POST
  onSaveDraft: () => Promise<void>;
}

interface DocCardProps {
  // ... lo que necesite para mostrar el estado real del storage
  files: string[];
  // ... 
}
```

### Estados a trackear

- `wizardPropertyDbId: string | null` — UUID real una vez persistido
- `wizardDriveFolderId: string | null`
- `uploadedDocs: Record<slotKey, string[]>` — array de URLs (drive o blob)
- `creatingTenant: boolean` — para el modal del tenant
- `finalizeSummary: FinalizeSummary | null` — para el modal post-finalize

## 5. Timeouts (explícitos)

- **Server**: cada llamada a Google Drive (refreshAccessToken, files.create, files.list) tiene timeout de **8s**. Si se cumple, se loguea warning y se continúa sin Drive.
- **Server**: pool MySQL tiene connectionLimit=10. Si se agotan, los requests esperan (waitForConnections=true).
- **Client**: fetch al server tiene timeout de **15s** via AbortController. Si se cumple, toast: "El servidor tardó demasiado. Reintentá en unos segundos."

## 6. Tostadas exactas (copy approved)

| Trigger | Tipo | Copy exacto |
|---|---|---|
| Click "Continuar a Documentación" éxito | success | "✓ Avance guardado en el servidor (MySQL). Estado: Pendiente hasta subir el Mandato." |
| Click "Continuar a Documentación" error | error | "Error guardando en servidor: {error del server}" |
| Click "Continuar a Documentación" timeout 15s | error | "El servidor tardó demasiado. Reintentá en unos segundos." |
| Drive upload éxito | success | "✓ {filename} subido a Drive" |
| Drive upload falla (continúa) | warning | "Drive no disponible — el archivo se guardó localmente. Se subirá cuando Drive responda." |
| Wizard finalize éxito | success | "✓ ¡Propiedad creada! Resumen abajo." |
| Wizard finalize con pendientes | warning | "⚠ Propiedad creada con N pendiente(s). Resumen abajo." |
| Wizard finalize error | error | "Error guardando propiedad: {error}" |

## 7. Dependencias

### Archivos a modificar
- `src/features/properties/PropertiesView.tsx` (monolito, 3158 líneas)
- `src/features/properties/components/StepBasic.tsx`
- `src/features/properties/components/StepDocs.tsx`
- `src/features/properties/components/StepInventory.tsx`
- `server/routes/properties.ts`
- `src/features/tenants/TenantsView.tsx` (si el fix toca tenants)
- `server/routes/tenants.ts` (si el fix toca tenants)

### Archivos a NO tocar (out of scope explícito)
- `src/features/contracts/` (refactor mayor pendiente)
- `src/features/billing/` (no relacionado)
- Cualquier migración SQL nueva (a menos que se identifique schema drift)

## 8. Out of Scope

- Refactor del monolito `PropertiesView.tsx` (Fase 2 del proyecto).
- Instalación de Vitest (decisión pendiente per AGENTS.md).
- Multi-tenant real (sigue siendo piloto single-tenant).
- Real-time upload a Drive de los documentos en step 2 (a menos que se incluya
  explícitamente en el spec).

## 9. Riesgos identificados

- **Drive timeout**: si Google está caído, los uploads se pierden. Mitigación:
  blob URL local + retry en finalize.
- **Orphan `Pendiente` properties**: si user abandona a mitad del wizard,
  queda fila huérfana. Mitigación: `discardDraft` hace DELETE.
- **Browser cache**: el bundle cacheado puede hacer parecer que los fixes
  no están. Mitigación: `Ctrl+Shift+R` después del deploy.

## 10. Approval

**Status:** ⏳ Pending Review
**Aprobado por:** [nombre del user]
**Fecha de aprobación:** [YYYY-MM-DD]
