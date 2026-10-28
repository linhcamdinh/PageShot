# Publishing checklist

Steps only you can do are marked **(you)**. Everything else is already in the code.

## 1. Set up payments

1. ✅ Signed up at ExtensionPay and registered the extension as `pageshot`.
2. **(you)** In ExtensionPay, connect your Stripe account and create the plan: a one-time price or a monthly or yearly subscription. Pageshot reads the price from ExtensionPay and shows it on the upgrade page, so there is nothing to change in the code when you change the price.
3. ✅ The ID `pageshot` is set in `extension/lib/config.js` (`EXTPAY_ID`). The trial length is `TRIAL_DAYS` in the same file.
4. Test it: load the unpacked extension, open the Pageshot popup, click **Unlock**, and go through checkout. ExtensionPay marks unpacked installs as development installs; check its dashboard for how to make test payments.

## 2. Finish the privacy policy

1. ✅ Support email added to `store/privacy-policy.md`.
2. **(you)** Publish it at a public URL. Easiest: make the GitHub repo public (or a separate public repo with just this file) and use the file's GitHub link, or turn on GitHub Pages.

## 3. Build the package

1. Bump `version` in `extension/manifest.json` for every upload (for example `1.0.0` for launch).
2. Run `npm run zip`. Upload `dist/pageshot.zip`.

## 4. Submit to the Chrome Web Store

1. **(you)** Register a developer account at https://chrome.google.com/webstore/devconsole (one-time registration fee) and verify your email.
2. **(you)** Click **New item** and upload `dist/pageshot.zip`.
3. **(you)** Fill in the Store listing, Privacy practices and Distribution tabs from `store/listing.md`, and upload the images in `store/assets/`.
4. **(you)** Submit for review. You get an email when it is approved or if the reviewer has questions.

## After launch

- **Free users:** adding someone under "free users" in ExtensionPay ties free access to their email, not to their browser. They unlock Pageshot by opening the upgrade page, clicking **Already paid or given free access? Log in with your email**, entering that same email and clicking the link ExtensionPay emails them.

- Each update: bump the version, `npm run zip`, upload on the item's Package tab, submit.
- Installs, ratings and crash reports are on the item's Analytics tab.
- Buyers who reinstall or switch computers click **Already paid? Restore your purchase** on the upgrade page.
