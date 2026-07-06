/**
 * Tipos del dominio de Inventario.
 *
 * `Inventory` es el documento completo (Inicial o Final) que se firma.
 * Por cada área hay un `InventoryArea` con sus items y fotos.
 * Las firmas (`Signature`) son PNGs en base64.
 * Las fotos (`InventoryPhoto`) también son base64 (dataURL) — guardamos
 *   como dataURL en IndexedDB para no depender de un backend.
 */

import type { PropertyType, ItemStatus } from './inventoryConfig';

export interface InventoryPhoto {
  id: string;
  areaId: string;             // id lógico del área
  areaLabel?: string;         // nombre legible del área (cocina, alcoba 2, etc.)
  dataUrl: string;            // base64
  caption?: string;
  takenAt: string;            // ISO
  /** Nombre "bautizado" para identificación en Drive y reportes */
  fileName?: string;          // ej: "cocina_01_cocina"
}

export interface InventoryItem {
  id: string;                 // id del ItemDef
  label: string;
  status: ItemStatus;
  notes?: string;
}

export interface InventoryArea {
  id: string;                 // id lógico (single-0, multi-alcoba-1, ...)
  category: string;           // alcoba, bano, cocina, ...
  label: string;              // "Alcoba 1"
  items: Record<string, InventoryItem>;
  photos: string[];           // ids de InventoryPhoto
  observations?: string;
}

export interface Signature {
  signerName: string;
  signerRole: 'arrendatario' | 'agente' | 'propietario';
  signerIdNumber?: string;
  /** Teléfono con WhatsApp del firmante — usado para enviar el PDF firmado */
  signerPhone?: string;
  /** Email del firmante — usado para enviar el PDF firmado */
  signerEmail?: string;
  /** Foto del firmante (comprimida) — aparece en el PDF al lado de la firma */
  signerPhotoDataUrl?: string;
  /** Nombre bautizado de la foto — ej: "Tatiana_Prieto_ARR_foto" */
  signerPhotoName?: string;
  /** Nombre bautizado de la firma — ej: "Tatiana_Prieto_ARR_firma" */
  signatureName?: string;
  dataUrl: string;            // PNG base64 de la firma
  signedAt: string;
}

export type InventoryPhase = 'inicial' | 'final';

export interface Inventory {
  id: string;
  propertyId: string;
  phase: InventoryPhase;
  propertyType: PropertyType;
  counters: Record<string, number>;
  areas: InventoryArea[];
  photos: InventoryPhoto[];
  signatures: Signature[];
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
  agentId?: string;
  agentName?: string;
  tenantId?: string;
  tenantName?: string;
  /** Áreas personalizadas agregadas por el usuario con el botón "Otros". */
  customAreas?: { id: string; label: string }[];
}
