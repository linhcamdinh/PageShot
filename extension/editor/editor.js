import { getCapture } from '../lib/store.js';
import {
  FONTS, bounds, drawAll, drawShape, flatten, fontString, hitTest, isBox, isLine, normBox, textLayout, translate,
} from './shapes.js';
import { DEFAULT_SETTINGS, cleanName, defaultBaseName, downloadPath, encode, formatBytes } from './export.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const textInput = $('text-input');

// Which style controls each tool (or selected shape type) uses.
const CONTROLS = {
  select: [],
  arrow: ['color', 'stroke'],
  line: ['color', 'stroke'],
  rect: ['color', 'stroke', 'fill'],
  ellipse: ['color', 'stroke', 'fill'],
  pen: ['color', 'stroke'],
  highlighter: ['color', 'stroke'],
  text: ['color', 'text'],
  step: ['color', 'stroke'],
  blur: ['stroke'],
  crop: [],
};
const DRAW_TOOLS = new Set(['arrow', 'line', 'rect', 'ellipse', 'pen', 'highlighter', 'blur']);
const TOOL_KEYS = { v: 'select', a: 'arrow', l: 'line', r: 'rect', o: 'ellipse', p: 'pen', h: 'highlighter', t: 'text', n: 'step', b: 'blur', c: 'crop' };
const HIGHLIGHTER_MIN = 14;

const state = {
  capture: null,
  base: null, // ImageBitmap or OffscreenCanvas holding the screenshot pixels
  shapes: [],
  history: [],
  historyIndex: -1,
  savedIndex: 0,
  tool: 'arrow',
  style: { color: '#e53935', width: 4, fill: 'none', font: FONTS[0].value, size: 28, bold: true, italic: false, background: false },
  selected: null,
  active: null, // shape being drawn or dragged; drawn on top of the cached layer
  drag: null,
  crop: null,
  editingText: null,
  zoom: 1,
  cacheDirty: true,
};
const cache = { canvas: null, ctx: null };

// ---------- history ----------

function snapshot() {
  return { base: state.base, shapes: structuredClone(state.shapes) };
}

function commit() {
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snapshot());
  state.historyIndex = state.history.length - 1;
  if (state.savedIndex > state.historyIndex) state.savedIndex = -1;
  state.cacheDirty = true;
  updateUndoButtons();
  render();
}

function restore(index) {
  const snap = state.history[index];
  state.historyIndex = index;
  const sizeChanged = snap.base !== state.base;
  state.base = snap.base;
  state.shapes = structuredClone(snap.shapes);
  state.selected = null;
  state.active = null;
  if (sizeChanged) resizeCanvas();
  state.cacheDirty = true;
  updateUndoButtons();
  syncControls();
  render();
}

function undo() {
  if (state.editingText) finishText();
  if (state.historyIndex > 0) restore(state.historyIndex - 1);
}

function redo() {
  if (state.editingText) finishText();
  if (state.historyIndex < state.history.length - 1) restore(state.historyIndex + 1);
}

function updateUndoButtons() {
  $('undo').disabled = state.historyIndex <= 0;
  $('redo').disabled = state.historyIndex >= state.history.length - 1;
}

// ---------- rendering ----------

let frameRequested = false;
function render() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    draw();
  });
}

function draw() {
  if (!state.base) return;
  if (state.cacheDirty) {
    cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
    const hidden = state.active || state.editingText;
    drawAll(cache.ctx, state.base, state.shapes.filter((s) => s !== hidden));
    state.cacheDirty = false;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cache.canvas, 0, 0);
  if (state.active && state.active !== state.editingText) drawShape(ctx, state.active, state.base);
  if (state.selected && !state.editingText) drawSelection(state.selected);
  if (state.crop) drawCropOverlay(state.crop);
}

const px = (n) => n / state.zoom; // screen pixels to image pixels

