// Annotation model: plain objects in image pixel coordinates, drawn onto a 2D context.
// Kept free of DOM and editor state so export and tests can reuse it.

export const FONTS = [
  { label: 'Sans', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet', value: '"Trebuchet MS", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, sans-serif' },
  { label: 'Comic', value: '"Comic Sans MS", "Comic Sans", cursive' },
];

const BOX_TYPES = new Set(['rect', 'ellipse', 'blur']);
const LINE_TYPES = new Set(['line', 'arrow']);

export const isBox = (s) => BOX_TYPES.has(s.type);
export const isLine = (s) => LINE_TYPES.has(s.type);

// Boxes are stored as two corners while drawing; this gives a positive-size rect.
export function normBox(s) {
  return {
    x: Math.min(s.x1, s.x2),
    y: Math.min(s.y1, s.y2),
    w: Math.abs(s.x2 - s.x1),
    h: Math.abs(s.y2 - s.y1),
  };
}

export function fontString(s) {
  return `${s.italic ? 'italic ' : ''}${s.bold ? '700 ' : '400 '}${s.size}px ${s.font}`;
}

const measureCtx = new OffscreenCanvas(1, 1).getContext('2d');

export function textLayout(s) {
  measureCtx.font = fontString(s);
  const lines = (s.text || '').split('\n');
  const lineHeight = Math.round(s.size * 1.25);
  const width = Math.max(1, ...lines.map((l) => measureCtx.measureText(l).width));
  const pad = s.background ? Math.round(s.size * 0.35) : 0;
  return { lines, lineHeight, width, height: lines.length * lineHeight, pad };
}

export function stepRadius(s) {
  return Math.round(12 + s.width * 1.6);
}

// Bounding box used for selection outlines and hit testing.
export function bounds(s) {
  if (isBox(s)) return normBox(s);
  if (isLine(s)) {
    const head = s.type === 'arrow' ? arrowHead(s) : 0;
    const p = s.width / 2 + head / 2;
    return {
      x: Math.min(s.x1, s.x2) - p,
      y: Math.min(s.y1, s.y2) - p,
      w: Math.abs(s.x2 - s.x1) + p * 2,
      h: Math.abs(s.y2 - s.y1) + p * 2,
    };
  }
  if (s.type === 'pen') {
    const xs = s.points.map((p) => p[0]);
    const ys = s.points.map((p) => p[1]);
    const p = s.width / 2;
    const x = Math.min(...xs) - p;
    const y = Math.min(...ys) - p;
    return { x, y, w: Math.max(...xs) + p - x, h: Math.max(...ys) + p - y };
  }
  if (s.type === 'text') {
    const t = textLayout(s);
    return { x: s.x - t.pad, y: s.y - t.pad, w: t.width + t.pad * 2, h: t.height + t.pad * 2 };
  }
  if (s.type === 'step') {
    const r = stepRadius(s);
    return { x: s.x - r, y: s.y - r, w: r * 2, h: r * 2 };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function hitTest(s, x, y, tolerance) {
  if (isLine(s)) return distToSegment(x, y, s.x1, s.y1, s.x2, s.y2) <= s.width / 2 + tolerance;
  if (s.type === 'pen') {
    const pts = s.points;
    if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= s.width / 2 + tolerance;
    for (let i = 1; i < pts.length; i++) {
      if (distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= s.width / 2 + tolerance) return true;
    }
    return false;
  }
  const b = bounds(s);
  return x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance;
}

export function translate(s, dx, dy) {
  if (isBox(s) || isLine(s)) {
    s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy;
  } else if (s.type === 'pen') {
    s.points = s.points.map(([x, y]) => [x + dx, y + dy]);
  } else {
    s.x += dx; s.y += dy;
  }
}

function arrowHead(s) {
  return Math.max(12, s.width * 3.2);
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Picks black or white, whichever reads better on the given color.
export function contrastColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '#000000' : '#ffffff';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

// `source` is the unannotated image, used by blur so it always hides the original pixels.
export function drawShape(ctx, s, source) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;

  switch (s.type) {
    case 'rect':
    case 'ellipse': {
      const { x, y, w, h } = normBox(s);
      ctx.beginPath();
      if (s.type === 'rect') ctx.rect(x, y, w, h);
      else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (s.fill === 'solid') {
        ctx.fill();
      } else if (s.fill === 'light') {
        ctx.fillStyle = withAlpha(s.color, 0.25);
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'line':
    case 'arrow': {
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = s.type === 'arrow' ? arrowHead(s) : 0;
      // Stop the shaft short of the tip so its round cap does not poke through the head.
      const ex = s.x2 - Math.cos(angle) * head * 0.6;
      const ey = s.y2 - Math.sin(angle) * head * 0.6;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(head ? ex : s.x2, head ? ey : s.y2);
      ctx.stroke();
      if (head) {
        const spread = Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - head * Math.cos(angle - spread), s.y2 - head * Math.sin(angle - spread));
        ctx.lineTo(s.x2 - head * Math.cos(angle + spread), s.y2 - head * Math.sin(angle + spread));
        ctx.closePath();
        ctx.lineWidth = Math.max(1, s.width / 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'pen': {
      const pts = s.points;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
      // Quadratic curves through midpoints give a smooth stroke.
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      if (pts.length > 1) ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      if (s.highlighter) {
        ctx.globalAlpha = 0.4;
        ctx.globalCompositeOperation = 'multiply';
      }
      ctx.stroke();
      break;
    }
    case 'text': {
      const t = textLayout(s);
      if (s.background) {
        ctx.fillStyle = contrastColor(s.color);
        roundRect(ctx, s.x - t.pad, s.y - t.pad, t.width + t.pad * 2, t.height + t.pad * 2, t.pad);
        ctx.fill();
        ctx.fillStyle = s.color;
      }
      ctx.font = fontString(s);
      ctx.textBaseline = 'top';
      // Center each line in its line box so the background padding looks even.
      const offset = (t.lineHeight - s.size) / 2;
      t.lines.forEach((line, i) => ctx.fillText(line, s.x, s.y + i * t.lineHeight + offset));
      break;
    }
    case 'blur': {
      const { x, y, w, h } = normBox(s);
      if (w < 1 || h < 1) break;
      // Pixelate: shrink the region, then scale it back up without smoothing.
      // Unlike a soft blur, this cannot be reversed to recover text.
      const block = Math.max(4, Math.round(s.width * 2.5));
      const sw = Math.max(1, Math.round(w / block));
      const sh = Math.max(1, Math.round(h / block));
      const small = new OffscreenCanvas(sw, sh);
      const sctx = small.getContext('2d');
      sctx.imageSmoothingQuality = 'medium';
      sctx.drawImage(source, x, y, w, h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
      break;
    }
    case 'step': {
      const r = stepRadius(s);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.strokeStyle = contrastColor(s.color);
      ctx.stroke();
      ctx.fillStyle = contrastColor(s.color);
      ctx.font = `700 ${Math.round(r * 1.1)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(s.n), s.x, s.y + r * 0.05);
      break;
    }
  }
  ctx.restore();
}

export function drawAll(ctx, base, shapes, skip) {
  ctx.drawImage(base, 0, 0);
  for (const s of shapes) if (s !== skip) drawShape(ctx, s, base);
}

// Flattens the image and annotations into a new canvas for export.
export function flatten(base, shapes) {
  const canvas = new OffscreenCanvas(base.width, base.height);
  drawAll(canvas.getContext('2d'), base, shapes);
  return canvas;
}
