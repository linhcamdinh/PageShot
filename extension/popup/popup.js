const errorBox = document.getElementById('error');
const working = document.getElementById('working');
const buttons = document.querySelectorAll('button[data-mode]');
const $plan = document.getElementById('plan');

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

// Trial and purchase status in the footer.
chrome.runtime.sendMessage({ type: 'status' }).then((status) => {
  if (!status || status.state === 'paid') return;
  const expired = status.state === 'expired';
  $plan.hidden = false;
  $plan.classList.toggle('expired', expired);
  document.getElementById('plan-text').textContent = expired
    ? 'Your free trial has ended.'
    : `Free trial: ${status.daysLeft === 1 ? '1 day' : `${status.daysLeft} days`} left`;
});
document.getElementById('plan-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('upgrade/upgrade.html?reason=popup') });
  window.close();
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
