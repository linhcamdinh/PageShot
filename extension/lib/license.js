// Trial and purchase status.
// The 7 day trial starts on first install and needs no sign up. Purchases go through ExtensionPay,
// which keeps the paid flag on its server; the last known answer is cached so Pageshot works offline.

import ExtPay from '../vendor/ExtPay.module.js';
import { EXTPAY_ID, PRO_FEATURES, TRIAL_DAYS } from './config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // how long a cached "paid" answer is trusted before asking again

export const extpay = ExtPay(EXTPAY_ID);

// Trial start is kept in both sync and local storage; the earliest one wins,
// so signing in to Chrome on a new computer does not restart the trial.
export async function trialStartedAt() {
  const [{ trialStart: synced } = {}, { trialStart: local } = {}] = await Promise.all([
    chrome.storage.sync.get('trialStart').catch(() => ({})),
    chrome.storage.local.get('trialStart'),
  ]);
  const known = [synced, local].filter(Number.isFinite);
  const start = known.length ? Math.min(...known) : Date.now();
  if (synced !== start) chrome.storage.sync.set({ trialStart: start }).catch(() => {});
  if (local !== start) await chrome.storage.local.set({ trialStart: start });
  return start;
}

async function isPaid({ refresh = false } = {}) {
  const { paidCache } = await chrome.storage.local.get('paidCache');
  if (paidCache?.paid && !refresh && Date.now() - paidCache.checkedAt < CHECK_EVERY_MS) return true;
  try {
    const user = await extpay.getUser();
    const paid = Boolean(user.paid);
    await chrome.storage.local.set({ paidCache: { paid, checkedAt: Date.now() } });
    return paid;
  } catch (err) {
    // Offline or ExtensionPay unreachable: keep the last known answer.
    console.warn('Pageshot: could not check purchase status', err);
    return Boolean(paidCache?.paid);
  }
}

// { state: 'paid' | 'trial' | 'free', pro, daysLeft, trialEndsAt }
// 'free' is the plan after the trial: Pageshot keeps working, without the Pro features.
export async function getStatus(options) {
  if (await isPaid(options)) return { state: 'paid', pro: true };
  const trialEndsAt = (await trialStartedAt()) + TRIAL_DAYS * DAY_MS;
  const msLeft = trialEndsAt - Date.now();
  if (msLeft > 0) return { state: 'trial', pro: true, daysLeft: Math.ceil(msLeft / DAY_MS), trialEndsAt };
  return { state: 'free', pro: false, daysLeft: 0, trialEndsAt };
}

export async function markPaid() {
  await chrome.storage.local.set({ paidCache: { paid: true, checkedAt: Date.now() } });
}

export const isProFeature = (feature) => Object.hasOwn(PRO_FEATURES, feature);

export const upgradeUrl = (reason, feature) =>
  chrome.runtime.getURL(`upgrade/upgrade.html?reason=${reason}${feature ? `&feature=${feature}` : ''}`);
