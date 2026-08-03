# Fix: Sin UNIQUE en tenants (organization_id, document_id) (BUG-033)

> Karpathy Spec - Agosto 2026.
> Bug origen: BUG-033 en docs/bugs/BUGS.md. Severidad: Amarillo Medio.

## User Story

Como operador, quiero que no se pueda crear 2 inquilinos con la misma cedula en la misma organizacion.

## Contexto

Hoy el endpoint POST /api/tenants hace un pre-check con SELECT. Si 2 POSTs concurrentes pasan el pre-check, ambos INSERT pasan.

## Acceptance Criteria

### AC-1: Migration con UNIQUE constraint

```sql
ALTER TABLE tenants
  ADD UNIQUE KEY tenants_unique_doc_per_org
  (organization_id, document_id);
```

### AC-2: Script apply con pre-check

Pre-check de duplicados.

### AC-3: Manejo de ER_DUP_ENTRY en POST /api/tenants

- Si INSERT tira ER_DUP_ENTRY, devolver 409 con mensaje claro.

### AC-4: Replicar en schemas

schema-completo.sql y schema-hostinger.sql.

## Effort

- Migration + script: 30 min.
- Manejo de error: 10 min.
- Replicar: 10 min.
- **Total: 50 min**

---

Pendiente de aprobacion del usuario.
