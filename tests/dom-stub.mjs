/* The smallest DOM that lets the scene modules run outside a browser.

   Only the 2D canvas surface is real enough to matter: the procedural textures
   write pixels through createImageData/putImageData, and the calendar board
   measures and draws text. Everything else answers as a no-op so a stray call
   cannot fail the build. */

function context2d(canvas) {
  const state = {
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px sans-serif',
    letterSpacing: '0px',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    filter: 'none',
    globalAlpha: 1,

    createImageData(w, h) {
      const width = h === undefined ? w.width : w;
      const height = h === undefined ? w.height : h;
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
    getImageData(x, y, w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    // Rough but monotonic: enough for the invoice's line-wrapping maths.
    measureText(text) {
      const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] || '10');
      return { width: String(text).length * px * 0.55 };
    },
  };

  const noop = () => {};
  for (const name of [
    'fillRect', 'clearRect', 'strokeRect', 'fillText', 'strokeText', 'beginPath',
    'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fill',
    'stroke', 'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform',
    'transform', 'clip', 'drawImage', 'quadraticCurveTo', 'bezierCurveTo',
    'setLineDash', 'resetTransform',
  ]) state[name] = noop;

  return state;
}

class StubCanvas {
  constructor() {
    this.width = 300;
    this.height = 150;
    this.style = {};
    this._ctx = null;
  }

  getContext(kind) {
    if (kind !== '2d') return null;
    if (!this._ctx) this._ctx = context2d(this);
    return this._ctx;
  }

  toDataURL() { return 'data:image/png;base64,'; }
  toBlob(cb) { cb(null); }
  addEventListener() {}
  removeEventListener() {}
}

export function installDom() {
  const memory = new Map();

  globalThis.HTMLCanvasElement = StubCanvas;
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') return new StubCanvas();
      return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} };
    },
    createDocumentFragment() { return { appendChild() {} }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    fonts: { ready: Promise.resolve() },
  };
  globalThis.window = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  globalThis.matchMedia = globalThis.window.matchMedia;
  globalThis.localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
    clear: () => memory.clear(),
  };
  globalThis.location = { search: '', pathname: '/', hash: '', origin: 'http://localhost' };
  globalThis.fetch = async () => ({ ok: false });
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);

  return { memory };
}
