import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User, Building2, Shield, Bell, CreditCard, Globe, LogOut, Plus,
  CheckCircle, FolderOpen, Unlink, Loader2, Mail, Trash2,
} from 'lucide-react';
import { Button, Card, Input, Modal } from '../../shared/ui';
import {
  formatAddress,
  isNonEmpty,
  isValidEmail,
  isValidColombianPhone,
  formatNITColombian,
  isValidNIT,
  isValidURL,
  passwordIssues,
} from '../../utils/validators';
import { useSettingsStore } from '../../shared/store/settingsStore';
import { useGoogleDriveStore } from '../../shared/store/googleDriveStore';
import { compressImage } from '../properties/imageCompress';
import { GoogleDriveIntegration } from './GoogleDriveIntegration';
import { useNotificationConfigStore } from '../alerts/notificationConfigStore';
import type { EmailMailbox, EmailPurpose } from '../alerts/ruleTypes';
import { EMAIL_PURPOSES, EMAIL_PURPOSE_LABEL } from '../alerts/ruleTypes';
import { SaasBillingView } from '../saasBilling/SaasBillingView';
import { PlanAdminView } from '../saasBilling/PlanAdminView';

export interface SettingsViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type SubTab = 'profile' | 'agency' | 'security' | 'notifications' | 'billing' | 'integrations';

const SUB_TABS: { id: SubTab; label: string; icon: any }[] = [
  { id: 'profile', label: 'Perfil de Usuario', icon: User },
  { id: 'agency', label: 'Información de Agencia', icon: Building2 },
  { id: 'security', label: 'Seguridad y Accesos', icon: Shield },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'billing', label: 'Facturación y Plan', icon: CreditCard },
  { id: 'integrations', label: 'Integraciones', icon: Globe },
];

type ProfileErrors = Partial<Record<'name' | 'email' | 'phone' | 'role', string>>;
type AgencyErrors = Partial<Record<'name' | 'nit' | 'address' | 'city' | 'representative' | 'website', string>>;
type SecurityErrors = Partial<Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>>;

