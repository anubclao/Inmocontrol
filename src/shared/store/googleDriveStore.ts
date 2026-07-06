import { create } from 'zustand';

/** Estado de la conexión con Google Drive del usuario. */
interface GoogleDriveState {
  connected: boolean;
  folderId: string | null;
  connecting: boolean;

  setConnecting: (v: boolean) => void;
  setConnected: (connected: boolean, folderId?: string) => void;
  disconnect: () => void;
  checkStatus: () => Promise<void>;
}

export const useGoogleDriveStore = create<GoogleDriveState>((set) => ({
  connected: false,
  folderId: null,
  connecting: false,

  setConnecting: (v) => set({ connecting: v }),

  setConnected: (connected, folderId) =>
    set({ connected, folderId: folderId ?? null, connecting: false }),

  disconnect: () =>
    set({ connected: false, folderId: null, connecting: false }),

  checkStatus: async () => {
    try {
      const res = await fetch('/api/status/google-drive');
      if (!res.ok) throw new Error();
      const data = await res.json();
      set({ connected: data.connected, folderId: data.folderId ?? null });
    } catch {
      set({ connected: false, folderId: null });
    }
  },
}));
