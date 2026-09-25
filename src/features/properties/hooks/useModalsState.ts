/**
 * useModalsState — agrupa TODO el state de modales que vivía inline en
 * `PropertiesView.tsx`. El shell solo necesita desestructure y pasar
 * props a los componentes modal.
 *
 * Spec #5c Commit 1: refactor `PropertiesView.tsx` <500 lineas.
 * Mantener 1:1 el shape del state (los componentes modal ya esperan
 * este shape via props).
 *
 * No incluye:
 * - Wizard state (wizardFiles, wizardInventory, etc.) — eso vive en
 *   `PropertyWizard.tsx` despues del Commit 7.
 * - File input refs — eso queda en el shell (refs no van en hooks
 *   de state).
 */

import { useState } from 'react';
import type { FinalizeSummary } from '../utils/finalizeSummary';
import type { Inventory } from '../inventoryTypes';

export interface PhotoGalleryItem {
  id: string;
  areaId: string;
  areaLabel: string;
  dataUrl: string;
  phase: 'inicial' | 'final';
}

export function useModalsState() {
  // Modal: detalle del inmueble.
  const [viewingProperty, setViewingProperty] = useState<any | null>(null);

  // Modal: visor de documento (Drive o blob).
  const [viewingDoc, setViewingDoc] = useState<{
    label: string;
    url: string;
  } | null>(null);

  // Modal: inventario inicial/final.
  const [inventoryModalProperty, setInventoryModalProperty] =
    useState<any | null>(null);
  const [inventoryPhase, setInventoryPhase] = useState<
    'inicial' | 'final' | null
  >(null);
  const [baseInventory, setBaseInventory] = useState<Inventory | null>(null);

  // Modal: comparativa inicial vs final.
  const [comparingProperty, setComparingProperty] = useState<any | null>(null);

  // Modal: confirmar descarte del draft del wizard.
  const [confirmDiscardDraft, setConfirmDiscardDraft] = useState(false);

  // Modal: confirmacion de borrado de propiedad.
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Modal: upload de mandato + upload de doc legal (en el detalle).
  const [uploadingMandatoPropertyId, setUploadingMandatoPropertyId] = useState<
    string | null
  >(null);
  const [uploadingDocPropertyId, setUploadingDocPropertyId] = useState<
    string | null
  >(null);

  // Estado auxiliar del detalle: cuando hay un refetch en background.
  const [detailRefreshing, setDetailRefreshing] = useState(false);

  // Resumen estructurado del wizard (modal post-finalizar).
  const [finalizeSummary, setFinalizeSummary] =
    useState<FinalizeSummary | null>(null);

  // Modal: galeria de fotos del inventario.
  const [photoGallery, setPhotoGallery] = useState<{
    propertyId: string;
    address: string;
    photos: PhotoGalleryItem[];
  } | null>(null);
  const [photoGalleryLoading, setPhotoGalleryLoading] = useState(false);

  return {
    // Detalle del inmueble
    viewingProperty,
    setViewingProperty,
    // Doc viewer
    viewingDoc,
    setViewingDoc,
    // Inventario modal
    inventoryModalProperty,
    setInventoryModalProperty,
    inventoryPhase,
    setInventoryPhase,
    baseInventory,
    setBaseInventory,
    // Comparativa
    comparingProperty,
    setComparingProperty,
    // Discard draft
    confirmDiscardDraft,
    setConfirmDiscardDraft,
    // Delete confirm
    pendingDelete,
    setPendingDelete,
    deleting,
    setDeleting,
    // Uploads en detalle
    uploadingMandatoPropertyId,
    setUploadingMandatoPropertyId,
    uploadingDocPropertyId,
    setUploadingDocPropertyId,
    detailRefreshing,
    setDetailRefreshing,
    // Finalize summary
    finalizeSummary,
    setFinalizeSummary,
    // Photo gallery
    photoGallery,
    setPhotoGallery,
    photoGalleryLoading,
    setPhotoGalleryLoading,
  };
}

export type ModalsState = ReturnType<typeof useModalsState>;