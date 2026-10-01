// filepath: src/features/settings/tabs/IntegrationsTab.tsx
// Tab "Integraciones" de SettingsView.
//
// Lista de integraciones disponibles: Google Drive (interactivo), Email
// (interactivo, abre modal de configuración) y 3 placeholders (WhatsApp,
// PSE, Facturación Electrónica).
//
// fix-issue-09b (oct-2026): extraída del monolito SettingsView.tsx (805 → <600).
// Antes vivía inline como `{activeSubTab === "integrations" && ...}` en
// SettingsView.tsx líneas 653-732.

import { motion } from "motion/react";
import { Globe } from "lucide-react";
import { Button, Card } from "../../../shared/ui";
import { GoogleDriveIntegration } from "../GoogleDriveIntegration";
import { EmailIntegrationsCard } from "../integrations/EmailIntegrationsCard";

type IntegrationPlaceholder = {
  name: string;
  desc: string;
  status: "Conectado" | "En Proceso" | "Sin configurar";
  icon: string;
};

const PLACEHOLDERS: ReadonlyArray<IntegrationPlaceholder> = [
  {
    name: "WhatsApp Business",
    desc: "Envío de alertas automáticas vía WhatsApp.",
    status: "Conectado",
    icon: "📱",
  },
  {
    name: "PSE / Pagos",
    desc: "Recaudo de arriendos en línea.",
    status: "Conectado",
    icon: "💰",
  },
  {
    name: "Facturación Electrónica",
    desc: "Emisión automática de facturas DIAN.",
    status: "En Proceso",
    icon: "📄",
  },
] as const;

export function IntegrationsTab({
  setSelectedIntegration,
  showToast,
}: {
  setSelectedIntegration: (integration: IntegrationPlaceholder) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  return (
    <motion.div
      key="integrations"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      <Card className="p-6">
        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-600" />
          Integraciones
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {/* ── Google Drive — componente interactivo ── */}
          <GoogleDriveIntegration showToast={showToast} />

          {/* ── Email — componente interactivo (Fase 7) ── */}
          <EmailIntegrationsCard
            onConfigure={() =>
              setSelectedIntegration({
                name: "Email",
                desc: "Envío de alertas automáticas vía correo electrónico. Configura buzones por propósito: cobros, contratos, alertas, etc.",
                status: "Sin configurar",
                icon: "📧",
              })
            }
          />

          {/* ── Resto de integraciones (placeholder) ── */}
          {PLACEHOLDERS.map((int, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-xl shadow-sm">
                  {int.icon}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {int.name}
                  </h4>
                  <p className="text-xs text-slate-500">{int.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    int.status === "Conectado"
                      ? "bg-emerald-100 text-emerald-600"
                      : int.status === "En Proceso"
                        ? "bg-amber-100 text-amber-600"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {int.status.toUpperCase()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIntegration(int)}
                >
                  Configurar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
