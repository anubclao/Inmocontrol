// filepath: src/features/settings/tabs/BillingTab.tsx
// Tab "Facturación y Plan" de SettingsView.
//
// Wrapper que muestra el header + botón "Administrar planes" y delega el
// render del contenido al componente `SaasBillingView` (Fase 8).
//
// fix-issue-09b (oct-2026): extraída del monolito SettingsView.tsx (805 → <600).
// Antes vivía inline como `{activeSubTab === "billing" && ...}` en
// SettingsView.tsx líneas 620-652.

import { motion } from "motion/react";
import { CreditCard } from "lucide-react";
import { Button } from "../../../shared/ui";
import { SaasBillingView } from "../../saasBilling/SaasBillingView";

export function BillingTab({
  setPlanAdminOpen,
  showToast,
}: {
  setPlanAdminOpen: (open: boolean) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  return (
    <motion.div
      key="billing"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Facturación y Plan
            </h3>
            <p className="text-xs text-slate-500">
              Tu subscripción al SaaS InmoControl. Planes, métodos de pago y
              facturas.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlanAdminOpen(true)}
            className="gap-1"
          >
            <CreditCard className="w-3.5 h-3.5" /> Administrar planes
          </Button>
        </div>
        <SaasBillingView showToast={showToast} />
      </div>
    </motion.div>
  );
}
