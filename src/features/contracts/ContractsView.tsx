import { useState, useMemo } from "react";
import { motion } from "motion/react";
import {
  Plus,
  FileText,
  CheckCircle,
  ClipboardCheck,
  Clock,
  X,
  Download,
} from "lucide-react";
import { Button, Card } from "../../shared/ui";
import { useContractStore } from "./contractStore";
import { useAppStore } from "../../shared/store/appStore";
import {
  deriveContractStatus,
  type Contract,
  type ContractStatus,
} from "./contractTypes";
import { generateContractPdf } from "./contractPdf";
import { Role, can } from "../auth/permissions";
import { formatCurrency } from "../../utils/calculations";
import { createContractServer, updateContractServer } from "./contractApi";
import { ProcessOrderBanner } from "../../shared/ui/ProcessOrderBanner";
import { StatTile } from "./components/StatTile";
import { ContractRow } from "./components/ContractRow";
import { ContractForm } from "./components/ContractForm";
import { ContractDetail } from "./components/ContractDetail";

export interface ContractsViewProps {
  showToast: (msg: string, type?: "success" | "error") => void;
  properties: any[];
  tenants: any[];
  role: Role | null;
  onStartInventoryEnd: (contract: Contract) => void;
}

export function ContractsView({
  showToast,
  properties: propsProperties,
  tenants: propsTenants,
  role,
  onStartInventoryEnd,
}: ContractsViewProps) {
  const { contracts, addContract, updateContract, setStatus } =
    useContractStore();
  // Leemos del store de Zustand primero (datos del seed), con fallback a las
  // props que pasa App.tsx. Esto evita el bug de "N/A" cuando el modal se
  // abre antes de que App.tsx termine de hidratar el useState desde
  // localStorage.
  const storeProperties = useAppStore((s) => s.properties);
  const storeTenants = useAppStore((s) => s.tenants);
  const properties =
    storeProperties.length > 0 ? storeProperties : propsProperties;
  const tenants = storeTenants.length > 0 ? storeTenants : propsTenants;
  const [filter, setFilter] = useState<"all" | ContractStatus>("all");
  const [editing, setEditing] = useState<Contract | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Contract | null>(null);

  const enriched = useMemo(
    () =>
      contracts.map((c) => ({ contract: c, info: deriveContractStatus(c) })),
    [contracts],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return enriched;
    return enriched.filter((e) => e.info.status === filter);
  }, [enriched, filter]);

  const stats = useMemo(
    () => ({
      total: contracts.length,
      active: enriched.filter((e) => e.info.status === "active").length,
      expiring: enriched.filter((e) => e.info.status === "expiring").length,
      expired: enriched.filter((e) => e.info.status === "expired").length,
      needsInventory: enriched.filter((e) => e.info.needsInventoryEnd).length,
    }),
    [contracts, enriched],
  );

  const propertyName = (id: string) =>
    properties.find((p: any) => p.id === id)?.address ?? "N/A";
  const tenantName = (id: string) =>
    tenants.find((t: any) => t.id === id)?.name ?? "N/A";

  const handleDownloadPdf = async (contract: Contract) => {
    const property = properties.find((p: any) => p.id === contract.propertyId);
    const tenant = tenants.find((t: any) => t.id === contract.tenantId);
    if (!property || !tenant) {
      showToast(
        "No se puede generar el PDF: faltan datos del inmueble o inquilino",
        "error",
      );
      return;
    }
    try {
      await generateContractPdf({
        contract,
        property: {
          address: property.address,
          owner: property.owner,
          chip: property.chip,
          ownerIdNumber: property.ownerIdNumber,
        },
        tenant: {
          name: tenant.name,
          documentId: tenant.documentId,
          email: tenant.email,
          phone: tenant.phone,
        },
      });
      showToast("PDF del contrato generado", "success");
    } catch (err) {
      console.error(err);
      showToast("Error al generar el PDF del contrato", "error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Contratos de Arrendamiento
          </h2>
          <p className="text-slate-500 text-sm">
            Vigencia, vencimientos e Inventarios Finales
          </p>
        </div>
        {/*
          IMPORTANTE: el botón "Nuevo Contrato" está OCULTO a propósito.
          El contrato NO se crea manualmente desde acá. Se genera
          AUTOMÁTICAMENTE al firmar el Inventario de Colocación (en el
          módulo de Arrendatarios). El orden legal del proceso es:
            1. Propiedad con mandato firmado (status=Activo)
            2. Crear tenant (status=En Colocación)
            3. Subir cédula del tenant
            4. Firmar Inventario de Colocación (arrendatario + agente)
               → AQUÍ se crea el contrato (status=active) y la propiedad
                 pasa a "Arrendado"
            5. Recién con contrato activo se puede operar billing/recibos
          Permitir crear contratos desde acá violaría ese orden: el
          contrato existiría sin que el arrendatario haya firmado el
          inventario, lo cual es ilegal y operativamente confuso.
        */}
      </div>

      {/* Banner explicando el nuevo orden — mismo ProcessOrderBanner que los otros módulos */}
      <ProcessOrderBanner
        currentStep="contracts"
        title="Paso 3 (automático): Contrato generado al firmar Inventario de Colocación"
        description="Los contratos NO se crean manualmente desde acá. Se generan automáticamente al firmar el Inventario de Colocación del arrendatario (paso 2/3). Esto garantiza que el contrato siempre exista junto con un arrendamiento legalmente cerrado. Desde este módulo podés consultar los contratos existentes y editar fechas o condiciones especiales."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile
          label="Total"
          value={stats.total}
          icon={<FileText className="w-4 h-4" />}
        />
        <StatTile
          label="Vigentes"
          value={stats.active}
          icon={<CheckCircle className="w-4 h-4" />}
          tone="ok"
        />
        <StatTile
          label="Por vencer"
          value={stats.expiring}
          icon={<Clock className="w-4 h-4" />}
          tone="warn"
        />
        <StatTile
          label="Vencidos"
          value={stats.expired}
          icon={<X className="w-4 h-4" />}
          tone="bad"
        />
        <StatTile
          label="Req. Inv. Final"
          value={stats.needsInventory}
          icon={<ClipboardCheck className="w-4 h-4" />}
          tone="warn"
        />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            "all",
            "active",
            "expiring",
            "expired",
            "terminated",
            "draft",
          ] as const
        ).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-bold uppercase rounded-full whitespace-nowrap transition-all ${
              filter === f
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f === "all"
              ? "Todos"
              : f === "active"
                ? "Vigentes"
                : f === "expiring"
                  ? "Por vencer"
                  : f === "expired"
                    ? "Vencidos"
                    : f === "terminated"
                      ? "Terminados"
                      : "Borrador"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-700">
            No hay contratos {filter !== "all" ? filter : ""}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Crea uno para empezar a gestionar vigencias.
          </p>
          {can(role, "canAddProperty") && (
            <Button className="mt-4 gap-2" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" />
              Crear primer contrato
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ contract, info }) => (
            <ContractRow
              key={contract.id}
              contract={contract}
              info={info}
              propertyName={propertyName(contract.propertyId)}
              tenantName={tenantName(contract.tenantId)}
              onView={() => setViewing(contract)}
              onEdit={() => setEditing(contract)}
              onStartInventoryEnd={() => onStartInventoryEnd(contract)}
              onTerminate={() => {
                setStatus(contract.id, "terminated");
                showToast("Contrato terminado anticipadamente");
              }}
              onDownloadPdf={() => handleDownloadPdf(contract)}
            />
          ))}
          {/* `key` consumido por React, no se pasa al componente */}
        </div>
      )}

      {/* Modales */}
      {creating && (
        <ContractForm
          onClose={() => setCreating(false)}
          onSave={async (c) => {
            // Persistir primero en MySQL — si el server rechaza, NO creamos
            // el contrato local (queda fantasma). Razón: el billing necesita
            // el contrato en MySQL para que la FK de amortization_rows resuelva.
            try {
              const created = await createContractServer(c);
              addContract(created);
              setCreating(false);
              showToast("Contrato creado");
            } catch (err: any) {
              console.error("[ContractsView] createContract failed:", err);
              showToast(
                err?.message ?? "No se pudo crear el contrato en el servidor",
                "error",
              );
            }
          }}
          properties={properties}
          tenants={tenants}
        />
      )}
      {editing && (
        <ContractForm
          contract={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            try {
              const updated = await updateContractServer(c.id, c);
              updateContract(c.id, updated);
              setEditing(null);
              showToast("Contrato actualizado");
            } catch (err: any) {
              console.error("[ContractsView] updateContract failed:", err);
              showToast(
                err?.message ??
                  "No se pudo actualizar el contrato en el servidor",
                "error",
              );
            }
          }}
          properties={properties}
          tenants={tenants}
        />
      )}
      {viewing && (
        <ContractDetail
          contract={viewing}
          onClose={() => setViewing(null)}
          propertyName={propertyName(viewing.propertyId)}
          tenantName={tenantName(viewing.tenantId)}
          onDownloadPdf={() => handleDownloadPdf(viewing)}
        />
      )}
    </motion.div>
  );
}
