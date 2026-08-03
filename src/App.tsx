import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DashboardView } from "./features/dashboard/DashboardView";
import { PropertiesView } from "./features/properties/PropertiesView";
import { TenantsView } from "./features/tenants/TenantsView";
import { FinancialView } from "./features/financial/FinancialView";
import { ReportsView } from "./features/reports/ReportsView";
import { AlertsView } from "./features/alerts/AlertsView";
import { SettingsView } from "./features/settings/SettingsView";
import { LoginScreen } from "./features/auth/LoginScreen";
import { AppShell, TabId } from "./features/shell/AppShell";
import { LoadingScreen } from "./features/shell/LoadingScreen";
import { ContractsView } from "./features/contracts/ContractsView";
import { BillingView } from "./features/billing/views/BillingView";
import { Role, can } from "./features/auth/permissions";
import { useContractStore } from "./features/contracts/contractStore";
import { inventoryDB } from "./features/properties/inventoryDB";
import type { Contract } from "./features/contracts/contractTypes";
import { useAppStore } from "./shared/store/appStore";
// createPropertyFolders se importaba aquí y se llamaba después de addProperty, pero
// eso creaba una SEGUNDA carpeta en Drive (el wizard ya la crea en POST /api/properties).
// Eliminado: el path actual (wizard) maneja toda la creación de carpetas.
import type { FinancialRecord } from "./shared/store/types";
import { STORAGE_KEYS } from "./shared/hooks/storageKeys";
import { useGoogleDriveStore } from "./shared/store/googleDriveStore";
import { DriveStatusBanner } from "./shared/ui/DriveStatusBanner";
import { useBillingStore } from "./features/billing/billingStore";
import { deriveAlerts } from "./features/alerts/deriveAlerts";
import { useAlertsStore } from "./features/alerts/alertsStore";

/**
 * Inactividad → logout automático.
 * 8 horas = un día de trabajo completo. Antes era 15 min, muy agresivo
 * (sacaba al usuario del wizard en medio del inventario si se distraía).
 * Para cambiar a "nunca cierra salvo logout manual", setear este valor
 * a un número muy grande (ej: Number.MAX_SAFE_INTEGER) o eliminar el useEffect
 * que lo usa en el archivo.
 */
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

interface LocalUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: Role;
}

