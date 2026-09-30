/**
 * InmoControl — Endpoints para sincronizar entidades base (orgs, properties,
 * tenants, contracts) desde el cliente.
 *
 * El cliente hoy tiene esas entidades en localStorage (vía Zustand). El backend
 * necesita al menos la propiedad y el contrato para resolver las FK de las
 * tablas de billing. Este módulo expone un endpoint bulk "sync" y CRUDS
 * individuales.
 *
 * Estrategia simple para MVP:
 *   - El cliente llama POST /api/entities/sync con su estado actual completo.
 *   - El backend hace upsert idempotente (INSERT ... ON DUPLICATE KEY UPDATE).
 *   - Cualquier propiedad/contrato referenciado por billing DEBE estar primero
 *     en la DB (el sync se ejecuta al iniciar la app).
 *
 * POST /api/contracts y PATCH /api/contracts/:id fueron agregados después
 * porque el flujo real (crear tenant → crear contrato automático) necesita
 * escribir contratos UNO a UNO desde el cliente, no en batches. Antes el
 * contrato solo vivía en Zustand/localStorage y el billing fallaba con FK
 * cuando intentaba generar amortización (fk_amort_contract).
 */

import { Router } from "express";
import pool from "../db.js";
import crypto from "crypto";
// FIX 2026-09-25 (saas_multitenant.md): usar getOrgIdForRequest en vez de
// ensureDefaultOrg() para que el orgId venga del req.user, no del primero
// de la tabla. ensureDefaultOrg() se mantiene para bootstrap/tests.
import { getOrgIdForRequest } from "../lib/orgContext.js";
// FIX #2 (P0 seguridad): requireAuth en todas las rutas de entities (contracts, etc.).
import { requireAuth } from "./auth.js";
// fix-issue-permissions-by-endpoint: requireRole valida acción específica.
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();
router.use(requireAuth);

// ─── Tipos del payload ─────────────────────────────────────────────────

interface SyncPayload {
  organizations?: any[];
  properties?: any[];
  tenants?: any[];
  contracts?: any[];
}

// ─── POST /api/entities/sync ───────────────────────────────────────────
// Upsert masivo. Idempotente. Devuelve conteo de filas afectadas.

// BUG-029: migrado a asyncHandler.
router.post(
  "/sync",
  asyncHandler(async (req, res) => {
    const payload: SyncPayload = req.body ?? {};
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;

    const result = {
      organizations: 0,
      properties: 0,
      tenants: 0,
      contracts: 0,
    };

    // Organizations — solo si vienen en el payload (caso normal: ninguna)
    for (const org of payload.organizations ?? []) {
      await pool.query(
        `INSERT INTO organizations (id, name, nit, address, phone, website, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         nit = VALUES(nit),
         address = VALUES(address),
         phone = VALUES(phone),
         website = VALUES(website)`,
        [
          org.id,
          org.name,
          org.nit ?? null,
          org.address ?? null,
          org.phone ?? null,
          org.website ?? null,
          org.createdBy ?? null,
        ],
      );
      result.organizations++;
    }

    // Properties — mapeo flexible: campos extra del frontend se ignoran
    for (const p of payload.properties ?? []) {
      await pool.query(
        `INSERT INTO properties
         (id, organization_id, address, chip, folio,
          owner_name, owner_id_number, owner_phone, owner_email,
          status, archived, archived_at, archived_reason,
          mandato_pdf_url, mandato_signed_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         address         = VALUES(address),
         chip            = VALUES(chip),
         folio           = VALUES(folio),
         owner_name      = VALUES(owner_name),
         owner_id_number = VALUES(owner_id_number),
         owner_phone     = VALUES(owner_phone),
         owner_email     = VALUES(owner_email),
         status          = VALUES(status),
         archived        = VALUES(archived),
         archived_at     = VALUES(archived_at),
         archived_reason = VALUES(archived_reason),
         mandato_pdf_url = VALUES(mandato_pdf_url),
         mandato_signed_at = VALUES(mandato_signed_at)`,
        [
          p.id,
          orgId,
          p.address,
          p.chip ?? null,
          p.folio ?? null,
          p.ownerName ?? p.owner_name ?? "(sin nombre)",
          p.ownerIdNumber ?? p.owner_id_number ?? null,
          p.ownerPhone ?? p.owner_phone ?? null,
          p.ownerEmail ?? p.owner_email ?? null,
          p.status ?? "available",
          p.archived ? 1 : 0,
          p.archivedAt ?? p.archived_at ?? null,
          p.archivedReason ?? p.archived_reason ?? null,
          p.mandatoPdfUrl ?? p.mandato_pdf_url ?? null,
          p.mandatoSignedAt ?? p.mandato_signed_at ?? null,
          p.createdBy ?? p.created_by ?? null,
        ],
      );
      result.properties++;
    }

    // Tenants
    for (const t of payload.tenants ?? []) {
      await pool.query(
        `INSERT INTO tenants (id, organization_id, property_id, name, document_id, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         property_id = VALUES(property_id),
         name        = VALUES(name),
         email       = VALUES(email),
         phone       = VALUES(phone)`,
        [
          t.id,
          orgId,
          t.propertyId ?? t.property_id ?? null,
          t.name,
          t.documentId ?? t.document_id ?? "",
          t.email ?? null,
          t.phone ?? null,
        ],
      );
      result.tenants++;
    }

    // Contracts
    for (const c of payload.contracts ?? []) {
      await upsertContract(orgId, c);
      result.contracts++;
    }

    res.json({ ok: true, orgId, synced: result });
  }),
);

