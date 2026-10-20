// File naming and encoding for saved screenshots.

export const FORMATS = {
  png: { mime: 'image/png', ext: 'png' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
};

export const DEFAULT_SETTINGS = { format: 'png', quality: 92, askLocation: true, folder: 'Pageshot' };

// Characters Windows, macOS or chrome.downloads reject in file names.
const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f~]+/g;

export function cleanName(name) {
  return name.replace(BAD_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 120);
}

export function defaultBaseName(capture) {
  const d = new Date(capture.createdAt || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const title = cleanName(capture.title || '').slice(0, 60);
  return `Pageshot ${stamp}${title ? ` ${title}` : ''}`;
}

// Path relative to the Downloads folder, as chrome.downloads expects.
export function downloadPath(baseName, format, folder) {
  const name = (cleanName(baseName.replace(/\.(png|jpe?g)$/i, '')) || 'screenshot') + '.' + FORMATS[format].ext;
  const dirs = (folder || '').split(/[\\/]+/).map(cleanName).filter((p) => p && p !== '..');
  return [...dirs, name].join('/');
}

export async function encode(canvas, format, quality) {
  if (format === 'jpeg') {
    // JPEG has no transparency; paint white under the image so empty areas do not turn black.
    const out = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    return out.convertToBlob({ type: FORMATS.jpeg.mime, quality: quality / 100 });
  }
  return canvas.convertToBlob({ type: FORMATS.png.mime });
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
