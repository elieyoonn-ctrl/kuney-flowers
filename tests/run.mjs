/* Node-runnable checks for the parts of KUNEY FLOWERS that do not need WebGL:
   geometry builders, the procedural flower factory, availability rules, order
   state and the garden growth model. Run with `npm test`.

   The browser-only surfaces (canvas textures, renderer, DOM) are stubbed just
   enough to let the modules import. */

import * as THREE from 'three';

/* --- stubs ------------------------------------------------------------- */

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
};
globalThis.location = { search: '', pathname: '/', hash: '', origin: 'http://localhost' };
globalThis.fetch = async () => ({ ok: false });

/* --- harness ----------------------------------------------------------- */

let pass = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function near(a, b, tol, message) {
  assert(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b} (tol ${tol})`);
}

/** Every vertex finite, and no NaN normals — the usual procedural-mesh trap. */
function sane(geo, label) {
  const pos = geo.attributes.position;
  assert(pos && pos.count > 0, `${label}: no positions`);
  for (let i = 0; i < pos.count * 3; i += 1) {
    assert(Number.isFinite(pos.array[i]), `${label}: non-finite position at ${i}`);
  }
  const nrm = geo.attributes.normal;
  if (nrm) {
    for (let i = 0; i < nrm.count * 3; i += 1) {
      assert(Number.isFinite(nrm.array[i]), `${label}: non-finite normal at ${i}`);
    }
  }
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert(b && Number.isFinite(b.min.x) && Number.isFinite(b.max.y), `${label}: bad bounds`);
  return b;
}

function size(geo) {
  geo.computeBoundingBox();
  const v = new THREE.Vector3();
  geo.boundingBox.getSize(v);
  return v;
}

/* --- geometry ---------------------------------------------------------- */

const geom = await import('../js/geometry.js');

check('slab: dimensions land on the requested axes', () => {
  const s = geom.slab(2, 1, 0.25, { radius: 0.05, bevel: 0.03 });
  const v = size(s);
  near(v.x, 2, 0.02, 'slab width on X');
  near(v.z, 1, 0.02, 'slab depth on Z');
  near(v.y, 0.25, 0.02, 'slab thickness on Y');
  sane(s, 'slab');
});

check('slab: raw wobble only perturbs the long edges', () => {
  const plain = size(geom.slab(2, 1, 0.1));
  const wobbly = size(geom.slab(2, 1, 0.1, { wobble: 0.03 }));
  assert(wobbly.z > plain.z, 'wobble should widen the depth');
  near(wobbly.x, plain.x, 0.001, 'wobble must not change width');
  near(wobbly.y, plain.y, 0.001, 'wobble must not change thickness');
});

check('planeWithHole: hole is offset, slab stays centred', () => {
  const g = geom.planeWithHole(16, 22, 2, { holeX: 0.4, holeZ: -1.2, segments: 32 });
  const b = sane(g, 'ceiling');
  near(b.min.x, -8, 0.05, 'ceiling left edge');
  near(b.max.x, 8, 0.05, 'ceiling right edge');
  near(b.min.z, -11, 0.05, 'ceiling back edge');
  near(b.max.z, 11, 0.05, 'ceiling front edge');
  // A vertex must exist on the hole rim at its offset centre.
  const pos = g.attributes.position;
  let found = false;
  for (let i = 0; i < pos.count; i += 1) {
    const dx = pos.getX(i) - 0.4;
    const dz = pos.getZ(i) - (-1.2);
    if (Math.abs(Math.hypot(dx, dz) - 2) < 0.05) { found = true; break; }
  }
  assert(found, 'no vertices on the offset hole rim');
});

check('turned: lathe profiles never invert', () => {
  for (const [name, profile] of Object.entries(geom.VASE_PROFILES)) {
    const g = geom.turned(profile, { segments: 24 });
    sane(g, `vase ${name}`);
  }
  sane(geom.turned(geom.POT_PROFILE, { segments: 24 }), 'pot');
});

check('turned: smoothing keeps radii positive', () => {
  // A deliberately sharp profile: the spline will overshoot without clamping.
  const g = geom.turned([[0.001, 0], [0.4, 0], [0.02, 0.1], [0.4, 0.2], [0.001, 0.2]], { segments: 16 });
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    assert(r >= -1e-6, `negative radius ${r}`);
  }
});

check('amphitheatre: rises tier by tier', () => {
  const g = geom.amphitheatre({ tiers: 4, innerRadius: 1.5, tread: 0.66, rise: 0.4 });
  const b = sane(g, 'amphitheatre');
  near(b.max.y, 4 * 0.4, 0.06, 'top tier height');
  assert(b.max.x - b.min.x > 2, 'seating should be wide');
});

check('seeded: deterministic and in range', () => {
  const a = geom.seeded(42);
  const b = geom.seeded(42);
  for (let i = 0; i < 50; i += 1) {
    const x = a();
    assert(x === b(), 'same seed must give the same sequence');
    assert(x >= 0 && x <= 1, `out of range: ${x}`);
  }
});

/* --- flowers ----------------------------------------------------------- */

const flowers = await import('../js/flowers.js');

check('every recipe builds a valid stem', () => {
  for (const id of Object.keys(flowers.RECIPES)) {
    const rng = geom.seeded(7);
    const stem = flowers.createStem(id, '#e8c4c9', { rng });
    assert(stem.children.length > 0, `${id}: empty group`);
    let meshes = 0;
    stem.traverse((o) => {
      if (o.isMesh) {
        meshes += 1;
        sane(o.geometry, `${id}/${o.name || 'mesh'}`);
      }
    });
    assert(meshes >= 1, `${id}: no meshes`);
    assert(stem.userData.height > 0.1, `${id}: implausible height ${stem.userData.height}`);
  }
});

check('openness changes the bloom without breaking it', () => {
  for (const openness of [0, 0.25, 0.6, 1]) {
    const stem = flowers.createStem('peony', '#eec3cb', { rng: geom.seeded(3), openness });
    const head = stem.getObjectByName('head');
    assert(head, `no head at openness ${openness}`);
    sane(head.geometry, `peony head @${openness}`);
  }
  // A closed bud must be narrower than an open flower.
  const closed = flowers.createStem('rose', '#fff', { rng: geom.seeded(9), openness: 0 });
  const open = flowers.createStem('rose', '#fff', { rng: geom.seeded(9), openness: 1 });
  const cw = size(closed.getObjectByName('head').geometry).x;
  const ow = size(open.getObjectByName('head').geometry).x;
  assert(ow > cw, `open rose (${ow.toFixed(3)}) should be wider than a bud (${cw.toFixed(3)})`);
});

check('merged heads carry every attribute needed to merge', () => {
  const stem = flowers.createStem('dahlia', '#b83a3f', { rng: geom.seeded(1) });
  const head = stem.getObjectByName('head');
  for (const attr of ['position', 'normal', 'uv', 'color']) {
    assert(head.geometry.attributes[attr], `head is missing ${attr}`);
  }
  assert(head.geometry.index, 'head should be indexed');
});

check('bunches fan out as separate pickable stems', () => {
  const bunch = flowers.createBunch('ranunculus', '#f6c9a8', 9, { rng: geom.seeded(5) });
  assert(bunch.children.length === 9, `expected 9 stems, got ${bunch.children.length}`);
  const spreads = bunch.children.map((s) => Math.hypot(s.position.x, s.position.z));
  assert(Math.max(...spreads) > 0, 'stems should be offset from the centre');
  for (const s of bunch.children) {
    assert(Number.isFinite(s.rotation.z) && Math.abs(s.rotation.z) < 1, 'implausible lean');
  }
});

check('a grouped bunch carries a colour per stem, in blocks', () => {
  const groups = [
    { id: 'a', hex: '#c62430', label: 'Red', count: 6 },
    { id: 'b', hex: '#f2c01e', label: 'Yellow', count: 5 },
    { id: 'c', hex: '#f8f5ef', label: 'White', count: 7 },
  ];
  const bunch = flowers.createGroupedBunch('rose', groups, { rng: geom.seeded(4) });
  assert(bunch.children.length === 18, `expected 18 stems, got ${bunch.children.length}`);

  const tally = new Map();
  for (const stem of bunch.children) {
    assert(stem.userData.hex, 'a stem has no colour on it');
    assert(stem.userData.colorId, 'a stem has no colour id on it');
    tally.set(stem.userData.colorLabel, (tally.get(stem.userData.colorLabel) || 0) + 1);
  }
  for (const g of groups) {
    assert(tally.get(g.label) === g.count,
      `${g.label}: expected ${g.count} stems, got ${tally.get(g.label)}`);
  }

  // Each colour occupies its own wedge rather than being shuffled through the
  // vase — grouping by variety and colour is the whole point of the display.
  const order = bunch.children.map((s) => s.userData.colorLabel);
  let switches = 0;
  for (let i = 1; i < order.length; i += 1) if (order[i] !== order[i - 1]) switches += 1;
  assert(switches === groups.length - 1,
    `colours are interleaved: ${switches} changes across ${groups.length} groups`);
});

check('a grouped bunch can be cut to a length, blooms unchanged', () => {
  const groups = [{ id: 'a', hex: '#e8699b', label: 'Pink', count: 5 }];
  const tall = flowers.createGroupedBunch('iris', groups, { rng: geom.seeded(8) });
  const short = flowers.createGroupedBunch('iris', groups, { rng: geom.seeded(8), height: 0.4 });
  const highest = (b) => Math.max(...b.children.map((s) => s.userData.height));
  assert(highest(short) < highest(tall) * 0.75,
    `cutting to length did nothing: ${highest(short)} vs ${highest(tall)}`);
  // The head is sized by `scale`, not by the stem length, so it must survive.
  const headWidth = (b) => {
    const head = b.children[0].getObjectByName('head');
    head.geometry.computeBoundingBox();
    return size(head.geometry).x;
  };
  near(headWidth(short), headWidth(tall), 0.001, 'the bloom shrank with the stem');
});

check('the varieties the shop lists all have a recipe', () => {
  // The content names a bloom per display; a typo would silently fall back to
  // a rose and nothing would look wrong enough to notice.
  const wanted = [
    'rose', 'dahlia', 'hydrangea', 'tropical', 'lisianthus', 'delphinium',
    'gerbera', 'tulip', 'orchid', 'calla', 'iris',
  ];
  for (const id of wanted) {
    assert(flowers.RECIPES[id], `no recipe for ${id}`);
    const stem = flowers.createStem(id, '#c62430', { rng: geom.seeded(2) });
    const head = stem.getObjectByName('head');
    assert(head, `${id}: no head`);
    const w = size(head.geometry).x;
    assert(w > 0.012 && w < 0.3, `${id}: implausible head width ${w.toFixed(3)}`);
  }
});

check('olive tree builds trunk and canopy', () => {
  const tree = flowers.createOliveTree({ height: 3, rng: geom.seeded(11) });
  const canopy = tree.getObjectByName('canopy');
  assert(canopy, 'no canopy');
  const b = sane(canopy.geometry, 'canopy');
  assert(b.max.y > 1, 'canopy should sit above the trunk base');
});

/* --- availability ------------------------------------------------------ */

const store = await import('../js/store.js');
const { Order } = await import('../js/order.js');
const content = await store.load();

const key = (offset) => store.dateKey(store.addDays(new Date(), offset));

check('dateKey is local time, not UTC', () => {
  const d = new Date(2026, 0, 1, 23, 30);
  assert(store.dateKey(d) === '2026-01-01', `got ${store.dateKey(d)}`);
});

check('the shipped defaults are the shop\u2019s actual rules', () => {
  // Three bouquets a day, open every day, three days\u2019 notice.
  const cal = store.getContent().calendar;
  assert(cal.dailyLimit === 3, `daily limit should be 3, got ${cal.dailyLimit}`);
  assert(cal.leadTimeDays === 3, `lead time should be 3 days, got ${cal.leadTimeDays}`);
  assert((cal.closedWeekdays || []).length === 0,
    `no weekly rest day expected, got ${JSON.stringify(cal.closedWeekdays)}`);
  assert((cal.closed || []).length === 0, 'no days should ship pre-closed');
  assert(Object.keys(cal.overrides || {}).length === 0, 'no overrides should ship');
});

check('Sundays are orderable', () => {
  // Walk forward to the first Sunday that clears the lead time.
  for (let i = 3; i < 17; i += 1) {
    const k = key(i);
    if (store.parseDateKey(k).getDay() !== 0) continue;
    const day = store.availability(k);
    assert(day.selectable, `Sunday ${k} should be orderable but was not`);
    return;
  }
  throw new Error('no Sunday found in the next fortnight');
});

check('three days\u2019 notice: today and the next two are blocked', () => {
  assert(store.availability(key(-1)).past, 'yesterday should be past');
  for (const offset of [0, 1, 2]) {
    const day = store.availability(key(offset));
    assert(!day.selectable, `day +${offset} should not be selectable`);
    assert(day.tooSoon, `day +${offset} should be flagged as too soon`);
  }
  const first = store.availability(key(3));
  assert(first.selectable, 'the third day from today should be the earliest orderable');
  assert(first.remaining === 3, `expected 3 bouquets, got ${first.remaining}`);
  assert(store.earliestOrderDate() === key(3),
    `earliestOrderDate should be ${key(3)}, got ${store.earliestOrderDate()}`);
});

check('a day override wins over the daily limit', () => {
  store.setDayLimit(key(5), 2);
  assert(store.availability(key(5)).remaining === 2, 'override not applied');
  store.setDayLimit(key(5), null);
  assert(store.availability(key(5)).remaining === 3, 'override not cleared');
});

check('setting a day to zero is what sells it out', () => {
  const k = key(6);
  assert(store.availability(k).selectable, 'should start available');
  store.setDayLimit(k, 0);
  const day = store.availability(k);
  assert(day.soldOut, 'should be sold out');
  assert(!day.selectable, 'sold-out days must not be selectable');
  store.setDayLimit(k, null);
  assert(store.availability(k).selectable, 'clearing the override should reopen it');
});

check('closing a day sells it out regardless of the number', () => {
  store.setDayLimit(key(7), 9);
  store.toggleClosed(key(7));
  assert(store.availability(key(7)).soldOut, 'closed day should be sold out');
  store.toggleClosed(key(7));
  assert(store.availability(key(7)).selectable, 'reopening should restore it');
  store.setDayLimit(key(7), null);
});

check('a weekly rest day still works if one is ever set', () => {
  // Not used by default — the shop is open every day — but the owner panel
  // offers it, so it has to behave.
  const target = store.parseDateKey(key(8)).getDay();
  store.saveContent({ calendar: { closedWeekdays: [target] } });
  assert(store.availability(key(8)).soldOut, 'rest day should be sold out');
  assert(store.availability(key(15)).soldOut, 'same weekday next week too');
  // An explicit number reopens one such day without reopening the rest.
  store.setDayLimit(key(8), 2);
  assert(store.availability(key(8)).selectable, 'an override should reopen a rest day');
  assert(store.availability(key(15)).soldOut, 'the following week should stay shut');
  store.setDayLimit(key(8), null);
  store.saveContent({ calendar: { closedWeekdays: [] } });
});

check('only the owner changes availability, never a visitor', () => {
  // A visitor confirming an order and following the purchase link must not
  // move the numbers: the shop is told about real orders out of band, and the
  // owner lowers the day themselves. Anything else would show one customer a
  // different count from the next.
  const k = key(9);
  const before = store.availability(k).remaining;
  assert(before === 3, `expected the daily limit, got ${before}`);

  const o = new Order(store.getContent());
  o.setSize('standard');
  o.setDate(k);
  o.confirm();

  assert(store.availability(k).remaining === before,
    'confirming an order changed the day\u2019s availability');
  assert(store.availability(k).selectable, 'the day should still be selectable');
  assert(typeof store.recordOrder === 'undefined',
    'recordOrder should be gone — availability is owner-set only');
});

check('firstAvailableDate respects the lead time and skips closed days', () => {
  store.saveContent({ calendar: { dailyLimit: 3, leadTimeDays: 3, closed: [], overrides: {}, closedWeekdays: [] } });
  assert(store.firstAvailableDate() === key(3),
    `expected ${key(3)}, got ${store.firstAvailableDate()}`);

  // Close the first three orderable days; it should walk past them.
  store.setDayLimit(key(3), 0);
  store.setDayLimit(key(4), 0);
  store.toggleClosed(key(5));
  const first = store.firstAvailableDate();
  assert(first === key(6), `expected ${key(6)}, got ${first}`);
  assert(store.availability(first).selectable, 'returned date must be selectable');

  store.setDayLimit(key(3), null);
  store.setDayLimit(key(4), null);
  store.toggleClosed(key(5));
});

check('monthAvailability covers the whole month', () => {
  const m = store.monthAvailability(2026, 8);   // September 2026
  assert(m.days.length === 30, `September should have 30 days, got ${m.days.length}`);
  assert(m.firstWeekday === new Date(2026, 8, 1).getDay(), 'wrong first weekday');
});

check('broken saved content is repaired, not fatal', () => {
  // What actually happened in Safari: a saved snapshot was missing `frames`,
  // and buildShop threw on frames.slice() — a blank page with no explanation.
  const c = store.getContent();
  delete c.frames;
  c.displays = 'not an array';
  c.calendar.overrides = null;
  c.calendar.closed = undefined;
  delete c.garden.rewards;

  const repaired = store.repair(c);
  assert(repaired.includes('frames'), 'frames not repaired');
  assert(repaired.includes('displays'), 'displays not repaired');
  assert(repaired.includes('calendar.overrides'), 'overrides not repaired');
  assert(repaired.includes('calendar.closed'), 'closed not repaired');
  assert(repaired.includes('garden.rewards'), 'rewards not repaired');

  assert(Array.isArray(c.frames) && c.frames.length > 0, 'frames should hold defaults');
  assert(Array.isArray(c.displays) && c.displays.length > 0, 'displays should hold defaults');
  assert(Array.isArray(c.calendar.closed), 'closed should be an array');
  assert(c.calendar.overrides && typeof c.calendar.overrides === 'object', 'overrides should be an object');
  // Valid content must be left completely alone.
  assert(store.repair(c).length === 0, 'a second pass should find nothing to fix');
});

check('a null in saved content cannot clobber a real value', () => {
  // This is what actually blanked the shop: the browser copy had frames: null,
  // which overwrote a perfectly good array, and buildShop threw on .slice().
  const json = store.exportContent();
  store.importContent(JSON.stringify({ ...JSON.parse(json), frames: null, palette: null }));
  const c = store.getContent();
  assert(Array.isArray(c.frames) && c.frames.length > 0, 'frames lost to a null');
  assert(Array.isArray(c.palette) && c.palette.length > 0, 'palette lost to a null');
  // Clearing to an empty array is a legitimate edit and must still be honoured.
  store.importContent(JSON.stringify({ ...JSON.parse(json), frames: [] }));
  assert(Array.isArray(store.getContent().frames) && store.getContent().frames.length === 0,
    'an owner clearing every frame should be respected');
  store.importContent(json);
});

check('repair falls back to shipped content, not the factory default', () => {
  // On a copy: repair mutates in place, and the live content is shared state.
  const c = JSON.parse(JSON.stringify(store.getContent()));
  const shipped = JSON.parse(JSON.stringify(c));
  shipped.frames = [{ id: 'published', title: 'Published frame', caption: '', photo: 'images/x.jpg' }];
  c.frames = 'corrupt';
  store.repair(c, shipped);
  assert(c.frames.length === 1 && c.frames[0].id === 'published',
    'a corrupt browser copy should fall back to what the site publishes');
});

check('editing one item in a list leaves the list intact', () => {
  /* The bug that blanked the shop. The owner panel wrote each field as a nested
     patch — `{frames: {0: {photo: '...'}}}` — an object where an array belongs,
     and merge replaced the whole array with it. Every edit to a flower, a
     colour, a size or a frame destroyed that entire list, and the room then
     threw while being built. Writes go through setContentPath now, which walks
     the real structure. */
  const snapshot = store.exportContent();   // restored at the end
  const before = store.getContent().frames.length;
  assert(before >= 3, 'expected the default frames');

  store.setContentPath('frames.0.photo', 'images/wrapped-01.jpg');
  const frames = store.getContent().frames;
  assert(Array.isArray(frames), 'frames stopped being an array');
  assert(frames.length === before, `frames went from ${before} to ${frames.length}`);
  assert(frames[0].photo === 'images/wrapped-01.jpg', 'the edit did not take');
  assert(frames[1].title, 'a sibling frame lost its data');

  // Same for every other editable list.
  for (const [path, key] of [
    ['palette.2.label', 'palette'],
    ['displays.1.title', 'displays'],
    ['sizes.0.price', 'sizes'],
    ['garden.rewards.0.label', 'garden.rewards'],
  ]) {
    const list = path.startsWith('garden')
      ? store.getContent().garden.rewards
      : store.getContent()[key];
    const n = list.length;
    store.setContentPath(path, 'edited');
    const after = path.startsWith('garden')
      ? store.getContent().garden.rewards
      : store.getContent()[key];
    assert(Array.isArray(after), `${key} stopped being an array`);
    assert(after.length === n, `${key} lost items: ${n} -> ${after.length}`);
  }

  store.importContent(snapshot);
});

check('a bad write is repaired rather than saved', () => {
  const snapshot = store.exportContent();
  store.saveContent({ frames: { 0: { photo: 'x' } } });
  assert(Array.isArray(store.getContent().frames), 'an object patch should be repaired away');
  assert(store.getContent().frames.length > 0, 'frames should hold real entries');
  store.importContent(snapshot);
});

check('content export/import round-trips', () => {
  store.saveContent({ brand: { seasonName: 'Test Season' } });
  const json = store.exportContent();
  store.saveContent({ brand: { seasonName: 'Overwritten' } });
  store.importContent(json);
  assert(store.getContent().brand.seasonName === 'Test Season', 'round-trip lost the value');
});

/* --- order ------------------------------------------------------------- */

check('order needs a size and an available date, nothing else', () => {
  const o = new Order(store.getContent());
  assert(!o.isReady, 'empty order must not be ready');
  o.setSize('standard');
  assert(o.missing().includes('a delivery date'), 'should still want a date');
  o.setDate(store.firstAvailableDate());
  assert(o.isReady, `should be ready, missing: ${o.missing()}`);
  assert(o.colors.size === 0 && o.occasions.size === 0, 'colour and occasion stay optional');
});

check('a sold-out date is rejected', () => {
  const o = new Order(store.getContent());
  o.setSize('large');
  const k = key(9);
  store.setDayLimit(k, 0);
  o.setDate(k);
  assert(!o.isReady, 'sold-out date must block the order');
  assert(o.missing().includes('an available delivery date'), `got: ${o.missing()}`);
});

check('only one colour can be chosen, and it stays optional', () => {
  const o = new Order(store.getContent());
  assert(o.colorId === null, 'nothing chosen to begin with');

  o.selectColor('blush-pink');
  assert(o.colorId === 'blush-pink', 'first choice not taken');
  assert(o.colors.size === 1, 'exactly one colour should be held');

  o.selectColor('red');
  assert(o.colorId === 'red', 'a second choice should replace the first');
  assert(o.colors.size === 1, `expected one colour, got ${o.colors.size}`);

  o.selectColor('red');
  assert(o.colorId === null, 'pressing the chosen colour again should clear it');
  assert(o.colors.size === 0, 'clearing should leave nothing');
});

check('only one occasion can be chosen, and it stays optional', () => {
  const o = new Order(store.getContent());
  o.selectOccasion('birthday');
  o.selectOccasion('newborn');
  assert(o.occasionId === 'newborn', 'a second choice should replace the first');
  assert(o.occasions.size === 1, `expected one occasion, got ${o.occasions.size}`);
  o.selectOccasion('newborn');
  assert(o.occasionId === null, 'pressing it again should clear it');
});

check('gathering stems changes nothing about the order', () => {
  const o = new Order(store.getContent());
  o.selectColor('white');
  o.selectOccasion('graduation');

  o.addPicked({ displayId: 'peony-blush', title: 'Peony, Blush', recipeId: 'peony', hex: '#eec3cb', colorId: 'blush-pink' });
  o.addPicked({ displayId: 'dahlia-red', title: 'Dahlia, Deep Red', recipeId: 'dahlia', hex: '#b83a3f', colorId: 'red' });

  // Gathering must not touch a deliberate choice — with a single selection,
  // the old auto-add would have silently overwritten it.
  assert(o.colorId === 'white', `gathering changed the colour to ${o.colorId}`);
  assert(o.occasionId === 'graduation', 'gathering changed the occasion');
  assert(o.picked.length === 2, 'the stems should still be recorded as a keepsake');
  assert(o.pickedColors().length === 2, 'keepsake swatches should list both colours');
});

check('the summary carries no trace of the gathered stems', () => {
  const o = new Order(store.getContent());
  o.selectColor('peach');
  o.setSize('standard');
  o.setDate(store.firstAvailableDate());
  o.addPicked({ displayId: 'x', title: 'Peony, Blush', recipeId: 'peony', hex: '#eec3cb', colorId: 'blush-pink' });
  o.addPicked({ displayId: 'y', title: 'Dahlia, Deep Red', recipeId: 'dahlia', hex: '#b83a3f', colorId: 'red' });
  o.confirm();

  const s = o.summary();
  assert(s.reference && /^KF-\d{6}-\d{4}$/.test(s.reference), `bad reference ${s.reference}`);
  assert(s.total === 1599, `wrong total ${s.total}`);
  assert(s.colours.length === 1 && s.colours[0].id === 'peach', 'the chosen colour should carry');

  // The invoice can only read summary(), so these absences are the guarantee.
  for (const banned of ['gathered', 'gatheredByColor', 'gatheredByVariety', 'picked', 'varieties']) {
    assert(!(banned in s), `summary must not carry "${banned}"`);
  }
  const serialised = JSON.stringify(s);
  assert(!serialised.includes('Peony, Blush'), 'a gathered variety leaked into the summary');
  assert(!serialised.includes('Dahlia'), 'a gathered variety leaked into the summary');
  assert(!serialised.includes('blush-pink'), 'a gathered colour leaked into the summary');
});

check('confirm is refused until the order is ready', () => {
  const o = new Order(store.getContent());
  assert(o.confirm() === null, 'incomplete order should not confirm');
  assert(o.reference === null, 'no reference before confirming');
});

check('every invoice rendering carries the order but not the stems', async () => {
  const invoice = await import('../js/invoice.js');
  const content = store.getContent();
  const o = new Order(content);
  o.setSize('extravagant');
  o.selectColor('peach');
  o.selectOccasion('birthday');
  o.setDate(store.firstAvailableDate());
  o.addPicked({ displayId: 'x', title: 'Secret Variety', recipeId: 'rose', hex: '#fff', colorId: 'white' });
  o.confirm();
  const summary = o.summary();

  const text = invoice.text(summary);
  assert(text.includes('Extravagant'), 'size missing from the message');
  assert(text.includes('Peach'), 'colour missing from the message');
  assert(text.includes('Birthday'), 'occasion missing from the message');
  assert(!text.includes('Secret Variety'), 'variety leaked into the WhatsApp message');
  assert(!/stem/i.test(text), 'the message mentions stems');

  const markup = invoice.html(summary, content);
  assert(markup.includes('Extravagant') && markup.includes('Peach'), 'invoice is missing the order');
  assert(!markup.includes('Secret Variety'), 'variety leaked into the printed invoice');
  assert(!/Gathered/i.test(markup), 'the invoice still lists gathered stems');
  // The keepsake note must survive, since it is what sets expectations.
  assert(markup.includes('keepsake'), 'the keepsake note is missing from the invoice');

  const link = invoice.whatsappLink(summary, content);
  assert(link.startsWith('https://wa.me/85296124061?text='), `bad link: ${link.slice(0, 60)}`);
});

check('the keepsake note says what it needs to say', () => {
  const note = store.getContent().invoice.gameNote.toLowerCase();
  assert(note.includes('keepsake'), 'note should call the stems a keepsake');
  assert(note.includes('variety'), 'note should say it does not set the variety');
  assert(note.includes('count'), 'note should say it does not set the count');
});

/* --- garden ------------------------------------------------------------ */

const { GardenGame } = await import('../js/garden-game.js');

/** Minimal stand-in for the 3D garden. */
function fakeGarden() {
  const calls = [];
  return { calls, setPlant: (i, spec) => calls.push([i, spec]) };
}

check('garden starts with seeds, water and a claimable reward', () => {
  memory.delete('kuney.garden.v3');
  const g = new GardenGame(store.getContent(), fakeGarden());
  assert(g.state.seeds > 0, 'should start with seeds');
  assert(g.state.water === store.getContent().garden.waterPerDay, 'watering can should be full');
  assert(g.state.streak === 1, `first visit should be streak 1, got ${g.state.streak}`);
  assert(g.canClaim, 'first reward should be claimable');
  const reward = g.claimDaily();
  assert(reward, 'claim failed');
  assert(!g.canClaim, 'reward should only be claimable once a day');
});

check('sowing costs a seed and reaches the scene', () => {
  memory.delete('kuney.garden.v3');
  const scene = fakeGarden();
  const g = new GardenGame(store.getContent(), scene);
  const before = g.state.seeds;
  const variety = g.seedVarieties[0];
  const res = g.plant(0, variety);
  assert(res.ok, `plant failed: ${res.reason}`);
  assert(g.state.seeds === before - 1, 'seed not spent');
  assert(scene.calls.some(([i, spec]) => i === 0 && spec && spec.stage === 0), 'scene not told to show a seed');
  assert(!g.plant(0, variety).ok, 'should refuse to plant twice in one bed');
});

check('growth advances with real time and stalls without water', () => {
  memory.delete('kuney.garden.v3');
  const g = new GardenGame(store.getContent(), fakeGarden());
  g.plant(0, g.seedVarieties[0]);
  const HOUR = 3600 * 1000;
  const plot = g.state.plots[0];

  // Pretend 10 hours passed with a recent watering.
  plot.lastUpdate = Date.now() - 10 * HOUR;
  plot.lastWatered = Date.now() - 2 * HOUR;
  g.syncScene();
  near(plot.growthHours, 10, 0.2, 'watered growth should run at full speed');
  assert(g.stageOf(plot) === 1, `expected sprout, got stage ${g.stageOf(plot)}`);

  // Now 10 hours with no water for two days.
  plot.lastUpdate = Date.now() - 10 * HOUR;
  plot.lastWatered = Date.now() - 48 * HOUR;
  g.syncScene();
  near(plot.growthHours, 10 + 2.5, 0.3, 'neglected growth should run at a quarter speed');
});

check('watering is once a day and boosts growth', () => {
  memory.delete('kuney.garden.v3');
  const g = new GardenGame(store.getContent(), fakeGarden());
  g.plant(0, g.seedVarieties[0]);
  const before = g.state.plots[0].growthHours;
  const first = g.water(0);
  assert(first.ok, `water failed: ${first.reason}`);
  assert(g.state.plots[0].growthHours > before, 'watering should advance growth');
  assert(!g.water(0).ok, 'second watering on the same day should be refused');
});

check('a bloom can be cut, returns seeds and frees the bed', () => {
  memory.delete('kuney.garden.v3');
  const g = new GardenGame(store.getContent(), fakeGarden());
  g.plant(0, g.seedVarieties[0]);
  assert(!g.harvest(0).ok, 'should not harvest a seed');
  g.state.plots[0].growthHours = 999;
  const seeds = g.state.seeds;
  const res = g.harvest(0);
  assert(res.ok, `harvest failed: ${res.reason}`);
  assert(g.state.plots[0] === null, 'bed should be empty after cutting');
  assert(g.state.bloomed === 1, 'bloom not counted');
  assert(g.state.seeds === seeds + 2, 'cutting should leave seed behind');
});

check('streak counts consecutive days and resets after a gap', () => {
  memory.delete('kuney.garden.v3');
  new GardenGame(store.getContent(), fakeGarden());   // day 1
  let saved = JSON.parse(memory.get('kuney.garden.v3'));
  saved.lastVisit = store.dateKey(store.addDays(new Date(), -1));
  memory.set('kuney.garden.v3', JSON.stringify(saved));
  let g = new GardenGame(store.getContent(), fakeGarden());
  assert(g.state.streak === 2, `returning the next day should be streak 2, got ${g.state.streak}`);

  saved = JSON.parse(memory.get('kuney.garden.v3'));
  saved.lastVisit = store.dateKey(store.addDays(new Date(), -5));
  memory.set('kuney.garden.v3', JSON.stringify(saved));
  g = new GardenGame(store.getContent(), fakeGarden());
  assert(g.state.streak === 1, `a five-day gap should reset to 1, got ${g.state.streak}`);
});

check('growth stages map to visibly different plants', () => {
  memory.delete('kuney.garden.v3');
  const scene = fakeGarden();
  const g = new GardenGame(store.getContent(), scene);
  g.plant(0, g.seedVarieties[0]);
  const seen = new Set();
  for (const hours of [0, 8, 25, 50, 90]) {
    g.state.plots[0].growthHours = hours;
    g.state.plots[0].lastUpdate = Date.now();
    g.state.plots[0].lastWatered = Date.now();
    scene.calls.length = 0;
    g.syncScene(0);
    const spec = scene.calls[0][1];
    seen.add(`${spec.stage}`);
    assert(spec.scale > 0 && spec.scale <= 1.2, `implausible scale ${spec.scale}`);
    assert(spec.openness >= 0 && spec.openness <= 1, `openness out of range ${spec.openness}`);
  }
  assert(seen.size === 5, `expected 5 distinct stages, saw ${[...seen].join(',')}`);
});

/* --- report ------------------------------------------------------------ */

console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