// ─── GETs ──────────────────────────────────────────────────────────────

// BUG-029: migrado a asyncHandler.
router.get(
  "/properties",
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query(
      `SELECT * FROM properties WHERE archived = 0 ORDER BY created_at DESC`,
    );
    res.json(rows);
  }),
);

// BUG-029: migrado a asyncHandler.
router.get(
  "/properties/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`SELECT * FROM properties WHERE id = ?`, [
      req.params.id,
    ]);
    const list = rows as any[];
    if (list.length === 0) return res.status(404).json({ error: "not found" });
    res.json(list[0]);
  }),
);

// BUG-029: migrado a asyncHandler.
router.get(
  "/tenants",
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query(`SELECT * FROM tenants ORDER BY name`);
    res.json(rows);
  }),
);

// BUG-029: migrado a asyncHandler.
router.get(
  "/contracts",
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md AC-4): filtrar por org del request.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const tenantId = req.query.tenantId as string | undefined;
    const propertyId = req.query.propertyId as string | undefined;
    const where: string[] = ["organization_id = ?"];
    const values: any[] = [orgId];
    if (tenantId) {
      where.push("tenant_id = ?");
      values.push(tenantId);
    }
    if (propertyId) {
      where.push("property_id = ?");
      values.push(propertyId);
    }
    const sql = `SELECT * FROM contracts WHERE ${where.join(" AND ")} ORDER BY start_date DESC`;
    const [rows] = await pool.query(sql, values);
    res.json(rows);
  }),
);

// BUG-029: migrado a asyncHandler.
router.get(
  "/contracts/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`SELECT * FROM contracts WHERE id = ?`, [
      req.params.id,
    ]);
    const list = rows as any[];
    if (list.length === 0) return res.status(404).json({ error: "not found" });
    res.json(list[0]);
  }),
);

// ─── DELETE /api/entities/contracts/:id ────────────────────────────────
// Borra un contrato puntual. Usado para limpieza (ej: borrar los contratos
// fantasma que se crearon con la versión vieja del flujo, antes del fix
// que crea el contrato recién al firmar el Inventario de Colocación).
//
// Devuelve: { success: true } o 404 si no existe.

