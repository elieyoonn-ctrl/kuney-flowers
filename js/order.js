/* ==========================================================================
   Order state.

   The important distinction, kept honest in one place: the stems a visitor
   gathers in the virtual shop are a keepsake of the visit and set nothing.
   The only things this shop caters for are ONE COLOUR and ONE OCCASION, both
   optional, plus a SIZE and a DELIVERY DATE.

   `summary()` is the only thing the invoice may read, and it deliberately
   carries no trace of the gathered stems — not the varieties, not the colours,
   not even the count. The game layer cannot leak into the real order because
   there is nothing there to leak.
   ========================================================================== */

import { colorById, stockColorById } from './content.js';
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

  /* --- the two things we cater for --------------------------------------
     One colour and one occasion, each optional. Held in Sets so the invoice
     and summary keep a stable shape, but never more than one member: pressing
     a different chip replaces the choice, pressing the same one clears it.
     ---------------------------------------------------------------------- */

  selectColor(id) {
    const already = this.colors.has(id);
    this.colors.clear();
    if (!already) this.colors.add(id);
    this._emit('colors');
  }

  selectOccasion(id) {
    const already = this.occasions.has(id);
    this.occasions.clear();
    if (!already) this.occasions.add(id);
    this._emit('occasions');
  }

  get colorId() {
    return [...this.colors][0] ?? null;
  }

  get occasionId() {
    return [...this.occasions][0] ?? null;
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

  /**
   * Gather a stem — a keepsake of the visit, nothing more.
   *
   * This deliberately does not touch the chosen colour. It used to add the
   * stem's colour to the palette, which was harmless when several colours
   * could be chosen at once; with a single choice it would silently overwrite
   * a deliberate one, and it would contradict the promise that gathering sets
   * nothing about the real bouquet.
   */
  addPicked({ displayId, title, recipeId, hex, colorId }) {
    this.picked.push({ displayId, title, recipeId, hex, colorId, at: Date.now() });
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

  /**
   * The distinct colours gathered, in the order they were gathered — used only
   * for the little swatches on the in-shop keepsake counter. Never reaches the
   * invoice.
   *
   * A gathered stem's colour is a *stock* colour, which is a longer list than
   * the customer palette; resolving against both is what keeps the swatches
   * from silently emptying when someone gathers an orange tulip.
   */
  pickedColors() {
    const out = [];
    const seen = new Set();
    for (const p of this.picked) {
      if (seen.has(p.colorId)) continue;
      seen.add(p.colorId);
      const colour = stockColorById(this.content, p.colorId)
        || (p.hex ? { id: p.colorId, label: p.colorId, hex: p.hex } : null);
      if (colour) out.push(colour);
    }
    return out;
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
      // No gathered-stem data of any kind: see the note at the top of this file.
      delivery: content.delivery,
      terms: content.terms,
      note: content.invoice.note,
      gameNote: content.invoice.gameNote,
    };
  }
}
