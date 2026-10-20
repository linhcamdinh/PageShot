import { getCapture } from '../lib/store.js';

// Step 1 viewer: shows the capture with basic save and copy.
// Annotation tools and JPEG export come in later steps.

const img = document.getElementById('shot');
const meta = document.getElementById('meta');
const notice = document.getElementById('notice');
let capture;

function showNotice(text) {
  notice.textContent = text;
  notice.hidden = false;
}

function fileName(ext) {
  const stamp = new Date(capture.createdAt).toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
  const base = (capture.title || 'screenshot').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'screenshot';
  return `Pageshot ${stamp} ${base}.${ext}`;
}

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  capture = id && (await getCapture(id));
  if (!capture) {
    showNotice('This screenshot is no longer available. Take a new one from the Pageshot button.');
    return;
  }
  img.src = URL.createObjectURL(capture.blob);
  await img.decode();
  meta.textContent = `${img.naturalWidth} × ${img.naturalHeight}${capture.title ? ` · ${capture.title}` : ''}`;
  if (capture.title) document.title = `Pageshot · ${capture.title}`;
  if (capture.truncated) showNotice('This page is taller than Chrome can fit in one image, so the bottom was cut off.');
}

document.getElementById('save').addEventListener('click', async () => {
  if (!capture) return;
  const url = URL.createObjectURL(capture.blob);
  try {
    await chrome.downloads.download({ url, filename: fileName('png'), saveAs: true });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
});

document.getElementById('copy').addEventListener('click', async (e) => {
  if (!capture) return;
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': capture.blob })]);
  e.target.textContent = 'Copied';
  setTimeout(() => (e.target.textContent = 'Copy'), 1500);
});

load();
