# Fix: 3 migrations no idempotentes (BUG-034)

> Karpathy Spec - Agosto 2026.
> Bug origen: BUG-034 en docs/bugs/BUGS.md. Severidad: Verde Bajo.

## User Story

Como dev/operador, quiero que TODAS las migrations sean idempotentes (re-ejecutables sin error).

## Contexto

Migrations no idempotentes hoy:
- 002_*.sql
- 004_invoice_number.sql
- 006a-password_hash.sql

Migrations idempotentes (ya arregladas): 009, 010.

## Acceptance Criteria

### AC-1: Patron de idempotencia

```sql
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rent_invoices'
    AND COLUMN_NAME = 'invoice_number'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE rent_invoices ADD COLUMN invoice_number VARCHAR(20) NULL',
  'SELECT "Column invoice_number already exists" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

### AC-2: Aplicar el patron a las 3 migrations

### AC-3: Test de re-run

- Aplicar 1ra vez OK.
- Aplicar de nuevo OK.

## Effort

- Refactor 3 migrations: 1h.
- Tests: 30 min.
- **Total: 1.5h**

---

Pendiente de aprobacion del usuario.
