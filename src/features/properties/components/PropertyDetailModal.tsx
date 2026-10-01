/**
 * PropertyDetailModal — popup "Detalle del Inmueble" con propietarios,
 * unidades, documentos, contratos, inventario, galería y mandato.
 *
 * Refactor #14: las 6 secciones se extrajeron a `detailModal/`. El componente
 * principal queda como shell que pasa props y compone las secciones.
 */

import { Modal } from "../../../shared/ui";
import { HeaderSection } from "./detailModal/HeaderSection";
import { OwnersSection } from "./detailModal/OwnersSection";
import { UnitsSection } from "./detailModal/UnitsSection";
import { PropertyDocsSection } from "./detailModal/PropertyDocsSection";
import { ContractsSection } from "./detailModal/ContractsSection";
import { InventoryActionsSection } from "./detailModal/InventoryActionsSection";

export interface PropertyDetailModalProps {
  isOpen: boolean;
  viewingProperty: any | null;
  onClose: () => void;
  onLocalUpdate: (updated: any) => void;
  onUpdateProperty: (id: string, patch: any) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
  onViewDoc: (label: string, url: string) => void;
  triggerDetailDocUpload: (
    propertyId: string,
    slotKey: string,
  ) => Promise<void> | void;
  triggerUnitDocUpload: (
    propertyId: string,
    unitId: string,
  ) => Promise<void> | void;
  triggerPropertyDocUpload: (
    propertyId: string,
    slotKey: "predial" | "certificado_tradicion:main",
  ) => Promise<void> | void;
  triggerMandatoUpload: (propertyId: string) => Promise<void> | void;
  handleDownloadMandato: (property: any) => Promise<void>;
  onOpenInventory: (property: any, phase: "inicial" | "final") => void;
  openPhotoGallery: (
    property: any,
    phase: "inicial" | "final",
  ) => Promise<void> | void;
  photoGalleryLoading: boolean;
  onCompareInventories: (property: any) => void;
  detailRefreshing: boolean;
  contracts: any[];
}

export function PropertyDetailModal({
  isOpen,
  viewingProperty,
  onClose,
  onLocalUpdate,
  onUpdateProperty,
  showToast,
  onViewDoc,
  triggerDetailDocUpload,
  triggerUnitDocUpload,
  triggerPropertyDocUpload,
  triggerMandatoUpload,
  handleDownloadMandato,
  onOpenInventory,
  openPhotoGallery,
  photoGalleryLoading,
  onCompareInventories,
  detailRefreshing,
  contracts,
}: PropertyDetailModalProps) {
  if (!viewingProperty) return null;

  const hasActiveContract = contracts.some(
    (c: any) => c.propertyId === viewingProperty?.id && c.status === "active",
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle del Inmueble">
      <div className="space-y-6">
        <HeaderSection
          property={viewingProperty}
          hasActiveContract={hasActiveContract}
          onUpdateProperty={onUpdateProperty}
          onLocalUpdate={onLocalUpdate}
          showToast={showToast}
        />

        <OwnersSection
          property={viewingProperty}
          onViewDoc={onViewDoc}
          triggerDetailDocUpload={triggerDetailDocUpload}
        />

        <UnitsSection
          property={viewingProperty}
          onViewDoc={onViewDoc}
          triggerUnitDocUpload={triggerUnitDocUpload}
        />

        <PropertyDocsSection
          property={viewingProperty}
          onViewDoc={onViewDoc}
          triggerPropertyDocUpload={triggerPropertyDocUpload}
        />

        <ContractsSection
          property={viewingProperty}
          onViewDoc={onViewDoc}
          triggerMandatoUpload={triggerMandatoUpload}
          handleDownloadMandato={handleDownloadMandato}
        />

        <InventoryActionsSection
          property={viewingProperty}
          onOpenInventory={onOpenInventory}
          openPhotoGallery={openPhotoGallery}
          photoGalleryLoading={photoGalleryLoading}
          onCompareInventories={onCompareInventories}
          detailRefreshing={detailRefreshing}
          onRefresh={() => {
            /* El shell padre expone esto via ref. Simplificado: onLocalUpdate
               no es el refresh, lo es la prop detailRefreshing + el botón
               "Actualizar" interno. La prop onRefresh queda para futuro. */
          }}
        />
      </div>
    </Modal>
  );
}
