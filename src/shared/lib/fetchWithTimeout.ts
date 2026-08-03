// filepath: src/shared/lib/fetchWithTimeout.ts
// Helper central para fetch con AbortController + timeout.
// Usado por appStore.hydrate() y reusado por otros consumidores
// (driveService, billing/api) en fixes futuros.
//
// Sin AbortController, un fetch colgado (MySQL saturado, Drive timeout)
// queda bloqueando el flujo del cliente hasta el timeout del browser (~5min).
// Con AbortController, podemos abortar la promise y propagar un error
// "TimeoutError" a quien nos llamó, que decide qué hacer (retry, toast, etc.).
//
// NO introduce dependencias. Usa APIs nativas: fetch + AbortController.

/**
 * Error específico para timeouts.
 * El caller puede hacer `if (err instanceof TimeoutError) ...` para
 * distinguir entre un timeout (la red está lenta) y un error de red
 * (la red está caída).
 */
export class TimeoutError extends Error {
  public readonly url: string;
  public readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number) {
    super(`fetch timeout after ${timeoutMs}ms: ${url}`);
    this.name = "TimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * fetch() con timeout vía AbortController.
 * - Si la red responde dentro de `timeoutMs`, devuelve el Response normal.
 * - Si pasan `timeoutMs` sin respuesta, aborta el fetch y rechaza con TimeoutError.
 * - El AbortController SIEMPRE se limpia (clearTimeout) — incluso si el fetch
 *   tira error antes de que dispare el timeout — para no dejar timers colgados.
 *
 * @param url - URL completa (o path relativo si el caller lo resuelve antes).
 * @param options - Opciones estándar de fetch. Si options.signal está set, se
 *                  respeta (compatible con cancelaciones externas).
 * @param timeoutMs - Timeout en ms. Default 15s — suficiente para endpoints
 *                    locales, corto para que un endpoint colgado no frene la UI.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15_000,
): Promise<Response> {
  // Si el caller ya pasó un signal, lo respetamos. Pero también necesitamos
  // nuestro propio controller para el timeout, así que creamos uno interno
  // y chain-eamos las signals.
  const externalSignal = options.signal;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Si el signal externo ya está aborted, propagar inmediatamente.
  if (externalSignal?.aborted) {
    clearTimeout(timeoutId);
    throw new Error("fetch aborted by caller signal");
  }
  // Chain: si el caller aborta, abortamos nuestro controller también.
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch (err: any) {
    // Si el abort fue disparado por el timeout (no por el caller), envolver
    // en TimeoutError para que el caller pueda distinguir.
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new TimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
