# Chrome Web Store listing

Copy these into the Developer Dashboard. Character limits are noted where the store has one.

## Store listing tab

**Name** (max 75): Pageshot: Screenshot, Annotate & Save

**Summary** (max 132):
Capture the visible tab, a full scrolling page, any area or your whole screen. Add arrows, text and blur, then save as PNG or JPEG.

**Category:** Tools (alternative: Productivity)

**Language:** English

**Description:**

```
Pageshot takes screenshots of anything on your screen and lets you mark them up before you save or share.

CAPTURE FOUR WAYS
• Visible part: what you see in the tab, in one click (Alt+Shift+V)
• Full page: scrolls and stitches the whole page into one tall image, with sticky headers shown only once (Alt+Shift+F)
• Select area: drag a rectangle around exactly what you need (Alt+Shift+R)
• Screen or window: your whole desktop, any monitor or any app window, with an optional 3, 5 or 10 second delay

ANNOTATE
• Arrows, lines, rectangles and ellipses, with light or solid fill
• Text in 9 fonts with size, bold, italic and an optional background box
• Pen and highlighter
• Numbered steps for tutorials and bug reports
• Blur that pixelates passwords, emails and personal details so they cannot be recovered
• Crop, move, resize and restyle anything, with full undo and redo
• Any color, any size

SAVE YOUR WAY
• PNG for crisp text, or JPEG with a quality slider for small files
• Choose the folder every time, or save straight to a Downloads subfolder
• Copy to the clipboard and paste into chat, email or docs

PRIVATE BY DESIGN
Your screenshots never leave your computer. Pageshot has no account, no cloud upload and no tracking.

TRY IT FREE
Every feature is free for 7 days with no sign up. After that, a one-time unlock keeps Pageshot working forever.
```

> If you choose a subscription instead of a one-time price, change the last line to match.

**Graphic assets** (in `store/assets/`):

| Asset | File | Required |
| --- | --- | --- |
| Store icon 128×128 | `extension/icons/icon128.png` | Yes |
| Screenshot 1280×800 | `store-1-capture.png` | At least one |
| Screenshot 1280×800 | `store-2-annotate.png` | |
| Screenshot 1280×800 | `store-3-save.png` | |
| Small promo tile 440×280 | `promo-small-440x280.png` | Yes |

To regenerate the screenshots after UI changes: from `store/`, run `node shots.mjs && node compose.mjs` (needs Playwright).

## Privacy practices tab

**Single purpose:**
Pageshot captures screenshots of web pages and the screen, lets the user annotate them, and saves them to the user's computer.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| activeTab | Captures the tab the user is on, only after they click the Pageshot button or press a Pageshot shortcut. |
| scripting | Injects the area selection overlay, and scrolls the page to stitch a full page capture. Runs only on the tab the user chose to capture. |
| downloads | Saves the annotated screenshot to a file in the folder the user picks. |
| desktopCapture | Lets the user capture their whole screen or an app window through Chrome's screen picker. |
| storage | Remembers editor and save preferences, the trial start date and whether the user has paid. |
| Host permission: extensionpay.com | Runs the payment provider's script on its own checkout pages so Pageshot unlocks right after a purchase. No other site is accessed. |

**Remote code:** No, I am not using remote code. (All scripts ship in the package.)

**Data usage** (what to tick):

- Personally identifiable information: **Yes**. The email address entered on the ExtensionPay checkout or restore page, used only to verify the purchase.
- Financial and payment information: **Yes**. Card details are entered on ExtensionPay's Stripe checkout and are never seen or stored by Pageshot.
- Everything else (health, authentication, personal communications, location, web history, user activity, website content): **No**. Screenshots stay on the device and are not transmitted.

Then tick all three certifications (not sold to third parties, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** the public URL of `store/privacy-policy.md`, for example its GitHub link once the repo is public, or a GitHub Pages copy.

## Distribution tab

- Visibility: Public
- Regions: All regions
- Pricing: Free (the in-app purchase runs through ExtensionPay, not the Web Store)
