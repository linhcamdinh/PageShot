// The extension ID registered at https://extensionpay.com (dashboard: extensionpay.com/home/extension/pageshot).
export const EXTPAY_ID = 'pageshot';

export const TRIAL_DAYS = 7;

// After the trial, Pageshot keeps working on the free plan. These need Pro.
// Capture modes are checked in the background; editor tools and formats in the editor.
export const PRO_FEATURES = {
  full: 'Full page capture',
  screen: 'Screen and window capture',
  blur: 'Blur',
  step: 'Numbered steps',
  jpeg: 'JPEG export',
};

// Opened when someone uninstalls, to ask why. Leave empty to open nothing.
// Point it at a one-question form (Google Forms, Tally) you own.
export const UNINSTALL_URL = '';
