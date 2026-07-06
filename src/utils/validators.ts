/**
 * Address Validator (Secretaría del Hábitat)
 * Transforms common address words into official abbreviations.
 */
export const formatAddress = (address: string): string => {
  const abbreviations: Record<string, string> = {
    'calle': 'CL',
    'cll': 'CL',
    'carrera': 'KR',
    'cra': 'KR',
    'diagonal': 'DG',
    'diag': 'DG',
    'avenida': 'AV',
    'ave': 'AV',
    'avenida calle': 'AC',
    'av calle': 'AC',
    'avenida carrera': 'AK',
    'av carrera': 'AK',
    'apartamento': 'AP',
    'apto': 'AP',
    'transversal': 'TV',
    'trans': 'TV',
    'torre': 'T',
    'bloque': 'B',
    'interior': 'INT',
    'piso': 'P',
    'casa': 'CS',
    'local': 'LC',
    'oficina': 'OF',
    'deposito': 'DP',
    'garaje': 'GR',
    'parqueadero': 'PQ',
    'sotano': 'ST',
    'mezzanine': 'MN',
    'manzana': 'MZ',
    'lote': 'LT',
    'autopista': 'AU',
    'via': 'VI',
    'circular': 'CQ',
  };

  let formatted = address.toLowerCase();
  
  // Sort keys by length descending to match longer phrases first
  const sortedKeys = Object.keys(abbreviations).sort((a, b) => b.length - a.length);

  sortedKeys.forEach((full) => {
    const abbr = abbreviations[full];
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    formatted = formatted.replace(regex, abbr);
  });

  return formatted.toUpperCase();
};

/**
 * CHIP Validator
 * Uppercase, no spaces.
 */
export const formatCHIP = (chip: string): string => {
  return chip.replace(/\s+/g, '').toUpperCase();
};

/**
 * CHIP Validation (Bogotá Standard)
 * Starts with AAA, usually 11 characters.
 */
export const isValidCHIP = (chip: string): boolean => {
  const regex = /^AAA[A-Z0-9]{7,8}$/;
  return regex.test(chip);
};

/**
 * ID Number Formatter (Cédula/NIT)
 * Adds dots for thousands.
 */
export const formatIdNumber = (id: unknown): string => {
  const raw = typeof id === 'string' ? id : String(id ?? '');
  const clean = raw.replace(/[^0-9]/g, '');
  if (!clean) return '';
  return new Intl.NumberFormat('es-CO').format(parseInt(clean));
};

/**
 * Tenant Name Formatter
 * Uppercase.
 */
export const formatTenantName = (name: unknown): string => {
  return String(name ?? '').toUpperCase();
};

/**
 * Date Formatter
 * Standard: dd/mm/yy
 */
export const formatDate = (date: Date): string => {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear().toString().slice(-2);
  return `${d}/${m}/${y}`;
};

// ─── Validation helpers (formularios de Configuración) ────────────

/** Required field: not empty after trim. */
export const isNonEmpty = (value: unknown): boolean => {
  return String(value ?? '').trim().length > 0;
};

/** Minimal email regex — suficiente para validación client-side. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (value: unknown): boolean => {
  return EMAIL_RE.test(String(value ?? '').trim());
};

/**
 * Colombian phone.
 * Acepta: `+57 300 123 4567`, `+573001234567`, `573001234567`, `3001234567`
 * (10 dígitos, opcional prefijo país 57).
 */
export const isValidColombianPhone = (value: unknown): boolean => {
  const cleaned = String(value ?? '').replace(/[\s\-()]/g, '');
  return /^(\+?57)?3\d{9}$/.test(cleaned);
};

/**
 * Auto-formatea un NIT colombiano como `XXX.XXX.XXX-D`.
 * Tolera cualquier entrada y solo deja pasar dígitos. Si llega con
 * separadores, los reemplaza (idempotente).
 */
export const formatNITColombian = (raw: unknown): string => {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '').slice(0, 15);
  if (!digits) return '';
  const main = digits.slice(0, 9);
  const check = digits.slice(9);
  const grouped = main.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return check ? `${grouped}-${check}` : grouped;
};

/** NIT válido: 9-15 dígitos (sin contar separadores). */
export const isValidNIT = (raw: unknown): boolean => {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '');
  return digits.length >= 9 && digits.length <= 15;
};

/**
 * URL: acepta `https://…`, `http://…`, con o sin `www.`,
 * o dominio bare `www.ejemplo.com`. Vacío = válido (campo opcional).
 */
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;
export const isValidURL = (raw: unknown): boolean => {
  const v = String(raw ?? '').trim();
  if (!v) return true;
  return URL_RE.test(v);
};

/**
 * Reglas de fuerza de contraseña.
 * Devuelve un array de mensajes; vacío = OK.
 * Reglas: mínimo 8 caracteres, al menos una letra y un número.
 */
export const passwordIssues = (raw: unknown): string[] => {
  const v = String(raw ?? '');
  const issues: string[] = [];
  if (v.length < 8) issues.push('Mínimo 8 caracteres');
  if (!/[A-Za-z]/.test(v)) issues.push('Debe incluir al menos una letra');
  if (!/\d/.test(v)) issues.push('Debe incluir al menos un número');
  return issues;
};
