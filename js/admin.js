/* ==========================================================================
   Owner panel.

   A schema-driven editor over the same content object the shop reads. Fields
   declare a dotted path; editing one writes straight through store.saveContent,
   which persists to this browser and notifies any open shop tab.

   The calendar editor is hand-built rather than schema-driven, because setting
   a day's stock is the thing this panel exists for.
   ========================================================================== */

import * as store from './store.js';

/* Declared locally rather than imported from calendar.js / flowers.js: those
   modules pull in three.js, and the owner panel has no 3D in it. Keep the
   bloom list in step with RECIPES in js/flowers.js if you add a flower. */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const BLOOMS = [
  { value: 'rose', label: 'Rose & Garden Rose' },
  { value: 'peony', label: 'Peony' },
  { value: 'ranunculus', label: 'Ranunculus' },
  { value: 'dahlia', label: 'Dahlia' },
  { value: 'hydrangea', label: 'Hydrangea' },
  { value: 'gerbera', label: 'Gerbera' },
  { value: 'tulip', label: 'Tulip' },
  { value: 'iris', label: 'Iris' },
  { value: 'calla', label: 'Calla Lily' },
  { value: 'orchid', label: 'Orchid' },
  { value: 'lisianthus', label: 'Lisianthus' },
  { value: 'sweetpea', label: 'Sweet Pea' },
  { value: 'delphinium', label: 'Delphinium' },
  { value: 'craspedia', label: 'Craspedia' },
  { value: 'tropical', label: 'Anthurium / tropical' },
  { value: 'branches', label: 'Branch installation' },
];

