# Fix #8: Refactor server/routes/billing.ts (1771 → <300 por archivo)

> **Severidad**: 🟠 P1. Stack: `server/routes/billing/`.

## AC-1: Estructura target

```
server/routes/billing/
  index.ts                              # barrel export (~50 líneas)
  policies.ts                           # GET/PUT policies
  amortization.ts                       # POST generate + GET by contractId
  payments.ts                           # POST payments + markInvoicePaid
  charges.ts                            # POST/GET/DELETE charges
  increases.ts                          # POST/GET increases
  ownerPayouts.ts                       # POST/GET/DELETE owner-payouts
  invoices.ts                           # POST generate/send + GET/lookup
  statements.ts                         # GET account-statement + owner-statement
  actions.ts                            # POST/GET actions
  shared.ts                             # loadPolicy, loadBankAccounts, etc.
```

## AC-2: Cero cambio funcional

- Mismos endpoints, mismos contratos.
- El barrel `index.ts` mantiene el `app.use("/api/billing", router)` funcionando.

## Effort

- 2 commits × ~2h c/u = 4h.

---

**Status:** ⏳ Pendiente.