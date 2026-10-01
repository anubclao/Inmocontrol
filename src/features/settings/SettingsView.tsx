import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  User,
  Building2,
  Shield,
  Bell,
  CreditCard,
  Globe,
  LogOut,
  Plus,
  CheckCircle,
  FolderOpen,
  Unlink,
  Loader2,
  Mail,
  Trash2,
} from "lucide-react";
import { Button, Card, Input, Modal } from "../../shared/ui";
import {
  formatAddress,
  isNonEmpty,
  isValidEmail,
  isValidColombianPhone,
  formatNITColombian,
  isValidNIT,
  isValidURL,
  passwordIssues,
} from "../../utils/validators";
import { useSettingsStore } from "../../shared/store/settingsStore";
import { useGoogleDriveStore } from "../../shared/store/googleDriveStore";
import { compressImage } from "../properties/imageCompress";
import { GoogleDriveIntegration } from "./GoogleDriveIntegration";
import { WhatsAppConfigForm } from "./integrations/WhatsAppConfigForm";
import { EmailIntegrationsCard } from "./integrations/EmailIntegrationsCard";
import { EmailConfigManager } from "./integrations/EmailConfigManager";
import { useNotificationConfigStore } from "../alerts/notificationConfigStore";
import type { EmailMailbox, EmailPurpose } from "../alerts/ruleTypes";
import { EMAIL_PURPOSES, EMAIL_PURPOSE_LABEL } from "../alerts/ruleTypes";
import { SaasBillingView } from "../saasBilling/SaasBillingView";
import { PlanAdminView } from "../saasBilling/PlanAdminView";

export interface SettingsViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
}

type SubTab =
  | "profile"
  | "agency"
  | "security"
  | "notifications"
  | "billing"
  | "integrations";

const SUB_TABS: { id: SubTab; label: string; icon: any }[] = [
  { id: "profile", label: "Perfil de Usuario", icon: User },
  { id: "agency", label: "Información de Agencia", icon: Building2 },
  { id: "security", label: "Seguridad y Accesos", icon: Shield },
  { id: "notifications", label: "Notificaciones", icon: Bell },
  { id: "billing", label: "Facturación y Plan", icon: CreditCard },
  { id: "integrations", label: "Integraciones", icon: Globe },
];

type ProfileErrors = Partial<
  Record<"name" | "email" | "phone" | "role", string>
>;
type AgencyErrors = Partial<
  Record<
    "name" | "nit" | "address" | "city" | "representative" | "website",
    string
  >
>;
type SecurityErrors = Partial<
  Record<"currentPassword" | "newPassword" | "confirmPassword", string>
>;

