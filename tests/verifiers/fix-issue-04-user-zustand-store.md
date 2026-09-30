# Verifier #4: user en Zustand store

## Pasos:

1. Logout + login con user A.
2. Verificar en DevTools que `localStorage["inmocontrol:auth:v1"]` existe.
3. Logout + login con user B en mismo browser.
4. Verificar que el store se limpia y `useAppStore.hydrate()` corre.
5. `grep -r "STORAGE_KEYS.user" src/` → debe dar 0 referencias.

**Status:** ⏳ Pending