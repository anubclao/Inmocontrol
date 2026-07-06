import { motion, AnimatePresence } from 'motion/react';
import { CloudOff, Settings } from 'lucide-react';
import { useGoogleDriveStore } from '../../shared/store/googleDriveStore';
import { useState } from 'react';

interface Props {
  onGoToIntegrations?: () => void;
}

/**
 * Banner persistente que aparece en la parte superior del contenido
 * cuando Google Drive NO está conectado. Indica claramente que los documentos
 * que se suban solo quedarán en el navegador (no en la nube).
 *
 * Los botones de subida a Drive ya validan `connected` antes de invocar la API;
 * este banner es la pista visual de por qué un botón podría estar deshabilitado
 * o mostrar un error explícito.
 */
export function DriveStatusBanner({ onGoToIntegrations }: Props) {
  const connected = useGoogleDriveStore((s) => s.connected);
  const checkStatus = useGoogleDriveStore((s) => s.checkStatus);
  const [checking, setChecking] = useState(false);

  if (connected) return null;

  const handleRecheck = async () => {
    setChecking(true);
    try { await checkStatus(); } finally { setChecking(false); }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
        role="alert"
        data-testid="drive-disconnected-banner"
        className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm"
      >
        <CloudOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="flex-1 text-sm">
          <p className="font-semibold">Google Drive no está conectado</p>
          <p className="mt-0.5 text-xs text-amber-800">
            Los PDFs que subas (documentos del propietario, contratos de mandato,
            inventarios) <strong>solo se guardarán en este navegador</strong> y se
            perderán si cambias de equipo. Para guardarlos en tu Drive personal,
            conectá tu cuenta desde Configuración → Integraciones.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {onGoToIntegrations && (
              <button
                type="button"
                onClick={onGoToIntegrations}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
              >
                <Settings className="h-3.5 w-3.5" />
                Ir a Integraciones
              </button>
            )}
            <button
              type="button"
              onClick={handleRecheck}
              disabled={checking}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {checking ? 'Verificando…' : 'Volver a verificar'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Helper de validación: lo invocan los handlers de upload ANTES de llamar a
 * `uploadFileToDrive`. Devuelve `null` si todo OK, o un string con el motivo
 * del bloqueo si Drive está desconectado.
 */
export function getDriveGuardError(): string | null {
  const { connected } = useGoogleDriveStore.getState();
  if (connected) return null;
  return 'Google Drive no está conectado. Conectá tu cuenta desde Configuración → Integraciones para subir a la nube. (Si solo querés guardar local, hacé clic de nuevo en 5 segundos).';
}
