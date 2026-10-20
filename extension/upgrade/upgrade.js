import { extpay, getStatus, markPaid } from '../lib/license.js';
import { TRIAL_DAYS } from '../lib/config.js';

const $ = (id) => document.getElementById(id);
const reason = new URLSearchParams(location.search).get('reason');

function show(view) {
  document.querySelectorAll('[data-view]').forEach((el) => (el.hidden = el.dataset.view !== view));
  $('buy').hidden = view === 'paid' || view === 'welcome';
}

async function refresh(options) {
  const status = await getStatus(options);
  if (status.state === 'paid') return show('paid');
  if (status.state === 'expired') return show('expired');
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

async function loadPrice() {
  try {
    const plans = await extpay.getPlans();
    if (!plans?.length) return;
    $('price').textContent = plans.map(formatPrice).join(' or ');
    $('price').hidden = false;
  } catch {
    // Price is optional on this page; the payment page always shows it.
  }
}

function showError(err) {
  console.error(err);
  $('error').textContent = 'Could not reach the payment service. Check your connection and try again.';
  $('error').hidden = false;
}

$('pay').addEventListener('click', () => {
  $('error').hidden = true;
  extpay.openPaymentPage().catch(showError);
});
$('login').addEventListener('click', () => {
  $('error').hidden = true;
  extpay.openLoginPage().catch(showError);
});

// The background tells open pages when a payment goes through.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'paid') markPaid().then(() => refresh());
});
// Coming back from the payment tab: ask ExtensionPay again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh({ refresh: true });
});

$('trial-days').textContent = `${TRIAL_DAYS} day`;
refresh();
loadPrice();