function drawSelection(s) {
  const b = bounds(s);
  ctx.save();
  ctx.lineWidth = px(1.5);
  ctx.setLineDash([px(5), px(4)]);
  ctx.strokeStyle = '#1a73e8';
  const pad = px(4);
  ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
  ctx.setLineDash([]);
  for (const h of handles(s)) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, px(5), 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawCropOverlay(c) {
  const { x, y, w, h } = normBox(c);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.rect(x, y, w, h);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = px(1.5);
  ctx.setLineDash([px(6), px(4)]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function handles(s) {
  if (isBox(s)) {
    const { x, y, w, h } = normBox(s);
    return [
      { id: 'nw', x, y }, { id: 'ne', x: x + w, y },
      { id: 'sw', x, y: y + h }, { id: 'se', x: x + w, y: y + h },
    ];
  }
  if (isLine(s)) return [{ id: 'p1', x: s.x1, y: s.y1 }, { id: 'p2', x: s.x2, y: s.y2 }];
  return [];
}

function resizeCanvas() {
  canvas.width = state.base.width;
  canvas.height = state.base.height;
  cache.canvas = new OffscreenCanvas(state.base.width, state.base.height);
  cache.ctx = cache.canvas.getContext('2d');
  state.cacheDirty = true;
  updateMeta();
  applyZoom();
}

// ---------- zoom ----------

function fitZoom() {
  const avail = stage.clientWidth - 48;
  return Math.min(1, avail / state.base.width);
}

function setZoom(z) {
  state.zoom = Math.max(0.1, Math.min(4, z));
  applyZoom();
}

function applyZoom() {
  canvas.style.width = `${Math.round(state.base.width * state.zoom)}px`;
  canvas.style.height = `${Math.round(state.base.height * state.zoom)}px`;
  $('zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
  if (state.editingText) positionTextInput();
  render();
}

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
function zoomStep(dir) {
  const z = state.zoom;
  const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001);
  if (next) setZoom(next);
}

// ---------- pointer input ----------

function toImage(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width, (e.clientX - r.left) / state.zoom)),
    y: Math.max(0, Math.min(canvas.height, (e.clientY - r.top) / state.zoom)),
  };
}

function shapeAt(x, y) {
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    if (hitTest(state.shapes[i], x, y, px(6))) return state.shapes[i];
  }
  return null;
}

function handleAt(x, y) {
  if (!state.selected) return null;
  return handles(state.selected).find((h) => Math.hypot(h.x - x, h.y - y) <= px(9)) || null;
}

// Holding Shift keeps lines at 45° steps and boxes square.
function constrain(x0, y0, x, y, kind) {
  const dx = x - x0;
  const dy = y - y0;
  if (kind === 'line') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: x0 + Math.cos(angle) * len, y: y0 + Math.sin(angle) * len };
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: x0 + Math.sign(dx || 1) * size, y: y0 + Math.sign(dy || 1) * size };
}

