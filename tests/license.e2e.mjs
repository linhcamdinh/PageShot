// End-to-end test of the trial and paywall. Run: node tests/license.e2e.mjs (needs Playwright).
// ExtensionPay is not reachable from tests, so paid status is simulated through its cache.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pageshot-lic-'));
const ext = path.join(out, 'ext');
fs.cpSync(path.join(here, '../extension'), ext, { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); mf.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
const fixture = fs.readFileSync(path.join(here, 'fixture2.html'));
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fixture); }).listen(8768);
const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 900, height: 700 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
const welcome = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('reason=welcome'), timeout: 10000 }).catch(() => null);
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const swErrors = []; sw.on('console', (m) => m.type() === 'error' && swErrors.push(m.text()));
const extId = sw.url().split('/')[2];
const w = await welcome;
console.log('welcome tab opened:', !!w);
if (w) { await w.waitForSelector('[data-view=welcome]:not([hidden])'); await w.screenshot({ path: path.join(out, 'welcome.png'), fullPage: true }); }

const page = await ctx.newPage(); await page.goto('http://localhost:8768/');
const popup = await ctx.newPage(); await popup.setViewportSize({ width: 260, height: 260 });
async function popupFooter() {
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`); await popup.waitForTimeout(400);
  return (await popup.locator('#plan').isHidden()) ? '(hidden)' : await popup.locator('#plan-text').textContent();
}
const tab = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8768/*' }))[0]);
async function tryCapture() {
  const next = ctx.waitForEvent('page', { timeout: 10000 });
  await popup.evaluate((tab) => chrome.runtime.sendMessage({ type: 'capture', mode: 'visible', tab }), tab);
  const p = await next; await p.waitForLoadState(); return p;
}
const setStorage = (obj) => sw.evaluate(async (obj) => { await chrome.storage.local.set(obj); await chrome.storage.sync.set(obj.trialStart ? { trialStart: obj.trialStart } : {}); }, obj);

console.log('day 0 footer:', await popupFooter());
await popup.screenshot({ path: path.join(out, 'popup-trial.png') });
let p = await tryCapture(); console.log('day 0 capture opens:', new URL(p.url()).pathname); await p.close();

await setStorage({ trialStart: Date.now() - 6.5 * 864e5 });
console.log('day 6.5 footer:', await popupFooter());

await setStorage({ trialStart: Date.now() - 8 * 864e5 });
console.log('day 8 footer:', await popupFooter());
await popup.screenshot({ path: path.join(out, 'popup-expired.png') });
p = await tryCapture(); console.log('day 8 capture opens:', new URL(p.url()).pathname + new URL(p.url()).search);
await p.waitForSelector('[data-view=expired]:not([hidden])'); await p.waitForTimeout(500);
console.log('expired page buy visible:', await p.locator('#buy').isVisible());
await p.screenshot({ path: path.join(out, 'expired.png'), fullPage: true });

// A later local value must not reset the earlier synced start.
await sw.evaluate(async () => chrome.storage.local.set({ trialStart: Date.now() }));
console.log('trial reset by local storage?', (await popupFooter()).includes('7 days'));

await sw.evaluate(async () => chrome.storage.local.set({ paidCache: { paid: true, checkedAt: Date.now() } }));
console.log('paid footer:', await popupFooter());
await p.reload(); await p.waitForTimeout(500);
console.log('paid page view:', await p.locator('section:not([hidden]) h1').textContent());
const p2 = await tryCapture(); console.log('paid capture opens:', new URL(p2.url()).pathname);
console.log('sw errors:', JSON.stringify(swErrors.filter((e) => !/extensionpay|Failed to fetch|ExtPay/i.test(e))));
console.log('out', out);
await ctx.close(); srv.close();
