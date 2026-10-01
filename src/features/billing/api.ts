// filepath: src/features/billing/api.ts
/**
 * Billing API client (barrel). Re-exporta `api/*` para mantener compat
 * con `import { ... } from '../billing/api'`. Detalle en `api/*Api.ts`.
 */
export { getBillingPolicy, saveBillingPolicy } from "./api/policiesApi";

export {
  getOrGenerateAmortization,
  registerPayment,
} from "./api/amortizationApi";

export { addPropertyDiscount, listPropertyDiscounts } from "./api/discountsApi";

export {
  addPropertyCharge,
  listPropertyCharges,
  listPropertyChargesForPeriod,
  removePropertyCharge,
  getInvoiceChargesSummary,
} from "./api/chargesApi";

export { addRentIncrease, listRentIncreases } from "./api/rentIncreasesApi";

export { getAccountStatement } from "./api/accountStatementApi";

export {
  generateInvoiceForMonth,
  listInvoices,
  getInvoiceForPeriod,
  markInvoiceAsSent,
} from "./api/invoicesApi";

export {
  listOwnerPayouts,
  saveOwnerPayout,
  deleteOwnerPayout,
} from "./api/ownerPayoutsApi";

export { getOwnerStatement } from "./api/ownerStatementApi";

export { logAction, listActions } from "./api/actionsApi";

export { listBankAccounts, saveBankAccount } from "./api/bankAccountsApi";

export { getInsurancePolicy, saveInsurancePolicy } from "./api/insuranceApi";

export { syncEntities, resetApiMode, getApiMode } from "./api/apiModeApi";
