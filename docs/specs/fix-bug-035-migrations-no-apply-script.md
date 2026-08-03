# Fix: 2 migrations sin script apply (BUG-035)

> Karpathy Spec - Agosto 2026.
> Bug origen: BUG-035 en docs/bugs/BUGS.md. Severidad: Verde Bajo.

## User Story

Como dev/operador, quiero que TODAS las migrations tengan un script apply-NNN-migration.mjs en scripts/.

## Contexto

Migrations sin script:
- 002_*.sql
- 006a-password_hash.sql

## Acceptance Criteria

### AC-1: Crear apply-002-migration.mjs

```js
import pool from '../db/mysql/pool.js';
import fs from 'fs';
import path from 'path';

async function run() {
  const sql = fs.readFileSync(
    path.join('db/mysql/migrations/002_*.sql'), 'utf8'
  );
  // ... pre-check + execute ...
}
```

### AC-2: Crear apply-006a-password-migration.mjs

Idem patron, apuntando a 006a-password_hash.sql.

### AC-3: Documentar en AGENTS.md

## Effort

- 2 scripts: 20 min.
- **Total: 20 min**

---

Pendiente de aprobacion del usuario.
