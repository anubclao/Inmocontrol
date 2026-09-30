import { Request, Response, NextFunction } from "express";
import { AppError } from "./errors.js";

/**
 * Middleware central de errores para InmoControl.
 * Captura cualquier error que llegue via next(err) o de un asyncHandler.
 * SIEMPRE devuelve JSON (regla AGENTS.md: "NUNCA HTML").
 *
 * Shape de respuesta: { error: string, code: string }
 *
 * fix-issue-27 (FASE 4 Karpathy, oct-2026):
 *  - Reconoce errores `AppError` (de server/lib/errors.ts) con shape uniforme.
 *  - Aplica la regla `expose`:
 *      • 4xx: el mensaje del caller SE expone al cliente (es seguro).
 *      • 5xx con expose=true: el mensaje custom SE expone (caller ya validó).
 *      • 5xx con expose=false: mensaje genérico "Internal server error" (evita leak).
 *  - Loguea una sola línea uniforme por error (con stack si >= 500).
 *  - Si `err` no es `AppError`, lo trata como 500 internal.
 *
 * Casos especiales:
 *  - err.type === 'entity.parse.failed': body malformado → 400 INVALID_JSON.
 *  - res.headersSent: no podemos responder de nuevo (race con el handler).
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  // JSON parse error → 400
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({
      error: err.message ?? "Invalid JSON body",
      code: "INVALID_JSON",
    });
    return;
  }

  // Si el handler ya respondió, no podemos responder de nuevo
  if (res.headersSent) {
    return;
  }

  // ── Resolver status / code / message / expose ────────────────────────
  let statusCode: number;
  let code: string;
  let message: string;
  let isAppError = false;

  if (err instanceof AppError) {
    isAppError = true;
    statusCode = err.statusCode;
    code = err.code;
    message = err.expose ? err.message : "Internal server error";
  } else {
    // Error no tipado: 4xx si trae status < 500, 5xx por default
    statusCode = err?.statusCode ?? err?.status ?? 500;
    code = err?.code ?? (statusCode >= 500 ? "INTERNAL" : "CLIENT_ERROR");
    // Si es 4xx o el caller marcó expose=true, mostramos el mensaje.
    // Si es 5xx sin expose, mensaje genérico.
    const expose = statusCode < 500 || err?.expose === true;
    message = expose
      ? (err?.message ?? "Internal server error")
      : "Internal server error";
  }

  // ── Logging uniforme ──────────────────────────────────────────────────
  if (statusCode >= 500) {
    console.error(
      `[errorHandler] ${req.method} ${req.path} → ${statusCode} ` +
        `(code=${code}, msg=${err?.message ?? "(no msg)"}, ` +
        `stack=${err?.stack ? "presente" : "ausente"}, ` +
        `appError=${isAppError})`,
    );
  } else {
    console.warn(
      `[errorHandler] ${req.method} ${req.path} → ${statusCode} ` +
        `(code=${code}, msg=${message})`,
    );
  }

  res.status(statusCode).json({
    error: message,
    code,
  });
}
