/**
 * Propietario de una propiedad (migración 010+).
 * Una propiedad puede tener N propietarios, cada uno con su % de participación.
 * El Contrato de Mandato sigue siendo 1 PDF multi-firmado por todos (no se
 * desglosa por dueño — vive en `Property.mandatePdfUrl`).
 */
export interface PropertyOwner {
  id: string;
  name: string;
  idNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Porcentaje de participación (0.00 - 100.00). `null` = sin definir. */
  ownershipPct?: number | null;
  position: number;
  notes?: string | null;
  /** Documentos legales del dueño. Solo CC y RUT — el Predial es por propiedad. */
  documents?: {
    cedula?: string;
    rut?: string;
  };
}

/**
 * Unidad adicional de una propiedad (migración 010+): garaje, depósito, etc.
 * NO se crea fila para la unidad principal: la principal ES la propiedad
 * misma y sus docs (Certificado de Tradición) tienen `unitId = null` en
 * el backend.
 */
export type PropertyUnitType = 'parking' | 'storage' | 'other';

export interface PropertyUnit {
  id: string;
  type: PropertyUnitType;
  label: string; // "Garaje 12", "Depósito 3B"
  folioMatricula?: string | null;
  areaM2?: number | null;
  notes?: string | null;
  position: number;
  /** Documentos de la unidad. Solo Certificado de Tradición por ahora. */
  documents?: {
    certificado_tradicion?: string;
  };
}

export interface Owner {
  id: string;
  name: string;
  documentId: string;
  email: string;
  phone: string;
  bankAccount: string;
}

export interface Tenant {
  id: string;
  name: string;
  idNumber: string;
  email?: string;
  phone?: string;
  propertyId: string;
  rent: number;
  adminFee?: number;
  status: 'Activo' | 'Inactivo';
  leaseStartDate: string;
  documents?: string[];
  tenantDriveFolderId?: string | null;
}

export interface Property {
  id: string;
  address: string;
  chip: string;
  folio: string;
  ownerId: string;
  /**
   * LEGACY: alias de `ownerName`. El código viejo usaba `.owner`, el nuevo
   * prefiere `.ownerName` (consistente con el resto del modelo). Mantenemos
   * `owner` como opcional y deprecado para no romper componentes que aún
   * lo referencian. Si en el futuro queremos eliminarlo, hay que migrar
   * las refs en `shared/store/appStore.ts:239-266` y en
   * `features/contracts/ContractsView.tsx:65`.
   * @deprecated Usar `ownerName`.
   */
  owner?: string;
  status: 'available' | 'rented' | 'maintenance' | 'Pendiente' | 'Activo' | 'En Colocación' | 'Arrendado' | 'Inactivo';

  /**
   * URL (Drive o blob:) del PDF firmado del Contrato de Mandato subido por el
   * agente al registrar la propiedad. Cuando es null, el inmueble aún no
   * cuenta con mandato firmado y su estado no puede pasar a Activo al 100%.
   */
  mandatePdfUrl?: string | null;
  /** ISO timestamp del momento en que se subió el PDF firmado del mandato. */
  mandateSignedAt?: string | null;
  /** ID de la carpeta de esta propiedad en Google Drive del usuario (creada al registrar). */
  driveFolderId?: string | null;
  /** Fecha de creación de la propiedad (ISO). */
  createdAt?: string;

  // ─── Datos del propietario (opcionales, vienen del form de captación) ──
  // El form `PropertiesView` los guarda en el estado local + Zustand, pero
  // el tipo Property original solo declaraba `ownerId` (FK a un Owner entity
  // que casi nunca se usa). Estos campos opcionales son los que realmente
  // llegan del form y se persisten al backend vía /api/entities/sync.
  ownerName?: string;
  ownerIdNumber?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  propertyType?: string;
  /** Path legible de la carpeta Drive (ej: "Mi unidad / InmoControl / Calle 123"). */
  driveFolderPath?: string;
  /** URL del PDF firmado del Inventario de Captación. */
  inventoryPdfUrl?: string;

  // ── Migración 010+ ────────────────────────────────────────────────
  /** N propietarios de esta propiedad (reemplaza el legacy `ownerName`). */
  owners?: PropertyOwner[];
  /** N unidades adicionales: garaje, depósito, etc. */
  units?: PropertyUnit[];
  /**
   * Documentos a nivel de PROPIEDAD (no de un owner/unit específico):
   *   - `predial`: 1 por propiedad (impuesto al bien, no al dueño)
   *   - `certificado_tradicion`: Certificado de la unidad principal
   * Los Certificados de unidades adicionales viven en `units[i].documents.certificado_tradicion`.
   * Las CCs y RUTs de cada propietario viven en `owners[i].documents`.
   */
  documents_property?: {
    predial?: string;
    certificado_tradicion?: string;
  };
}

export interface Contract {
  id: string;
  propertyId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  adminFee: number;
  commissionPercentage: number;
  insurancePercentage: number;
}

export interface Transaction {
  id: string;
  contractId: string;
  date: string;
  type: 'income' | 'expense';
  category: 'rent' | 'admin_ph' | 'maintenance' | 'services' | 'tax' | 'bank_fee' | 'commission' | 'insurance';
  description: string;
  amount: number;
  attachmentUrl?: string;
}

export interface FinancialSummary {
  totalIncome: number;
  fixedDiscounts: number;
  bankDiscounts: number;
  otherDiscounts: number;
  pendingBalance: number;
}
