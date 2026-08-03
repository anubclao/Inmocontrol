# Fix: Sin UNIQUE en rent_invoices.invoice_number (BUG-032)

> Karpathy Spec - Agosto 2026.
> Bug origen: BUG-032 en docs/bugs/BUGS.md. Severidad: Amarillo Medio.

## User Story

Como operador, quiero que la columna rent_invoices.invoice_number tenga UNIQUE constraint, scoped por (organization_id, property_id, period), para que no se creen 2 cuentas de cobro con el mismo numero.

## Contexto

NOTA: Este fix se solapa con BUG-007. La migration 011 (de BUG-007) YA implementa este UNIQUE constraint. Si BUG-007 se aplica primero, este spec queda resuelto.

## Acceptance Criteria

### AC-1: Migration con UNIQUE constraint

```sql
ALTER TABLE rent_invoices
  ADD UNIQUE KEY rent_invoices_unique_invoice_number
  (organization_id, property_id, period, invoice_number);
```

### AC-2: Script apply con pre-check

Pre-check de duplicados existentes antes de aplicar.

### AC-3: Replicar en schemas

- schema-completo.sql y schema-hostinger.sql: agregar UNIQUE KEY en CREATE TABLE rent_invoices.

## Effort

- Migration + script: 30 min.
- Replicar en schemas: 10 min.
- **Total: 40 min**

---

Pendiente de aprobacion del usuario.
