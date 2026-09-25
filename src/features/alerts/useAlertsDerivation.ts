/**
 * useAlertsDerivation — auto-deriva alerts cuando cambian los datos
 * fuente. Encapsula el useEffect inline de App.tsx que re-corria
 * `deriveAlerts` cada vez que cambiaban contratos/facturas/props/tenants.
 *
 * El alertsStore NO persiste la lista (siempre se rederiva); solo
 * persiste los IDs descartados. Mantiene el dashboard honesto: si el
 * estado de una factura cambia, el contador de alertas también.
 */
import { useEffect } from 'react';
import { deriveAlerts } from './deriveAlerts';
import { useAlertsStore } from './alertsStore';
import { useBillingStore } from '../billing/billingStore';
import { useContractStore } from '../contracts/contractStore';
import { useAppStore } from '../../shared/store/appStore';

export function useAlertsDerivation() {
  const contracts = useContractStore((s) => s.contracts);
  const billingInvoices = useBillingStore((s) => s.invoices);
  const properties = useAppStore((s) => s.properties);
  const tenants = useAppStore((s) => s.tenants);

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
}