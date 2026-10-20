import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch(); const dir = process.cwd();
async function render(html, w, h, out) { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(html, { waitUntil: 'load' }); await p.waitForTimeout(200); await p.screenshot({ path: out }); await p.close(); }
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const icon = img('../extension/icons/icon128.png');
// 1: popup over the page, with a Chrome-like toolbar strip
await render(`<body style="margin:0;width:1280px;height:800px;overflow:hidden;font-family:system-ui;background:#fff">
<div style="height:44px;background:#dee1e6;display:flex;align-items:center;justify-content:flex-end;padding:0 14px;gap:14px">
<div style="flex:1;margin:0 20px 0 80px;height:30px;border-radius:15px;background:#fff;display:flex;align-items:center;padding-left:16px;color:#5f6368;font-size:14px">brightline.test/dashboard</div>
<img src="${icon}" style="width:20px;height:20px;padding:5px;border-radius:50%;background:#c2c7cf"></div>
<img src="${img('page.png')}" style="display:block;width:1280px">
<img src="${img('popup.png')}" style="position:absolute;top:48px;right:10px;width:300px;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.28)">
</body>`, 1280, 800, 'store-1-capture.png');
fs.copyFileSync('shot-editor.png', 'store-2-annotate.png');
fs.copyFileSync('shot-save.png', 'store-3-save.png');
// promo tile 440x280
await render(`<body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:linear-gradient(135deg,#1a73e8,#0b4fb3);font-family:system-ui;color:#fff;text-align:center">
<img src="${icon}" style="width:84px;height:84px;filter:drop-shadow(0 6px 16px rgba(0,0,0,.25))">
<div style="font-size:36px;font-weight:700;letter-spacing:-.5px">Pageshot</div>
<div style="font-size:17px;opacity:.92">Capture, annotate and save any page</div></body>`, 440, 280, 'promo-small-440x280.png');
await b.close();
