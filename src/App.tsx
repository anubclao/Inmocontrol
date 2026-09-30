import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DashboardView } from "./features/dashboard/DashboardView";
import { PropertiesView } from "./features/properties/PropertiesView";
import { TenantsView } from "./features/tenants/TenantsView";
import { FinancialView } from "./features/financial/FinancialView";
import { ReportsView } from "./features/reports/ReportsView";
import { AlertsView } from "./features/alerts/AlertsView";
import { SettingsView } from "./features/settings/SettingsView";
import { LoginScreen } from "./features/auth/LoginScreen";
import { SignupScreen } from "./features/auth/SignupScreen";
import { AppShell, TabId } from "./features/shell/AppShell";
import { LoadingScreen } from "./features/shell/LoadingScreen";
import { ContractsView } from "./features/contracts/ContractsView";
import { BillingView } from "./features/billing/views/BillingView";
import { can } from "./features/auth/permissions";
import { useContractStore } from "./features/contracts/contractStore";
import { inventoryDB } from "./features/properties/inventoryDB";
import type { Contract } from "./features/contracts/contractTypes";
import { useAppStore } from "./shared/store/appStore";
import { useAuthStore, selectRole } from "./shared/store/authStore";
import { STORAGE_KEYS } from "./shared/hooks/storageKeys";
import { DriveStatusBanner } from "./shared/ui/DriveStatusBanner";
import { useToast } from "./shared/hooks/useToast";
import { useAuthBootstrap } from "./features/auth/useAuthBootstrap";
import { useSessionTimeout } from "./features/auth/useSessionTimeout";
import { useCrudHandlers } from "./features/shell/useCrudHandlers";
import { useClosedMonths } from "./features/shell/useClosedMonths";
import { useAlertsDerivation } from "./features/alerts/useAlertsDerivation";