const DEFAULT_USER: LocalUser = {
  uid: "admin-local",
  displayName: "Administrador Inmobiliario",
  email: "admin@inmocontrol.com",
  role: "admin",
  photoURL: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<LocalUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [inventoryModalProperty, setInventoryModalProperty] = useState<
    any | null
  >(null);
  const [inventoryPhase, setInventoryPhase] = useState<
    "inicial" | "final" | null
  >(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contracts = useContractStore((s) => s.contracts);
  const billingInvoices = useBillingStore((s) => s.invoices);

  // ── Data layer: Zustand useAppStore (Fase 2 — antes era localStorage directo)
  const properties = useAppStore((s) => s.properties);
  const tenants = useAppStore((s) => s.tenants);
  const financialRecords = useAppStore((s) => s.financialRecords);
  const addProperty = useAppStore((s) => s.addProperty);
  const updateProperty = useAppStore((s) => s.updateProperty);
  const addTenant = useAppStore((s) => s.addTenant);
  const updateTenant = useAppStore((s) => s.updateTenant);
  const removeTenant = useAppStore((s) => s.removeTenant);
  const addFinancialRecord = useAppStore((s) => s.addFinancialRecord);
  const updateFinancialRecord = useAppStore((s) => s.updateFinancialRecord);
  const removeFinancialRecord = useAppStore((s) => s.removeFinancialRecord);
  const removeProperty = useAppStore((s) => s.removeProperty);

  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [openedMonths, setOpenedMonths] = useState<string[]>([]);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Reset inactivity timeout
  useEffect(() => {
    if (user) {
      const events = [
        "mousedown",
        "mousemove",
        "keypress",
        "scroll",
        "touchstart",
      ];
      const handler = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          handleLogout();
        }, SESSION_TIMEOUT_MS);
      };
      events.forEach((event) => window.addEventListener(event, handler));
      handler();
      return () => {
        events.forEach((event) => window.removeEventListener(event, handler));
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [user]);

  // ── Hidratación: cargar todo desde MySQL ─────────────────────────────
  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.user);

    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as LocalUser;
        setUser(parsed);
        setRole(parsed.role ?? "admin");
      } catch {
        setUser(DEFAULT_USER);
        setRole("admin");
      }
    } else {
      setUser(DEFAULT_USER);
      setRole("admin");
    }

    // Limpiar localStorage legacy (ya no se usa)
    Object.values(STORAGE_KEYS).forEach((key) => {
      if (key !== STORAGE_KEYS.user) localStorage.removeItem(key);
    });

    // Cargar datos desde MySQL
    void useAppStore.getState().hydrate();

    // Chequear estado de Google Drive al montar
    void useGoogleDriveStore.getState().checkStatus();

    setLoading(false);
  }, []);

  // ── Re-derivar alertas cada vez que cambian los datos fuente ──
  // El alertsStore NO persiste la lista (siempre se rederiva); solo persiste
  // los IDs descartados. Esto mantiene el dashboard honesto: si el estado de
  // una factura cambia, el contador de alertas también.
  useEffect(() => {
    const allInvoices = Object.values(billingInvoices).flat();
    const alerts = deriveAlerts({
      contracts,
      invoices: allInvoices,
      properties,
      tenants,
    });
    useAlertsStore.getState().setAlerts(alerts);
  }, [contracts, billingInvoices, properties, tenants]);

  const handleLogin = (loggedInUser: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    organizationId: string;
  }) => {
    // Mapea el user del server (snake_case → camelCase) al shape local
    const localUser = {
      uid: loggedInUser.id,
      displayName: loggedInUser.displayName,
      email: loggedInUser.email,
      role: loggedInUser.role as Role,
    };
    setUser(localUser);
    setRole(localUser.role);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(localUser));
    showToast(`Bienvenido, ${loggedInUser.displayName}`);
  };

  const handleLogout = async () => {
    // Limpia cookie de sesión en el server
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // silent — igual limpiamos local
    }
    setUser(null);
    setRole(null);
    localStorage.removeItem(STORAGE_KEYS.user);
    // FIX PRIVACIDAD: limpiar también el draft del wizard de propiedad.
    // Sin esto, el siguiente user en el mismo browser ve el draft del
    // user anterior al hacer click en "+ Agregar Propiedad" (la app
    // restaura drafts viejos de localStorage sin filtrar por user).
    try {
      localStorage.removeItem(STORAGE_KEYS.wizardPropertyDraft);
    } catch {
      /* silent */
    }
    // FIX: limpiar el store Zustand también. Sin esto, los datos del usuario
    // anterior quedan en memoria del browser, accesibles si el siguiente user
    // usa la misma sesión/equipo. Además, evita la confusión de ver "datos
    // viejos" después de un logout+login rápido.
    useAppStore.getState().reset();
    showToast("Sesión finalizada");
  };

  /**
   * Re-hidrata los datos del store cuando el user pasa de null a !null
   * (es decir, después de un login). Sin esto, el store mantiene datos
   * del user anterior o aparece vacío tras un logout+login. Con el
   * reset() en handleLogout, partimos de initialState y necesitamos
   * volver a traer todo de MySQL.
   */
  useEffect(() => {
    if (user) {
      void useAppStore.getState().hydrate();
      // Re-chequear Google Drive por si cambió de cuenta entre sesiones
      void useGoogleDriveStore.getState().checkStatus();
    }
  }, [user]);

  /**
   * Al montar la app, si hay cookie de sesión válida, intenta restaurar
   * la sesión llamando GET /api/auth/me. Si responde 401, queda en login.
   * Si responde 200, autologin sin pedir password.
   */
  useEffect(() => {
    if (!user) {
      const stored = localStorage.getItem(STORAGE_KEYS.user);
      if (!stored) return; // no hay user previo → mostrar login
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.uid) {
          // Hay user en localStorage pero la cookie puede haber expirado.
          // Intentamos revalidar con el server antes de dejarlo entrar.
          fetch("/api/auth/me", { credentials: "include" })
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json();
                setUser({
                  uid: data.user.id,
                  displayName: data.user.displayName,
                  email: data.user.email,
                  role: data.user.role as Role,
                });
                setRole(data.user.role as Role);
              } else {
                // Sesión expirada — limpiar local
                localStorage.removeItem(STORAGE_KEYS.user);
              }
            })
            .catch(() => {
              /* silent */
            });
        }
      } catch {
        /* silent */
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── CRUD handlers (Fase 2 — ahora delegan al store) ─────────────
  const handleAddProperty = (newProperty: any) => {
    console.log(
      "[App] handleAddProperty — newProperty.id:",
      newProperty.id,
      "address:",
      newProperty.address,
    );
    const propertyWithId = {
      ...newProperty,
      id: newProperty.id ?? `prop-${Date.now()}`,
      createdAt: newProperty.createdAt ?? new Date().toISOString(),
      createdBy: newProperty.createdBy ?? user?.uid,
    };
    console.log("[App] addProperty al store con id:", propertyWithId.id);
    addProperty(propertyWithId);
    showToast("Propiedad guardada");

    // BUG HISTÓRICO: este bloque creaba una SEGUNDA carpeta en Drive porque el
    // wizard ya crea la carpeta en POST /api/properties (paso 1). El endpoint
    // /api/drive/create-property-folders NO chequeaba si existía → duplicado.
    // FIX: el wizard maneja toda la creación de carpetas. Si en el futuro hay
    // un path "quick add" sin wizard, ese path debe llamar a un endpoint con
    // check de existencia.

    // Si el wizard ya creó el inventario de captación (step 3.5 corre antes
    // que addProperty) el state local podría tener inventoryCount desactualizado.
    // Refrescamos esa propiedad puntual desde el server para que:
    //   - el trash button se oculte / candado aparezca (inventoryCount)
    //   - los links a PDFs en Drive aparezcan en el detalle (captacion/colocacion URLs)
    //   - el badge de "N inventarios" se vea correcto
    // Si el ID es local (prop-* fallback), el server responde 404 → lo ignoramos.
    void fetch(`/api/properties/${propertyWithId.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh) => {
        if (!fresh) return;
        const patch: Record<string, any> = {};
        if (fresh.inventory_count !== undefined)
          patch.inventoryCount = fresh.inventory_count;
        if (fresh.inventory_pdf_url)
          patch.inventoryPdfUrl = fresh.inventory_pdf_url;
        if (
          fresh.inventario_captacion_pdf_url ||
          fresh.inventory_captacion_pdf_url
        ) {
          patch.inventoryCaptacionPdfUrl =
            fresh.inventario_captacion_pdf_url ??
            fresh.inventory_captacion_pdf_url;
        }
        if (
          fresh.inventario_colocacion_pdf_url ||
          fresh.inventory_colocacion_pdf_url
        ) {
          patch.inventoryColocacionPdfUrl =
            fresh.inventario_colocacion_pdf_url ??
            fresh.inventory_colocacion_pdf_url;
        }
        if (Object.keys(patch).length > 0) {
          updateProperty(propertyWithId.id, patch);
        }
      })
      .catch(() => {
        /* silent — la UI no depende de este refresh */
      });
  };
  const handleUpdateProperty = (id: string, updates: any) => {
    updateProperty(id, updates);
    showToast("Propiedad actualizada");
  };
  const handleUpdateTenant = async (
    id: string,
    updates: any,
  ): Promise<boolean> => {
    // FIX Karpathy (jul-2026): antes era fire-and-forget con toast mentiroso
    // ("Inquilino actualizado" aparecía aunque el server hubiera devuelto 500).
    // Ahora esperamos el resultado real del store y mostramos el toast correcto.
    // Retornamos el `ok` para que el modal de edición (que llama a esta función
    // directamente) pueda mostrar su propio toast detallado (con el nombre del
    // tenant) en vez del genérico "Inquilino actualizado".
    const ok = await updateTenant(id, updates);
    if (ok) {
      showToast("Inquilino actualizado");
    } else {
      showToast(
        "Error al actualizar el inquilino. Reintentá en unos segundos.",
        "error",
      );
    }
    return ok;
  };
  const handleAddTenant = (newTenant: any) => {
    const tenantWithId = {
      ...newTenant,
      id: newTenant.id ?? `tenant-${Date.now()}`,
      createdAt: newTenant.createdAt ?? new Date().toISOString(),
    };
    addTenant(tenantWithId);
    showToast("Inquilino registrado");
  };
  const handleAddRecord = (record: any) => {
    const recordWithId = { ...record, id: record.id ?? `fin-${Date.now()}` };
    addFinancialRecord(recordWithId);
    showToast("Registro financiero guardado");
  };
  const handleDeleteTenant = async (id: string) => {
    await removeTenant(id);
    showToast("Arrendatario eliminado");
  };
  const handleDeleteRecord = (id: string) => {
    removeFinancialRecord(id);
    showToast("Registro eliminado");
  };
  const handleUpdateRecord = (updatedRecord: any) => {
    const { id, ...data } = updatedRecord;
    updateFinancialRecord(id, data);
    showToast("Registro actualizado");
  };
  const handleCloseMonth = (propertyId: string, month: string) => {
    setClosedMonths((prev) => [...prev, `${propertyId}-${month}`]);
    showToast(`Mes de ${month} cerrado correctamente para este inmueble`);
  };
  const handleOpenMonth = (propertyId: string, month: string) => {
    setOpenedMonths((prev) => [...prev, `${propertyId}-${month}`]);
    showToast(`Mes de ${month} abierto correctamente para este inmueble`);
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

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

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
        setRole(r);
        const u = { ...user, role: r };
        setUser(u);
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(u));
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

      {/* Toast UI — esquina inferior derecha */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className={`fixed bottom-6 right-6 z-[9999] max-w-md p-4 rounded-lg shadow-2xl border ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <pre className="text-sm whitespace-pre-wrap font-sans m-0">
            {toast.message}
          </pre>
        </motion.div>
      )}
    </AppShell>
  );
}
