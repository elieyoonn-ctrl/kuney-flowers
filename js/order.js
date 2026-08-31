/* ==========================================================================
   Order state.

   The important distinction, kept honest in one place: the stems a visitor
   gathers in the virtual shop are a keepsake of the visit. The only things
   this shop can actually cater for are COLOUR and OCCASION, both optional,
   plus a SIZE and a DELIVERY DATE. Everything the invoice prints comes from
   `summary()`, so the game layer can never leak into the real order.
   ========================================================================== */

import { colorById } from './content.js';
import * as store from './store.js';

export class Order {
  constructor(content) {
    this.content = content;
    this.colors = new Set();
    this.occasions = new Set();
    this.sizeId = null;
    this.dateKey = null;
    this.picked = [];
    this.reference = null;
    this.confirmedAt = null;
    this._listeners = new Set();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(reason) {
    for (const fn of this._listeners) fn(this, reason);
  }

  /* --- the two things we cater for -------------------------------------- */

  toggleColor(id) {
    if (this.colors.has(id)) this.colors.delete(id);
    else this.colors.add(id);
    this._emit('colors');
  }

  toggleOccasion(id) {
    if (this.occasions.has(id)) this.occasions.delete(id);
    else this.occasions.add(id);
    this._emit('occasions');
  }

  setSize(id) {
    this.sizeId = this.sizeId === id ? null : id;
    this._emit('size');
  }

  setDate(key) {
    this.dateKey = key;
    this._emit('date');
  }

  /* --- the game layer --------------------------------------------------- */

  /** Gather a stem. Picking implies an interest in that colour, so it is
   *  added to the palette selection — but the stem itself is never ordered. */
  addPicked({ displayId, title, recipeId, hex, colorId }) {
    this.picked.push({ displayId, title, recipeId, hex, colorId, at: Date.now() });
    if (colorId) this.colors.add(colorId);
    this._emit('picked');
    return this.picked.length;
  }

  removeLastPicked() {
    const removed = this.picked.pop();
    this._emit('picked');
    return removed;
  }

  clearPicked() {
    this.picked = [];
    this._emit('picked');
  }

  /** Counts per colour of what was gathered, in palette order. */
  pickedByColor() {
    const counts = new Map();
    for (const p of this.picked) {
      counts.set(p.colorId, (counts.get(p.colorId) || 0) + 1);
    }
    return this.content.palette
      .filter((c) => counts.has(c.id))
      .map((c) => ({ ...c, count: counts.get(c.id) }));
  }

  pickedByVariety() {
    const counts = new Map();
    for (const p of this.picked) {
      counts.set(p.title, (counts.get(p.title) || 0) + 1);
    }
    return [...counts.entries()].map(([title, count]) => ({ title, count }));
  }

  /* --- validity --------------------------------------------------------- */

  get size() {
    return this.content.sizes.find((s) => s.id === this.sizeId) || null;
  }

  get dateAvailable() {
    return this.dateKey ? store.availability(this.dateKey).selectable : false;
  }

  /** What still needs choosing before an invoice can be printed. */
  missing() {
    const gaps = [];
    if (!this.sizeId) gaps.push('a bouquet size');
    if (!this.dateKey) gaps.push('a delivery date');
    else if (!this.dateAvailable) gaps.push('an available delivery date');
    return gaps;
  }

  get isReady() {
    return this.missing().length === 0;
  }

  reset() {
    this.colors.clear();
    this.occasions.clear();
    this.sizeId = null;
    this.dateKey = null;
    this.picked = [];
    this.reference = null;
    this.confirmedAt = null;
    this._emit('reset');
  }

  /* --- confirmation ----------------------------------------------------- */

  confirm() {
    if (!this.isReady) return null;
    if (!this.reference) {
      const d = new Date();
      const stamp =
        String(d.getFullYear()).slice(2) +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
      const rand = String(Math.floor(1000 + Math.random() * 9000));
      this.reference = `KF-${stamp}-${rand}`;
      this.confirmedAt = d;
    }
    this._emit('confirm');
    return this.reference;
  }

  /* --- the printable order --------------------------------------------- */

  summary() {
    const content = this.content;
    const size = this.size;
    const colours = [...this.colors].map((id) => colorById(content, id));
    const occasions = [...this.occasions]
      .map((id) => content.occasions.find((o) => o.id === id))
      .filter(Boolean);

    return {
      reference: this.reference,
      issued: this.confirmedAt || new Date(),
      brand: content.brand,
      contact: content.contact,
      currency: content.currency,
      size,
      total: size ? size.price : 0,
      colours,
      occasions,
      dateKey: this.dateKey,
      dateLong: this.dateKey ? store.formatLongDate(this.dateKey) : null,
      gathered: this.picked.length,
      gatheredByColor: this.pickedByColor(),
      gatheredByVariety: this.pickedByVariety(),
      delivery: content.delivery,
      terms: content.terms,
      note: content.invoice.note,
      gameNote: content.invoice.gameNote,
    };
  }
}