export default function App() {
  const { toast, showToast } = useToast();
  const { loading } = useAuthBootstrap();
  useAlertsDerivation();

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [inventoryModalProperty, setInventoryModalProperty] = useState<
    any | null
  >(null);
  const [inventoryPhase, setInventoryPhase] = useState<
    "inicial" | "final" | null
  >(null);

  // Auth state
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore(selectRole);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clear);

  // saas_signup.md: state para alternar entre Login y Signup. Vive solo
  // cuando el user es null (pre-auth).
  const [authView, setAuthView] = useState<"login" | "signup">("login");

  // Cuando se loguea/signea OK, vuelve a "login" para que el proximo
  // logout arranque en la pantalla de login.
  useEffect(() => {
    if (user && authView !== "login") setAuthView("login");
  }, [user, authView]);

  // Data layer
  const properties = useAppStore((s) => s.properties);
  const tenants = useAppStore((s) => s.tenants);
  const financialRecords = useAppStore((s) => s.financialRecords);
  const removeProperty = useAppStore((s) => s.removeProperty);
  const contracts = useContractStore((s) => s.contracts);
  const hydrationPartial = useAppStore((s) => s.hydrationPartial);

  // BUG-019: warning si la hidratación quedó parcial. Mostrar UNA
  // sola vez (cuando el flag pasa de false→true).
  const [warnedPartial, setWarnedPartial] = useState(false);
  useEffect(() => {
    if (hydrationPartial && !warnedPartial) {
      showToast(
        "Algunos datos no pudieron cargarse. Reintentá desde Configuración.",
        "warning",
      );
      setWarnedPartial(true);
    }
  }, [hydrationPartial, warnedPartial, showToast]);

  // Inactividad → logout automático.
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* silent */
    }
    clearAuth();
    try {
      localStorage.removeItem(STORAGE_KEYS.wizardPropertyDraft);
    } catch {
      /* silent */
    }
    useAppStore.getState().reset();
    showToast("Sesión finalizada");
  };
  useSessionTimeout({ enabled: !!user, onTimeout: handleLogout });

  // CRUD handlers extraídos.
  const {
    handleAddProperty,
    handleUpdateProperty,
    handleUpdateTenant,
    handleAddTenant,
    handleAddRecord,
    handleDeleteTenant,
    handleDeleteRecord,
    handleUpdateRecord,
  } = useCrudHandlers({ user, showToast });

  const { closedMonths, openedMonths, handleCloseMonth, handleOpenMonth } =
    useClosedMonths(showToast);

  const filteredProperties = properties.filter(
    (p) =>
      p.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.chip?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.folio?.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const filteredTenants = tenants.filter(
    (t) =>
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.idNumber?.includes(searchQuery),
  );

  const handleLogin = (loggedInUser: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    organizationId: string;
  }) => {
    setUser({
      uid: loggedInUser.id,
      displayName: loggedInUser.displayName,
      email: loggedInUser.email,
      role: loggedInUser.role as any,
    });
    showToast(`Bienvenido, ${loggedInUser.displayName}`);
  };

  const handleStartInventoryEndFromContract = (c: Contract) => {
    const property = properties.find((p: any) => p.id === c.propertyId);
    if (!property) {
      showToast("No se encontró la propiedad", "error");
      return;
    }
    setInventoryModalProperty(property);
    setInventoryPhase("final");
    setActiveTab("properties");
    void inventoryDB.getInventory(`${c.propertyId}:inicial`);
  };

  if (loading) return <LoadingScreen />;
  if (!user) {
    if (authView === "signup") {
      return (
        <SignupScreen
          onSignup={(u) => {
            setUser({
              uid: u.id,
              displayName: u.displayName,
              email: u.email,
              role: u.role as any,
            });
            setAuthView("login");
            // saas_signup.md AC-17: toast de bienvenida con el copy exacto.
            showToast(
              "Bienvenido a InmoControl! Tu trial de 14 dias esta activo.",
              "success",
            );
          }}
          onGoToLogin={() => setAuthView("login")}
        />
      );
    }
    return (
      <LoginScreen
        onLogin={handleLogin}
        onGoToSignup={() => setAuthView("signup")}
      />
    );
  }

  return (
    <AppShell
      user={{ displayName: user.displayName, email: user.email }}
      role={role}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={handleLogout}
      onRoleChange={(r) => {
        if (user) {
          setUser({ ...user, role: r });
        }
        showToast(`Rol cambiado a ${r}`);
      }}
      toast={toast}
    >
      <DriveStatusBanner onGoToIntegrations={() => setActiveTab("settings")} />
      <AnimatePresence mode="wait">
        {activeTab === "dashboard" && (
          <DashboardView
            onNewCapture={() => setActiveTab("properties")}
            onNavigateToAlerts={() => setActiveTab("alerts")}
            properties={properties}
            tenants={tenants}
            financialRecords={financialRecords}
            showToast={showToast}
            role={role}
          />
        )}
        {activeTab === "properties" && can(role, "canAddProperty") && (
          <PropertiesView
            showToast={showToast}
            properties={filteredProperties}
            onAddProperty={handleAddProperty}
            onUpdateProperty={handleUpdateProperty}
            onDeleteProperty={removeProperty}
            role={role}
          />
        )}
        {activeTab === "tenants" && role === "admin" && (
          <TenantsView
            showToast={showToast}
            tenants={filteredTenants}
            properties={properties}
            onAddTenant={handleAddTenant}
            onUpdateTenant={handleUpdateTenant}
            onDeleteTenant={handleDeleteTenant}
            onUpdateProperty={handleUpdateProperty}
            role={role}
          />
        )}
        {activeTab === "contracts" &&
          (role === "admin" || role === "propietario") && (
            <ContractsView
              showToast={showToast}
              properties={properties}
              tenants={tenants}
              role={role}
              onStartInventoryEnd={handleStartInventoryEndFromContract}
            />
          )}
        {activeTab === "billing" &&
          (role === "admin" || role === "propietario") && (
            <BillingView
              properties={properties}
              contracts={contracts}
              tenants={tenants}
              userName={user?.displayName ?? "agente"}
              showToast={showToast}
            />
          )}
        {activeTab === "financial" && (
          <FinancialView
            showToast={showToast}
            financialRecords={financialRecords}
            properties={properties}
            onAddRecord={handleAddRecord}
            onDeleteRecord={handleDeleteRecord}
            onUpdateRecord={handleUpdateRecord}
            onCloseMonth={handleCloseMonth}
            onOpenMonth={handleOpenMonth}
            closedMonths={closedMonths}
            openedMonths={openedMonths}
            role={role}
          />
        )}
        {activeTab === "reports" && can(role, "canViewReports") && (
          <ReportsView
            showToast={showToast}
            financialRecords={financialRecords}
            properties={properties}
            role={role}
          />
        )}
        {activeTab === "alerts" && can(role, "canViewReports") && (
          <AlertsView showToast={showToast} />
        )}
        {activeTab === "settings" && can(role, "canViewSettings") && (
          <SettingsView showToast={showToast} />
        )}
      </AnimatePresence>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className={`fixed bottom-6 right-6 z-[9999] max-w-md p-4 rounded-lg shadow-2xl border ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : toast.type === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <p className="text-sm whitespace-pre-wrap font-sans m-0">
            {toast.message}
          </p>
        </motion.div>
      )}
    </AppShell>
  );
}