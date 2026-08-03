import { Request, Response, NextFunction } from "express";

/**
 * Middleware central de errores para InmoControl.
 * Captura cualquier error que llegue via next(err) o de un asyncHandler.
 * SIEMPRE devuelve JSON (regla AGENTS.md: "NUNCA HTML").
 *
 * Shape de respuesta: { error: string, code?: string }
 *
 * - Para 4xx: incluye el mensaje del error (es seguro exponerlo al cliente).
 * - Para 5xx: mensaje genérico "Internal server error" (evita leak de internals).
 *   El error original se loguea con stack a console.error.
 * - err.expose === true: el caller marcó el error como seguro de exponer.
 *
 * Casos especiales:
 * - err.type === 'entity.parse.failed': body malformado → 400 INVALID_JSON.
 * - res.headersSent: no podemos responder de nuevo (race con el handler).
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

  const status = err?.statusCode ?? err?.status ?? 500;
  const expose = err?.expose === true;
  const message =
    status < 500 || expose
      ? (err?.message ?? "Internal server error")
      : "Internal server error";

  if (status >= 500) {
    console.error(`[errorHandler] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({
    error: message,
    code: err?.code ?? (status >= 500 ? "INTERNAL" : "CLIENT_ERROR"),
  });
}
