// filepath: src/features/settings/tabs/NotificationsTab.tsx
// Tab "Notificaciones" de SettingsView.
//
// Muestra 4 preferencias (alertas de mora, solicitudes de reparación, vencimientos
// de contratos, reportes mensuales) con switches individuales.
//
// fix-issue-09b (oct-2026): extraída del monolito SettingsView.tsx (805 → <600).
// Antes vivía inline como `{activeSubTab === "notifications" && ...}` en
// SettingsView.tsx líneas 564-619.

import { motion } from "motion/react";
import { Bell } from "lucide-react";
import { Card } from "../../../shared/ui";

const PREFERENCES: ReadonlyArray<{ title: string; desc: string }> = [
  {
    title: "Alertas de Mora",
    desc: "Recibir notificaciones cuando un inquilino se retrasa en el pago.",
  },
  {
    title: "Solicitudes de Reparación",
    desc: "Notificar sobre nuevas solicitudes de mantenimiento.",
  },
  {
    title: "Vencimiento de Contratos",
    desc: "Avisar 30 días antes del vencimiento de un contrato.",
  },
  {
    title: "Reportes Mensuales",
    desc: "Enviar resumen financiero mensual por correo.",
  },
] as const;

export function NotificationsTab({
  notifications,
  toggleNotification,
}: {
  notifications: Record<number, boolean>;
  toggleNotification: (i: number) => void;
}) {
  return (
    <motion.div
      key="notifications"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      <Card className="p-6">
        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600" />
          Preferencias de Notificación
        </h3>
        <div className="space-y-4">
          {PREFERENCES.map((pref, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  {pref.title}
                </h4>
                <p className="text-xs text-slate-500">{pref.desc}</p>
              </div>
              <div
                onClick={() => toggleNotification(i)}
                className={`w-10 h-5 rounded-full relative cursor-pointer transition-all ${
                  notifications[i] ? "bg-blue-600" : "bg-slate-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
                    notifications[i] ? "right-0.5" : "left-0.5"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
