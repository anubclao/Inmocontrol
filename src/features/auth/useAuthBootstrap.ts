/**
 * useAuthBootstrap — encapsula los 3 useEffect de auth + data layer
 * que estaban inline en App.tsx.
 *
 * 1. Hidratación inicial + check Drive status.
 * 2. Restore sesión vía /api/auth/me (cookie httpOnly).
 * 3. Re-hidratación post-login (cuando `user` pasa de null → !null).
 *
 * DEVUELVE `loading` que App usa para mostrar LoadingScreen solo en
 * el primer render.
 */
import { useEffect, useState } from "react";
import { useAuthStore } from "../../shared/store/authStore";
import { useAppStore } from "../../shared/store/appStore";
import { useGoogleDriveStore } from "../../shared/store/googleDriveStore";
// fix-issue-28: apiRequest reemplaza fetch() directo. Timeout 15s, parse
// JSON uniforme, ApiError tipado con status/code/body.
import { apiRequest, ApiError } from "../../shared/lib/apiClient";
import type { Role } from "../auth/permissions";

// FIX 2026-09-25: ya NO inyectamos un DEFAULT_USER fake. Si no hay sesión
// persistida Y /api/auth/me responde 401, el user queda en null y la app
// muestra la pantalla de login. Antes, este DEFAULT_USER mentía al usuario
// ("Sistema Online") mientras el backend rechazaba todo con 401, causando
// una contradicción visible entre la UI y el server.
// FIX 2026-09-26: el primer useEffect que wipeaba TODO el localStorage en
// cada mount era destructivo (borraba properties, tenants, wizard drafts
// además de user). El fix real es limpiar SOLO el state de auth cuando
// /api/auth/me responde 401 (3er useEffect, sin cambios). El store de
// Zustand (`inmocontrol:auth:v1`) ya tiene su propia clave persistente
// y la cookie httpOnly del server mantiene la sesión.
// El seed del piloto sigue funcionando: el admin@inmocontrol.local puede
// loguearse via /api/auth/login y la cookie httpOnly se persiste.

export function useAuthBootstrap() {
  const [loading, setLoading] = useState(true);
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);

  // Loading inicial. No tocamos localStorage — el store de Zustand se
  // rehidrata solo desde `inmocontrol:auth:v1`, y la cookie httpOnly
  // mantiene la sesión real contra el server.
  useEffect(() => {
    setLoading(false);
  }, []);

  // Re-hidratar cuando el user pasa de null → !null (post-login).
  useEffect(() => {
    if (user) {
      void useAppStore.getState().hydrate();
      void useGoogleDriveStore.getState().checkStatus();
    }
  }, [user]);

  // Restore sesión via cookie httpOnly si no hay user persistido.
  // FIX 2026-09-25: si el server responde 401, llamar clear() para
  // sincronizar el state con la realidad. Antes, el silencio dejaba
  // un user fake en localStorage y la UI mentía ("Sistema Online").
  // fix-issue-28: apiRequest en vez de fetch directo. El ApiError tiene
  // status/code/body. Si status=401, es el caso "sesion expirada" — clear.
  useEffect(() => {
    if (user) return; // ya hay user, no llamar al server
    interface AuthMeResponse {
      user: { id: string; displayName: string; email: string; role: string };
    }
    apiRequest<AuthMeResponse>("GET", "/api/auth/me")
      .then((data) => {
        setUser({
          uid: data.user.id,
          displayName: data.user.displayName,
          email: data.user.email,
          role: data.user.role as Role,
        });
      })
      .catch((err: unknown) => {
        // Cualquier error (401, network, timeout) = no autenticado.
        // ApiError.status === 401 es el caso "sesion expirada" — es
        // esperado y silencioso. Otros errores (NETWORK_ERROR,
        // TIMEOUT) tambien deben limpiar el state para que la UI
        // muestre el login en vez de mentir con un user fake.
        if (err instanceof ApiError && err.status === 401) {
          // Sesion expirada — caso normal, no loguear.
        } else {
          console.warn("[useAuthBootstrap] /api/auth/me fallo:", err);
        }
        useAuthStore.getState().clear();
      });
    // setUser es estable; ejecutamos solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading };
}
