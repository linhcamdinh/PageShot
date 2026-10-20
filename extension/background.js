import { saveCapture } from './lib/store.js';
import { captureFullPage } from './lib/fullpage.js';
import { extpay, getStatus, markPaid, trialStartedAt } from './lib/license.js';

// ExtensionPay listens for messages from its payment pages.
extpay.startBackground();
extpay.onPaid.addListener(async () => {
  await markPaid();
  chrome.runtime.sendMessage({ type: 'paid' }).catch(() => {}); // refresh any open upgrade page
});

const upgradeUrl = (reason) => chrome.runtime.getURL(`upgrade/upgrade.html?reason=${reason}`);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  await trialStartedAt(); // starts the trial clock
  chrome.tabs.create({ url: upgradeUrl('welcome') });
});

// Chrome allows about two captureVisibleTab calls per second.
const CAPTURE_GAP_MS = 550;
let lastCaptureAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function captureVisible(windowId) {
  const wait = lastCaptureAt + CAPTURE_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; ; attempt++) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      lastCaptureAt = Date.now();
      return dataUrl;
    } catch (err) {
      // Retry only the rate limit error; anything else (restricted page, no permission) is final.
      if (attempt < 3 && /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(err.message)) {
        await sleep(CAPTURE_GAP_MS);
        continue;
      }
      throw err;
    }
  }
}

export async function dataUrlToBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

async function openEditor(blob, meta) {
  const id = await saveCapture(blob, meta);
  await chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html?id=${id}`) });
}

async function runCapture(mode, tab) {
  const status = await getStatus();
  if (status.state === 'expired') {
    await chrome.tabs.create({ url: upgradeUrl('expired') });
    return;
  }
  switch (mode) {
    case 'visible': {
      const dataUrl = await captureVisible(tab.windowId);
      const blob = await (await fetch(dataUrl)).blob();
      return openEditor(blob, { mode, title: tab.title, url: tab.url });
    }
    case 'full': {
      const { blob, truncated } = await captureFullPage(tab, { captureVisible, dataUrlToBitmap });
      return openEditor(blob, { mode, title: tab.title, url: tab.url, truncated });
    }
    case 'region':
      // The overlay reports back with a 'region-selected' message.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/region.js'] });
      return;
    case 'screen':
      // Picking a screen needs a page of its own: the popup closes as soon as the picker takes focus.
      await chrome.windows.create({
        url: chrome.runtime.getURL('capture/screen.html'),
        type: 'popup',
        width: 420,
        height: 260,
        focused: true,
      });
      return;
    default:
      throw new Error(`Unknown capture mode: ${mode}`);
  }
}

async function cropRegion(tab, rect) {
  const bitmap = await dataUrlToBitmap(await captureVisible(tab.windowId));
  // The capture is in device pixels; the rect is in CSS pixels.
  const scale = bitmap.width / rect.viewportWidth;
  const sx = Math.round(rect.x * scale);
  const sy = Math.round(rect.y * scale);
  const sw = Math.max(1, Math.round(rect.width * scale));
  const sh = Math.max(1, Math.round(rect.height * scale));
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return openEditor(blob, { mode: 'region', title: tab.title, url: tab.url });
}

async function reportError(err) {
  console.error('Pageshot capture failed:', err);
  await chrome.storage.session.set({ lastError: friendlyError(err) });
  chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  chrome.action.setBadgeText({ text: '!' });
}

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (/Cannot access|cannot be scripted|chrome:\/\/|edge:\/\/|webstore|extensions gallery/i.test(msg)) {
    return 'Chrome does not allow capturing this page (browser pages and the Web Store are protected).';
  }
  if (/activeTab|permission/i.test(msg)) {
    return 'Pageshot lost access to this tab. Open the Pageshot popup on the tab and try again.';
  }
  return msg;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'capture') {
    chrome.action.setBadgeText({ text: '' });
    chrome.storage.session.remove('lastError');
    runCapture(msg.mode, msg.tab).then(
      () => sendResponse({ ok: true }),
      (err) => reportError(err).then(() => sendResponse({ ok: false, error: friendlyError(err) })),
    );
    return true;
  }
  if (msg.type === 'status') {
    getStatus({ refresh: msg.refresh }).then(sendResponse);
    return true;
  }
  if (msg.type === 'region-selected' && sender.tab) {
    cropRegion(sender.tab, msg.rect).catch(reportError);
    return false;
  }
  if (msg.type === 'screen-captured') {
    // Sent by capture/screen.html with the frame already stored.
    chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html?id=${msg.id}`) });
    return false;
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  const mode = { 'capture-visible': 'visible', 'capture-full': 'full', 'capture-region': 'region' }[command];
  if (!mode || !tab) return;
  chrome.action.setBadgeText({ text: '' });
  runCapture(mode, tab).catch(reportError);
});
