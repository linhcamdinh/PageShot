// End-to-end test of saving PNG and JPEG files. Run: node tests/export.e2e.mjs (needs Playwright).
// Playwright renames downloads to random ids, so check file paths with the export.js helpers instead.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pageshot-ex-'));
const ext = path.join(out, 'ext');
fs.cpSync(path.join(here, '../extension'), ext, { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); mf.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
const fixture = fs.readFileSync(path.join(here, 'fixture2.html'));
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fixture); }).listen(8767);
const downloads = path.join(out, 'downloads');
const ctx = await chromium.launchPersistentContext(path.join(out, 'profile'), {
  channel: 'chromium', headless: true, viewport: { width: 1100, height: 760 }, acceptDownloads: true, downloadsPath: downloads,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
const page = await ctx.newPage(); await page.goto('http://localhost:8767/');
const helper = await ctx.newPage(); await helper.goto(`chrome-extension://${extId}/popup/popup.html`);
await page.bringToFront();
const tab = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8767/*' }))[0]);
const edP = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('editor.html') });
await helper.evaluate((tab) => chrome.runtime.sendMessage({ type: 'capture', mode: 'visible', tab }), tab);
const ed = await edP;
const errors = []; ed.on('pageerror', (e) => errors.push(e.message));
await ed.waitForFunction(() => window.pageshotEditor?.base);
const box = await ed.locator('#canvas').boundingBox();
await ed.mouse.move(box.x + 300, box.y + 300); await ed.mouse.down(); await ed.mouse.move(box.x + 100, box.y + 150, { steps: 5 }); await ed.mouse.up();

await ed.click('#save-settings');
await ed.uncheck('#ask-location');
await ed.fill('#folder', 'Pageshot/Tests'); await ed.dispatchEvent('#folder', 'change');
await ed.fill('#filename', 'my: shot?'); await ed.dispatchEvent('#filename', 'change');
console.log('cleaned name', await ed.inputValue('#filename'));
await ed.screenshot({ path: path.join(out, 'menu.png') });

async function saveAs(format, quality) {
  await ed.click(`[data-format=${format}]`);
  if (quality) { await ed.locator('#quality').fill(String(quality)); await ed.dispatchEvent('#quality', 'change'); }
  await ed.evaluate(() => (document.getElementById('toast').hidden = true));
  const dl = ed.waitForEvent('download').catch(() => null);
  await ed.click('#save');
  await ed.waitForSelector('#toast:not([hidden])', { timeout: 15000 });
  const toast = await ed.locator('#toast-text').textContent();
  const d = await dl;
  const item = await ed.evaluate(async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0]);
  console.log(format, 'toast:', toast, '| path:', item.filename.split('/').slice(-3).join('/'), '| bytes:', item.fileSize, '| mime:', item.mime);
  if (d) await d.saveAs(path.join(out, `saved.${format}`));
  await ed.waitForTimeout(300);
}
await saveAs('png');
await saveAs('jpeg', 70);
await saveAs('jpeg', 100);
await ed.screenshot({ path: path.join(out, 'toast.png') });
const settings = await ed.evaluate(async () => (await chrome.storage.local.get('exportSettings')).exportSettings);
console.log('remembered settings', JSON.stringify(settings));
console.log('save button', await ed.locator('#save').textContent());
console.log('errors', JSON.stringify(errors), 'out', out);
await ctx.close(); srv.close();
