/* Boots the owner panel outside a browser to catch runtime errors that a
   syntax check and the unit tests both miss.

   The DOM here is a "string DOM": it keeps the real HTML file plus everything
   ever assigned to an innerHTML, and answers querySelector by looking for the
   selector in that text. Crude, but it resolves the one thing that matters —
   whether a lookup returns an element or null — so `role('typo').textContent`
   throws here exactly as it would in Safari. */

import { readFileSync } from 'node:fs';

const html = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

/** Turn a selector into the substring that would appear in markup. */
function fingerprint(selector) {
  const s = String(selector).trim();
  let m = /^\[data-role="([^"]+)"\]$/.exec(s);
  if (m) return `data-role="${m[1]}"`;
  m = /^#([\w-]+)$/.exec(s);
  if (m) return `id="${m[1]}"`;
  m = /^\[data-([\w-]+)="?([^"\]]*)"?\]$/.exec(s);
  if (m) return `data-${m[1]}="${m[2]}"`;
  m = /^\.([\w-]+)$/.exec(s);
  if (m) return m[1];
  // Compound or attribute-only selectors: fall back to the first token.
  m = /([\w-]+)/.exec(s);
  return m ? m[1] : s;
}

class FakeElement {
  constructor(doc, tag = 'div', markup = '') {
    this.doc = doc;
    this.tagName = tag.toUpperCase();
    this.dataset = {};
    this.style = { cssText: '' };
    this.classList = {
      _s: new Set(),
      add: (...c) => c.forEach((x) => this.classList._s.add(x)),
      remove: (...c) => c.forEach((x) => this.classList._s.delete(x)),
      toggle: (c, on) => (on ? this.classList._s.add(c) : this.classList._s.delete(c)),
      contains: (c) => this.classList._s.has(c),
    };
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.offsetParent = this;
    this._html = markup;
  }

  get innerHTML() { return this._html; }

  set innerHTML(v) {
    this._html = String(v);
    this.doc.absorb(this._html);
  }

  setAttribute(name, value) {
    if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value);
    this[name] = value;
  }

  getAttribute(name) { return this[name] ?? null; }
  removeAttribute(name) { delete this[name]; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { return child; }
  replaceChildren() { this.children.length = 0; }
  addEventListener() {}
  removeEventListener() {}
  focus() {}
  scrollTo() {}
  closest() { return null; }
  querySelector(sel) { return this.doc.find(sel, this._html); }
  querySelectorAll(sel) { const el = this.querySelector(sel); return el ? [el] : []; }
  insertAdjacentHTML(_pos, markup) { this.doc.absorb(markup); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
}

class FakeDoc {
  constructor(page) {
    this.text = html(page);
    this.cache = new Map();
    this.body = new FakeElement(this, 'body');
    this.documentElement = new FakeElement(this, 'html');
    this.fonts = { ready: Promise.resolve() };
    this.activeElement = null;
  }

  absorb(markup) { this.text += '\n' + markup; }

  /** Resolve a selector against the page text, or a scoped fragment. */
  find(sel, scope = null) {
    const needle = fingerprint(sel);
    const haystack = scope === null ? this.text : scope;
    if (!haystack.includes(needle)) return null;
    const key = `${sel}::${scope === null ? 'doc' : 'scoped'}`;
    if (scope === null && this.cache.has(key)) return this.cache.get(key);
    const el = new FakeElement(this, 'div');
    if (scope === null) this.cache.set(key, el);
    return el;
  }

  querySelector(sel) { return this.find(sel); }
  querySelectorAll(sel) { const el = this.find(sel); return el ? [el] : []; }
  createElement(tag) { return new FakeElement(this, tag); }
  createElementNS(_ns, tag) { return new FakeElement(this, tag); }
  createDocumentFragment() { return new FakeElement(this, 'fragment'); }
  addEventListener() {}
  removeEventListener() {}
}

export function installPage(page) {
  const doc = new FakeDoc(page);
  const memory = new Map();

  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    scrollY: 0,
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    open() {},
  };
  globalThis.matchMedia = globalThis.window.matchMedia;
  globalThis.scrollTo = () => {};
  globalThis.localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
  globalThis.location = { search: '', pathname: '/admin.html', hash: '', origin: 'http://localhost', href: '' };
  globalThis.history = { replaceState() {} };
  // Node defines navigator as a getter-only property.
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => {} }, userAgent: 'node' },
    configurable: true,
    writable: true,
  });
  globalThis.fetch = async () => ({ ok: false });
  globalThis.requestAnimationFrame = (cb) => cb(0);
  globalThis.confirm = () => false;
  globalThis.Blob = class {};
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};

  return { doc, memory };
}

/* --- run ---------------------------------------------------------------- */

installPage('admin.html');
// Signed in, so the panel renders instead of the passcode screen.
localStorage.setItem('kuney.owner', 'ab4ffe4752fdd007ed90a27685d478b30462376f90db22b17a9c4b9d8d831881');

const failures = [];

// Registered first: admin.js builds its panel inside store.load().then(...),
// so a throw there surfaces as a rejection, not as a throw from the import.
process.on('unhandledRejection', (reason) => {
  failures.push(`unhandled rejection: ${reason?.stack || reason}`);
});
process.on('uncaughtException', (err) => {
  failures.push(`uncaught exception: ${err?.stack || err}`);
});

try {
  await import('../js/admin.js');
} catch (err) {
  failures.push(`admin.js threw on import: ${err.stack || err.message}`);
}

await new Promise((r) => setTimeout(r, 150));

if (failures.length) {
  console.log('\n  boot: FAILED\n');
  for (const f of failures) console.log(`  x ${f}\n`);
  process.exit(1);
}
console.log('\n  boot: the owner panel renders without throwing\n');
