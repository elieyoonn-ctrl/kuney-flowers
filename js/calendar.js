/* ==========================================================================
   Availability calendar.

   One source of truth (store.monthAvailability) drives two renderings:

   1. A canvas that becomes the texture of the plaster board on the shop wall,
      so the numbers you see across the room are the live numbers.
   2. An HTML panel for the zoomed-in view — real buttons, real focus order,
      announced to screen readers, and editable in place when signed in as the
      owner.
   ========================================================================== */

import * as THREE from 'three';
import * as store from './store.js';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CANVAS_W = 1030;
const CANVAS_H = 740;

/* --- canvas face -------------------------------------------------------- */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Paint the wall board.
 * @returns {HTMLCanvasElement}
 */
export function renderBoard(content, year, month, { selectedKey = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fbf9f5';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cal = content.calendar;
  const ink = '#2c2a26';
  const faint = '#a9a29a';
  const sage = '#6e7c66';

  /* Header */
  ctx.fillStyle = faint;
  ctx.font = '500 20px Inter, Helvetica, Arial, sans-serif';
  ctx.letterSpacing = '5px';
  ctx.textAlign = 'left';
  ctx.fillText((cal.heading || 'Delivery Availability').toUpperCase(), 62, 74);

  ctx.letterSpacing = '0px';
  ctx.fillStyle = ink;
  ctx.font = '300 58px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(`${MONTHS[month]} ${year}`, 60, 138);

  ctx.fillStyle = faint;
  ctx.font = '400 21px Inter, Helvetica, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(cal.subheading || 'Remaining bouquets per day', CANVAS_W - 62, 132);

  ctx.strokeStyle = 'rgba(44,42,38,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 168);
  ctx.lineTo(CANVAS_W - 60, 168);
  ctx.stroke();

  /* Grid */
  const gridX = 60;
  const gridY = 196;
  const gridW = CANVAS_W - 120;
  const cellW = gridW / 7;
  const cellH = 84;

  ctx.font = '500 18px Inter, Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '3px';
  WEEKDAYS.forEach((d, i) => {
    ctx.fillStyle = faint;
    ctx.fillText(d, gridX + cellW * (i + 0.5), gridY);
  });
  ctx.letterSpacing = '0px';

  const { firstWeekday, days } = store.monthAvailability(year, month);

  days.forEach((day, i) => {
    const cellIndex = firstWeekday + i;
    const col = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);
    const x = gridX + col * cellW;
    const y = gridY + 26 + row * cellH;
    const dayNumber = i + 1;

    const isSelected = selectedKey === day.key;

    if (isSelected) {
      ctx.fillStyle = 'rgba(110,124,102,0.14)';
      roundRect(ctx, x + 4, y + 4, cellW - 8, cellH - 12, 10);
      ctx.fill();
      ctx.strokeStyle = sage;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x + 4, y + 4, cellW - 8, cellH - 12, 10);
      ctx.stroke();
    }

    const dim = day.past || day.tooSoon;
    ctx.fillStyle = dim ? '#c9c3ba' : ink;
    ctx.font = '300 34px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(dayNumber), x + 16, y + 40);

    ctx.font = '500 15px Inter, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    if (day.past) {
      ctx.fillStyle = '#d6d0c7';
      ctx.fillText('—', x + cellW - 16, y + 40);
    } else if (day.tooSoon) {
      ctx.fillStyle = '#c9c3ba';
      ctx.fillText('—', x + cellW - 16, y + 40);
    } else if (day.soldOut) {
      ctx.fillStyle = '#b9b2a8';
      ctx.letterSpacing = '1.5px';
      ctx.fillText('SOLD OUT', x + cellW - 16, y + 39);
      ctx.letterSpacing = '0px';
      // Struck through, the way a shop crosses off a full day.
      ctx.strokeStyle = 'rgba(44,42,38,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 14, y + 30);
      ctx.lineTo(x + cellW - 14, y + 46);
      ctx.stroke();
    } else {
      ctx.fillStyle = sage;
      ctx.font = '500 26px Inter, Helvetica, Arial, sans-serif';
      ctx.fillText(String(day.remaining), x + cellW - 16, y + 42);
      ctx.fillStyle = faint;
      ctx.font = '400 12px Inter, Helvetica, Arial, sans-serif';
      ctx.letterSpacing = '1.5px';
      ctx.fillText('LEFT', x + cellW - 16, y + 60);
      ctx.letterSpacing = '0px';
    }

    ctx.strokeStyle = 'rgba(44,42,38,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + cellH - 8);
    ctx.lineTo(x + cellW - 8, y + cellH - 8);
    ctx.stroke();
  });

  /* Footer key */
  ctx.textAlign = 'left';
  ctx.font = '400 16px Inter, Helvetica, Arial, sans-serif';
  ctx.fillStyle = faint;
  ctx.fillText(
    `Daily limit ${cal.dailyLimit} · orders from ${cal.leadTimeDays} day${cal.leadTimeDays === 1 ? '' : 's'} ahead`,
    62,
    CANVAS_H - 34
  );
  ctx.textAlign = 'right';
  ctx.fillText(content.brand.logoText || 'KUNEY', CANVAS_W - 62, CANVAS_H - 34);

  return canvas;
}