function newShape(tool, x, y) {
  const { color, width, fill } = state.style;
  if (tool === 'pen' || tool === 'highlighter') {
    const s = { type: 'pen', points: [[x, y]], color, width };
    if (tool === 'highlighter') Object.assign(s, { highlighter: true, width: Math.max(width, HIGHLIGHTER_MIN) });
    return s;
  }
  const s = { type: tool, x1: x, y1: y, x2: x, y2: y, color, width };
  if (tool === 'rect' || tool === 'ellipse') s.fill = fill;
  return s;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !state.base) return;
  if (state.editingText) {
    finishText();
    if (state.tool === 'text') return; // a click outside the box only closes it
  }
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = toImage(e);
  const tool = state.tool;

  if (tool === 'crop') {
    state.crop = { x1: x, y1: y, x2: x, y2: y };
    state.drag = { kind: 'crop' };
    showCropBar();
    return render();
  }

  if (tool === 'text') {
    const hit = shapeAt(x, y);
    if (hit?.type === 'text') return startText(hit);
    const { color, font, size, bold, italic, background } = state.style;
    return startText({ type: 'text', x, y: y - size * 0.6, text: '', color, font, size, bold, italic, background }, true);
  }

  if (tool === 'step') {
    const n = Math.max(0, ...state.shapes.filter((s) => s.type === 'step').map((s) => s.n)) + 1;
    const s = { type: 'step', x, y, n, color: state.style.color, width: state.style.width };
    state.shapes.push(s);
    select(s);
    return commit();
  }

  if (tool === 'select') {
    const handle = handleAt(x, y);
    if (handle) {
      state.drag = { kind: 'handle', handle: handle.id, moved: false };
      state.active = state.selected;
      state.cacheDirty = true;
      return render();
    }
    const hit = shapeAt(x, y);
    select(hit);
    if (hit) {
      state.drag = { kind: 'move', last: { x, y }, moved: false };
      state.active = hit;
      state.cacheDirty = true;
    }
    return render();
  }

  if (DRAW_TOOLS.has(tool)) {
    const s = newShape(tool, x, y);
    state.active = s;
    state.drag = { kind: 'draw', start: { x, y } };
    select(null);
    render();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const { x, y } = toImage(e);
  updateCursor(x, y);
  const d = state.drag;
  if (!d) return;

  if (d.kind === 'crop') {
    const p = e.shiftKey ? constrain(state.crop.x1, state.crop.y1, x, y, 'box') : { x, y };
    state.crop.x2 = Math.max(0, Math.min(canvas.width, p.x));
    state.crop.y2 = Math.max(0, Math.min(canvas.height, p.y));
    updateCropSize();
  } else if (d.kind === 'draw') {
    const s = state.active;
    if (s.type === 'pen') {
      const last = s.points[s.points.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) >= px(1.5)) s.points.push([x, y]);
    } else {
      const p = e.shiftKey ? constrain(s.x1, s.y1, x, y, isLine(s) ? 'line' : 'box') : { x, y };
      s.x2 = p.x;
      s.y2 = p.y;
    }
  } else if (d.kind === 'move') {
    translate(state.active, x - d.last.x, y - d.last.y);
    d.last = { x, y };
    d.moved = true;
  } else if (d.kind === 'handle') {
    const s = state.active;
    const map = { nw: ['x1', 'y1'], ne: ['x2', 'y1'], sw: ['x1', 'y2'], se: ['x2', 'y2'], p1: ['x1', 'y1'], p2: ['x2', 'y2'] };
    const [kx, ky] = map[d.handle];
    s[kx] = x;
    s[ky] = y;
    d.moved = true;
  }
  render();
});

