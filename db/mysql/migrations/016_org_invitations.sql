-- 016_org_invitations.sql
-- Migración idempotente: crea la tabla org_invitations para el feature
-- de invitaciones por magic link.
--
-- Spec: docs/specs/saas_user_mgmt.md
-- Verifier: tests/verifiers/saas_user_mgmt.md
--
-- Notas de diseño:
-- - Token es hex 64 chars (crypto.randomBytes(32).toString('hex')).
-- - email es UNIQUE POR ORG (no global), index compuesto (organization_id, email)
--   para soportar el check de "ya es miembro" (AC-15).
-- - role tiene CHECK constraint con los 3 roles invitables. NO se puede
--   invitar a 'admin' por este endpoint (solo el admin original puede serlo).
-- - accepted_at NULL = pendiente. Si llega a setearse, NO se puede borrar
--   la fila (preserva trazabilidad legal).
-- - CASCADE en organization_id: si se borra la org, se borran sus invitaciones.
-- - CASCADE en invited_by: si se borra el profile que invitó, se borran
--   sus invitaciones. Esto es OK porque el admin original está protegido
--   por el endpoint (no se puede borrar via DELETE /members/:id).

CREATE TABLE IF NOT EXISTS org_invitations (
  id              CHAR(36)     NOT NULL,
  organization_id CHAR(36)     NOT NULL,
  email           VARCHAR(150) NOT NULL,
  role            VARCHAR(20)  NOT NULL,
  token           VARCHAR(64)  NOT NULL,
  invited_by      CHAR(36)     NOT NULL,
  expires_at      DATETIME     NOT NULL,
  accepted_at     DATETIME     NULL,
  created_by      VARCHAR(150) NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY org_invitations_token_idx (token),
  KEY org_invitations_org_idx (organization_id),
  KEY org_invitations_org_email_idx (organization_id, email),
  KEY org_invitations_invited_by_idx (invited_by),
  CONSTRAINT fk_org_invitations_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_org_invitations_invited_by
    FOREIGN KEY (invited_by) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT chk_org_invitations_role
    CHECK (role IN ('gestor', 'propietario', 'inquilino'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
