import { useState } from 'react';
import { Building2, Shield, Loader2, AlertCircle } from 'lucide-react';
import { Button, Card, Input } from '../../shared/ui';

export interface LoginScreenProps {
  /**
   * Se llama con el user object cuando el login es exitoso.
   * El padre se encarga de pasar al Dashboard.
   */
  onLogin: (user: { id: string; email: string; displayName: string; role: string; organizationId: string }) => void;
}

/**
 * Pantalla de login del piloto InmoControl.
 *
 * Llama POST /api/auth/login. Si OK, el server setea cookie httpOnly
 * `inmocontrol_pilot_session` con el sessionId y devuelve el user.
 * El browser manda la cookie automáticamente en cada request subsecuente.
 *
 * Migrada desde el demo "Acceder al Sistema" (sin auth) a auth real con
 * bcrypt + sesión de 12 horas. Cuando se migre a SaaS multi-tenant, esta
 * pantalla se reemplaza por OAuth Google.
 */
export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Ingresa email y contraseña');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include',  // necesario para que el browser mande/acepte la cookie
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Mensaje genérico — el server no distingue entre "email no existe"
        // y "password incorrecto" para evitar enumeración de usuarios.
        setError(data.error ?? 'Credenciales inválidas');
        return;
      }

      const data = await res.json();
      onLogin(data.user);
    } catch (err) {
      console.error('[LoginScreen] error:', err);
      setError('Error de conexión. Verifica que el backend esté corriendo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-900 p-6">
      <Card className="max-w-md w-full p-10 space-y-8 bg-slate-800 border-slate-700">
        <div className="space-y-2 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-900/20">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">InmoControl</h1>
          <p className="text-slate-400">Gestión Inmobiliaria Profesional</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Email
            </label>
            <Input
              type="email"
              autoComplete="email"
              placeholder="admin@tuempresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Contraseña
            </label>
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full py-5 text-base gap-2"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validando…
              </>
            ) : (
              <>Acceder al Sistema</>
            )}
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-800">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-4 text-center">
            Acceso Seguro · Sesión 12h
          </p>
          <div className="flex justify-center gap-4">
            <div className="flex flex-col items-center gap-1 opacity-50">
              <Shield className="w-4 h-4 text-slate-400" />
              <span className="text-[8px] text-slate-500 font-bold uppercase">Bcrypt</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50">
              <Shield className="w-4 h-4 text-slate-400" />
              <span className="text-[8px] text-slate-500 font-bold uppercase">httpOnly cookie</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}