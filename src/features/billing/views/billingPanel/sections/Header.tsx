// filepath: src/features/billing/views/billingPanel/sections/Header.tsx
/**
 * Header — header del BillingPanel con botón "Volver" + dirección + tenant.
 * Sale de BillingPanel.tsx como parte del refactor #12.
 */
import { ArrowLeft } from "lucide-react";
import { Button } from "../../../../../shared/ui";
import type { Property } from "../../../../../types";

export interface HeaderProps {
  property: Property;
  onBack: () => void;
}

export function Header({ property, onBack }: HeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver
      </Button>
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Facturación — {property.address}
        </h2>
        {property.ownerName && (
          <p className="text-xs text-slate-500">
            Propietario: {property.ownerName}
          </p>
        )}
      </div>
    </div>
  );
}
