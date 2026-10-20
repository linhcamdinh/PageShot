# Pageshot

A Chrome extension (Manifest V3) for taking screenshots.

## Capture modes

| Mode | How | Shortcut |
| --- | --- | --- |
| Visible part | Captures what you see in the current tab | Alt+Shift+V |
| Full page | Scrolls the page and stitches the screens into one image. Fixed headers appear once, at the top | Alt+Shift+F |
| Select area | Drag a rectangle on the page; Esc cancels | Alt+Shift+R |
| Screen or window | Chrome's picker lets you choose a monitor or any app window, with an optional 3, 5 or 10 second delay | none |

Each capture opens in the editor. Capture shortcuts can be changed at `chrome://extensions/shortcuts`.

## Editor

| Tool | Key | Notes |
| --- | --- | --- |
| Select | V | Click to select, drag to move, drag the dots to resize. Arrow keys nudge (Shift for 10px) |
| Arrow, Line | A, L | Shift snaps to 45° |
| Rectangle, Ellipse | R, O | Shift makes a square or circle. Fill: none, light or solid |
| Pen, Highlighter | P, H | |
| Text | T | Click to type, Ctrl+Enter or click outside to finish, double-click to edit. Font, size, bold, italic and an optional background box |
| Numbered step | N | Click to drop 1, 2, 3… |
| Blur | B | Pixelates the area so text cannot be recovered |
| Crop | C | Drag, then Enter or Apply crop |

Every tool uses the color swatches or a custom color, plus a size slider. Changing a style while a shape is selected restyles it. Undo and redo with Ctrl+Z and Ctrl+Shift+Z, delete with Del, zoom with Ctrl+wheel or Ctrl+= and Ctrl+-. Ctrl+C copies and Ctrl+S saves the annotated image.

## Try it

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension` folder.
3. Pin Pageshot to the toolbar and click it on any web page.

## Known limits

- Chrome blocks capturing its own pages (`chrome://…`) and the Chrome Web Store.
- Full page capture scrolls the main page only. Apps that scroll an inner panel (Gmail, some dashboards) capture one screen.
- Very tall pages are cut off at Chrome's canvas limit (32,767 px tall); the editor says when that happens.

## Development

- `npm run icons` regenerates the icons.
- `npm test` runs Playwright tests of the capture modes and the editor.
- `npm run zip` builds `dist/pageshot.zip` for the Web Store.

## Roadmap

1. ✅ Capture core
2. ✅ Annotation editor: text, arrows, shapes, blur, fonts and colors
3. Export: PNG and JPEG to a folder you choose
4. 7 day free trial and in-app purchase (ExtensionPay), then Web Store launch