// BUG-029: migrado a asyncHandler (preserva la rama de race condition FK 1451).
router.delete(
  "/contracts/:id",
  requireRole("canDeleteContract"),
  asyncHandler(async (req, res) => {
    // BUG-012: pre-check de dependencias. Si el contrato tiene amortization_rows
    // o rent_invoices, devolver 409 con detalle en vez de tirar FK violation 500.
    const { id } = req.params;
    // FIX 2026-09-25 (saas_multitenant.md): orgId del request.
    const delCtx = await getOrgIdForRequest(req);
    if (delCtx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = delCtx.orgId;
    try {
      const [deps] = await pool.query<any>(
        `SELECT
         (SELECT COUNT(*) FROM amortization_rows WHERE contract_id = ?) AS amort_count,
         (SELECT COUNT(*) FROM rent_invoices WHERE contract_id = ?) AS invoice_count`,
        [id, id],
      );
      const d = (deps as any[])[0] ?? { amort_count: 0, invoice_count: 0 };
      if (d.amort_count > 0 || d.invoice_count > 0) {
        return res.status(409).json({
          error:
            "No se puede eliminar el contrato porque tiene datos asociados.",
          details: {
            amortizationRows: d.amort_count,
            invoices: d.invoice_count,
          },
          hint: "Primero anulá los recibos en el módulo Billing.",
        });
      }
      const [result] = await pool.query<any>(
        `DELETE FROM contracts WHERE id = ? AND organization_id = ?`,
        [id, orgId],
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Contrato no encontrado" });
      }
      res.json({ success: true });
    } catch (err: any) {
      // Red de seguridad: si por race condition entra una fila entre el
      // pre-check y el DELETE, MySQL tira ER_ROW_IS_REFERENCED_2 (1451).
      if (err.code === "ER_ROW_IS_REFERENCED_2") {
        console.warn(
          "[entities/contracts DELETE] FK violation (race condition):",
          err.message,
        );
        return res.status(409).json({
          error:
            "No se puede eliminar el contrato porque tiene datos asociados.",
          hint: "Primero anulá los recibos en el módulo Billing.",
        });
      }
      throw err; // BUG-029: propagar al errorHandler central
    }
  }),
);

// ─── POST /api/contracts ────────────────────────────────────────────────
// Crea (o actualiza si ya existe) UN contrato en MySQL. Idempotente.
// El frontend usa este endpoint cuando crea un tenant (contrato automático
// en 'draft') o cuando edita desde el módulo Contratos.
//
// Body: Contract en camelCase o snake_case (mismo formato que /sync).
// Devuelve: { contract: <row de MySQL> }
//
// IMPORTANTE: el billing genera amortization_rows con FK a contracts(id),
// por lo que el contrato DEBE estar en MySQL antes de generar recibos.

// BUG-029: migrado a asyncHandler.
router.post(
  "/contracts",
  requireRole("canAddContract"),
  asyncHandler(async (req, res) => {
    // FIX 2026-09-25 (saas_multitenant.md AC-8): orgId del request + 403 si cross-tenant.
    const ctx = await getOrgIdForRequest(req);
    if (ctx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = ctx.orgId;
    const body = req.body ?? {};
    const bodyOrgId = body.organizationId as string | undefined;
    if (bodyOrgId && bodyOrgId !== orgId) {
      return res.status(403).json({
        error: "No podés crear recursos en otra organización",
        code: "CROSS_TENANT_FORBIDDEN",
      });
    }

    if (!body.propertyId && !body.property_id) {
      return res.status(400).json({ error: "propertyId es requerido" });
    }
    if (!body.startDate && !body.start_date) {
      return res.status(400).json({ error: "startDate es requerido" });
    }
    if (!body.endDate && !body.end_date) {
      return res.status(400).json({ error: "endDate es requerido" });
    }

    // Si el cliente no mandó id, generamos uno. Esto permite que el frontend
    // genere el UUID desde el cliente y solo caiga acá como fallback.
    const contractId = body.id ?? crypto.randomUUID();

    // Validar que la propiedad existe (FK)
    const propertyId = body.propertyId ?? body.property_id;
    const [propRows] = await pool.query<any[]>(
      "SELECT id FROM properties WHERE id = ?",
      [propertyId],
    );
    if (propRows.length === 0) {
      return res
        .status(400)
        .json({ error: `La propiedad ${propertyId} no existe` });
    }

    // Si mandan tenantId, validar que existe (FK nullable, pero si viene debe existir)
    const tenantId = body.tenantId ?? body.tenant_id ?? null;
    if (tenantId) {
      const [tenantRows] = await pool.query<any[]>(
        "SELECT id FROM tenants WHERE id = ?",
        [tenantId],
      );
      if (tenantRows.length === 0) {
        return res
          .status(400)
          .json({ error: `El inquilino ${tenantId} no existe` });
      }
    }

    const c = { ...body, id: contractId };
    await upsertContract(orgId, c);

    // Devolver la fila recién creada/actualizada para que el frontend pueda
    // sincronizar su state local con el id canónico del server.
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM contracts WHERE id = ?",
      [contractId],
    );
    res.status(201).json({ contract: rows[0] });
  }),
);

// ─── PATCH /api/contracts/:id ────────────────────────────────────────────
// Actualización parcial. Body con cualquier subset de campos editables.
// Devuelve: { contract: <row actualizada> }

// BUG-029: migrado a asyncHandler (preserva la rama FK violation 1452).
router.patch(
  "/contracts/:id",
  requireRole("canEditContract"),
  asyncHandler(async (req, res) => {
    // BUG-011: validar el body ANTES de tocar la DB. Rechaza status fuera
    // de enum, rentAmount negativo, fechas incoherentes, etc.
    const { id } = req.params;
    const body = req.body ?? {};

    const errors: Array<{ field: string; code: string; message: string }> = [];
    const validStatuses = [
      "active",
      "ended",
      "pending",
      "cancelled",
      "renewed",
    ];
    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      errors.push({
        field: "status",
        code: "INVALID_ENUM",
        message: `status debe ser uno de: ${validStatuses.join(", ")}`,
      });
    }
    if (body.rentAmount !== undefined) {
      const n = Number(body.rentAmount);
      if (isNaN(n) || n < 0) {
        errors.push({
          field: "rentAmount",
          code: "NEGATIVE",
          message: "rentAmount debe ser un número >= 0",
        });
      }
    }
    if (body.adminFee !== undefined) {
      const n = Number(body.adminFee);
      if (isNaN(n) || n < 0) {
        errors.push({
          field: "adminFee",
          code: "NEGATIVE",
          message: "adminFee debe ser un número >= 0",
        });
      }
    }
    if (body.commissionPct !== undefined) {
      const n = Number(body.commissionPct);
      if (isNaN(n) || n < 0 || n > 100) {
        errors.push({
          field: "commissionPct",
          code: "INVALID_TYPE",
          message: "commissionPct debe estar entre 0 y 100",
        });
      }
    }
    if (body.insurancePct !== undefined) {
      const n = Number(body.insurancePct);
      if (isNaN(n) || n < 0 || n > 100) {
        errors.push({
          field: "insurancePct",
          code: "INVALID_TYPE",
          message: "insurancePct debe estar entre 0 y 100",
        });
      }
    }
    if (body.startDate !== undefined && body.endDate !== undefined) {
      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push({
          field: "startDate",
          code: "INVALID_DATE",
          message: "startDate / endDate deben ser fechas válidas ISO",
        });
      } else if (start > end) {
        errors.push({
          field: "endDate",
          code: "INVALID_DATE",
          message: "endDate debe ser >= startDate",
        });
      }
    } else if (body.startDate !== undefined) {
      if (isNaN(new Date(body.startDate).getTime())) {
        errors.push({
          field: "startDate",
          code: "INVALID_DATE",
          message: "startDate debe ser fecha válida ISO",
        });
      }
    } else if (body.endDate !== undefined) {
      if (isNaN(new Date(body.endDate).getTime())) {
        errors.push({
          field: "endDate",
          code: "INVALID_DATE",
          message: "endDate debe ser fecha válida ISO",
        });
      }
    }
    if (errors.length > 0) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: errors });
    }

    // Mapeo camelCase → snake_case para todos los campos editables.
    const fieldMap: Record<string, string> = {
      rentAmount: "rent_amount",
      adminFee: "admin_fee",
      commissionPct: "commission_pct",
      insurancePct: "insurance_pct",
      startDate: "start_date",
      endDate: "end_date",
      noticeDate: "notice_date",
      status: "status",
      renewalStrategy: "renewal_strategy",
      inventoryEndRequired: "inventory_end_required",
      notes: "notes",
      contractPdfUrl: "contract_pdf_url",
      signedAt: "signed_at",
      propertyId: "property_id",
      tenantId: "tenant_id",
    };

    const updates: string[] = [];
    const values: any[] = [];

    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (body[camel] !== undefined) {
        updates.push(`${snake} = ?`);
        values.push(body[camel]);
      }
    }

    if (updates.length === 0) {
      return res.json({ success: true, message: "Nothing to update" });
    }

    // FIX 2026-09-25 (saas_multitenant.md AC-9): orgId del request, 404 si cross-tenant.
    const patchCtx = await getOrgIdForRequest(req);
    if (patchCtx.isLegacySession) {
      return res
        .status(401)
        .json({ error: "Sesión inválida", code: "SESSION_MISSING_ORG" });
    }
    const orgId = patchCtx.orgId;
    try {
      values.push(id, orgId);
      const [result] = await pool.query<any>(
        `UPDATE contracts SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`,
        values,
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Contrato no encontrado" });
      }
      const [rows] = await pool.query<any[]>(
        "SELECT * FROM contracts WHERE id = ?",
        [id],
      );
      res.json({ contract: rows[0] });
    } catch (err: any) {
      // BUG-011: FK violation (propertyId/tenantId inexistente) → 400
      if (err.code === "ER_NO_REFERENCED_ROW_2") {
        return res.status(400).json({
          error: "FK violation",
          field: "propertyId o tenantId no existe",
        });
      }
      throw err; // BUG-029: propagar al errorHandler central
    }
  }),
);