function endDrag() {
  const d = state.drag;
  if (!d) return;
  state.drag = null;

  if (d.kind === 'crop') {
    const { w, h } = normBox(state.crop);
    if (w < 4 || h < 4) cancelCrop();
    return render();
  }

  const s = state.active;
  state.active = null;
  state.cacheDirty = true;

  if (d.kind === 'draw') {
    const b = bounds(s);
    const tiny = s.type === 'pen' ? false : isLine(s) ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 4 : b.w < 4 || b.h < 4;
    if (tiny) return render();
    if (isBox(s)) normalizeBox(s);
    state.shapes.push(s);
    select(s);
    return commit();
  }
  if (d.kind === 'handle' && isBox(s)) normalizeBox(s);
  if (d.moved) commit();
  else render();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function normalizeBox(s) {
  const { x, y, w, h } = normBox(s);
  Object.assign(s, { x1: x, y1: y, x2: x + w, y2: y + h });
}

canvas.addEventListener('dblclick', (e) => {
  const { x, y } = toImage(e);
  const hit = shapeAt(x, y);
  if (hit?.type === 'text') startText(hit);
});

function updateCursor(x, y) {
  let cursor = 'crosshair';
  if (state.tool === 'text') cursor = 'text';
  else if (state.tool === 'select') {
    if (state.drag?.kind === 'move') cursor = 'grabbing';
    else if (handleAt(x, y)) cursor = 'pointer';
    else cursor = shapeAt(x, y) ? 'move' : 'default';
  }
  canvas.style.cursor = cursor;
}

// ---------- text editing ----------

function startText(shape, isNew = false) {
  state.editingText = shape;
  state.editingIsNew = isNew;
  select(shape);
  if (!isNew) {
    // Edit with the shape's own style so changes from the toolbar apply to it.
    Object.assign(state.style, { color: shape.color, font: shape.font, size: shape.size, bold: shape.bold, italic: shape.italic, background: shape.background });
    syncControls();
  }
  textInput.value = shape.text;
  textInput.hidden = false;
  styleTextInput();
  state.cacheDirty = true;
  render();
  requestAnimationFrame(() => {
    textInput.focus();
    textInput.select();
  });
}

function styleTextInput() {
  const s = state.editingText;
  const z = state.zoom;
  const lineHeight = Math.round(s.size * 1.25);
  textInput.style.font = fontString({ ...s, size: s.size * z });
  textInput.style.lineHeight = `${lineHeight * z}px`;
  textInput.style.color = s.color;
  positionTextInput();
}

function positionTextInput() {
  const s = state.editingText;
  const z = state.zoom;
  const layout = textLayout({ ...s, text: textInput.value || ' ' });
  textInput.style.left = `${s.x * z}px`;
  textInput.style.top = `${s.y * z}px`;
  textInput.style.width = `${(layout.width + s.size) * z}px`;
  textInput.style.height = `${layout.height * z + 2}px`;
}

textInput.addEventListener('input', () => {
  state.editingText.text = textInput.value;
  positionTextInput();
});

textInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault();
    finishText();
  }
});

function finishText() {
  const s = state.editingText;
  if (!s) return;
  state.editingText = null;
  textInput.hidden = true;
  s.text = textInput.value.replace(/\s+$/, '');
  const index = state.shapes.indexOf(s);
  if (!s.text) {
    if (index >= 0) state.shapes.splice(index, 1);
    select(null);
    state.cacheDirty = true;
    if (index >= 0) commit();
    else render();
    return;
  }
  if (index < 0) state.shapes.push(s);
  select(s);
  commit();
}

textInput.addEventListener('blur', () => {
  // Clicking toolbar controls (font, size, color) must not close the box.
  setTimeout(() => {
    if (state.editingText && !document.querySelector('.toolbar')?.contains(document.activeElement)) finishText();
  }, 0);
});

// ---------- crop ----------

function showCropBar() {
  $('cropbar').hidden = false;
  $('styles').hidden = true;
  updateCropSize();
}

function updateCropSize() {
  const { w, h } = normBox(state.crop);
  $('crop-size').textContent = `${Math.round(w)} × ${Math.round(h)}`;
  $('crop-apply').disabled = w < 4 || h < 4;
}

function cancelCrop() {
  state.crop = null;
  $('cropbar').hidden = true;
  $('styles').hidden = false;
  render();
}

function applyCrop() {
  if (!state.crop) return;
  const b = normBox(state.crop);
  const x = Math.round(b.x);
  const y = Math.round(b.y);
  const w = Math.round(b.w);
  const h = Math.round(b.h);
  const next = new OffscreenCanvas(w, h);
  next.getContext('2d').drawImage(state.base, x, y, w, h, 0, 0, w, h);
  state.base = next;
  for (const s of state.shapes) translate(s, -x, -y);
  state.crop = null;
  $('cropbar').hidden = true;
  $('styles').hidden = false;
  select(null);
  resizeCanvas();
  setZoom(fitZoom());
  setTool('select');
  commit();
}

$('crop-apply').addEventListener('click', applyCrop);
$('crop-cancel').addEventListener('click', cancelCrop);

// ---------- tools and styles ----------

