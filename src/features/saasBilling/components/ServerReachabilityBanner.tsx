// filepath: src/features/saasBilling/components/ServerReachabilityBanner.tsx
/**
 * ServerReachabilityBanner — banner de estado de conexión con el backend.
 * Sale de SaasBillingView.tsx como parte del refactor #16.
 */
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui";

export interface ServerReachabilityBannerProps {
  serverReachable: boolean;
  lastSyncAt: string | null;
  loading: boolean;
  onRetry: () => void;
}

export function ServerReachabilityBanner({
  serverReachable,
  lastSyncAt,
  loading,
  onRetry,
}: ServerReachabilityBannerProps) {
  if (serverReachable) {
    return (
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Sincronizado
          {lastSyncAt &&
            ` · ${new Date(lastSyncAt).toLocaleTimeString("es-CO")}`}
        </span>
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
    );
  }
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs text-amber-900">
        <p className="font-semibold">Servidor no disponible</p>
        <p>
          Mostrando datos de la última sincronización local. Algunas acciones
          pueden fallar.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