export function SettingsView({ showToast }: SettingsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("profile");
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null);
  const [notifications, setNotifications] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
    3: false,
  });
  const [planAdminOpen, setPlanAdminOpen] = useState(false);

  const agency = useSettingsStore((s) => s.agency);
  const profile = useSettingsStore((s) => s.profile);
  const updateAgency = useSettingsStore((s) => s.updateAgency);
  const updateProfile = useSettingsStore((s) => s.updateProfile);

  // ── Validation state ──
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [agencyErrors, setAgencyErrors] = useState<AgencyErrors>({});
  const [securityErrors, setSecurityErrors] = useState<SecurityErrors>({});
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });

  // Snapshots del "último estado guardado" — habilitan que Cancel revierta de verdad.
  const profileSnapshot = useRef(profile);
  const agencySnapshot = useRef(agency);

  const handleProfilePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Solo se permiten imágenes", "error");
      return;
    }
    const dataUrl = await compressImage(file);
    updateProfile({ photoDataUrl: dataUrl });
    showToast("Foto actualizada", "success");
  };

  // ── Save handlers (validan y solo persisten snapshot si todo OK) ──
  const handleSaveProfile = () => {
    const errs: ProfileErrors = {};
    if (!isNonEmpty(profile.name)) errs.name = "El nombre es obligatorio";
    else if (profile.name.trim().length < 3) errs.name = "Mínimo 3 caracteres";
    if (!isValidEmail(profile.email))
      errs.email = "Correo inválido (ej: nombre@dominio.com)";
    if (!isValidColombianPhone(profile.phone))
      errs.phone = "Formato: +57 3XX XXX XXXX";
    if (Object.keys(errs).length) {
      setProfileErrors(errs);
      showToast("Revisa los campos marcados", "error");
      return;
    }
    setProfileErrors({});
    profileSnapshot.current = profile;
    showToast("Perfil actualizado correctamente", "success");
  };

  const handleCancelProfile = () => {
    updateProfile(profileSnapshot.current);
    setProfileErrors({});
    showToast("Cambios descartados");
  };

  const handleSaveAgency = () => {
    const errs: AgencyErrors = {};
    if (!isNonEmpty(agency.name)) errs.name = "El nombre es obligatorio";
    if (!isValidNIT(agency.nit)) errs.nit = "NIT inválido (9-15 dígitos)";
    if (!isNonEmpty(agency.address))
      errs.address = "La dirección es obligatoria";
    if (!isNonEmpty(agency.city)) errs.city = "La ciudad es obligatoria";
    if (!isNonEmpty(agency.representative))
      errs.representative = "El representante es obligatorio";
    if (!isValidURL(agency.website))
      errs.website = "URL inválida (ej: www.ejemplo.com)";
    if (Object.keys(errs).length) {
      setAgencyErrors(errs);
      showToast("Revisa los campos marcados", "error");
      return;
    }
    setAgencyErrors({});
    agencySnapshot.current = agency;
    showToast("Información de agencia guardada", "success");
  };

  const handleCancelAgency = () => {
    updateAgency(agencySnapshot.current);
    setAgencyErrors({});
    showToast("Cambios descartados");
  };

  const handleSaveSecurity = () => {
    const errs: SecurityErrors = {};
    if (!isNonEmpty(pwd.current))
      errs.currentPassword = "Ingresa tu contraseña actual";
    const pwdIssues = passwordIssues(pwd.next);
    if (pwdIssues.length) errs.newPassword = pwdIssues[0];
    if (!isNonEmpty(pwd.confirm))
      errs.confirmPassword = "Confirma la nueva contraseña";
    else if (pwd.confirm !== pwd.next)
      errs.confirmPassword = "No coincide con la nueva contraseña";
    if (Object.keys(errs).length) {
      setSecurityErrors(errs);
      showToast("Revisa los campos marcados", "error");
      return;
    }
    setSecurityErrors({});
    setPwd({ current: "", next: "", confirm: "" });
    showToast("Contraseña actualizada correctamente", "success");
  };

  const toggleNotification = (index: number) => {
    setNotifications((prev) => ({ ...prev, [index]: !prev[index] }));
    showToast("Preferencia actualizada");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8 max-w-4xl mx-auto"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Configuración</h2>
          <p className="text-slate-500 text-sm">
            Administra tu cuenta, agencia y preferencias del sistema.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full sm:w-auto text-red-600 border-red-100 hover:bg-red-50 gap-2"
        >
          <LogOut className="w-4 h-4" />
          Cerrar Sesión
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-1">
          {SUB_TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSubTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeSubTab === item.id
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="md:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            {activeSubTab === "profile" && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    Perfil de Usuario
                  </h3>
                  <div className="space-y-6">
                    <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
                      {profile.photoDataUrl ? (
                        <img
                          src={profile.photoDataUrl}
                          alt="Foto de perfil"
                          className="w-20 h-20 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-2xl font-bold text-slate-600">
                          {profile.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase() || "TP"}
                        </div>
                      )}
                      <div>
                        <label className="inline-block">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleProfilePhoto}
                          />
                          <span className="cursor-pointer inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
                            Cambiar Foto
                          </span>
                        </label>
                        <p className="text-xs text-slate-400 mt-2">
                          JPG o PNG. Se comprime automáticamente.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Nombre Completo"
                        value={profile.name}
                        onChange={(e) => {
                          updateProfile({ name: e.target.value });
                          if (profileErrors.name)
                            setProfileErrors((p) => ({
                              ...p,
                              name: undefined,
                            }));
                        }}
                        error={profileErrors.name}
                        autoComplete="name"
                      />
                      <Input
                        label="Correo Electrónico"
                        type="email"
                        value={profile.email}
                        onChange={(e) => {
                          updateProfile({ email: e.target.value });
                          if (profileErrors.email)
                            setProfileErrors((p) => ({
                              ...p,
                              email: undefined,
                            }));
                        }}
                        error={profileErrors.email}
                        autoComplete="email"
                      />
                      <Input
                        label="Teléfono"
                        type="tel"
                        value={profile.phone}
                        onChange={(e) => {
                          updateProfile({ phone: e.target.value });
                          if (profileErrors.phone)
                            setProfileErrors((p) => ({
                              ...p,
                              phone: undefined,
                            }));
                        }}
                        error={profileErrors.phone}
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+57 3XX XXX XXXX"
                      />
                      <Input
                        label="Cargo"
                        value={profile.role}
                        onChange={(e) =>
                          updateProfile({ role: e.target.value })
                        }
                      />
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                      <Button variant="outline" onClick={handleCancelProfile}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveProfile}>
                        Guardar Cambios
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === "agency" && (
              <motion.div
                key="agency"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    Información de Agencia
                  </h3>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Nombre de la Agencia"
                        value={agency.name}
                        onChange={(e) => {
                          updateAgency({ name: e.target.value });
                          if (agencyErrors.name)
                            setAgencyErrors((p) => ({ ...p, name: undefined }));
                        }}
                        error={agencyErrors.name}
                      />
                      <Input
                        label="NIT"
                        value={agency.nit}
                        onChange={(e) => {
                          updateAgency({
                            nit: formatNITColombian(e.target.value),
                          });
                          if (agencyErrors.nit)
                            setAgencyErrors((p) => ({ ...p, nit: undefined }));
                        }}
                        error={agencyErrors.nit}
                        placeholder="900.123.456-7"
                        inputMode="numeric"
                      />
                      <Input
                        label="Dirección"
                        value={agency.address}
                        onChange={(e) => {
                          updateAgency({
                            address: formatAddress(e.target.value),
                          });
                          if (agencyErrors.address)
                            setAgencyErrors((p) => ({
                              ...p,
                              address: undefined,
                            }));
                        }}
                        error={agencyErrors.address}
                      />
                      <Input
                        label="Ciudad"
                        value={agency.city}
                        onChange={(e) => {
                          updateAgency({ city: e.target.value });
                          if (agencyErrors.city)
                            setAgencyErrors((p) => ({ ...p, city: undefined }));
                        }}
                        error={agencyErrors.city}
                        autoComplete="address-level2"
                      />
                      <Input
                        label="Representante Legal"
                        value={agency.representative}
                        onChange={(e) => {
                          updateAgency({ representative: e.target.value });
                          if (agencyErrors.representative)
                            setAgencyErrors((p) => ({
                              ...p,
                              representative: undefined,
                            }));
                        }}
                        error={agencyErrors.representative}
                        autoComplete="name"
                      />
                      <Input
                        label="Sitio Web"
                        type="url"
                        value={agency.website}
                        onChange={(e) => {
                          updateAgency({ website: e.target.value });
                          if (agencyErrors.website)
                            setAgencyErrors((p) => ({
                              ...p,
                              website: undefined,
                            }));
                        }}
                        error={agencyErrors.website}
                        autoComplete="url"
                        placeholder="www.ejemplo.com"
                      />
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                      <Button variant="outline" onClick={handleCancelAgency}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveAgency}>
                        Guardar Cambios
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === "security" && (
              <motion.div
                key="security"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-600" />
                    Seguridad y Accesos
                  </h3>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-700">
                        Cambiar Contraseña
                      </h4>
                      <Input
                        label="Contraseña Actual"
                        type="password"
                        value={pwd.current}
                        onChange={(e) => {
                          setPwd((p) => ({ ...p, current: e.target.value }));
                          if (securityErrors.currentPassword)
                            setSecurityErrors((s) => ({
                              ...s,
                              currentPassword: undefined,
                            }));
                        }}
                        error={securityErrors.currentPassword}
                        autoComplete="current-password"
                      />
                      <Input
                        label="Nueva Contraseña"
                        type="password"
                        value={pwd.next}
                        onChange={(e) => {
                          setPwd((p) => ({ ...p, next: e.target.value }));
                          if (securityErrors.newPassword)
                            setSecurityErrors((s) => ({
                              ...s,
                              newPassword: undefined,
                            }));
                        }}
                        error={securityErrors.newPassword}
                        autoComplete="new-password"
                        placeholder="Mínimo 8 caracteres, 1 letra y 1 número"
                      />
                      <Input
                        label="Confirmar Nueva Contraseña"
                        type="password"
                        value={pwd.confirm}
                        onChange={(e) => {
                          setPwd((p) => ({ ...p, confirm: e.target.value }));
                          if (securityErrors.confirmPassword)
                            setSecurityErrors((s) => ({
                              ...s,
                              confirmPassword: undefined,
                            }));
                        }}
                        error={securityErrors.confirmPassword}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                      <h4 className="text-sm font-bold text-slate-700 mb-4">
                        Autenticación de Dos Pasos (2FA)
                      </h4>
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Shield className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">
                              Proteger mi cuenta con 2FA
                            </p>
                            <p className="text-xs text-slate-500">
                              Usa una app de autenticación para mayor seguridad.
                            </p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline">
                          Configurar
                        </Button>
                      </div>
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPwd({ current: "", next: "", confirm: "" });
                          setSecurityErrors({});
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveSecurity}>
                        Actualizar Seguridad
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === "notifications" && (
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
                    {[
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
                    ].map((pref, i) => (
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
                          className={`w-10 h-5 rounded-full relative cursor-pointer transition-all ${notifications[i] ? "bg-blue-600" : "bg-slate-300"}`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${notifications[i] ? "right-0.5" : "left-0.5"}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === "billing" && (
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
                        Tu subscripción al SaaS InmoControl. Planes, métodos de
                        pago y facturas.
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
            )}

            {activeSubTab === "integrations" && (
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
                        })
                      }
                    />

                    {/* ── Resto de integraciones (placeholder) ── */}
                    {[
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
                    ].map((int, i) => (
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
            )}
          </AnimatePresence>
        </div>
      </div>

      <Modal
        isOpen={!!selectedIntegration}
        onClose={() => setSelectedIntegration(null)}
        title={`Configurar: ${selectedIntegration?.name}`}
      >
        <div className="space-y-6">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-sm text-slate-600 leading-relaxed">
              {selectedIntegration?.desc}
            </p>
          </div>
          {selectedIntegration?.name === "WhatsApp Business" && (
            <WhatsAppConfigForm showToast={showToast} />
          )}
          {selectedIntegration?.name === "Email" && (
            <EmailConfigManager showToast={showToast} />
          )}
          {selectedIntegration?.name === "PSE / Pagos" && (
            <div className="space-y-4">
              <Input label="ID de Comercio" defaultValue="987654321" />
              <Input
                label="Llave de Encriptación"
                type="password"
                defaultValue="••••••••••••••••"
              />
              <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-xs">
                Los pagos se sincronizan automáticamente con el módulo
                financiero cada 15 minutos.
              </div>
            </div>
          )}
          {selectedIntegration?.name === "Google Calendar" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Sincroniza tus eventos de Inmocontrol con tu calendario
                personal.
              </p>
              <Button className="w-full bg-white text-slate-900 border border-slate-200 hover:bg-slate-50">
                Conectar con Google Account
              </Button>
            </div>
          )}
          {selectedIntegration?.name === "Facturación Electrónica" && (
            <div className="space-y-4">
              <Input label="Proveedor Tecnológico" defaultValue="FacturaTech" />
              <Input label="Resolución DIAN" defaultValue="18760000001" />
              <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-xs">
                Estado: En proceso de habilitación ante la DIAN.
              </div>
            </div>
          )}
          <div className="pt-4 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setSelectedIntegration(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                showToast(
                  `Configuración de ${selectedIntegration?.name} guardada`,
                );
                setSelectedIntegration(null);
              }}
            >
              Guardar Configuración
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Administrar planes (Fase 8) ── */}
      <Modal
        isOpen={planAdminOpen}
        onClose={() => setPlanAdminOpen(false)}
        title="Administrar planes del SaaS"
        size="lg"
      >
        <PlanAdminView showToast={showToast} />
      </Modal>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EMAIL (Fase 7) — multi-buzón por propósito
// Sub-componentes extraidos al modulo ./integrations/ (fix-issue-09)
// ════════════════════════════════════════════════════════════════════════════
