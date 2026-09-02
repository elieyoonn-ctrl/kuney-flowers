/* ==========================================================================
   Store — the only place the app reads or writes persisted data.

   Content resolution order (later wins):
     1. DEFAULT_CONTENT   (js/content.js)
     2. data/content.json (shipped overrides — commit admin exports here)
     3. localStorage      (this browser's admin edits)

   Everything is behind this module deliberately: swapping localStorage for a
   real API later means rewriting `load` and `saveContent` only.
   ========================================================================== */

import { DEFAULT_CONTENT, CONTENT_VERSION } from './content.js';

const KEY_CONTENT = 'kuney.content.v4';
const KEY_GARDEN = 'kuney.garden.v3';
const KEY_ADMIN = 'kuney.admin';

let content = clone(DEFAULT_CONTENT);
let loaded = false;
const listeners = new Set();

/* --- utilities ---------------------------------------------------------- */

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** Deep-merge plain objects; arrays are replaced wholesale (they are lists the
 *  owner curates, so a partial merge would be surprising). */
function merge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const prev = out[key];
    // A null over a list or a settings object is corruption, not intent — an
    // owner clearing a field leaves an empty string or an empty array. Letting
    // it through once cost a blank shop, because the room is built from these.
    if (value === null && prev !== null && typeof prev === 'object') continue;
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      prev && typeof prev === 'object' && !Array.isArray(prev)
    ) {
      out[key] = merge(prev, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Private browsing or a full quota. The app must still work in-session.
    return false;
  }
}

/* --- dates -------------------------------------------------------------- */

/** Local-time YYYY-MM-DD. Never use toISOString() here — it shifts to UTC and
 *  would roll Hong Kong evenings onto the previous day. */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const out = new Date(date);
  out.setDate(out.getDate() + n);
  return out;
}

export function formatLongDate(key) {
  return parseDateKey(key).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/* --- content ------------------------------------------------------------ */

export async function load() {
  if (loaded) return content;

  let shipped = null;
  try {
    const res = await fetch('data/content.json', { cache: 'no-cache' });
    if (res.ok) shipped = await res.json();
  } catch {
    // Fine — running from a host without the file, or offline.
  }

  // Defaults plus whatever the site ships is the trustworthy baseline.
  let base = clone(DEFAULT_CONTENT);
  if (shipped) base = merge(base, shipped);
  repair(base, DEFAULT_CONTENT);

  const local = readJSON(KEY_CONTENT);
  content = (local && local.version === CONTENT_VERSION) ? merge(base, local) : base;

  content.version = CONTENT_VERSION;
  // Anything the browser copy broke falls back to the shipped value, not to the
  // factory default, so a stale snapshot cannot silently undo a publish.
  repair(content, base);
  loaded = true;
  return content;
}

/**
 * Make sure saved content still has the shape the app relies on.
 *
 * Content can arrive from a stale browser snapshot, a hand-edited
 * content.json, or an export from an older build, and a single missing array
 * is enough to throw while the room is being built — which shows up as a blank
 * page with no obvious cause. Anything missing or of the wrong type falls back
 * to the default for that key alone, so one bad value cannot cost the rest.
 *
 * @returns {string[]} the keys that had to be repaired
 */
export function repair(target = content, fallback = DEFAULT_CONTENT) {
  const repaired = [];
  const restore = (key) => clone(fallback[key] ?? DEFAULT_CONTENT[key]);
  const expect = (key, kind) => {
    const value = target[key];
    const ok = kind === 'array' ? Array.isArray(value)
      : value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!ok) {
      target[key] = restore(key);
      repaired.push(key);
    }
  };

  for (const key of ['palette', 'stockColors', 'occasions', 'sizes', 'delivery', 'terms',
    'displays', 'frames']) {
    expect(key, 'array');
  }
  for (const key of ['brand', 'contact', 'theme', 'invoice', 'calendar', 'garden']) {
    expect(key, 'object');
  }

  // The calendar's own collections are addressed by key, so they matter too.
  const cal = target.calendar;
  if (!Array.isArray(cal.closed)) { cal.closed = []; repaired.push('calendar.closed'); }
  if (!Array.isArray(cal.closedWeekdays)) { cal.closedWeekdays = []; repaired.push('calendar.closedWeekdays'); }
  if (!cal.overrides || typeof cal.overrides !== 'object' || Array.isArray(cal.overrides)) {
    cal.overrides = {};
    repaired.push('calendar.overrides');
  }
  if (!Array.isArray(target.garden.rewards)) {
    target.garden.rewards = clone((fallback.garden || DEFAULT_CONTENT.garden).rewards);
    repaired.push('garden.rewards');
  }
  if (!Array.isArray(target.garden.stageHours)) {
    target.garden.stageHours = clone((fallback.garden || DEFAULT_CONTENT.garden).stageHours);
    repaired.push('garden.stageHours');
  }
  if (!Array.isArray(target.garden.stageNames)) {
    target.garden.stageNames = clone((fallback.garden || DEFAULT_CONTENT.garden).stageNames);
    repaired.push('garden.stageNames');
  }

  if (repaired.length) {
    console.warn('[KUNEY] restored defaults for:', repaired.join(', '));
    globalThis.KUNEY_REPORT?.(`content repaired: ${repaired.join(', ')}`);
  }
  return repaired;
}