function setTool(tool) {
  if (state.editingText) finishText();
  if (state.crop && tool !== 'crop') cancelCrop();
  state.tool = tool;
  document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  if (tool !== 'select') select(null);
  syncControls();
  render();
}

function select(shape) {
  state.selected = shape;
  $('delete').hidden = !shape;
  syncControls();
}

function controlKind() {
  const s = state.selected;
  if (s) {
    if (s.type === 'pen') return s.highlighter ? 'highlighter' : 'pen';
    return s.type;
  }
  return state.tool;
}

function syncControls() {
  const kind = controlKind();
  const shown = new Set(CONTROLS[kind] || []);
  document.querySelector('.swatches').hidden = !shown.has('color');
  document.querySelectorAll('.ctl').forEach((el) => (el.hidden = !shown.has(el.dataset.for)));

  const src = state.selected || state.style;
  const color = src.color || state.style.color;
  $('color').value = color;
  let matched = false;
  document.querySelectorAll('.swatch').forEach((b) => {
    const on = b.dataset.color === color;
    matched ||= on;
    b.setAttribute('aria-checked', String(on));
  });
  document.querySelector('.custom-color').classList.toggle('checked', !matched);

  $('width-label').textContent = kind === 'blur' ? 'Strength' : 'Size';
  $('width').value = src.width ?? state.style.width;
  $('width-value').textContent = $('width').value;
  $('fill').value = src.fill ?? state.style.fill;
  const t = state.selected?.type === 'text' ? state.selected : state.style;
  $('font').value = t.font;
  $('font-size').value = t.size;
  $('bold').setAttribute('aria-pressed', String(!!t.bold));
  $('italic').setAttribute('aria-pressed', String(!!t.italic));
  $('text-bg').setAttribute('aria-pressed', String(!!t.background));
}

// Updates the default style and the selected shape. `final` records an undo step.
function setStyle(key, value, final = true) {
  state.style[key] = value;
  saveStyle();
  const s = state.selected;
  if (s && key in s) {
    s[key] = key === 'width' && s.highlighter ? Math.max(value, HIGHLIGHTER_MIN) : value;
    state.cacheDirty = true;
    if (state.editingText === s) {
      styleTextInput();
      textInput.focus();
    }
    else if (final) return commit();
  }
  syncControls();
  render();
}

function saveStyle() {
  chrome.storage.local.set({ editorStyle: state.style }).catch(() => {});
}

document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => setStyle('color', b.dataset.color)));
$('color').addEventListener('input', (e) => setStyle('color', e.target.value, false));
$('color').addEventListener('change', (e) => setStyle('color', e.target.value));
$('width').addEventListener('input', (e) => setStyle('width', Number(e.target.value), false));
$('width').addEventListener('change', (e) => setStyle('width', Number(e.target.value)));
$('fill').addEventListener('change', (e) => setStyle('fill', e.target.value));
$('font').addEventListener('change', (e) => setStyle('font', e.target.value));
$('font-size').addEventListener('change', (e) => {
  const v = Math.max(8, Math.min(200, Number(e.target.value) || 28));
  e.target.value = v;
  setStyle('size', v);
});
$('bold').addEventListener('click', () => setStyle('bold', !(state.selected?.type === 'text' ? state.selected.bold : state.style.bold)));
$('italic').addEventListener('click', () => setStyle('italic', !(state.selected?.type === 'text' ? state.selected.italic : state.style.italic)));
$('text-bg').addEventListener('click', () => setStyle('background', !(state.selected?.type === 'text' ? state.selected.background : state.style.background)));
// Keep focus in the text box while using the text controls.
for (const id of ['bold', 'italic', 'text-bg']) $(id).addEventListener('mousedown', (e) => state.editingText && e.preventDefault());

for (const f of FONTS) $('font').add(new Option(f.label, f.value));
for (const opt of $('font').options) opt.style.fontFamily = opt.value;

