import { create } from 'zustand';

/** Estado de la conexión con Google Drive del usuario. */
export type DriveConnectionReason =
  | "no_token"
  | "no_expiry"
  | "expired"
  | "revoked"
  | "network";

interface GoogleDriveState {
  connected: boolean;
  folderId: string | null;
  /** Razón de la desconexión (solo si connected=false). Útil para UI específica. */
  disconnectReason: DriveConnectionReason | null;
  /**
   * 'user'   → tokens del Gmail que conectó este usuario.
   * 'legacy' → tokens viejos guardados bajo `default_user` (cuenta de la
   *            agencia). La UI avisa que conviene reconectar con el Gmail propio.
   */
  source: "user" | "legacy" | null;
  connecting: boolean;

  setConnecting: (v: boolean) => void;
  setConnected: (connected: boolean, folderId?: string) => void;
  disconnect: () => void;
  checkStatus: () => Promise<void>;
}

export const useGoogleDriveStore = create<GoogleDriveState>((set) => ({
  connected: false,
  folderId: null,
  disconnectReason: null,
  source: null,
  connecting: false,

  setConnecting: (v) => set({ connecting: v }),

  setConnected: (connected, folderId) =>
    set({
      connected,
      folderId: folderId ?? null,
      disconnectReason: connected ? null : 'no_token',
      connecting: false,
    }),

  disconnect: () =>
    set({
      connected: false,
      folderId: null,
      disconnectReason: 'no_token',
      source: null,
      connecting: false,
    }),

  checkStatus: async () => {
    try {
      const res = await fetch('/api/status/google-drive');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        connected: !!data.connected,
        folderId: data.folderId ?? null,
        // FIX Karpathy (jul-2026): propagamos la razón para que la UI pueda
        // mostrar el mensaje específico ("sesión expirada" vs "no conectado").
        disconnectReason: data.connected ? null : (data.reason ?? 'no_token'),
        source: data.source === 'legacy' ? 'legacy' : data.source === 'user' ? 'user' : null,
      });
    } catch {
      set({
        connected: false,
        folderId: null,
        disconnectReason: 'network',
        source: null,
      });
    }
  },
}));
