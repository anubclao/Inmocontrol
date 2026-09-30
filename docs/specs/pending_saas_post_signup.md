# Pendientes SaaS post-signup (2026-09-26)

> Documento de apoyo. NO es un spec Karpathy todavía — solo registra
> dos decisiones de producto que el usuario planteó en sesión pero
> para las que NO se comenzó implementación. Si las activamos, hay
> que convertirlas en spec formal siguiendo
> [`TEMPLATE_feature-spec.md`](TEMPLATE_feature-spec.md).

## 1. Mail de bienvenida post-signup

**Contexto:** Hoy el signup es "trial instantáneo, sin verificación de email"
([saas_signup.md AC-14](saas_signup.md)). El usuario preguntó por qué no
se envía un correo de verificación.

**Decisión tomada (autónoma, 2026-09-26):** **NO implementar por ahora.**

Razones:

- `saas_signup.md` AC-14 lo declara explícitamente out-of-scope para v1.
- `nodemailer` ya está instalado (Fase 7 cerrada), pero forzar
  verificación pre-trial es anti-patrón SaaS (mata el signup rate).
- Falta `forgot password` que es más urgente que welcome.

**Cuando se reactive**, opciones a evaluar:

- **A**: Magic link de bienvenida (mail no bloqueante, llega post-signup).
- **B**: Verificación dura pre-trial (alto friction, no recomendado).
- **C**: Verificación al primer pago (compromiso, requiere flujo Stripe/PSP).

## 2. Gating de Google Drive por plan

**Contexto:** El usuario preguntó cómo se va a manejar Drive cuando varias
orgs se registren y deban conectar sus Drives. Hoy el botón está
siempre visible en `Settings → Integraciones`.

**Estado actual (verificado en código, 2026-09-26):**

- `user_oauth_tokens` está atado al `user_id` del `profile` (no a la org).
- Como cada `profile` pertenece a una sola `organization` (FK), no hay
  colisión entre orgs: Org A y Org B usan Drives distintos porque cada
  admin conecta SU propio Drive personal.
- Las queries siempre filtran por `user_id`, no por `organization_id`.

**Decisión tomada (autónoma, 2026-09-26):** **NO gating por ahora.**

Razones:

- Multi-tenant recién quedó verde (verifier 18/20). Es seguro.
- El modelo de monetización (cuánto cuesta el plan pro, si Drive va
  incluido) es decisión de producto, no de código. Sin pricing cerrado
  no podemos decidir qué feature va en qué plan.
- Hoy es seguro: dos orgs distintas no pueden ver archivos de la otra
  (cada OAuth token está firmado contra su `user_id`).

**Cuando se reactive**, opciones:

- **A**: Drive siempre disponible, incluido en trial (default actual).
- **B**: Drive solo en plan `pro` o superior. Trial ve upsell.
  Spec: `saas_drive_gating.md` (1-2 días: 1 endpoint + banner + gating).
- **C**: Drive con cuota (trial = 20 archivos/mes, pro = ilimitado).
  Spec: `saas_drive_quotas.md` (2-3 días: migración para contar +
  middleware de quota).

## Próximos pasos sugeridos (no pedidos todavía)

1. Definir pricing del plan pro (input de producto, no de código).
2. Implementar `forgot password` con `nodemailer` (más urgente que welcome).
3. Decidir política de Drive según el pricing que se defina.
4. Recién ahí escribir `saas_drive_gating.md` o `saas_drive_quotas.md`
   si hace falta.
