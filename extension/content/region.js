// Overlay for drawing a capture rectangle. Injected on demand, removed when done.
(() => {
  if (window.__pageshotRegionActive) return;
  window.__pageshotRegionActive = true;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .layer { position: fixed; inset: 0; cursor: crosshair; background: rgba(0,0,0,.35); }
      .box { position: fixed; display: none; outline: 2px solid #1a73e8; box-shadow: 0 0 0 100vmax rgba(0,0,0,.35); }
      .layer.drawing { background: transparent; }
      .size { position: fixed; display: none; padding: 2px 6px; font: 12px/1.4 system-ui, sans-serif;
              color: #fff; background: #1a73e8; border-radius: 3px; pointer-events: none; }
      .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 8px 14px;
              font: 13px/1.4 system-ui, sans-serif; color: #fff; background: rgba(32,33,36,.92);
              border-radius: 6px; pointer-events: none; }
    </style>
    <div class="layer"></div>
    <div class="box"></div>
    <div class="size"></div>
    <div class="hint">Drag to select an area. Press Esc to cancel.</div>`;
  const layer = shadow.querySelector('.layer');
  const box = shadow.querySelector('.box');
  const size = shadow.querySelector('.size');
  const hint = shadow.querySelector('.hint');
  document.documentElement.appendChild(host);

  let start = null;
  let rect = null;

  const cleanup = () => {
    host.remove();
    window.removeEventListener('keydown', onKey, true);
    window.__pageshotRegionActive = false;
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  };
  window.addEventListener('keydown', onKey, true);

  layer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    layer.classList.add('drawing');
    hint.style.display = 'none';
  });

  layer.addEventListener('mousemove', (e) => {
    if (!start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const w = Math.abs(e.clientX - start.x);
    const h = Math.abs(e.clientY - start.y);
    rect = { x, y, width: w, height: h };
    Object.assign(box.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    size.textContent = `${Math.round(w)} × ${Math.round(h)}`;
    Object.assign(size.style, { display: 'block', left: `${x}px`, top: `${Math.max(0, y - 24)}px` });
  });

  layer.addEventListener('mouseup', () => {
    if (!start) return;
    start = null;
    const picked = rect;
    cleanup();
    if (!picked || picked.width < 4 || picked.height < 4) return; // a click, not a drag
    // Wait for the overlay to disappear from the screen before the capture is taken.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        chrome.runtime.sendMessage({
          type: 'region-selected',
          rect: { ...picked, viewportWidth: window.innerWidth },
        }),
      ),
    );
  });
})();
