// Test E2E del módulo SaaS Billing.
// Cubre: plans list → subscribe → payment methods → invoice → cancel → re-activate → plan admin CRUD.

const BASE = 'http://localhost:3001';

async function call(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function log(label, res) {
  const ok = res.status >= 200 && res.status < 300 ? '✅' : '❌';
  console.log(`${ok} HTTP ${res.status} — ${label}`);
  if (res.status >= 400 || process.env.VERBOSE) {
    console.log('   ', JSON.stringify(res.data).slice(0, 200));
  }
  return res;
}

async function main() {
  console.log('\n=== Plans ===');
  let r = await call('/api/saas-billing/plans');
  log('GET /plans', r);
  const proPlan = r.data.find((p) => p.slug === 'pro');

  console.log('\n=== Subscription (vacío al inicio) ===');
  r = await call('/api/saas-billing/subscription');
  log('GET /subscription', r);

  console.log('\n=== Subscribe to Pro ===');
  r = await call('/api/saas-billing/subscription', {
    method: 'POST',
    body: JSON.stringify({ planId: proPlan.id }),
  });
  log('POST /subscription (Pro)', r);
  const subId = r.data?.subscription?.id;

  console.log('\n=== Subscription (debe estar active) ===');
  r = await call('/api/saas-billing/subscription');
  log('GET /subscription', r);

  console.log('\n=== Payment Methods (vacío) ===');
  r = await call('/api/saas-billing/payment-methods');
  log('GET /payment-methods', r);

  console.log('\n=== Add VISA card ===');
  r = await call('/api/saas-billing/payment-methods', {
    method: 'POST',
    body: JSON.stringify({
      type: 'card',
      brand: 'visa',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2027,
      holderName: 'Anubis Test',
      makeDefault: true,
    }),
  });
  log('POST /payment-methods (visa)', r);
  const pmId = r.data?.id;

  console.log('\n=== Add Mastercard ===');
  r = await call('/api/saas-billing/payment-methods', {
    method: 'POST',
    body: JSON.stringify({
      type: 'card',
      brand: 'mastercard',
      last4: '5555',
      expiryMonth: 6,
      expiryYear: 2028,
      holderName: 'Anubis Test 2',
    }),
  });
  log('POST /payment-methods (mastercard)', r);
  const mcId = r.data?.id;

  console.log('\n=== Set mastercard as default ===');
  r = await call(`/api/saas-billing/payment-methods/${mcId}/default`, { method: 'PUT' });
  log('PUT /payment-methods/:id/default', r);

  console.log('\n=== Remove VISA (ya no es default) ===');
  r = await call(`/api/saas-billing/payment-methods/${pmId}`, { method: 'DELETE' });
  log('DELETE /payment-methods/:id', r);

  console.log('\n=== Invoices ===');
  r = await call('/api/saas-billing/invoices');
  log('GET /invoices', r);
  console.log('   invoices count:', r.data?.length);

  console.log('\n=== Plan admin: crear plan custom ===');
  r = await call('/api/saas-billing/plans', {
    method: 'POST',
    body: JSON.stringify({
      slug: 'enterprise',
      name: 'Enterprise',
      description: 'Para holdings inmobiliarios',
      priceCop: 999000,
      maxProperties: 5000,
      maxUsers: 100,
      maxAlertsPerMonth: 100000,
      features: ['Ilimitado casi todo', 'Soporte 24/7', 'Account manager'],
      sortOrder: 40,
    }),
  });
  log('POST /plans (enterprise)', r);
  const enterpriseId = r.data?.id;

  console.log('\n=== Plan admin: actualizar precio ===');
  r = await call(`/api/saas-billing/plans/${enterpriseId}`, {
    method: 'PUT',
    body: JSON.stringify({ priceCop: 1199000 }),
  });
  log('PUT /plans/:id', r);

  console.log('\n=== Plan admin: desactivar enterprise (sin subs) ===');
  r = await call(`/api/saas-billing/plans/${enterpriseId}`, { method: 'DELETE' });
  log('DELETE /plans/:id (hard delete OK porque no tiene subs)', r);

  console.log('\n=== Cancel subscription ===');
  r = await call('/api/saas-billing/subscription', { method: 'DELETE' });
  log('DELETE /subscription', r);

  console.log('\n=== Reactivate subscription ===');
  r = await call('/api/saas-billing/subscription/reactivate', { method: 'POST' });
  log('POST /subscription/reactivate', r);

  console.log('\n=== Final state ===');
  r = await call('/api/saas-billing/subscription');
  log('GET /subscription', r);
  console.log('   cancel_at_period_end:', r.data?.cancelAtPeriodEnd);

  console.log('\n✅ Test E2E completo.\n');
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