function deleteSelected() {
  const s = state.selected;
  if (!s) return;
  state.shapes.splice(state.shapes.indexOf(s), 1);
  select(null);
  commit();
}
$('delete').addEventListener('click', deleteSelected);
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('zoom-in').addEventListener('click', () => zoomStep(1));
$('zoom-out').addEventListener('click', () => zoomStep(-1));
$('zoom-label').addEventListener('click', () => setZoom(state.zoom === fitZoom() ? 1 : fitZoom()));

stage.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  zoomStep(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

// ---------- keyboard ----------

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && key === 'y') { e.preventDefault(); return redo(); }
  if (mod && key === 's') { e.preventDefault(); return save(); }
  if (mod && key === 'c' && !window.getSelection()?.toString()) { e.preventDefault(); return copy(); }
  if (mod && (key === '=' || key === '+')) { e.preventDefault(); return zoomStep(1); }
  if (mod && key === '-') { e.preventDefault(); return zoomStep(-1); }
  if (mod && key === '0') { e.preventDefault(); return setZoom(fitZoom()); }
  if (mod) return;

  if (key === 'delete' || key === 'backspace') { e.preventDefault(); return deleteSelected(); }
  if (key === 'escape') {
    if (state.crop) return cancelCrop();
    select(null);
    return render();
  }
  if (key === 'enter' && state.crop) return applyCrop();
  if (state.selected && key.startsWith('arrow')) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
    translate(state.selected, dx, dy);
    return commit();
  }
  if (TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
});

// ---------- export ----------

const exportSettings = { ...DEFAULT_SETTINGS };
let fileBaseName = '';
let lastDownloadId = null;
const pendingDownloads = new Map(); // download id -> history index and size at save time

function loadExportSettings(saved) {
  Object.assign(exportSettings, saved);
  syncExportControls();
}

function saveExportSettings() {
  chrome.storage.local.set({ exportSettings }).catch(() => {});
}

function syncExportControls() {
  document.querySelectorAll('[data-format]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.format === exportSettings.format)));
  $('quality-ctl').hidden = exportSettings.format !== 'jpeg';
  $('quality').value = exportSettings.quality;
  $('quality-value').textContent = exportSettings.quality;
  $('ask-location').checked = exportSettings.askLocation;
  $('folder').value = exportSettings.folder;
  $('folder').disabled = exportSettings.askLocation;
  $('folder-field').classList.toggle('disabled', exportSettings.askLocation);
  $('save').textContent = `Save ${exportSettings.format === 'jpeg' ? 'JPEG' : 'PNG'}`;
  $('filename').value = fileBaseName;
}

document.querySelectorAll('[data-format]').forEach((b) =>
  b.addEventListener('click', () => {
    exportSettings.format = b.dataset.format;
    saveExportSettings();
    syncExportControls();
  }),
);
$('quality').addEventListener('input', (e) => {
  exportSettings.quality = Number(e.target.value);
  $('quality-value').textContent = e.target.value;
});
$('quality').addEventListener('change', saveExportSettings);
$('ask-location').addEventListener('change', (e) => {
  exportSettings.askLocation = e.target.checked;
  saveExportSettings();
  syncExportControls();
});
$('folder').addEventListener('change', (e) => {
  exportSettings.folder = e.target.value.trim();
  saveExportSettings();
});
$('filename').addEventListener('change', (e) => {
  fileBaseName = cleanName(e.target.value) || defaultBaseName(state.capture);
  e.target.value = fileBaseName;
});

function toggleMenu(open = $('save-menu').hidden) {
  $('save-menu').hidden = !open;
  $('save-settings').setAttribute('aria-expanded', String(open));
}
$('save-settings').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMenu();
});
document.addEventListener('pointerdown', (e) => {
  if (!$('save-menu').hidden && !e.target.closest('.menu-wrap')) toggleMenu(false);
});
$('save-menu').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') toggleMenu(false);
});

