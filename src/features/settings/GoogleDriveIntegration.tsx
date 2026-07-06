import { useEffect } from 'react';
import { CheckCircle, FolderOpen, Unlink, Loader2, ExternalLink } from 'lucide-react';
import { Button, Card } from '../../shared/ui';
import { useGoogleDriveStore } from '../../shared/store/googleDriveStore';

interface GoogleDriveIntegrationProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

/**
 * Tarjeta de integración con Google Drive.
 * Muestra estado de conexión y permite conectar/desconectar la cuenta del usuario.
 * Los archivos subidos desde la app van a la carpeta "InmoControl" en el Drive del usuario.
 */
export function GoogleDriveIntegration({ showToast }: GoogleDriveIntegrationProps) {
  const { connected, connecting, folderId, setConnecting, setConnected, disconnect, checkStatus } =
    useGoogleDriveStore();

  // Al montar, verifica el estado de conexión contra el backend
  useEffect(() => {
    checkStatus();
  }, []);

  // Detecta si volvió del OAuth con éxito o error (query params en la URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gdrive_connected') === '1') {
      showToast('Google Drive conectado correctamente', 'success');
      checkStatus();
      // Limpia la URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    const err = params.get('gdrive_error');
    if (err) {
      const msgs: Record<string, string> = {
        no_code: 'No se recibió código de autorización.',
        token_exchange_failed: 'Error al intercambiar tokens. Intenta de nuevo.',
      };
      showToast(msgs[err] ?? 'Error al conectar Google Drive', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/auth/google');
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      // Abre el OAuth flow en la misma pestaña
      window.location.href = url;
    } catch {
      showToast('Error al iniciar conexión con Google Drive', 'error');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('¿Desconectar Google Drive? Los archivos ya subidos permanecen en tu Drive.')) return;
    try {
      await fetch('/api/auth/google-drive', { method: 'DELETE' });
      disconnect();
      showToast('Google Drive desconectado');
    } catch {
      showToast('Error al desconectar', 'error');
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border border-blue-100 bg-blue-50/50 rounded-xl hover:bg-blue-50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Logo SVG de Google Drive */}
        <div className="w-12 h-12 bg-white border border-blue-100 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
            <path d="M40.5 20.5L27.5 10L4 30.5L27.5 41L40.5 30.5L40.5 20.5Z" fill="#0066DA"/>
            <path d="M4 30.5L17 21.5L27.5 30.5L4 30.5Z" fill="#00AC47"/>
            <path d="M40.5 20.5L27.5 11.5V30.5L40.5 20.5Z" fill="#EA4335"/>
            <path d="M4 30.5L17.5 21L27.5 30.5L17 21L4 30.5Z" fill="#00832D"/>
            <path d="M27.5 30.5L17.5 21.5V39.5L27.5 30.5Z" fill="#2684FC"/>
            <path d="M40.5 20.5L27.5 29.5L27.5 30.5L40.5 20.5Z" fill="#FFBA00"/>
          </svg>
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900">Google Drive</h4>
          <p className="text-xs text-slate-500">
            {connected
              ? 'Los documentos se guardan en tu Google Drive personal.'
              : 'Almacena contratos, inventarios y documentos en tu cuenta de Google Drive.'}
          </p>
          {connected && folderId && (
            <a
              href={`https://drive.google.com/drive/folders/${folderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline mt-1"
            >
              <FolderOpen className="w-3 h-3" />
              Abrir carpeta InmoControl
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {connected ? (
          <>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle className="w-3 h-3" />
              CONECTADO
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              className="border-red-200 text-red-600 hover:bg-red-50 gap-1"
            >
              <Unlink className="w-3 h-3" />
              Desconectar
            </Button>
          </>
        ) : connecting ? (
          <>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              CONECTANDO...
            </span>
          </>
        ) : (
          <Button size="sm" onClick={handleConnect} className="gap-1">
            Conectar Google Drive
          </Button>
        )}
      </div>
    </div>
  );
}