export function getContent() {
  return content;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(content);
}

/** Persist a partial content patch to this browser and notify listeners. */
export function saveContent(patch) {
  content = merge(content, patch);
  content.version = CONTENT_VERSION;
  repair(content);
  const ok = writeJSON(KEY_CONTENT, content);
  emit();
  return ok;
}

/**
 * Replace one value outright, with no merging.
 *
 * `saveContent` deep-merges objects, which is right for nested settings but
 * wrong for a map whose keys come and go: deleting a calendar override would
 * be undone by the merge re-adding it from the previous state. Anything
 * key-addressed goes through here instead.
 */
export function setContentPath(path, value) {
  const next = clone(content);
  const keys = path.split('.');
  let cursor = next;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (cursor[keys[i]] == null || typeof cursor[keys[i]] !== 'object') cursor[keys[i]] = {};
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
  content = next;
  content.version = CONTENT_VERSION;
  repair(content);
  const ok = writeJSON(KEY_CONTENT, content);
  emit();
  return ok;
}

export function resetContent() {
  try {
    localStorage.removeItem(KEY_CONTENT);
  } catch { /* ignore */ }
  loaded = false;
  return load().then((c) => {
    emit();
    return c;
  });
}

export function exportContent() {
  return JSON.stringify(content, null, 2);
}

export function importContent(json) {
  const parsed = JSON.parse(json);
  content = merge(clone(DEFAULT_CONTENT), parsed);
  content.version = CONTENT_VERSION;
  repair(content);
  writeJSON(KEY_CONTENT, content);
  emit();
  return content;
}

/* --- admin gate --------------------------------------------------------- */

export function isAdmin() {
  if (new URLSearchParams(location.search).get('admin') === '1') return true;
  try {
    return localStorage.getItem(KEY_ADMIN) === '1';
  } catch {
    return false;
  }
}

export function setAdmin(on) {
  try {
    if (on) localStorage.setItem(KEY_ADMIN, '1');
    else localStorage.removeItem(KEY_ADMIN);
  } catch { /* ignore */ }
}

/* --- availability ------------------------------------------------------- */