async function exportBlob(format = 'png') {
  if (state.editingText) finishText();
  return encode(flatten(state.base, state.shapes), format, exportSettings.quality);
}

async function save() {
  if (!state.base) return;
  toggleMenu(false);
  const { format, askLocation, folder } = exportSettings;
  const blob = await exportBlob(format);
  const url = URL.createObjectURL(blob);
  try {
    const filename = downloadPath(fileBaseName, format, askLocation ? '' : folder);
    lastDownloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: askLocation,
      conflictAction: 'uniquify',
    });
    pendingDownloads.set(lastDownloadId, { index: state.historyIndex, size: blob.size });
    // Small files can finish before the listener knows the id.
    const [item] = await chrome.downloads.search({ id: lastDownloadId });
    if (item?.state === 'complete') onDownloadChanged({ id: item.id, state: { current: 'complete' } });
  } catch (err) {
    showToast(`Could not save: ${err.message}`);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// Report the outcome once Chrome finishes writing (or the person cancels the Save As dialog).
async function onDownloadChanged(delta) {
  const pending = pendingDownloads.get(delta.id);
  if (!pending) return;
  if (delta.state?.current === 'complete') {
    pendingDownloads.delete(delta.id);
    state.savedIndex = pending.index;
    const [item] = await chrome.downloads.search({ id: delta.id });
    const name = item?.filename?.split(/[\\/]/).pop() || 'screenshot';
    showToast(`Saved ${name} (${formatBytes(item?.fileSize || pending.size)})`, delta.id);
  } else if (delta.error) {
    pendingDownloads.delete(delta.id);
    if (delta.error.current !== 'USER_CANCELED') showToast(`Could not save: ${delta.error.current}`);
  }
}
chrome.downloads.onChanged.addListener(onDownloadChanged);

let toastTimer;
function showToast(text, downloadId) {
  $('toast-text').textContent = text;
  $('toast-show').hidden = downloadId == null;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 6000);
}
$('toast-show').addEventListener('click', () => {
  if (lastDownloadId != null) chrome.downloads.show(lastDownloadId);
});

async function copy() {
  if (!state.base) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': exportBlob('png') })]);
    const b = $('copy');
    b.textContent = 'Copied';
    setTimeout(() => (b.textContent = 'Copy'), 1500);
  } catch (err) {
    showToast(`Could not copy: ${err.message}`);
  }
}

$('save').addEventListener('click', save);
$('copy').addEventListener('click', copy);

window.addEventListener('beforeunload', (e) => {
  if (state.historyIndex > 0 && state.savedIndex !== state.historyIndex) e.preventDefault();
});

// ---------- startup ----------

function showNotice(text) {
  $('notice').textContent = text;
  $('notice').hidden = false;
}

function updateMeta() {
  const title = state.capture?.title;
  $('meta').textContent = `${state.base.width} × ${state.base.height}${title ? ` · ${title}` : ''}`;
}

async function load() {
  const stored = await chrome.storage.local.get(['editorStyle', 'exportSettings']).catch(() => ({}));
  if (stored.editorStyle) Object.assign(state.style, stored.editorStyle);

  const id = new URLSearchParams(location.search).get('id');
  state.capture = id && (await getCapture(id));
  if (!state.capture) {
    showNotice('This screenshot is no longer available. Take a new one from the Pageshot button.');
    return;
  }
  state.base = await createImageBitmap(state.capture.blob);
  fileBaseName = defaultBaseName(state.capture);
  loadExportSettings(stored.exportSettings || {});
  if (state.capture.title) document.title = `Pageshot · ${state.capture.title}`;
  if (state.capture.truncated) showNotice('This page is taller than Chrome can fit in one image, so the bottom was cut off.');
  resizeCanvas();
  setZoom(fitZoom());
  state.history = [snapshot()];
  state.historyIndex = 0;
  updateUndoButtons();
  setTool('arrow');
}

window.pageshotEditor = state; // handy for debugging from DevTools
load();
