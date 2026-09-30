/**
 * SignupScreen - Pantalla de sign-up publico (saas_signup.md).
 *
 * Llama POST /api/saas-billing/signup con email, password y organizationName.
 * Si OK, el server setea la cookie httpOnly y devuelve el user. El padre
 * se encarga de pasar al Dashboard.
 *
 * El diseno es paralelo a LoginScreen para que el usuario sienta que es
 * "el mismo sistema" solo del otro lado de la puerta.
 */
import { useState } from "react";
import type * as React from "react";
import { Building2, Shield, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button, Card, Input } from "../../shared/ui";

export interface SignupScreenProps {
  /**
   * Llamado cuando el signup es exitoso. El padre se encarga de pasar al
   * Dashboard con el user que devuelve el server.
   */
  onSignup: (user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    organizationId: string;
  }) => void;
  /**
   * Llamado cuando el user clickea "Ya tengo cuenta" para volver al login.
   */
  onGoToLogin: () => void;
}

interface FieldErrors {
  email?: string;
  password?: string;
  organizationName?: string;
}

export function SignupScreen({ onSignup, onGoToLogin }: SignupScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Validacion cliente (mismas reglas que el server).
    const newErrors: FieldErrors = {};
    if (!email.trim()) {
      newErrors.email = "Ingresa tu email";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "El email no tiene formato valido";
    }
    if (!password) {
      newErrors.password = "Ingresa una contrasena";
    } else if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      newErrors.password =
        "La contrasena debe tener al menos 8 caracteres, 1 letra y 1 numero.";
    }
    if (!organizationName.trim()) {
      newErrors.organizationName = "Ingresa el nombre de tu inmobiliaria";
    } else if (organizationName.trim().length < 3) {
      newErrors.organizationName = "Minimo 3 caracteres";
    } else if (organizationName.trim().length > 100) {
      newErrors.organizationName = "Maximo 100 caracteres";
    }
    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/saas-billing/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          organizationName: organizationName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Mapeo de codes a mensajes amigables. El server devuelve
        // mensajes ya localizables; los usamos directamente cuando
        // son utiles, sino mostramos un fallback generico.
        const friendly: Record<string, string> = {
          INVALID_EMAIL: "El email no tiene formato valido.",
          WEAK_PASSWORD:
            "La contrasena debe tener al menos 8 caracteres, 1 letra y 1 numero.",
          INVALID_ORG_NAME:
            "El nombre de la organizacion debe tener entre 3 y 100 caracteres.",
          MISSING_REQUIRED_FIELDS: "Completa todos los campos.",
          EMAIL_TAKEN:
            "Ya existe una cuenta con ese email. Inicia sesion o usa otro email.",
          ALREADY_AUTHENTICATED:
            "Ya tenes una cuenta activa. Cierra sesion primero.",
          RATE_LIMIT_EXCEEDED:
            "Demasiados intentos. Espera 15 minutos y volve a intentar.",
          DB_UNAVAILABLE:
            "Error de servidor. Reintenta en unos minutos.",
          NO_TRIAL_PLAN:
            "El sistema no esta listo para nuevos registros. Contactanos.",
        };
        const msg =
          (data.code && friendly[data.code]) || data.error || "Error creando la cuenta.";
        setError(msg);
        return;
      }

      const data = await res.json();
      onSignup(data.user);
    } catch (err) {
      console.error("[SignupScreen] error:", err);
      setError("Error de conexion. Verifica que el backend este corriendo.");
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
          <h1 className="text-3xl font-bold text-white">Crear cuenta</h1>
          <p className="text-slate-400">
            Proba InmoControl gratis durante 14 dias
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Nombre de la inmobiliaria
            </label>
            <Input
              type="text"
              autoComplete="organization"
              placeholder="Inmobiliaria Los Pinos"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              disabled={submitting}
              required
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            />
            {fieldErrors.organizationName && (
              <p className="text-xs text-red-400 mt-1">
                {fieldErrors.organizationName}
              </p>
            )}
          </div>

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
            {fieldErrors.email && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Contrasena
            </label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Minimo 8 caracteres, 1 letra y 1 numero"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            />
            {fieldErrors.password && (
              <p className="text-xs text-red-400 mt-1">
                {fieldErrors.password}
              </p>
            )}
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
                Creando cuenta...
              </>
            ) : (
              <>Crear cuenta gratis</>
            )}
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-800 space-y-3">
          <button
            type="button"
            onClick={onGoToLogin}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Ya tengo cuenta
          </button>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold text-center">
            Acceso Seguro - Sesion 12h
          </p>
          <div className="flex justify-center gap-4">
            <div className="flex flex-col items-center gap-1 opacity-50">
              <Shield className="w-4 h-4 text-slate-400" />
              <span className="text-[8px] text-slate-500 font-bold uppercase">
                Bcrypt
              </span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50">
              <Shield className="w-4 h-4 text-slate-400" />
              <span className="text-[8px] text-slate-500 font-bold uppercase">
                httpOnly cookie
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