const $ = (sel, root = document) => root.querySelector(sel);
const role = (name, root = document) => root.querySelector(`[data-role="${name}"]`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* --- path access -------------------------------------------------------- */

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

/**
 * Always read a content list as an array.
 *
 * The panel edits owner-supplied content, so it must render something rather
 * than throw if a value arrives in the wrong shape — a white-screened admin
 * leaves no way to put it right.
 */
function list(value) {
  return Array.isArray(value) ? value : [];
}

/* --- field renderers ---------------------------------------------------- */

function textField(content, { path, label, help, type = 'text', wide = false, min, max, step }) {
  const value = getPath(content, path) ?? '';
  const attrs = [
    `type="${type}"`,
    min !== undefined ? `min="${min}"` : '',
    max !== undefined ? `max="${max}"` : '',
    step !== undefined ? `step="${step}"` : '',
  ].filter(Boolean).join(' ');
  return `
    <label class="field${wide ? ' field--wide' : ''}">
      <span>${esc(label)}${help ? ` — <em style="font-style:normal;opacity:.75">${esc(help)}</em>` : ''}</span>
      <input ${attrs} data-path="${esc(path)}" value="${esc(value)}" />
    </label>`;
}

function areaField(content, { path, label, help, rows = 4 }) {
  const value = getPath(content, path) ?? '';
  return `
    <label class="field field--wide">
      <span>${esc(label)}${help ? ` — <em style="font-style:normal;opacity:.75">${esc(help)}</em>` : ''}</span>
      <textarea rows="${rows}" data-path="${esc(path)}">${esc(value)}</textarea>
    </label>`;
}

function colorField(content, { path, label }) {
  const value = getPath(content, path) ?? '#ffffff';
  return `
    <label class="field field--color">
      <span>${esc(label)}</span>
      <span class="row">
        <input type="color" data-path="${esc(path)}" data-mirror="${esc(path)}" value="${esc(value)}" />
        <input type="text" data-path="${esc(path)}" data-mirror="${esc(path)}" value="${esc(value)}" />
      </span>
    </label>`;
}

function selectField(content, { path, label, options }) {
  const value = getPath(content, path);
  return `
    <label class="field">
      <span>${esc(label)}</span>
      <select data-path="${esc(path)}">
        ${options.map((o) => `
          <option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>
        `).join('')}
      </select>
    </label>`;
}

/** Editable list of plain strings (terms, varieties). */
function linesField(content, { path, label, help, addLabel = 'Add line' }) {
  const items = list(getPath(content, path));
  return `
    <div class="field field--wide">
      <span>${esc(label)}${help ? ` — <em style="font-style:normal;opacity:.75">${esc(help)}</em>` : ''}</span>
      <div class="list-lines" data-lines="${esc(path)}">
        ${items.map((line, i) => `
          <div class="list-lines__row">
            <input type="text" data-line="${esc(path)}" data-index="${i}" value="${esc(line)}" />
            <button class="icon-mini" data-admin="line-remove" data-target="${esc(path)}" data-index="${i}"
                    aria-label="Remove line ${i + 1}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                   stroke-width="1.4"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>`).join('')}
      </div>
      <button class="btn btn--ghost" style="min-height:38px;font-size:.62rem;justify-self:start;margin-top:.5rem"
              data-admin="line-add" data-target="${esc(path)}">${esc(addLabel)}</button>
    </div>`;
}

/* Files found in images/. Populated by the dev server if it offers a listing;
   otherwise the path is simply typed by hand. */
let imageFiles = [];

async function loadImageList() {
  try {
    const res = await fetch('/__images');
    if (res.ok) imageFiles = await res.json();
  } catch { /* not running on the dev server */ }
  return imageFiles;
}

/** Path field with a picker of the files actually present in images/. */
function photoField(content, path, label, help) {
  const value = getPath(content, path) ?? '';
  const options = imageFiles.length
    ? `<select data-photo-pick="${esc(path)}" style="margin-top:.35rem">
         <option value="">— choose a file from images/ —</option>
         ${imageFiles.map((f) => `
           <option value="${esc(f)}" ${f === value ? 'selected' : ''}>${esc(f.replace('images/', ''))}</option>
         `).join('')}
       </select>`
    : '';
  return `
    <label class="field field--wide">
      <span>${esc(label)}${help ? ` — <em style="font-style:normal;opacity:.75">${esc(help)}</em>` : ''}</span>
      <input type="text" data-path="${esc(path)}" value="${esc(value)}"
             placeholder="images/your-photo.jpg" />
      ${options}
    </label>`;
}

/** Shows the picture, or says plainly that the path does not resolve. */
function photoPreview(value) {
  if (!value) {
    return `<p class="cal__adminnote">No photograph yet — the frame shows a plaster
            card with the title on it until you add one.</p>`;
  }
  return `
    <div style="display:flex;gap:.8rem;align-items:flex-start">
      <img src="${esc(value)}" alt="" style="max-width:150px;border-radius:3px;border:1px solid rgba(44,42,38,.15)"
           onload="this.nextElementSibling.textContent='Found — this is what hangs on the wall.'"
           onerror="this.style.display='none';this.nextElementSibling.textContent='Not found at that path. Check the file is in images/ and the spelling matches exactly.';this.nextElementSibling.style.color='#b83a3f'" />
      <p class="cal__adminnote" style="margin:0">Checking…</p>
    </div>`;
}

/* --- sections ----------------------------------------------------------- */

function section(id, title, blurb, body) {
  return `
    <section class="adm" id="${id}">
      <header>
        <h2>${esc(title)}</h2>
        ${blurb ? `<p>${blurb}</p>` : ''}
      </header>
      ${body}
    </section>`;
}

function brandSection(c) {
  return section('sec-brand', 'Brand & introduction',
    'The words on the landing page and the name shown inside the shop.',
    `<div class="grid2">
      ${textField(c, { path: 'brand.name', label: 'Full shop name' })}
      ${textField(c, { path: 'brand.logoText', label: 'Logo — first line', help: 'shown large' })}
      ${textField(c, { path: 'brand.logoMark', label: 'Logo — second line' })}
      ${textField(c, { path: 'brand.tagline', label: 'Tagline' })}
      ${textField(c, { path: 'brand.seasonLabel', label: 'Season label' })}
      ${textField(c, { path: 'brand.seasonName', label: 'Current season' })}
      ${textField(c, { path: 'brand.enterLabel', label: 'Enter button' })}
      ${areaField(c, { path: 'brand.intro', label: 'Introduction', rows: 4 })}
    </div>`);
}

function contactSection(c) {
  return section('sec-contact', 'Contact & links',
    'The purchase link and the WhatsApp number printed on every invoice.',
    `<div class="grid2">
      ${textField(c, { path: 'contact.whatsapp', label: 'WhatsApp (display)' })}
      ${textField(c, { path: 'contact.whatsappDigits', label: 'WhatsApp (digits only)', help: 'used to build wa.me links' })}
      ${textField(c, { path: 'contact.email', label: 'Email', type: 'email' })}
      ${textField(c, { path: 'contact.siteUrl', label: 'Shop website', type: 'url' })}
      ${textField(c, { path: 'contact.productUrl', label: 'Purchase link', type: 'url', wide: true })}
      ${textField(c, { path: 'contact.instagram', label: 'Instagram', type: 'url' })}
      ${textField(c, { path: 'contact.threads', label: 'Threads', type: 'url' })}
    </div>`);
}

function themeSection(c) {
  return section('sec-theme', 'Interior colours',
    'These re-tint the 3D room. Reload the shop tab after changing them.',
    `<div class="grid3">
      ${colorField(c, { path: 'theme.floor', label: 'Travertine floor' })}
      ${colorField(c, { path: 'theme.wall', label: 'Wall tone' })}
      ${colorField(c, { path: 'theme.plaster', label: 'Plaster' })}
      ${colorField(c, { path: 'theme.concrete', label: 'Concrete column' })}
      ${colorField(c, { path: 'theme.island', label: 'Long table stone' })}
      ${colorField(c, { path: 'theme.islandVein', label: 'Table strata' })}
      ${colorField(c, { path: 'theme.tableGlow', label: 'Under-table light' })}
      ${colorField(c, { path: 'theme.curtain', label: 'Window linen' })}
      ${colorField(c, { path: 'theme.terracotta', label: 'Terracotta pot' })}
      ${colorField(c, { path: 'theme.wrapPaper', label: 'Wrapping paper' })}
      ${colorField(c, { path: 'theme.ribbon', label: 'Ribbon' })}
      ${colorField(c, { path: 'theme.daylight', label: 'Daylight' })}
      ${textField(c, { path: 'theme.daylightIntensity', label: 'Daylight strength', type: 'number', min: 0, max: 8, step: 0.1 })}
    </div>`);
}

function paletteSection(c) {
  return section('sec-palette', 'Colour palette',
    'The colours a customer can request. These drive the chips, the flower colours in the 3D shop and the invoice.',
    `<div class="repeat" data-repeat="palette">
      ${list(c.palette).map((p, i) => `
        <div class="repeat__item">
          <div class="repeat__head">
            <span style="width:20px;height:20px;border-radius:50%;background:${esc(p.hex)};
                         box-shadow:inset 0 0 0 1px rgba(44,42,38,.2)"></span>
            <b>${esc(p.label)}</b>
            <button class="btn btn--ghost" data-admin="remove" data-list="palette" data-index="${i}">Remove</button>
          </div>
          <div class="grid3">
            ${textField(c, { path: `palette.${i}.id`, label: 'ID', help: 'no spaces' })}
            ${textField(c, { path: `palette.${i}.label`, label: 'Label' })}
            ${colorField(c, { path: `palette.${i}.hex`, label: 'Colour' })}
          </div>
        </div>`).join('')}
    </div>
    <button class="btn btn--ghost" style="justify-self:start" data-admin="add" data-list="palette">Add a colour</button>`);
}

function occasionsSection(c) {
  return section('sec-occasions', 'Occasions',
    'The occasions a customer can pick. Optional for them, always printed on the invoice.',
    `<div class="repeat" data-repeat="occasions">
      ${list(c.occasions).map((o, i) => `
        <div class="repeat__item">
          <div class="repeat__head">
            <b>${esc(o.label)}</b>
            <button class="btn btn--ghost" data-admin="remove" data-list="occasions" data-index="${i}">Remove</button>
          </div>
          <div class="grid2">
            ${textField(c, { path: `occasions.${i}.id`, label: 'ID' })}
            ${textField(c, { path: `occasions.${i}.label`, label: 'Label' })}
          </div>
        </div>`).join('')}
    </div>
    <button class="btn btn--ghost" style="justify-self:start" data-admin="add" data-list="occasions">Add an occasion</button>`);
}

function sizesSection(c) {
  return section('sec-sizes', 'Sizes & prices',
    'Prices are shown and totalled in the currency below.',
    `${textField(c, { path: 'currency', label: 'Currency code' })}
    <div class="repeat" data-repeat="sizes">
      ${list(c.sizes).map((s, i) => `
        <div class="repeat__item">
          <div class="repeat__head">
            <b>${esc(s.label)}</b>
            <button class="btn btn--ghost" data-admin="remove" data-list="sizes" data-index="${i}">Remove</button>
          </div>
          <div class="grid3">
            ${textField(c, { path: `sizes.${i}.id`, label: 'ID' })}
            ${textField(c, { path: `sizes.${i}.label`, label: 'Label' })}
            ${textField(c, { path: `sizes.${i}.price`, label: 'Price', type: 'number', min: 0, step: 1 })}
          </div>
          ${textField(c, { path: `sizes.${i}.note`, label: 'Short description', wide: true })}
        </div>`).join('')}
    </div>
    <button class="btn btn--ghost" style="justify-self:start" data-admin="add" data-list="sizes">Add a size</button>`);
}

function deliverySection(c) {
  return section('sec-delivery', 'Delivery zones',
    'Printed on the invoice exactly as written. Use the label for ranges like “HKD 500 – 800”.',
    `<div class="repeat" data-repeat="delivery">
      ${list(c.delivery).map((d, i) => `
        <div class="repeat__item">
          <div class="repeat__head">
            <b>${esc(d.zone)}</b>
            <button class="btn btn--ghost" data-admin="remove" data-list="delivery" data-index="${i}">Remove</button>
          </div>
          <div class="grid2">
            ${textField(c, { path: `delivery.${i}.zone`, label: 'Zone' })}
            ${textField(c, { path: `delivery.${i}.label`, label: 'Charge shown' })}
          </div>
        </div>`).join('')}
    </div>
    <button class="btn btn--ghost" style="justify-self:start" data-admin="add" data-list="delivery">Add a zone</button>`);
}

function termsSection(c) {
  return section('sec-terms', 'Terms & invoice text',
    'The numbered terms and the two notes printed under the total.',
    `${linesField(c, { path: 'terms', label: 'Terms & conditions', addLabel: 'Add a term' })}
    <div class="grid2">
      ${textField(c, { path: 'invoice.heading', label: 'Invoice heading' })}
      ${textField(c, { path: 'invoice.subheading', label: 'Invoice subheading' })}
      ${textField(c, { path: 'invoice.payLabel', label: 'Purchase button' })}
      ${textField(c, { path: 'invoice.whatsappLabel', label: 'WhatsApp button' })}
      ${textField(c, { path: 'invoice.saveLabel', label: 'Save-image button' })}
      ${areaField(c, { path: 'invoice.note', label: 'Florist’s note', rows: 4 })}
      ${areaField(c, { path: 'invoice.gameNote', label: 'Note about gathered stems', rows: 3 })}
      ${areaField(c, { path: 'invoice.bankNote', label: 'Bank transfer note', rows: 2 })}
    </div>`);
}

function displaysSection(c) {
  const kinds = [
    { value: 'vase-table', label: 'On the long table' },
    { value: 'shelf', label: 'Wall shelf' },
    { value: 'steps', label: 'On the steps' },
    { value: 'floor', label: 'Floor arrangement' },
  ];
  const blooms = BLOOMS;
  const colours = c.palette.map((p) => ({ value: p.id, label: p.label }));

  return section('sec-displays', 'Flower displays',
    `The flowers in the room. <strong>Bloom</strong> chooses the 3D flower shape and
     <strong>colour</strong> is the palette colour the display is filed under.
     Which colours actually stand in the vase, and how many stems of each, is the
     <code>colors</code> list on the display in <code>js/content.js</code> — a vase
     holds several colours of one variety. Leave <strong>photo</strong> blank to use
     an automatic still of the 3D arrangement, or point it at a file in
     <code>images/</code>.`,
    `<div class="repeat" data-repeat="displays">
      ${list(c.displays).map((d, i) => `
        <div class="repeat__item">
          <div class="repeat__head">
            <b>${esc(d.title)}</b>
            <button class="btn btn--ghost" data-admin="remove" data-list="displays" data-index="${i}">Remove</button>
          </div>
          <div class="grid2">
            ${textField(c, { path: `displays.${i}.id`, label: 'ID', help: 'used in share links' })}
            ${textField(c, { path: `displays.${i}.title`, label: 'Name' })}
            ${selectField(c, { path: `displays.${i}.kind`, label: 'Where it sits', options: kinds })}
            ${textField(c, { path: `displays.${i}.slot`, label: 'Position number', type: 'number', min: 0, max: 10, step: 1 })}
            ${selectField(c, { path: `displays.${i}.bloom`, label: 'Bloom shape', options: blooms })}
            ${selectField(c, { path: `displays.${i}.colorId`, label: 'Colour', options: colours })}
            ${photoField(c, `displays.${i}.photo`, 'Photograph', 'optional — overrides the automatic still')}
          </div>
          ${areaField(c, { path: `displays.${i}.note`, label: 'Description', rows: 3 })}
          ${linesField(c, { path: `displays.${i}.varieties`, label: 'Varieties listed', addLabel: 'Add a variety' })}
          <label class="field">
            <span>Can visitors gather stems from it?</span>
            <select data-path="displays.${i}.pickable" data-boolean="1">
              <option value="true" ${d.pickable !== false ? 'selected' : ''}>Yes</option>
              <option value="false" ${d.pickable === false ? 'selected' : ''}>No — display only</option>
            </select>
          </label>
        </div>`).join('')}
    </div>
    <button class="btn btn--ghost" style="justify-self:start" data-admin="add" data-list="displays">Add a display</button>`);
}

function framesSection(c) {
  return section('sec-frames', 'Wall photographs',
    'Three frames hang on the back wall. Drop files into <code>images/</code> and give the path, e.g. <code>images/wrapped-01.jpg</code>. Without a photo, a plaster placeholder is shown.',
    `<div class="repeat" data-repeat="frames">
      ${list(c.frames).map((f, i) => `
        <div class="repeat__item">
          <div class="repeat__head">
            <b>${esc(f.title)}</b>
            <button class="btn btn--ghost" data-admin="remove" data-list="frames" data-index="${i}">Remove</button>
          </div>
          <div class="grid2">
            ${textField(c, { path: `frames.${i}.id`, label: 'ID' })}
            ${textField(c, { path: `frames.${i}.title`, label: 'Title' })}
            ${textField(c, { path: `frames.${i}.caption`, label: 'Caption' })}
            ${photoField(c, `frames.${i}.photo`, 'Photograph')}
          </div>
          ${photoPreview(f.photo)}
        </div>`).join('')}
    </div>
    <button class="btn btn--ghost" style="justify-self:start" data-admin="add" data-list="frames">Add a frame</button>`);
}

function gardenSection(c) {
  return section('sec-garden', 'The garden',
    'The growing game outside. Stage hours are cumulative hours from sowing to each stage.',
    `<div class="grid2">
      ${textField(c, { path: 'garden.title', label: 'Garden name' })}
      ${textField(c, { path: 'garden.ctaLabel', label: 'Link button label' })}
      ${textField(c, { path: 'garden.plotCount', label: 'Number of beds', type: 'number', min: 1, max: 6, step: 1 })}
      ${textField(c, { path: 'garden.waterPerDay', label: 'Waterings per day', type: 'number', min: 1, max: 12, step: 1 })}
      ${areaField(c, { path: 'garden.intro', label: 'Garden introduction', rows: 3 })}
      ${textField(c, { path: 'garden.bloomReward', label: 'Reward for a bloom' })}
    </div>
    <div class="repeat" data-repeat="garden.rewards">
      ${list(c.garden.rewards).map((r, i) => `
        <div class="repeat__item">
          <div class="repeat__head">
            <b>Day ${r.day}</b>
            <button class="btn btn--ghost" data-admin="remove" data-list="garden.rewards" data-index="${i}">Remove</button>
          </div>
          <div class="grid3">
            ${textField(c, { path: `garden.rewards.${i}.day`, label: 'Day', type: 'number', min: 1, step: 1 })}
            ${textField(c, { path: `garden.rewards.${i}.label`, label: 'Reward' })}
            ${textField(c, { path: `garden.rewards.${i}.seeds`, label: 'Seeds given', type: 'number', min: 0, step: 1 })}
          </div>
        </div>`).join('')}
    </div>
    <button class="btn btn--ghost" style="justify-self:start" data-admin="add" data-list="garden.rewards">Add a reward day</button>`);
}

function ioSection() {
  return section('sec-io', 'Publish & backup',
    'Everything above is saved in <em>this browser only</em>. To make it live for every visitor, copy the JSON below into <code>data/content.json</code> and upload it with the site.',
    `<div class="io">
      <div class="hint-box">
        <strong>To publish:</strong> press <em>Copy JSON</em>, open <code>data/content.json</code>,
        replace its whole contents, save, and re-upload. Visitors then see your numbers
        without needing anything in their own browser.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem">
        <button class="btn" data-admin="copy">Copy JSON</button>
        <button class="btn btn--ghost" data-admin="download">Download content.json</button>
        <button class="btn btn--ghost" data-admin="apply-json">Apply pasted JSON</button>
      </div>
      <label class="field">
        <span>Content JSON</span>
        <textarea data-role="json" spellcheck="false"></textarea>
      </label>
    </div>`);
}

/* --- calendar editor ---------------------------------------------------- */

class CalendarEditor {
  constructor(mount) {
    this.mount = mount;
    const today = new Date();
    this.year = today.getFullYear();
    this.month = today.getMonth();
    mount.addEventListener('click', (e) => this.onClick(e));
    mount.addEventListener('change', (e) => this.onChange(e));
    this.render();
  }

  onClick(e) {
    const btn = e.target.closest('[data-cal]');
    if (!btn) return;
    const action = btn.dataset.cal;
    const key = btn.dataset.key;

    if (action === 'prev' || action === 'next') {
      const d = new Date(this.year, this.month + (action === 'next' ? 1 : -1), 1);
      this.year = d.getFullYear();
      this.month = d.getMonth();
      this.render();
    } else if (action === 'closed') {
      store.toggleClosed(key);
      this.render();
    } else if (action === 'default') {
      store.setDayLimit(key, null);
      this.render();
    } else if (action === 'fill-month') {
      const value = Number($('[data-role="fill-value"]', this.mount).value);
      if (!Number.isFinite(value)) return;
      const overrides = { ...store.getContent().calendar.overrides };
      const days = new Date(this.year, this.month + 1, 0).getDate();
      for (let d = 1; d <= days; d += 1) {
        overrides[store.dateKey(new Date(this.year, this.month, d))] = Math.max(0, value);
      }
      store.saveContent({ calendar: { overrides } });
      this.render();
      toast(`Set every day in ${MONTHS[this.month]} to ${value}.`);
    } else if (action === 'clear-month') {
      const overrides = { ...store.getContent().calendar.overrides };
      const days = new Date(this.year, this.month + 1, 0).getDate();
      for (let d = 1; d <= days; d += 1) {
        delete overrides[store.dateKey(new Date(this.year, this.month, d))];
      }
      store.saveContent({ calendar: { overrides } });
      this.render();
      toast(`${MONTHS[this.month]} reset to the daily limit.`);
    }
  }

  onChange(e) {
    const input = e.target.closest('[data-day]');
    if (!input) return;
    store.setDayLimit(input.dataset.day, input.value);
    this.render();
  }

  render() {
    const c = store.getContent();
    const cal = c.calendar;
    const { firstWeekday, days } = store.monthAvailability(this.year, this.month);
    const overrides = cal.overrides || {};
    const closed = new Set(cal.closed || []);

    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push('<div class="cal-day cal-day--pad"></div>');
    }
    days.forEach((day, i) => {
      const n = i + 1;
      const weekday = store.parseDateKey(day.key).getDay();
      const classes = ['cal-day'];
      if (day.past) classes.push('cal-day--past');
      if (Object.prototype.hasOwnProperty.call(overrides, day.key)) classes.push('cal-day--override');
      if (closed.has(day.key)) classes.push('cal-day--closed');

      cells.push(`
        <div class="${classes.join(' ')}">
          <div class="cal-day__top">
            <span class="cal-day__num">${n}</span>
            <span class="cal-day__wd">${WEEKDAYS[weekday]}</span>
          </div>
          <input type="number" min="0" max="99" step="1" data-day="${day.key}"
                 value="${store.baseLimitFor(day.key)}"
                 aria-label="Bouquets available on ${store.formatLongDate(day.key)}" />
          <div class="cal-day__row">
            <button class="cal-day__mini ${closed.has(day.key) ? 'is-on' : ''}"
                    data-cal="closed" data-key="${day.key}">Closed</button>
            <button class="cal-day__mini" data-cal="default" data-key="${day.key}">Default</button>
          </div>
        </div>`);
    });

    this.mount.innerHTML = `
      <div class="calendar-editor">
        <div class="grid3">
          <label class="field">
            <span>Default bouquets per day</span>
            <input type="number" min="0" max="99" step="1" data-path="calendar.dailyLimit"
                   value="${cal.dailyLimit}" />
          </label>
          <label class="field">
            <span>Days' notice needed — earliest is ${esc(store.formatLongDate(store.earliestOrderDate()))}</span>
            <input type="number" min="0" max="30" step="1" data-path="calendar.leadTimeDays"
                   value="${cal.leadTimeDays}" />
          </label>
          <label class="field">
            <span>Weekly rest day — leave as None to open every day</span>
            <select data-path="calendar.closedWeekdays" data-weekday="1">
              <option value="" ${!(cal.closedWeekdays || []).length ? 'selected' : ''}>None</option>
              ${WEEKDAYS.map((w, i) => `
                <option value="${i}" ${(cal.closedWeekdays || []).includes(i) ? 'selected' : ''}>${w}</option>
              `).join('')}
            </select>
          </label>
          <label class="field">
            <span>Board heading</span>
            <input type="text" data-path="calendar.heading" value="${esc(cal.heading)}" />
          </label>
          <label class="field">
            <span>Board subheading</span>
            <input type="text" data-path="calendar.subheading" value="${esc(cal.subheading)}" />
          </label>
        </div>

        <div class="calendar-editor__bar">
          <button class="btn btn--ghost" data-cal="prev">← Previous</button>
          <span class="calendar-editor__month">${MONTHS[this.month]} ${this.year}</span>
          <button class="btn btn--ghost" data-cal="next">Next →</button>
          <label class="field" style="max-width:130px">
            <span>Set whole month to</span>
            <input type="number" min="0" max="99" step="1" data-role="fill-value" value="${cal.dailyLimit}" />
          </label>
          <button class="btn btn--ghost" data-cal="fill-month">Apply to month</button>
          <button class="btn btn--ghost" data-cal="clear-month">Clear month</button>
        </div>

        <div class="cal-grid" role="group" aria-label="Availability for ${MONTHS[this.month]} ${this.year}">
          ${WEEKDAYS.map((w) => `<div class="cal-grid__head">${w}</div>`).join('')}
          ${cells.join('')}
        </div>

        <div class="hint-box">
          Type a number to set that day. <strong>Default</strong> removes it and falls back
          to the daily limit. <strong>Closed</strong> marks the day sold out whatever number
          is against it. A day shows as <strong>sold out</strong> only when you set it to
          <strong>0</strong> or close it — customers placing orders never change these
          numbers, so what you type here is exactly what they see.
        </div>
      </div>`;
  }
}

/* --- toast -------------------------------------------------------------- */

function toast(message) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  const live = role('live');
  if (live) live.textContent = message;
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 340);
  }, 2600);
}

/* --- panel -------------------------------------------------------------- */

class AdminPanel {
  constructor(content) {
    this.content = content;
    this.host = role('sections');
    store.setAdmin(true);
    this.render();
    this.bind();
  }

  render({ keepScroll = true } = {}) {
    const y = keepScroll ? window.scrollY : 0;
    const c = store.getContent();

    this.host.innerHTML = [
      section('sec-calendar', 'Availability calendar',
        'The numbers customers see on the wall of the shop. Set how many bouquets you can make each day; a day at zero, or marked closed, can no longer be ordered.',
        '<div data-role="cal-mount"></div>'),
      brandSection(c),
      contactSection(c),
      themeSection(c),
      paletteSection(c),
      occasionsSection(c),
      sizesSection(c),
      deliverySection(c),
      termsSection(c),
      displaysSection(c),
      framesSection(c),
      gardenSection(c),
      ioSection(),
    ].join('');

    this.calendar = new CalendarEditor(role('cal-mount'));
    this.refreshJSON();
    window.scrollTo(0, y);
  }

  refreshJSON() {
    const box = role('json');
    if (box) box.value = store.exportContent();
  }

  status(text) {
    const el = role('status');
    if (el) el.textContent = text;
  }

  bind() {
    // Live edits as you type, debounced so the JSON box does not thrash.
    this.host.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.path && el.type !== 'color') {
        this.writePath(el);
      } else if (el.dataset.line) {
        this.writeLine(el);
      }
    });

    this.host.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.photoPick) {
        // Picking a file fills the text field and saves in one step.
        const field = this.host.querySelector(`input[data-path="${el.dataset.photoPick}"]`);
        if (field) {
          field.value = el.value;
          this.writePath(field);
          this.render();
        }
        return;
      }
      if (el.dataset.path) this.writePath(el);
    });

    this.host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-admin]');
      if (!btn) return;
      this.onAction(btn.dataset.admin, btn);
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-bar [data-admin]');
      if (btn) this.onAction(btn.dataset.admin, btn);
    });
  }

  writePath(el) {
    const path = el.dataset.path;
    let value = el.value;

    if (el.dataset.weekday) {
      value = value === '' ? [] : [Number(value)];
    } else if (el.dataset.boolean) {
      value = value === 'true';
    } else if (el.type === 'number') {
      value = value === '' ? 0 : Number(value);
    }

    store.setContentPath(path, value);

    // Keep paired colour inputs in step without a full re-render.
    if (el.dataset.mirror) {
      for (const twin of this.host.querySelectorAll(`[data-mirror="${el.dataset.mirror}"]`)) {
        if (twin !== el) twin.value = el.value;
      }
    }

    clearTimeout(this._jsonTimer);
    this._jsonTimer = setTimeout(() => this.refreshJSON(), 400);
    this.status('Saved to this browser');
  }

  writeLine(el) {
    const path = el.dataset.line;
    const index = Number(el.dataset.index);
    const next = [...list(getPath(store.getContent(), path))];
    next[index] = el.value;
    store.setContentPath(path, next);
    clearTimeout(this._jsonTimer);
    this._jsonTimer = setTimeout(() => this.refreshJSON(), 400);
    this.status('Saved to this browser');
  }

  onAction(action, btn) {
    const listPath = btn.dataset.list;
    const target = btn.dataset.target;
    const index = btn.dataset.index !== undefined ? Number(btn.dataset.index) : null;

    switch (action) {
      case 'add': {
        const next = [...list(getPath(store.getContent(), listPath))];
        next.push(this.blankFor(listPath, next.length));
        store.setContentPath(listPath, next);
        this.render();
        toast('Added.');
        break;
      }
      case 'remove': {
        const next = [...list(getPath(store.getContent(), listPath))];
        next.splice(index, 1);
        store.setContentPath(listPath, next);
        this.render();
        toast('Removed.');
        break;
      }
      case 'line-add': {
        const next = [...list(getPath(store.getContent(), target))];
        next.push('');
        store.setContentPath(target, next);
        this.render();
        break;
      }
      case 'line-remove': {
        const next = [...list(getPath(store.getContent(), target))];
        next.splice(index, 1);
        store.setContentPath(target, next);
        this.render();
        break;
      }
      case 'copy': {
        const json = store.exportContent();
        navigator.clipboard?.writeText(json).then(
          () => toast('JSON copied. Paste it into data/content.json.'),
          () => toast('Could not copy — select the text and copy it manually.')
        );
        break;
      }
      case 'download': {
        const blob = new Blob([store.exportContent()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'content.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        toast('Downloaded. Replace data/content.json with this file.');
        break;
      }
      case 'apply-json': {
        try {
          store.importContent(role('json').value);
          this.render({ keepScroll: false });
          toast('Applied.');
        } catch (err) {
          toast(`That is not valid JSON — ${err.message}`);
        }
        break;
      }
      case 'reload': {
        this.render({ keepScroll: false });
        toast('Reloaded from saved content.');
        break;
      }
      case 'reset': {
        if (!confirm('Reset every setting back to the defaults? Your calendar numbers will be lost.')) return;
        store.resetContent().then(() => {
          this.render({ keepScroll: false });
          toast('Reset to defaults.');
        });
        break;
      }
      default:
        break;
    }
  }

  /** A sensible empty row for each editable list. */
  blankFor(path, index) {
    if (path === 'palette') return { id: `colour-${index + 1}`, label: 'New colour', hex: '#e8c4c9' };
    if (path === 'occasions') return { id: `occasion-${index + 1}`, label: 'New occasion' };
    if (path === 'sizes') return { id: `size-${index + 1}`, label: 'New size', price: 1599, note: '' };
    if (path === 'delivery') return { zone: 'New zone', fee: null, label: 'On enquiry' };
    if (path === 'frames') return { id: `frame-${index + 1}`, title: 'New photograph', caption: '', photo: '' };
    if (path === 'garden.rewards') return { day: index + 1, label: 'A packet of seeds', seeds: 2 };
    if (path === 'displays') {
      const c = store.getContent();
      return {
        id: `display-${index + 1}`,
        title: 'New arrangement',
        varieties: [],
        note: '',
        kind: 'shelf',
        slot: 0,
        bloom: 'rose',
        colorId: c.palette[0]?.id || 'white',
        photo: '',
        pickable: true,
      };
    }
    return {};
  }
}

/* --- start -------------------------------------------------------------- */

Promise.all([store.load(), loadImageList()]).then(([content]) => {
  new AdminPanel(content);
});
