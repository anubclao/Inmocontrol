// Test email endpoints via Node fetch.
const base = 'http://localhost:3001';

async function main() {
  console.log('=== /api/notifications/email/status ===');
  const r1 = await fetch(`${base}/api/notifications/email/status`);
  console.log(`HTTP ${r1.status}:`, await r1.json());

  console.log('\n=== /api/notifications/email/verify (fake SMTP) ===');
  const r2 = await fetch(`${base}/api/notifications/email/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mailbox: {
        purpose: 'cobros',
        fromName: 'Test Inmobiliaria',
        fromEmail: 'cobros@test.com',
        provider: {
          kind: 'smtp',
          host: 'smtp.gmail.com',
          port: 587,
          user: 'fake@gmail.com',
          pass: 'fake-app-password',
          secure: false,
        },
      },
    }),
  });
  console.log(`HTTP ${r2.status}:`, await r2.json());

  console.log('\n=== /api/notifications/email/send (missing fields) ===');
  const r3 = await fetch(`${base}/api/notifications/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'x@y.com' }),
  });
  console.log(`HTTP ${r3.status}:`, await r3.json());

  console.log('\n=== /api/notifications/email/send (missing mailbox + no fallback) ===');
  const r4 = await fetch(`${base}/api/notifications/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'x@y.com', subject: 'Hi', body: 'Body' }),
  });
  console.log(`HTTP ${r4.status}:`, await r4.json());
}

main().catch(console.error);
