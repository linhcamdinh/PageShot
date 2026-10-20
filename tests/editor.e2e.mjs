// End-to-end test of the annotation editor. Run: node tests/editor.e2e.mjs (needs Playwright).
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pageshot-ed-'));
const ext = path.join(out, 'ext');
fs.cpSync(path.join(here, '../extension'), ext, { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); mf.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
const fixture = fs.readFileSync(path.join(here, 'fixture2.html'));
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fixture); }).listen(8766);
const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1100, height: 760 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
const page = await ctx.newPage(); await page.goto('http://localhost:8766/');
const helper = await ctx.newPage(); await helper.goto(`chrome-extension://${extId}/popup/popup.html`);
await page.bringToFront();
const tab = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8766/*' }))[0]);
const edP = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('editor.html') });
await helper.evaluate((tab) => chrome.runtime.sendMessage({ type: 'capture', mode: 'visible', tab }), tab);
const ed = await edP;
const errors = []; ed.on('pageerror', (e) => errors.push(e.message)); ed.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await ed.waitForFunction(() => window.pageshotEditor?.base);
await ed.waitForTimeout(200);
const box = await ed.locator('#canvas').boundingBox();
const zoom = await ed.evaluate(() => window.pageshotEditor.zoom);
const at = (x, y) => [box.x + x * zoom, box.y + y * zoom];
async function drag(tool, [x1, y1], [x2, y2]) {
  await ed.click(`.tool[data-tool=${tool}]`);
  await ed.mouse.move(...at(x1, y1)); await ed.mouse.down(); await ed.mouse.move(...at(x2, y2), { steps: 8 }); await ed.mouse.up();
}
const shapes = () => ed.evaluate(() => window.pageshotEditor.shapes.map((s) => s.type + (s.text ? `:${s.text}` : '')));

await drag('blur', [100, 135], [300, 160]);           // hide API key
await ed.click('.tool[data-tool=arrow]'); await ed.click('.swatch[data-color="#e53935"]');
await drag('arrow', [520, 250], [250, 185]);           // arrow to the button
await drag('rect', [25, 165], [235, 225]);
await ed.selectOption('#fill', 'light');               // applies to the selected rect
await drag('ellipse', [600, 60], [760, 120]);
await ed.click('.tool[data-tool=pen]'); await ed.mouse.move(...at(600, 300)); await ed.mouse.down();
for (let i = 0; i <= 20; i++) await ed.mouse.move(...at(600 + i * 10, 300 + Math.sin(i / 2) * 20));
await ed.mouse.up();
await drag('highlighter', [30, 40], [330, 40]);
await ed.click('.tool[data-tool=step]'); await ed.mouse.click(...at(540, 255)); await ed.mouse.click(...at(80, 75));
// text
await ed.click('.tool[data-tool=text]');
await ed.mouse.click(...at(540, 240));
await ed.selectOption('#font', { label: 'Georgia' });
await ed.fill('#font-size', '30'); await ed.dispatchEvent('#font-size', 'change');
await ed.click('#text-bg');
await ed.locator('#text-input').focus();
await ed.keyboard.type('Click here to save');
await ed.keyboard.press('Control+Enter');
console.log('shapes', JSON.stringify(await shapes()));
const textShape = await ed.evaluate(() => window.pageshotEditor.shapes.find((s) => s.type === 'text'));
console.log('text style', textShape.font.split(',')[0], textShape.size, textShape.bold, textShape.background);
await ed.screenshot({ path: path.join(out, 'editor.png') });

// select + move + delete + undo
await ed.click('.tool[data-tool=select]');
const before = await ed.evaluate(() => window.pageshotEditor.shapes.find((s) => s.type === 'ellipse').x1);
await ed.mouse.move(...at(680, 90)); await ed.mouse.down(); await ed.mouse.move(...at(730, 130), { steps: 5 }); await ed.mouse.up();
const after = await ed.evaluate(() => window.pageshotEditor.shapes.find((s) => s.type === 'ellipse').x1);
console.log('moved ellipse by', Math.round(after - before));
await ed.keyboard.press('Delete');
console.log('after delete', (await shapes()).length);
await ed.keyboard.press('Control+z');
console.log('after undo', (await shapes()).length);
await ed.keyboard.press('Control+Shift+z');
console.log('after redo', (await shapes()).length);
await ed.keyboard.press('Control+z');

// crop
await drag('crop', [10, 20], [800, 360]);
await ed.click('#crop-apply');
console.log('after crop', await ed.locator('#meta').textContent());
await ed.waitForTimeout(200);
await ed.screenshot({ path: path.join(out, 'editor-cropped.png') });
// export flattened image
const dataUrl = await ed.evaluate(async () => {
  const { flatten } = await import('./shapes.js');
  const st = window.pageshotEditor; const blob = await flatten(st.base, st.shapes).convertToBlob();
  return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
});
fs.writeFileSync(path.join(out, 'export.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
await ed.keyboard.press('Control+z');
console.log('undo crop', await ed.locator('#meta').textContent());
console.log('errors', JSON.stringify(errors));
console.log('out', out);
await ctx.close(); srv.close();
