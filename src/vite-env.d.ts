/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// FIX BUG-2026-08-05: flag global para que el handleFinalize del wizard
// comunique al modal de resumen que la persistencia de property_documents
// falló silenciosamente (server devolvió 200 pero ningún INSERT se ejecutó).
// Se setea en `server/routes/properties.ts` solo si document count es 0.
interface Window {
  __inmocontrol_docsPersistFailed?: boolean;
}
