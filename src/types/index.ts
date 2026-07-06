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