/**
 * Bouquets the shop will make on a given day.
 *
 * This is *only* what the owner has set. A visitor placing an order does not
 * change it: real orders arrive through the shop or WhatsApp, and the owner
 * lowers the day's number when they want it to show as sold out. Decrementing
 * it in the browser would have been theatre — it would only ever have counted
 * that one visitor's own clicks, so different customers would see different
 * numbers for the same day.
 *
 * Precedence matters and is deliberate:
 *   1. an explicitly closed day is shut, whatever number is set against it
 *   2. otherwise a per-day number wins — including on a weekly rest day, so
 *      the owner can open one Sunday without opening them all
 *   3. then the weekly rest day, if one is set
 *   4. then the standing daily limit
 */
export function baseLimitFor(key) {
  const cal = content.calendar;
  if ((cal.closed || []).includes(key)) return 0;
  if (Object.prototype.hasOwnProperty.call(cal.overrides || {}, key)) {
    return Math.max(0, Number(cal.overrides[key]) || 0);
  }
  const weekday = parseDateKey(key).getDay();
  if ((cal.closedWeekdays || []).includes(weekday)) return 0;
  return Math.max(0, Number(cal.dailyLimit) || 0);
}

/**
 * Full availability picture for one day.
 *
 * `leadTimeDays` is counted from today, so a lead time of 3 makes today,
 * tomorrow and the day after unselectable, and the third day from now the
 * earliest a visitor can choose.
 */
export function availability(key) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = parseDateKey(key);
  const lead = Number(content.calendar.leadTimeDays) || 0;
  const earliest = addDays(today, lead);

  const past = day < today;
  const tooSoon = !past && day < earliest;
  const remaining = baseLimitFor(key);

  return {
    key,
    base: remaining,
    remaining,
    past,
    tooSoon,
    soldOut: !past && !tooSoon && remaining <= 0,
    selectable: !past && !tooSoon && remaining > 0,
  };
}

/** The earliest date a visitor may choose, given the lead time. */
export function earliestOrderDate() {
  return dateKey(addDays(new Date(), Number(content.calendar.leadTimeDays) || 0));
}

/** Availability for a whole month. `month` is 0-indexed. */
export function monthAvailability(year, month) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d += 1) {
    out.push(availability(dateKey(new Date(year, month, d))));
  }
  return { year, month, firstWeekday: first.getDay(), days: out };
}

/** First day a visitor can actually order — used to preselect the calendar. */
export function firstAvailableDate(searchDays = 120) {
  const today = new Date();
  for (let i = 0; i <= searchDays; i += 1) {
    const key = dateKey(addDays(today, i));
    if (availability(key).selectable) return key;
  }
  return null;
}

/** Set a day's stock, or pass null/'' to fall back to the daily limit. */
export function setDayLimit(key, value) {
  const overrides = { ...content.calendar.overrides };
  if (value === null || value === '') delete overrides[key];
  else overrides[key] = Math.max(0, Math.floor(Number(value) || 0));
  return setContentPath('calendar.overrides', overrides);
}

export function toggleClosed(key) {
  const closed = new Set(content.calendar.closed || []);
  if (closed.has(key)) closed.delete(key);
  else closed.add(key);
  return setContentPath('calendar.closed', [...closed]);
}

/* --- garden ------------------------------------------------------------- */

export function defaultGardenState() {
  return {
    plots: [],
    seeds: 3,
    water: content.garden.waterPerDay,
    waterDate: dateKey(),
    streak: 0,
    lastVisit: null,
    claimedToday: false,
    bloomed: 0,
  };
}

export function loadGarden() {
  const saved = readJSON(KEY_GARDEN);
  const state = { ...defaultGardenState(), ...(saved || {}) };
  if (!Array.isArray(state.plots)) state.plots = [];
  return state;
}

export function saveGarden(state) {
  return writeJSON(KEY_GARDEN, state);
}

export function resetGarden() {
  try {
    localStorage.removeItem(KEY_GARDEN);
  } catch { /* ignore */ }
  return defaultGardenState();
}

/* --- money -------------------------------------------------------------- */

export function money(amount, currency = content.currency) {
  return `${currency} ${Number(amount).toLocaleString('en-HK')}`;
}
