// Inspect what the UI actually shows for mandate state.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Console listener
page.on('console', msg => console.log(`[browser ${msg.type()}]`, msg.text()));
page.on('pageerror', err => console.log('[pageerror]', err.message));

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Click on the property card
const card = await page.locator('text=CL 145 76 55 T1 AP 202').first();
if (await card.count() > 0) {
  await card.click();
  await page.waitForTimeout(1500);
}

// Read the Zustand state from window
const state = await page.evaluate(() => {
  return {
    mandateUrl: document.querySelector('img[alt*="Mandato"], iframe[src*="drive.google"]')?.outerHTML?.slice(0, 200),
    cardHTML: document.querySelector('[data-testid^="inventory-count"]')?.parentElement?.parentElement?.outerHTML?.slice(0, 1500),
  };
});
console.log('=== UI state ===');
console.log(JSON.stringify(state, null, 2));

// Try to inspect Zustand directly
const zustandState = await page.evaluate(() => {
  // @ts-ignore
  const stores = window.__zustand_stores__;
  return stores ? Object.keys(stores) : 'no __zustand_stores__';
});
console.log('Zustand stores:', zustandState);

// Screenshot
await page.screenshot({ path: 'D:/desarrollos/Inmocontrol/diag.png', fullPage: true });

await browser.close();
console.log('Done.');