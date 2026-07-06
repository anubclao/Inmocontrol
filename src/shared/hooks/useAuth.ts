/**
 * Hook de auth — placeholder.
 *
 * En esta versión InmoControl opera en modo demo (localStorage puro).
 * Si en el futuro se integra un auth real (Supabase, Auth0, etc.),
 * este hook es el punto a reescribir. La forma sugerida:
 *
 *   const { user, signIn, signOut } = useAuth();
 *   user: { id, email, displayName, role, organizationId } | null
 *
 * Hoy App.tsx maneja user/role directamente desde localStorage,
 * así que este archivo queda como stub.
 */
export {};
