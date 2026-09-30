# Verifier #8: billing route refactor

- `wc -l server/routes/billing/*.ts` → <300 c/u
- `app.use("/api/billing", billingRouter)` sigue funcionando

**Status:** ⏳ Pending