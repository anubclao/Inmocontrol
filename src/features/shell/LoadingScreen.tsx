/**
 * Componente de carga inicial: spinner mientras hidratan los stores de localStorage.
 */
export function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm font-medium">Cargando InmoControl...</p>
      </div>
    </div>
  );
}
