// Full page capture: scroll the tab one screen at a time, capture each screen,
// and stitch the frames onto one canvas.

// Canvas limits in Chrome: 32767px per side and roughly 268M pixels in total.
const MAX_SIDE = 32767;
const MAX_AREA = 268_000_000;
const SETTLE_MS = 250; // time for lazy images and scroll handlers to react

async function inPage(tabId, func, ...args) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result;
}

// --- functions below run inside the page ---

function pageMetrics() {
  const el = document.scrollingElement || document.documentElement;
  return {
    scrollHeight: Math.max(el.scrollHeight, document.body?.scrollHeight || 0),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    clientWidth: el.clientWidth || window.innerWidth,
    clientHeight: el.clientHeight || window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

function scrollToY(y, settleMs) {
  window.scrollTo({ left: 0, top: y, behavior: 'instant' });
  return new Promise((resolve) =>
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY))), settleMs),
  );
}

function prepareForStitch() {
  // Smooth scrolling would make scrollTo asynchronous.
  const root = document.documentElement;
  root.dataset.pageshotScrollBehavior = root.style.scrollBehavior;
  root.style.setProperty('scroll-behavior', 'auto', 'important');
}

// Fixed and sticky elements (headers, chat bubbles) would repeat in every frame,
// so after the first frame they are hidden.
function hideFloating() {
  for (const el of document.querySelectorAll('body *')) {
    const pos = getComputedStyle(el).position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    el.dataset.pageshotVisibility = el.style.visibility;
    el.style.setProperty('visibility', 'hidden', 'important');
  }
}

function restorePage(x, y) {
  for (const el of document.querySelectorAll('[data-pageshot-visibility]')) {
    el.style.visibility = el.dataset.pageshotVisibility;
    delete el.dataset.pageshotVisibility;
  }
  const root = document.documentElement;
  root.style.scrollBehavior = root.dataset.pageshotScrollBehavior || '';
  delete root.dataset.pageshotScrollBehavior;
  window.scrollTo({ left: x, top: y, behavior: 'instant' });
}

// --- service worker side ---

export async function captureFullPage(tab, { captureVisible, dataUrlToBitmap }) {
  const tabId = tab.id;
  const m = await inPage(tabId, pageMetrics);
  if (!m) throw new Error('Cannot access this page.');

  await inPage(tabId, prepareForStitch);
  let canvas, ctx, scale, outWidth, outHeight;
  let truncated = false;

  try {
    let y = 0;
    let first = true;
    let lastTop = -1;
    let step = m.clientHeight;
    while (true) {
      const top = await inPage(tabId, scrollToY, y, SETTLE_MS);
      if (top === lastTop) break; // the page cannot scroll any further
      lastTop = top;

      const bitmap = await dataUrlToBitmap(await captureVisible(tab.windowId));
      if (first) {
        scale = bitmap.width / m.viewportWidth; // device pixel ratio as captured
        outWidth = Math.min(MAX_SIDE, Math.round(m.clientWidth * scale));
        const fullHeight = Math.round(m.scrollHeight * scale);
        const maxHeight = Math.min(MAX_SIDE, Math.floor(MAX_AREA / outWidth));
        outHeight = Math.min(fullHeight, maxHeight);
        truncated = fullHeight > maxHeight;
        canvas = new OffscreenCanvas(outWidth, outHeight);
        ctx = canvas.getContext('2d');
      }

      // Crop away the scrollbar and draw the frame where it sits on the page.
      // The capture can come back shorter than the viewport (e.g. with an info bar), so trust its height.
      const frameHeight = Math.min(Math.round(m.clientHeight * scale), bitmap.height);
      step = frameHeight / scale;
      ctx.drawImage(bitmap, 0, 0, outWidth, frameHeight, 0, Math.round(top * scale), outWidth, frameHeight);
      bitmap.close();

      if (first) {
        await inPage(tabId, hideFloating);
        first = false;
      }
      y = top + Math.floor(step);
      if (y * scale >= outHeight) break;
    }
  } finally {
    await inPage(tabId, restorePage, m.scrollX, m.scrollY).catch(() => {});
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { blob, truncated };
}
