import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Capa de errores tipada para InmoControl.
 *
 * FASE 4 de fix-issue-27 (Karpathy): reemplaza los 17 sitios que hacen
 * `res.status(500).json({...})` con un throw explícito de AppError.
 * `errorHandler` (server/lib/errorHandler.ts) lo captura y devuelve JSON
 * uniforme con shape `{ error, code }`.
 *
 * Reglas:
 *  - 4xx → expose = true (mensaje del caller ES seguro para el cliente).
 *  - 5xx → expose = false (mensaje genérico, evita leak de internals).
 *  - `internalExpose()` es para 5xx cuyo mensaje custom NO leak (ej:
 *    "No se pudo inicializar el plan trial" — el caller decide exponer
 *    un mensaje útil sin mostrar el SQL de MySQL).
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly expose: boolean = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// ── 4xx factories — siempre exponen el mensaje al cliente ────────────────
export const badRequest = (m: string, c = "BAD_REQUEST"): AppError =>
  new AppError(400, m, c, true);
export const unauthorized = (m: string, c = "UNAUTHORIZED"): AppError =>
  new AppError(401, m, c, true);
export const forbidden = (m: string, c = "FORBIDDEN"): AppError =>
  new AppError(403, m, c, true);
export const notFound = (m: string, c = "NOT_FOUND"): AppError =>
  new AppError(404, m, c, true);
export const conflict = (m: string, c = "CONFLICT"): AppError =>
  new AppError(409, m, c, true);

// ── 5xx factories ────────────────────────────────────────────────────────
/** 500 con mensaje genérico "Internal server error". El original se loguea con stack. */
export const internal = (code = "INTERNAL"): AppError =>
  new AppError(500, "Internal server error", code, false);

/** 500 con mensaje custom SEGURO de exponer (caller ya validó que no leak). */
export const internalExpose = (m: string, c = "INTERNAL"): AppError =>
  new AppError(500, m, c, true);

export const serviceUnavailable = (
  m: string,
  c = "SERVICE_UNAVAILABLE",
): AppError => new AppError(503, m, c, true);

// ── Re-export del asyncHandler existente (un solo punto de import) ──────
export { asyncHandler } from "./asyncHandler.js";

// Tipo helper para handlers que quieran tipar el error catch
export type AnyError = AppError | Error | unknown;
