const errorBox = document.getElementById('error');
const working = document.getElementById('working');
const buttons = document.querySelectorAll('button[data-mode]');

function showError(text) {
  errorBox.textContent = text;
  errorBox.hidden = !text;
}

// Show the error from the last capture, if it failed after the popup closed.
chrome.storage.session.get('lastError').then(({ lastError }) => {
  if (lastError) showError(lastError);
  chrome.storage.session.remove('lastError');
  chrome.action.setBadgeText({ text: '' });
});

for (const button of buttons) {
  button.addEventListener('click', async () => {
    const mode = button.dataset.mode;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    showError('');
    buttons.forEach((b) => (b.disabled = true));

    if (mode === 'full') {
      // Full page takes a few seconds; keep the popup open to show progress.
      working.hidden = false;
      const res = await chrome.runtime.sendMessage({ type: 'capture', mode, tab });
      if (res?.ok) return window.close();
      working.hidden = true;
      buttons.forEach((b) => (b.disabled = false));
      return showError(res?.error || 'Capture failed.');
    }

    // The other modes need the popup out of the way (it would cover the page or the picker).
    chrome.runtime.sendMessage({ type: 'capture', mode, tab });
    window.close();
  });
}
