import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Envuelve un handler async para que cualquier error se propague a `next(err)`.
 * Express 4 NO captura errores async por default; este wrapper lo arregla.
 * Cero dependencias nuevas (regla AGENTS.md).
 *
 * Uso:
 *   router.post('/foo', asyncHandler(async (req, res) => {
 *     // ... lógica del handler sin try/catch local ...
 *   }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
