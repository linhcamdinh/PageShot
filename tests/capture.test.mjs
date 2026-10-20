// Smoke test for the capture modes. Run: node tests/capture.test.mjs
// Needs Playwright (npm i -g playwright). Loads a copy of the extension with <all_urls>
// host access, because automation cannot click the toolbar button to grant activeTab.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pageshot-'));
process.chdir(out);
const ext = path.join(out, 'ext');
fs.cpSync(path.join(here, '../extension'), ext, { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
mf.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(mf));
const fixture = fs.readFileSync(path.join(here, 'fixture.html'));
const srv = http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end(fixture)}).listen(8765);
const ctx = await chromium.launchPersistentContext('', { channel:'chromium', headless:true, viewport:{width:1000,height:700},
  args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`] });
let [sw] = ctx.serviceWorkers(); if(!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
sw.on('console', m=>console.log('SW:', m.text()));
const page = await ctx.newPage(); await page.goto('http://localhost:8765/'); await page.evaluate(()=>scrollTo(0,300));
const helper = await ctx.newPage(); await helper.goto(`chrome-extension://${extId}/popup/popup.html`);
await page.bringToFront();
const tab = await sw.evaluate(async()=> (await chrome.tabs.query({url:'http://localhost:8765/*'}))[0]);
async function run(mode){
  const p = ctx.waitForEvent('page', {predicate: pg=>pg.url().includes('editor.html'), timeout:30000});
  const res = await helper.evaluate(([mode,tab])=>chrome.runtime.sendMessage({type:'capture',mode,tab}), [mode,tab]);
  console.log(mode,'response',JSON.stringify(res));
  const ed = await p; await ed.waitForFunction(()=>document.getElementById('shot').naturalWidth>0);
  console.log(mode, await ed.locator('#meta').textContent(), 'notice hidden:', await ed.locator('#notice').isHidden());
  await ed.screenshot({path:`ed-${mode}.png`, fullPage:true});
  const data = await ed.evaluate(async()=>{const i=document.getElementById('shot');const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d').drawImage(i,0,0);return c.toDataURL()});
  fs.writeFileSync(`out-${mode}.png`, Buffer.from(data.split(',')[1],'base64'));
  await ed.close(); await page.bringToFront();
}
await run('visible');
await run('full');
console.log('scroll restored to', await page.evaluate(()=>scrollY));
// region: inject overlay, drag
const p = ctx.waitForEvent('page', {predicate: pg=>pg.url().includes('editor.html'), timeout:30000});
await helper.evaluate((tab)=>chrome.runtime.sendMessage({type:'capture',mode:'region',tab}), tab);
await page.bringToFront(); await page.waitForTimeout(300);
await page.mouse.move(100,100); await page.mouse.down(); await page.mouse.move(400,300,{steps:5}); await page.mouse.up();
const ed = await p; await ed.waitForFunction(()=>document.getElementById('shot').naturalWidth>0);
console.log('region', await ed.locator('#meta').textContent());
const data = await ed.evaluate(async()=>{const i=document.getElementById('shot');const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d').drawImage(i,0,0);return c.toDataURL()});
fs.writeFileSync(`out-region.png`, Buffer.from(data.split(',')[1],'base64'));
// restricted page error
const res = await helper.evaluate(async()=>{const t=await chrome.tabs.create({url:'chrome://version',active:true}); await new Promise(r=>setTimeout(r,800)); return chrome.runtime.sendMessage({type:'capture',mode:'full',tab:t})});
console.log('restricted', JSON.stringify(res));
console.log('images written to', out);
await ctx.close(); srv.close();