/** Keeps the 3D board's texture in sync. */
export class BoardTexture {
  constructor(material) {
    this.material = material;
    this.texture = null;
  }

  refresh(content, year, month, opts) {
    const canvas = renderBoard(content, year, month, opts);
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    next.anisotropy = 8;
    this.texture?.dispose();
    this.texture = next;
    this.material.map = next;
    this.material.needsUpdate = true;
  }

  dispose() {
    this.texture?.dispose();
  }
}

/* --- HTML panel --------------------------------------------------------- */

/**
 * The zoomed calendar. Owns its own month cursor and selection, and reports
 * changes through `onSelect`.
 */
export class CalendarPanel {
  constructor(mount, { onSelect, onClose, getContent } = {}) {
    this.mount = mount;
    this.onSelect = onSelect || (() => {});
    this.onClose = onClose || (() => {});
    this.getContent = getContent || store.getContent;

    const today = new Date();
    this.year = today.getFullYear();
    this.month = today.getMonth();
    this.selected = null;

    this.el = document.createElement('div');
    this.el.className = 'cal';
    this.el.innerHTML = `
      <div class="cal__head">
        <div>
          <p class="eyebrow" data-role="eyebrow"></p>
          <h3 class="cal__title" data-role="title"></h3>
        </div>
        <div class="cal__nav">
          <button class="icon-btn" data-action="month-prev" aria-label="Previous month">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
          </button>
          <button class="icon-btn" data-action="month-next" aria-label="Next month">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
      <div class="cal__weekdays" aria-hidden="true"></div>
      <div class="cal__grid" role="grid" data-role="grid"></div>
      <p class="cal__note" data-role="note"></p>
      <div class="cal__admin" data-role="admin" hidden>
        <p class="eyebrow">Owner — edit availability</p>
        <div class="cal__adminrow">
          <label class="field">
            <span>Remaining on <b data-role="admin-date">—</b></span>
            <input type="number" min="0" max="99" step="1" data-role="admin-count" />
          </label>
          <button class="btn btn--ghost" data-action="admin-save">Save</button>
          <button class="btn btn--ghost" data-action="admin-clear">Use default</button>
          <button class="btn btn--ghost" data-action="admin-closed">Toggle closed</button>
        </div>
        <p class="cal__adminnote">Changes are saved to this browser. Export from <a href="admin.html">the admin panel</a> to publish them to everyone.</p>
      </div>
    `;
    mount.appendChild(this.el);

    this.el.querySelector('.cal__weekdays').innerHTML = WEEKDAYS_LONG
      .map((d) => `<span>${d.slice(0, 3)}</span>`)
      .join('');

    this.el.addEventListener('click', (e) => this._onClick(e));
    this.el.addEventListener('keydown', (e) => this._onKeydown(e));
  }

  _onClick(e) {
    const btn = e.target.closest('[data-action], [data-key]');
    if (!btn) return;
    const action = btn.dataset.action;

    // Namespaced deliberately: app.js listens on the document for a bare
    // 'prev'/'next' to step the camera between stops.
    if (action === 'month-prev') this.shiftMonth(-1);
    else if (action === 'month-next') this.shiftMonth(1);
    else if (action === 'admin-save') {
      const input = this.el.querySelector('[data-role="admin-count"]');
      if (this.selected) store.setDayLimit(this.selected, input.value);
      this.render();
    } else if (action === 'admin-clear') {
      if (this.selected) store.setDayLimit(this.selected, null);
      this.render();
    } else if (action === 'admin-closed') {
      if (this.selected) store.toggleClosed(this.selected);
      this.render();
    } else if (btn.dataset.key) {
      this.select(btn.dataset.key);
    }
  }

