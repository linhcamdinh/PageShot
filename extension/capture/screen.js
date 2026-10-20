import { saveCapture } from '../lib/store.js';

const status = document.getElementById('status');
const delaySelect = document.getElementById('delay');
const pickButton = document.getElementById('pick');

// Minimum wait after this window is minimized, so it is not in the shot.
const HIDE_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

chrome.storage.local.get('screenDelay').then(({ screenDelay }) => {
  if (screenDelay != null) delaySelect.value = String(screenDelay);
});
delaySelect.addEventListener('change', () => chrome.storage.local.set({ screenDelay: Number(delaySelect.value) }));

function chooseSource() {
  return new Promise((resolve) => chrome.desktopCapture.chooseDesktopMedia(['screen', 'window'], (id) => resolve(id)));
}

async function grabFrame(streamId) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: streamId,
        maxWidth: 8192,
        maxHeight: 8192,
      },
    },
  });
  const win = await chrome.windows.getCurrent();
  try {
    await chrome.windows.update(win.id, { state: 'minimized' });
    await sleep(Math.max(HIDE_MS, Number(delaySelect.value) * 1000));
    const [track] = stream.getVideoTracks();
    const frame = await new ImageCapture(track).grabFrame();
    const canvas = new OffscreenCanvas(frame.width, frame.height);
    canvas.getContext('2d').drawImage(frame, 0, 0);
    frame.close();
    return canvas.convertToBlob({ type: 'image/png' });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

async function capture() {
  pickButton.disabled = true;
  status.textContent = 'Choose a screen or window in the dialog.';
  try {
    const streamId = await chooseSource();
    if (!streamId) {
      status.textContent = 'Cancelled. Choose again when you are ready.';
      return;
    }
    const blob = await grabFrame(streamId);
    const id = await saveCapture(blob, { mode: 'screen' });
    await chrome.runtime.sendMessage({ type: 'screen-captured', id });
    window.close();
  } catch (err) {
    console.error(err);
    const win = await chrome.windows.getCurrent();
    chrome.windows.update(win.id, { state: 'normal', focused: true });
    status.textContent = `Capture failed: ${err.message}`;
  } finally {
    pickButton.disabled = false;
  }
}

pickButton.addEventListener('click', capture);
