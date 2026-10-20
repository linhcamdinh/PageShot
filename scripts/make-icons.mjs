// Generates the extension icons (a blue tile with white viewfinder corners).
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor for smooth edges
const BLUE = [26, 115, 232];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Returns 0 (transparent), 1 (blue) or 2 (white) for a point in unit coordinates.
function shade(u, v) {
  const r = 0.2, m = 0.04; // corner radius, margin
  const cx = Math.min(Math.max(u, m + r), 1 - m - r);
  const cy = Math.min(Math.max(v, m + r), 1 - m - r);
  if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return 0;

  const a = 0.24, b = 0.76, len = 0.17, w = 0.075; // viewfinder box, arm length, stroke
  const inCorner = (x, y) => {
    for (const [px, dx] of [[a, 1], [b, -1]]) {
      for (const [py, dy] of [[a, 1], [b, -1]]) {
        const ox = (x - px) * dx, oy = (y - py) * dy;
        if (ox >= -w / 2 && oy >= -w / 2 && ((ox <= len && oy <= w / 2) || (oy <= len && ox <= w / 2))) return true;
      }
    }
    return false;
  };
  if (inCorner(u, v)) return 2;
  if ((u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.11 ** 2) return 2;
  return 1;
}

for (const size of SIZES) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (!s) continue;
          const c = s === 2 ? [255, 255, 255] : BLUE;
          rs += c[0]; gs += c[1]; bs += c[2]; as += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (as) {
        out[i] = rs / as; out[i + 1] = gs / as; out[i + 2] = bs / as;
        out[i + 3] = Math.round((as / (SS * SS)) * 255);
      }
    }
  }
  writeFileSync(new URL(`../extension/icons/icon${size}.png`, import.meta.url), png(size, out));
}
console.log('icons written');
