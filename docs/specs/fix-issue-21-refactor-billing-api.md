# Fix #21: billing/api.ts 944 → split por dominio (15 archivos <250)

> **Severidad**: 🟡 P2. Stack: `src/features/billing/`.
> **Esfuerzo**: ~1.5h. 1 commit.
> **Status**: ⏳ Pendiente.

## 1. Contexto

`src/features/billing/api.ts` (944 líneas) es el cliente de API del módulo
de billing. Hoy es un monolito con 30+ funciones de muchos dominios
diferentes + infraestructura compartida (mode detection, fallback, etc).

## 2. Estado objetivo

```
src/features/billing/
├── api.ts                                    ~30  barrel re-export (compat)
└── api/
    ├── _internal.ts                          ~100  infra: mode, api(), tryBackendOrFallback
    ├── policiesApi.ts                         ~55  getBillingPolicy, saveBillingPolicy
    ├── amortizationApi.ts                     ~75  getOrGenerateAmortization, registerPayment
    ├── discountsApi.ts                        ~90  legacy: addPropertyDiscount, listPropertyDiscounts
    ├── chargesApi.ts                         ~110  addPropertyCharge, listPropertyCharges, summary
    ├── rentIncreasesApi.ts                    ~55  addRentIncrease, listRentIncreases
    ├── accountStatementApi.ts                  ~55  getAccountStatement
    ├── invoicesApi.ts                        ~140  generateInvoice, listInvoices, lookup, markAsSent
    ├── ownerPayoutsApi.ts                     ~80  listOwnerPayouts, saveOwnerPayout, deleteOwnerPayout
    ├── ownerStatementApi.ts                  ~200  getOwnerStatement
    ├── actionsApi.ts                          ~70  logAction, listActions
    ├── bankAccountsApi.ts                     ~50  listBankAccounts, saveBankAccount
    ├── insuranceApi.ts                        ~80  getInsurancePolicy, saveInsurancePolicy
    └── apiModeApi.ts                          ~25  resetApiMode, getApiMode, syncEntities
```

**Total**: 944 → 30 (barrel) + 14 archivos entre 25-200 líneas.

## 3. Acceptance Criteria

### AC-1: 14 archivos nuevos en `src/features/billing/api/`

Los 14 listados arriba (excluyendo `_internal.ts` y `apiModeApi.ts` son auxiliares).

### AC-2: `src/features/billing/api.ts` < 50 líneas

Solo re-exports.

### AC-3: Cada archivo nuevo < 250 líneas

### AC-4: tsc exit 0

### AC-5: 80/80 tests pass

### AC-6: Compat con importadores externos

- `FinancialView.tsx` debe seguir importando desde `../billing/api` sin cambios.
- Cero cambios funcionales (mismo comportamiento end-to-end).
