// filepath: src/features/properties/components/signatureStep/validators.ts
// ─── Validaciones para Colombia ─────────────────────────────────────────
// Cédula: solo dígitos, 6-15 chars (cubre CC 6-10, CE hasta 15, NIT 9+DV).
// Teléfono: 10 dígitos, empieza con 3 (celular colombiano usado en WhatsApp).
// Email: formato estándar. Nombre: requerido, mínimo 3 chars reales.

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(v: string): string | undefined {
  const t = v.trim();
  if (!t) return 'Nombre obligatorio';
  if (t.length < 3) return 'Mínimo 3 caracteres';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(t)) return 'Debe incluir letras';
  return undefined;
}

export function validateIdNumber(v: string): string | undefined {
  const digits = v.replace(/\D/g, '');
  if (!digits) return 'Cédula obligatoria';
  if (digits.length < 6) return 'Mínimo 6 dígitos';
  if (digits.length > 15) return 'Máximo 15 dígitos';
  return undefined;
}

export function validatePhone(v: string): string | undefined {
  const digits = v.replace(/\D/g, '');
  if (!digits) return 'Teléfono obligatorio';
  if (digits.length !== 10) return 'Debe tener 10 dígitos';
  if (!digits.startsWith('3')) return 'Celular colombiano debe empezar con 3';
  return undefined;
}

export function validateEmail(v: string): string | undefined {
  const t = v.trim();
  if (!t) return 'Correo obligatorio';
  if (!RE_EMAIL.test(t)) return 'Formato de correo inválido';
  return undefined;
}
