import { extpay, getStatus, markPaid } from '../lib/license.js';
import { PRO_FEATURES, TRIAL_DAYS } from '../lib/config.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reason = params.get('reason');
const feature = PRO_FEATURES[params.get('feature')];

function show(view) {
  document.querySelectorAll('[data-view]').forEach((el) => (el.hidden = el.dataset.view !== view));
  $('buy').hidden = view === 'paid' || view === 'welcome';
}

async function refresh(options) {
  const status = await getStatus(options);
  if (status.state === 'paid') return show('paid');
  if (status.state === 'free') {
    if (feature) $('feature-name').textContent = feature;
    return show(feature ? 'feature' : 'free');
  }
  $('days-left').textContent = status.daysLeft === 1 ? '1 day' : `${status.daysLeft} days`;
  show(reason === 'welcome' ? 'welcome' : 'trial');
}

function formatPrice(plan) {
  const amount = new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.currency.toUpperCase() })
    .format(plan.unitAmountCents / 100);
  if (plan.interval === 'month') return `${amount} a month`;
  if (plan.interval === 'year') return `${amount} a year`;
  return `${amount}, one time`;
}

// Lead with the one-time price: one clear number converts better than a list of plans.
async function loadPrice() {
  try {
    const plans = await extpay.getPlans();
    if (!plans?.length) return;
    const lifetime = plans.find((p) => !p.interval || p.interval === 'once');
    const lead = lifetime || plans[0];
    const others = plans.filter((p) => p !== lead);
    $('price').textContent = lifetime ? `${formatPrice(lead).replace(', one time', '')} once, yours forever` : formatPrice(lead);
    $('price').hidden = false;
    if (others.length) {
      $('other-prices').textContent = `Or ${others.map(formatPrice).join(' or ')}`;
      $('other-prices').hidden = false;
    }
    if (lifetime) $('welcome-price').textContent = ` (${formatPrice(lead).replace(', one time', '')} once)`;
  } catch {
    // Price is optional on this page; the payment page always shows it.
  }
}

function showError(err) {
  console.error(err);
  $('error').textContent = 'Could not reach the payment service. Check your connection and try again.';
  $('error').hidden = false;
}

// After someone opens checkout or the login page, keep asking ExtensionPay for a while.
// The login link arrives by email and checkout opens in another window, so this page
// may never lose visibility or get a message when access is granted.
let pollTimer;
function watchForAccess() {
  clearInterval(pollTimer);
  const stopAt = Date.now() + 10 * 60 * 1000;
  pollTimer = setInterval(async () => {
    const status = await getStatus({ refresh: true });
    if (status.state === 'paid' || Date.now() > stopAt) {
      clearInterval(pollTimer);
      if (status.state === 'paid') show('paid');
    }
  }, 5000);
}

$('pay').addEventListener('click', () => {
  $('error').hidden = true;
  extpay.openPaymentPage().then(watchForAccess, showError);
});
$('login').addEventListener('click', () => {
  $('error').hidden = true;
  extpay.openLoginPage().then(watchForAccess, showError);
});

// The background tells open pages when a payment goes through.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'paid') markPaid().then(() => refresh());
});
// Coming back from the payment tab or window: ask ExtensionPay again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh({ refresh: true });
});
window.addEventListener('focus', () => refresh({ refresh: true }));

$('trial-days').textContent = `${TRIAL_DAYS} day`;
refresh();
loadPrice();