  _onKeydown(e) {
    const cell = e.target.closest('[data-key]');
    if (!cell) return;
    const map = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    const delta = map[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const cells = [...this.el.querySelectorAll('[data-key]')];
    const index = cells.indexOf(cell);
    const next = cells[index + delta];
    if (next) next.focus();
  }

  shiftMonth(delta) {
    const d = new Date(this.year, this.month + delta, 1);
    this.year = d.getFullYear();
    this.month = d.getMonth();
    this.render();
  }

  /** Move the visible month to contain `key` and select it. */
  showKey(key, { select = true } = {}) {
    if (!key) return;
    const d = store.parseDateKey(key);
    this.year = d.getFullYear();
    this.month = d.getMonth();
    if (select) this.selected = key;
    this.render();
  }

  select(key) {
    const day = store.availability(key);
    if (!day.selectable && !store.isAdmin()) return;
    this.selected = key;
    this.render();
    this.onSelect(key, day);
  }

  clear() {
    this.selected = null;
    this.render();
  }

  render() {
    const content = this.getContent();
    const cal = content.calendar;
    const { firstWeekday, days } = store.monthAvailability(this.year, this.month);

    this.el.querySelector('[data-role="eyebrow"]').textContent = cal.heading || 'Delivery Availability';
    this.el.querySelector('[data-role="title"]').textContent = `${MONTHS[this.month]} ${this.year}`;

    const grid = this.el.querySelector('[data-role="grid"]');
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push('<span class="cal__cell cal__cell--empty" aria-hidden="true"></span>');
    }

    days.forEach((day, i) => {
      const n = i + 1;
      const admin = store.isAdmin();
      const classes = ['cal__cell'];
      let status = '';
      let disabled = '';

      if (day.past) {
        classes.push('is-past');
        status = '';
        disabled = 'disabled';
      } else if (day.tooSoon) {
        classes.push('is-past');
        status = '<i>too soon</i>';
        disabled = admin ? '' : 'disabled';
      } else if (day.soldOut) {
        classes.push('is-sold');
        status = '<i>Sold out</i>';
        disabled = admin ? '' : 'disabled';
      } else {
        status = `<b>${day.remaining}</b><i>left</i>`;
      }
      if (this.selected === day.key) classes.push('is-selected');

      const label = day.soldOut
        ? `${store.formatLongDate(day.key)} — sold out`
        : day.selectable
          ? `${store.formatLongDate(day.key)} — ${day.remaining} bouquets remaining`
          : `${store.formatLongDate(day.key)} — unavailable`;

      cells.push(`
        <button class="${classes.join(' ')}" data-key="${day.key}" ${disabled}
                role="gridcell" aria-label="${label}"
                aria-selected="${this.selected === day.key}">
          <span class="cal__num">${n}</span>
          <span class="cal__status">${status}</span>
        </button>
      `);
    });

    grid.innerHTML = cells.join('');

    const note = this.el.querySelector('[data-role="note"]');
    if (this.selected) {
      const day = store.availability(this.selected);
      note.textContent = day.selectable
        ? `Delivery ${store.formatLongDate(this.selected)} — ${day.remaining} bouquet${day.remaining === 1 ? '' : 's'} still available.`
        : `${store.formatLongDate(this.selected)} is not available.`;
    } else {
      note.textContent = `Choose a delivery date. Orders open ${cal.leadTimeDays} day${cal.leadTimeDays === 1 ? '' : 's'} ahead; days marked sold out are closed.`;
    }

    const adminBox = this.el.querySelector('[data-role="admin"]');
    adminBox.hidden = !store.isAdmin();
    if (store.isAdmin()) {
      const dateEl = this.el.querySelector('[data-role="admin-date"]');
      const input = this.el.querySelector('[data-role="admin-count"]');
      if (this.selected) {
        dateEl.textContent = store.formatLongDate(this.selected);
        input.value = store.baseLimitFor(this.selected);
        input.disabled = false;
      } else {
        dateEl.textContent = 'a date — select one first';
        input.value = '';
        input.disabled = true;
      }
    }
  }

  focusFirst() {
    const target =
      this.el.querySelector('[data-key].is-selected') ||
      this.el.querySelector('[data-key]:not([disabled])') ||
      this.el.querySelector('[data-action="month-next"]');
    target?.focus();
  }
}

export { MONTHS };