// ─── Helper compartido (sync + POST /contracts) ─────────────────────────

async function upsertContract(orgId: string, c: any): Promise<void> {
  await pool.query(
    `INSERT INTO contracts
       (id, organization_id, property_id, tenant_id,
        rent_amount, admin_fee, commission_pct, insurance_pct,
        start_date, end_date, notice_date,
        status, renewal_strategy, inventory_end_required, notes,
        contract_pdf_url, signed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rent_amount     = VALUES(rent_amount),
       admin_fee       = VALUES(admin_fee),
       commission_pct  = VALUES(commission_pct),
       insurance_pct   = VALUES(insurance_pct),
       start_date      = VALUES(start_date),
       end_date        = VALUES(end_date),
       notice_date     = VALUES(notice_date),
       status          = VALUES(status),
       renewal_strategy = VALUES(renewal_strategy),
       inventory_end_required = VALUES(inventory_end_required),
       notes           = VALUES(notes),
       contract_pdf_url = VALUES(contract_pdf_url),
       signed_at       = VALUES(signed_at)`,
    [
      c.id,
      orgId,
      c.propertyId ?? c.property_id,
      c.tenantId ?? c.tenant_id ?? null,
      Number(c.rentAmount ?? c.rent_amount ?? 0),
      Number(c.adminFee ?? c.admin_fee ?? 0),
      Number(c.commissionPct ?? c.commission_pct ?? 8),
      Number(c.insurancePct ?? c.insurance_pct ?? 0),
      c.startDate ?? c.start_date,
      c.endDate ?? c.end_date,
      c.noticeDate ?? c.notice_date ?? null,
      c.status ?? "draft",
      c.renewalStrategy ?? c.renewal_strategy ?? "manual",
      c.inventoryEndRequired ?? c.inventory_end_required ?? 1,
      c.notes ?? null,
      c.contractPdfUrl ?? c.contract_pdf_url ?? null,
      c.signedAt ?? c.signed_at ?? null,
    ],
  );
}

export default router;