export function SettingsView({ showToast }: SettingsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('profile');
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null);
  const [notifications, setNotifications] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: false });
  const [planAdminOpen, setPlanAdminOpen] = useState(false);

  const agency = useSettingsStore((s) => s.agency);
  const profile = useSettingsStore((s) => s.profile);
  const updateAgency = useSettingsStore((s) => s.updateAgency);
  const updateProfile = useSettingsStore((s) => s.updateProfile);

  // ── Validation state ──
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [agencyErrors, setAgencyErrors] = useState<AgencyErrors>({});
  const [securityErrors, setSecurityErrors] = useState<SecurityErrors>({});
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });

  // Snapshots del "último estado guardado" — habilitan que Cancel revierta de verdad.
  const profileSnapshot = useRef(profile);
  const agencySnapshot = useRef(agency);

  const handleProfilePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Solo se permiten imágenes', 'error'); return; }
    const dataUrl = await compressImage(file);
    updateProfile({ photoDataUrl: dataUrl });
    showToast('Foto actualizada', 'success');
  };

  // ── Save handlers (validan y solo persisten snapshot si todo OK) ──
  const handleSaveProfile = () => {
    const errs: ProfileErrors = {};
    if (!isNonEmpty(profile.name)) errs.name = 'El nombre es obligatorio';
    else if (profile.name.trim().length < 3) errs.name = 'Mínimo 3 caracteres';
    if (!isValidEmail(profile.email)) errs.email = 'Correo inválido (ej: nombre@dominio.com)';
    if (!isValidColombianPhone(profile.phone)) errs.phone = 'Formato: +57 3XX XXX XXXX';
    if (Object.keys(errs).length) {
      setProfileErrors(errs);
      showToast('Revisa los campos marcados', 'error');
      return;
    }
    setProfileErrors({});
    profileSnapshot.current = profile;
    showToast('Perfil actualizado correctamente', 'success');
  };

  const handleCancelProfile = () => {
    updateProfile(profileSnapshot.current);
    setProfileErrors({});
    showToast('Cambios descartados');
  };

  const handleSaveAgency = () => {
    const errs: AgencyErrors = {};
    if (!isNonEmpty(agency.name)) errs.name = 'El nombre es obligatorio';
    if (!isValidNIT(agency.nit)) errs.nit = 'NIT inválido (9-15 dígitos)';
    if (!isNonEmpty(agency.address)) errs.address = 'La dirección es obligatoria';
    if (!isNonEmpty(agency.city)) errs.city = 'La ciudad es obligatoria';
    if (!isNonEmpty(agency.representative)) errs.representative = 'El representante es obligatorio';
    if (!isValidURL(agency.website)) errs.website = 'URL inválida (ej: www.ejemplo.com)';
    if (Object.keys(errs).length) {
      setAgencyErrors(errs);
      showToast('Revisa los campos marcados', 'error');
      return;
    }
    setAgencyErrors({});
    agencySnapshot.current = agency;
    showToast('Información de agencia guardada', 'success');
  };

  const handleCancelAgency = () => {
    updateAgency(agencySnapshot.current);
    setAgencyErrors({});
    showToast('Cambios descartados');
  };

  const handleSaveSecurity = () => {
    const errs: SecurityErrors = {};
    if (!isNonEmpty(pwd.current)) errs.currentPassword = 'Ingresa tu contraseña actual';
    const pwdIssues = passwordIssues(pwd.next);
    if (pwdIssues.length) errs.newPassword = pwdIssues[0];
    if (!isNonEmpty(pwd.confirm)) errs.confirmPassword = 'Confirma la nueva contraseña';
    else if (pwd.confirm !== pwd.next) errs.confirmPassword = 'No coincide con la nueva contraseña';
    if (Object.keys(errs).length) {
      setSecurityErrors(errs);
      showToast('Revisa los campos marcados', 'error');
      return;
    }
    setSecurityErrors({});
    setPwd({ current: '', next: '', confirm: '' });
    showToast('Contraseña actualizada correctamente', 'success');
  };

  const toggleNotification = (index: number) => {
    setNotifications((prev) => ({ ...prev, [index]: !prev[index] }));
    showToast('Preferencia actualizada');
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
          <p className="text-slate-500 text-sm">Administra tu cuenta, agencia y preferencias del sistema.</p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto text-red-600 border-red-100 hover:bg-red-50 gap-2">
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
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="md:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            {activeSubTab === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    Perfil de Usuario
                  </h3>
                  <div className="space-y-6">
                    <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
                      {profile.photoDataUrl ? (
                        <img src={profile.photoDataUrl} alt="Foto de perfil" className="w-20 h-20 rounded-full object-cover" />
                      ) : (
                        <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-2xl font-bold text-slate-600">
                          {profile.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'TP'}
                        </div>
                      )}
                      <div>
                        <label className="inline-block">
                          <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhoto} />
                          <span className="cursor-pointer inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
                            Cambiar Foto
                          </span>
                        </label>
                        <p className="text-xs text-slate-400 mt-2">JPG o PNG. Se comprime automáticamente.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Nombre Completo"
                        value={profile.name}
                        onChange={(e) => { updateProfile({ name: e.target.value }); if (profileErrors.name) setProfileErrors((p) => ({ ...p, name: undefined })); }}
                        error={profileErrors.name}
                        autoComplete="name"
                      />
                      <Input
                        label="Correo Electrónico"
                        type="email"
                        value={profile.email}
                        onChange={(e) => { updateProfile({ email: e.target.value }); if (profileErrors.email) setProfileErrors((p) => ({ ...p, email: undefined })); }}
                        error={profileErrors.email}
                        autoComplete="email"
                      />
                      <Input
                        label="Teléfono"
                        type="tel"
                        value={profile.phone}
                        onChange={(e) => { updateProfile({ phone: e.target.value }); if (profileErrors.phone) setProfileErrors((p) => ({ ...p, phone: undefined })); }}
                        error={profileErrors.phone}
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+57 3XX XXX XXXX"
                      />
                      <Input
                        label="Cargo"
                        value={profile.role}
                        onChange={(e) => updateProfile({ role: e.target.value })}
                      />
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                      <Button variant="outline" onClick={handleCancelProfile}>Cancelar</Button>
                      <Button onClick={handleSaveProfile}>Guardar Cambios</Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === 'agency' && (
              <motion.div key="agency" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
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
                        onChange={(e) => { updateAgency({ name: e.target.value }); if (agencyErrors.name) setAgencyErrors((p) => ({ ...p, name: undefined })); }}
                        error={agencyErrors.name}
                      />
                      <Input
                        label="NIT"
                        value={agency.nit}
                        onChange={(e) => { updateAgency({ nit: formatNITColombian(e.target.value) }); if (agencyErrors.nit) setAgencyErrors((p) => ({ ...p, nit: undefined })); }}
                        error={agencyErrors.nit}
                        placeholder="900.123.456-7"
                        inputMode="numeric"
                      />
                      <Input
                        label="Dirección"
                        value={agency.address}
                        onChange={(e) => { updateAgency({ address: formatAddress(e.target.value) }); if (agencyErrors.address) setAgencyErrors((p) => ({ ...p, address: undefined })); }}
                        error={agencyErrors.address}
                      />
                      <Input
                        label="Ciudad"
                        value={agency.city}
                        onChange={(e) => { updateAgency({ city: e.target.value }); if (agencyErrors.city) setAgencyErrors((p) => ({ ...p, city: undefined })); }}
                        error={agencyErrors.city}
                        autoComplete="address-level2"
                      />
                      <Input
                        label="Representante Legal"
                        value={agency.representative}
                        onChange={(e) => { updateAgency({ representative: e.target.value }); if (agencyErrors.representative) setAgencyErrors((p) => ({ ...p, representative: undefined })); }}
                        error={agencyErrors.representative}
                        autoComplete="name"
                      />
                      <Input
                        label="Sitio Web"
                        type="url"
                        value={agency.website}
                        onChange={(e) => { updateAgency({ website: e.target.value }); if (agencyErrors.website) setAgencyErrors((p) => ({ ...p, website: undefined })); }}
                        error={agencyErrors.website}
                        autoComplete="url"
                        placeholder="www.ejemplo.com"
                      />
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                      <Button variant="outline" onClick={handleCancelAgency}>Cancelar</Button>
                      <Button onClick={handleSaveAgency}>Guardar Cambios</Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === 'security' && (
              <motion.div key="security" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-600" />
                    Seguridad y Accesos
                  </h3>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-700">Cambiar Contraseña</h4>
                      <Input
                        label="Contraseña Actual"
                        type="password"
                        value={pwd.current}
                        onChange={(e) => { setPwd((p) => ({ ...p, current: e.target.value })); if (securityErrors.currentPassword) setSecurityErrors((s) => ({ ...s, currentPassword: undefined })); }}
                        error={securityErrors.currentPassword}
                        autoComplete="current-password"
                      />
                      <Input
                        label="Nueva Contraseña"
                        type="password"
                        value={pwd.next}
                        onChange={(e) => { setPwd((p) => ({ ...p, next: e.target.value })); if (securityErrors.newPassword) setSecurityErrors((s) => ({ ...s, newPassword: undefined })); }}
                        error={securityErrors.newPassword}
                        autoComplete="new-password"
                        placeholder="Mínimo 8 caracteres, 1 letra y 1 número"
                      />
                      <Input
                        label="Confirmar Nueva Contraseña"
                        type="password"
                        value={pwd.confirm}
                        onChange={(e) => { setPwd((p) => ({ ...p, confirm: e.target.value })); if (securityErrors.confirmPassword) setSecurityErrors((s) => ({ ...s, confirmPassword: undefined })); }}
                        error={securityErrors.confirmPassword}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                      <h4 className="text-sm font-bold text-slate-700 mb-4">Autenticación de Dos Pasos (2FA)</h4>
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 rounded-lg"><Shield className="w-5 h-5 text-blue-600" /></div>
                          <div>
                            <p className="text-sm font-semibold">Proteger mi cuenta con 2FA</p>
                            <p className="text-xs text-slate-500">Usa una app de autenticación para mayor seguridad.</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline">Configurar</Button>
                      </div>
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                      <Button variant="outline" onClick={() => { setPwd({ current: '', next: '', confirm: '' }); setSecurityErrors({}); }}>Cancelar</Button>
                      <Button onClick={handleSaveSecurity}>Actualizar Seguridad</Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === 'notifications' && (
              <motion.div key="notifications" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-600" />
                    Preferencias de Notificación
                  </h3>
                  <div className="space-y-4">
                    {[
                      { title: 'Alertas de Mora', desc: 'Recibir notificaciones cuando un inquilino se retrasa en el pago.' },
                      { title: 'Solicitudes de Reparación', desc: 'Notificar sobre nuevas solicitudes de mantenimiento.' },
                      { title: 'Vencimiento de Contratos', desc: 'Avisar 30 días antes del vencimiento de un contrato.' },
                      { title: 'Reportes Mensuales', desc: 'Enviar resumen financiero mensual por correo.' },
                    ].map((pref, i) => (
                      <div key={i} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">{pref.title}</h4>
                          <p className="text-xs text-slate-500">{pref.desc}</p>
                        </div>
                        <div
                          onClick={() => toggleNotification(i)}
                          className={`w-10 h-5 rounded-full relative cursor-pointer transition-all ${notifications[i] ? 'bg-blue-600' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${notifications[i] ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === 'billing' && (
              <motion.div key="billing" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-blue-600" />
                        Facturación y Plan
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tu subscripción al SaaS InmoControl. Planes, métodos de pago y facturas.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setPlanAdminOpen(true)} className="gap-1">
                      <CreditCard className="w-3.5 h-3.5" /> Administrar planes
                    </Button>
                  </div>
                  <SaasBillingView showToast={showToast} />
                </div>
              </motion.div>
            )}

            {activeSubTab === 'integrations' && (
              <motion.div key="integrations" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-600" />
                    Integraciones
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {/* ── Google Drive — componente interactivo ── */}
                    <GoogleDriveIntegration showToast={showToast} />

                    {/* ── Email — componente interactivo (Fase 7) ── */}
                    <EmailIntegrationsCard onConfigure={() => setSelectedIntegration({ name: 'Email', desc: 'Envío de alertas automáticas vía correo electrónico. Configura buzones por propósito: cobros, contratos, alertas, etc.' })} />

                    {/* ── Resto de integraciones (placeholder) ── */}
                    {[
                      { name: 'WhatsApp Business', desc: 'Envío de alertas automáticas vía WhatsApp.', status: 'Conectado', icon: '📱' },
                      { name: 'PSE / Pagos', desc: 'Recaudo de arriendos en línea.', status: 'Conectado', icon: '💰' },
                      { name: 'Facturación Electrónica', desc: 'Emisión automática de facturas DIAN.', status: 'En Proceso', icon: '📄' },
                    ].map((int, i) => (
                      <div key={i} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-xl shadow-sm">{int.icon}</div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{int.name}</h4>
                            <p className="text-xs text-slate-500">{int.desc}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                            int.status === 'Conectado' ? 'bg-emerald-100 text-emerald-600' :
                            int.status === 'En Proceso' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {int.status.toUpperCase()}
                          </span>
                          <Button variant="outline" size="sm" onClick={() => setSelectedIntegration(int)}>Configurar</Button>
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
            <p className="text-sm text-slate-600 leading-relaxed">{selectedIntegration?.desc}</p>
          </div>
          {selectedIntegration?.name === 'WhatsApp Business' && (
            <WhatsAppConfigForm showToast={showToast} />
          )}
          {selectedIntegration?.name === 'Email' && (
            <EmailConfigManager showToast={showToast} />
          )}
          {selectedIntegration?.name === 'PSE / Pagos' && (
            <div className="space-y-4">
              <Input label="ID de Comercio" defaultValue="987654321" />
              <Input label="Llave de Encriptación" type="password" defaultValue="••••••••••••••••" />
              <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-xs">
                Los pagos se sincronizan automáticamente con el módulo financiero cada 15 minutos.
              </div>
            </div>
          )}
          {selectedIntegration?.name === 'Google Calendar' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Sincroniza tus eventos de Inmocontrol con tu calendario personal.</p>
              <Button className="w-full bg-white text-slate-900 border border-slate-200 hover:bg-slate-50">Conectar con Google Account</Button>
            </div>
          )}
          {selectedIntegration?.name === 'Facturación Electrónica' && (
            <div className="space-y-4">
              <Input label="Proveedor Tecnológico" defaultValue="FacturaTech" />
              <Input label="Resolución DIAN" defaultValue="18760000001" />
              <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-xs">
                Estado: En proceso de habilitación ante la DIAN.
              </div>
            </div>
          )}
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSelectedIntegration(null)}>Cancelar</Button>
            <Button onClick={() => {
              showToast(`Configuración de ${selectedIntegration?.name} guardada`);
              setSelectedIntegration(null);
            }}>Guardar Configuración</Button>
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

// ─── WhatsAppConfigForm ───────────────────────────────────────────────────
// Estado real del canal (configurado / no), test send al número que el
// usuario indique. El "API Key" NUNCA vive en el cliente — está en
// `process.env` del server (variables TWILIO_*).
function WhatsAppConfigForm({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [status, setStatus] = useState<{ configured: boolean; mode: 'mock' | 'live'; from: string | null; message: string } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [sending, setSending] = useState(false);

  const checkStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/notifications/whatsapp/status');
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setStatus({ configured: false, mode: 'mock', from: null, message: `No se pudo conectar al server: ${err?.message ?? 'error'}` });
    } finally {
      setLoadingStatus(false);
    }
  };

  // Check status al montar
  useEffect(() => { checkStatus(); }, []);

  const sendTest = async () => {
    if (!testNumber.trim()) {
      showToast('Ingresa un número de WhatsApp para probar', 'error');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/notifications/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testNumber.trim() }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        showToast(`Error: ${data?.error ?? data?.message ?? `HTTP ${res.status}`}`, 'error');
        return;
      }
      showToast(`✅ Mensaje enviado a ${data.to} (SID: ${data.sid?.slice(0, 10)}…)`, 'success');
    } catch (err: any) {
      showToast(`Error de red: ${err?.message ?? 'desconocido'}`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Estado del canal ── */}
      <div className={`p-4 rounded-xl border ${
        !status ? 'bg-slate-50 border-slate-200' :
        status.configured ? 'bg-emerald-50 border-emerald-200' :
        'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm text-slate-900">Estado del canal</h4>
              {loadingStatus ? (
                <span className="text-xs text-slate-500">Verificando…</span>
              ) : status?.configured ? (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Conectado (live)</span>
              ) : (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Mock (no configurado)</span>
              )}
            </div>
            <p className="text-xs text-slate-600">{status?.message ?? 'Cargando estado…'}</p>
            {status?.from && (
              <p className="text-xs text-slate-500 mt-1">
                <span className="font-mono">{status.from}</span>
                {status.mode === 'live' && <span className="text-slate-400"> (server-side, no editable desde acá)</span>}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={checkStatus}
            disabled={loadingStatus}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0"
          >
            {loadingStatus ? '…' : 'Reverificar'}
          </button>
        </div>
      </div>

      {/* ── Setup guide (solo si no está configurado) ── */}
      {status && !status.configured && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-slate-700 space-y-2">
          <p className="font-semibold text-slate-900">Cómo configurarlo:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-600">
            <li>Crear cuenta gratis en <a href="https://console.twilio.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">console.twilio.com</a></li>
            <li>Console → <strong>Messaging → Try it out → WhatsApp</strong> → copiar el sandbox number</li>
            <li>Console → <strong>Account → API keys &amp; tokens</strong> → copiar <code className="bg-white px-1 rounded">Account SID</code> y <code className="bg-white px-1 rounded">Auth Token</code></li>
            <li>Agregar estas 3 variables a <code className="bg-white px-1 rounded">.env.local</code>:
              <pre className="mt-1 bg-white p-2 rounded border border-slate-200 text-[11px] overflow-x-auto">
{`TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=tu_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`}
              </pre>
            </li>
            <li>Reiniciar el server (<code className="bg-white px-1 rounded">npm run dev:all</code>)</li>
            <li>Sandbox: el destinatario debe mandar <code className="bg-white px-1 rounded">join &lt;palabra&gt;</code> al sandbox number desde su WhatsApp antes de recibir el primer mensaje</li>
          </ol>
        </div>
      )}

      {/* ── Test send (solo si está configurado) ── */}
      {status?.configured && (
        <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
          <div>
            <h4 className="font-semibold text-sm text-slate-900">Probar envío</h4>
            <p className="text-xs text-slate-500">Mandá un mensaje de prueba a un número colombiano. Formato: <code className="bg-slate-100 px-1 rounded">+57 3XX XXX XXXX</code></p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="+57 300 123 4567"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="flex-1"
            />
            <Button onClick={sendTest} disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar prueba'}
            </Button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        El token de Twilio NUNCA se guarda en el cliente. Vive solo en las variables de entorno del server.
        El sistema usa este canal para alertas automáticas según las reglas configuradas en <strong>Alertas → Reglas por Categoría</strong>.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EMAIL (Fase 7) — multi-buzón por propósito
// ════════════════════════════════════════════════════════════════════════════

function EmailIntegrationsCard({ onConfigure }: { onConfigure: () => void }) {
  const mailboxes = useNotificationConfigStore((s) => s.emailConfig.mailboxes);
  const enabled = mailboxes.filter((m) => m.enabled);
  const hasAny = enabled.length > 0;
  return (
    <div className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-xl shadow-sm">📧</div>
        <div>
          <h4 className="text-sm font-bold text-slate-900">Email — Buzones por propósito</h4>
          <p className="text-xs text-slate-500">
            {hasAny
              ? `${enabled.length} buzón(es) activo(s) · cobros, contratos, alertas…`
              : 'Configura buzones SMTP o SendGrid por propósito para enviar alertas.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
          hasAny ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
        }`}>
          {hasAny ? `${enabled.length} ACTIVO${enabled.length > 1 ? 'S' : ''}` : 'SIN CONFIGURAR'}
        </span>
        <Button variant="outline" size="sm" onClick={onConfigure}>Configurar</Button>
      </div>
    </div>
  );
}

/** Pantalla principal de email dentro del modal de configuración. */
function EmailConfigManager({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const mailboxes = useNotificationConfigStore((s) => s.emailConfig.mailboxes);
  const defaultId = useNotificationConfigStore((s) => s.emailConfig.defaultMailboxId);
  const addMailbox = useNotificationConfigStore((s) => s.addMailbox);
  const updateMailbox = useNotificationConfigStore((s) => s.updateMailbox);
  const removeMailbox = useNotificationConfigStore((s) => s.removeMailbox);
  const toggleMailbox = useNotificationConfigStore((s) => s.toggleMailbox);
  const setDefaultMailbox = useNotificationConfigStore((s) => s.setDefaultMailbox);

  const [status, setStatus] = useState<{ packageInstalled: boolean; fallbackConfigured: boolean; fallbackProvider: string | null; message: string } | null>(null);
  const [editing, setEditing] = useState<null | { mode: 'create' | 'edit'; mailboxId?: string }>(null);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/notifications/email/status');
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setStatus({ packageInstalled: false, fallbackConfigured: false, fallbackProvider: null, message: `No se pudo conectar al server: ${err?.message ?? 'error'}` });
    }
  };
  useEffect(() => { checkStatus(); }, []);

  // ── Vista: lista de buzones ──
  if (!editing) {
    return (
      <div className="space-y-4">
        {/* Estado del paquete + fallback */}
        <div className={`p-4 rounded-xl border ${
          !status ? 'bg-slate-50 border-slate-200' :
          status.packageInstalled ? 'bg-emerald-50 border-emerald-200' :
          'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-sm text-slate-900">Backend de email</h4>
                {status?.packageInstalled ? (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Nodemailer OK</span>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Sin nodemailer</span>
                )}
                {status?.fallbackConfigured && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    Fallback {status.fallbackProvider}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">{status?.message ?? 'Cargando…'}</p>
            </div>
            <button onClick={checkStatus} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Reverificar</button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm text-slate-900">Buzones configurados ({mailboxes.length})</h4>
            <Button size="sm" onClick={() => setEditing({ mode: 'create' })} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> Agregar buzón
            </Button>
          </div>
          {mailboxes.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 border border-slate-100 rounded-xl">
              <Mail className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Sin buzones aún</p>
              <p className="text-xs text-slate-500 mt-1">
                Agrega al menos uno por cada propósito (cobros, contratos, alertas) o un "general" como fallback.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {mailboxes.map((m) => (
                <li key={m.id} className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-sm font-semibold text-slate-900">{m.fromEmail}</span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{m.purpose}</span>
                        {m.id === defaultId && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Default</span>
                        )}
                        {!m.enabled && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Inactivo</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {m.fromName} · {m.provider.kind === 'sendgrid' ? 'SendGrid' : `SMTP ${m.provider.host}:${m.provider.port}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleMailbox(m.id)}
                        className={`w-8 h-4 rounded-full relative transition-colors ${m.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
                        title={m.enabled ? 'Desactivar' : 'Activar'}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${m.enabled ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                      {m.id !== defaultId && m.enabled && (
                        <button
                          onClick={() => setDefaultMailbox(m.id)}
                          className="text-[10px] text-blue-600 hover:text-blue-700 font-medium px-2"
                          title="Marcar como default"
                        >
                          Hacer default
                        </button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ mode: 'edit', mailboxId: m.id })} className="text-slate-500 hover:text-blue-600 px-2">Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (confirm(`¿Eliminar buzón ${m.fromEmail}?`)) {
                          removeMailbox(m.id);
                          showToast('Buzón eliminado', 'success');
                        }
                      }} className="text-slate-400 hover:text-red-600 px-2" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-slate-700 space-y-1">
          <p className="font-semibold text-slate-900">Cómo funciona el routing</p>
          <p>El motor elige automáticamente el buzón según el propósito de la alerta:</p>
          <ul className="list-disc list-inside ml-2 space-y-0.5 text-slate-600">
            <li><strong>mora</strong> → cobros</li>
            <li><strong>vencimiento / preaviso</strong> → contratos</li>
            <li><strong>documento</strong> → alertas</li>
            <li>Si no hay match → buzón <strong>default</strong>.</li>
          </ul>
        </div>

        <p className="text-[11px] text-slate-400">
          Las credenciales SMTP/SendGrid se guardan en el navegador (localStorage cifrado a nivel app).
          En producción SaaS se moverán al backend cifrado — el frontend solo conocerá IDs de buzón.
        </p>
      </div>
    );
  }

  // ── Vista: crear/editar buzón ──
  return (
    <EmailMailboxForm
      mode={editing.mode}
      mailboxId={editing.mailboxId}
      showToast={showToast}
      onCancel={() => setEditing(null)}
      onSaved={() => { setEditing(null); showToast(editing.mode === 'create' ? 'Buzón creado' : 'Buzón actualizado', 'success'); }}
    />
  );
}

/** Form para crear o editar un buzón. */
function EmailMailboxForm({
  mode, mailboxId, onCancel, onSaved, showToast,
}: {
  mode: 'create' | 'edit';
  mailboxId?: string;
  onCancel: () => void;
  onSaved: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const existing = useNotificationConfigStore((s) =>
    mailboxId ? s.emailConfig.mailboxes.find((m) => m.id === mailboxId) : undefined
  );
  const addMailbox = useNotificationConfigStore((s) => s.addMailbox);
  const updateMailbox = useNotificationConfigStore((s) => s.updateMailbox);

  // Estado del form
  const [purpose, setPurpose] = useState<EmailPurpose>(existing?.purpose ?? 'cobros');
  const [fromName, setFromName] = useState(existing?.fromName ?? '');
  const [fromEmail, setFromEmail] = useState(existing?.fromEmail ?? '');
  const [replyTo, setReplyTo] = useState(existing?.replyTo ?? '');
  const [providerKind, setProviderKind] = useState<'smtp' | 'sendgrid'>(
    existing?.provider.kind ?? 'smtp'
  );
  // SMTP fields
  const [smtpHost, setSmtpHost] = useState(existing?.provider.kind === 'smtp' ? existing.provider.host : 'smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(existing?.provider.kind === 'smtp' ? existing.provider.port : 587);
  const [smtpUser, setSmtpUser] = useState(existing?.provider.kind === 'smtp' ? existing.provider.user : '');
  const [smtpPass, setSmtpPass] = useState(existing?.provider.kind === 'smtp' ? existing.provider.pass : '');
  const [smtpSecure, setSmtpSecure] = useState(existing?.provider.kind === 'smtp' ? existing.provider.secure : false);
  // SendGrid field
  const [sendgridKey, setSendgridKey] = useState(existing?.provider.kind === 'sendgrid' ? existing.provider.apiKey : '');

  const [verifying, setVerifying] = useState(false);
  const [testingTo, setTestingTo] = useState('');
  const [testing, setTesting] = useState(false);

  const providerPreset = (preset: 'gmail' | 'outlook' | 'sendgrid') => {
    if (preset === 'gmail') {
      setProviderKind('smtp');
      setSmtpHost('smtp.gmail.com'); setSmtpPort(587); setSmtpSecure(false);
    } else if (preset === 'outlook') {
      setProviderKind('smtp');
      setSmtpHost('smtp-mail.outlook.com'); setSmtpPort(587); setSmtpSecure(false);
    } else {
      setProviderKind('sendgrid');
    }
  };

  const buildMailbox = (): Omit<EmailMailbox, 'id' | 'createdAt'> | null => {
    if (!fromEmail.trim()) { showToast('Ingresa el correo remitente (From)', 'error'); return null; }
    if (!fromName.trim()) { showToast('Ingresa el nombre remitente', 'error'); return null; }
    if (providerKind === 'smtp') {
      if (!smtpHost.trim() || !smtpUser.trim() || !smtpPass.trim()) {
        showToast('Completa host, usuario y contraseña SMTP', 'error');
        return null;
      }
      return {
        purpose, fromName, fromEmail,
        ...(replyTo.trim() ? { replyTo: replyTo.trim() } : {}),
        provider: { kind: 'smtp', host: smtpHost.trim(), port: smtpPort, user: smtpUser.trim(), pass: smtpPass, secure: smtpSecure },
        enabled: true,
      };
    }
    if (!sendgridKey.trim()) { showToast('Ingresa la API key de SendGrid', 'error'); return null; }
    return {
      purpose, fromName, fromEmail,
      ...(replyTo.trim() ? { replyTo: replyTo.trim() } : {}),
      provider: { kind: 'sendgrid', apiKey: sendgridKey.trim() },
      enabled: true,
    };
  };

  const handleVerify = async () => {
    const mb = buildMailbox();
    if (!mb) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/notifications/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailbox: mb }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data.ok) {
        showToast(`Verificación falló: ${data?.error ?? `HTTP ${res.status}`}`, 'error');
        return;
      }
      showToast('✅ Conexión verificada — ahora guarda el buzón', 'success');
    } catch (err: any) {
      showToast(`Error de red: ${err?.message ?? 'desconocido'}`, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleTestSend = async () => {
    const mb = buildMailbox();
    if (!mb) return;
    if (!testingTo.trim()) { showToast('Ingresa un correo destino para la prueba', 'error'); return; }
    setTesting(true);
    try {
      const res = await fetch('/api/notifications/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailbox: mb, to: testingTo.trim() }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data.ok) {
        showToast(`Envío falló: ${data?.error ?? `HTTP ${res.status}`}`, 'error');
        return;
      }
      showToast('✅ Email de prueba enviado — revisá tu bandeja', 'success');
    } catch (err: any) {
      showToast(`Error de red: ${err?.message ?? 'desconocido'}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const mb = buildMailbox();
    if (!mb) return;
    if (mode === 'create') {
      addMailbox(mb);
    } else if (mailboxId) {
      updateMailbox(mailboxId, mb);
    }
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-sm text-slate-900 mb-3">
          {mode === 'create' ? 'Nuevo buzón' : 'Editar buzón'}
        </h4>
      </div>

      {/* Selector de propósito */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Propósito</label>
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as EmailPurpose)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
        >
          {EMAIL_PURPOSES.map((p) => (
            <option key={p} value={p}>{EMAIL_PURPOSE_LABEL[p]}</option>
          ))}
        </select>
        <p className="text-[11px] text-slate-400 mt-1">
          {purpose === 'cobros' && 'Mora, recordatorios de pago. Suele ser un buzón tipo cobranzas@'}
          {purpose === 'contratos' && 'Vencimientos, preavisos, renovaciones. Suele ser contratos@'}
          {purpose === 'alertas' && 'Documentos pendientes, alertas generales.'}
          {purpose === 'marketing' && 'Campañas, newsletters (futuro).'}
          {purpose === 'general' && 'Fallback cuando no hay match por propósito.'}
        </p>
      </div>

      {/* Identidad */}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Nombre remitente" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Inmobiliaria XYZ" />
        <Input label="Correo remitente (From)" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="cobros@empresa.co" />
        <Input label="Reply-To (opcional)" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="agente@empresa.co" />
      </div>

      {/* Selector de provider + presets */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Proveedor</label>
        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={() => providerPreset('gmail')} className={`text-xs px-2 py-1 rounded border ${providerKind === 'smtp' && smtpHost === 'smtp.gmail.com' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600'}`}>📨 Gmail</button>
          <button onClick={() => providerPreset('outlook')} className={`text-xs px-2 py-1 rounded border ${providerKind === 'smtp' && smtpHost === 'smtp-mail.outlook.com' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600'}`}>📧 Outlook</button>
          <button onClick={() => providerPreset('sendgrid')} className={`text-xs px-2 py-1 rounded border ${providerKind === 'sendgrid' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600'}`}>⚡ SendGrid</button>
        </div>
        {providerKind === 'smtp' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Input label="Host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="col-span-2" />
              <Input label="Puerto" type="number" value={smtpPort} onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)} />
            </div>
            <Input label="Usuario" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="cuenta@gmail.com" />
            <Input label="Contraseña / App Password" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={mode === 'edit' ? '•••••••• (dejar vacío para mantener)' : ''} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} className="rounded" />
              <span className="text-slate-700">SSL/TLS (puerto 465 — desmarcar para STARTTLS en 587)</span>
            </label>
            <p className="text-[11px] text-slate-400">
              <strong>Gmail:</strong> requiere App Password (2FA + <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 underline">myaccount.google.com/apppasswords</a>).
              No uses tu contraseña normal.
            </p>
          </div>
        ) : (
          <div>
            <Input label="API Key de SendGrid" type="password" value={sendgridKey} onChange={(e) => setSendgridKey(e.target.value)} placeholder="SG.xxxxxxxxxxxxxxxxxxxx" />
            <p className="text-[11px] text-slate-400 mt-1">
              Obtén tu API key en <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noreferrer" className="text-blue-600 underline">SendGrid → Settings → API Keys</a>. Free tier: 100 emails/día.
            </p>
          </div>
        )}
      </div>

      {/* Test buttons */}
      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-2">
        <p className="text-xs font-semibold text-slate-700">Probar antes de guardar</p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleVerify} disabled={verifying}>
            {verifying ? 'Verificando…' : '🔌 Probar conexión'}
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Input
            placeholder="destino@ejemplo.co"
            value={testingTo}
            onChange={(e) => setTestingTo(e.target.value)}
            className="flex-1 min-w-[180px]"
          />
          <Button size="sm" onClick={handleTestSend} disabled={testing}>
            {testing ? 'Enviando…' : '✉️ Enviar prueba'}
          </Button>
        </div>
      </div>

      <div className="pt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave}>{mode === 'create' ? 'Crear buzón' : 'Guardar cambios'}</Button>
      </div>
    </div>
  );
}
