/* Builds all three spaces outside the browser and checks the layout holds
   together: nothing lands inside a wall, every camera stop is inside the room
   and looking at something, colliders cover the furniture, and each display in
   content.js actually gets a slot. Run with `npm test`.

   No WebGL is involved — the scene modules take an optional renderer, and
   without one they skip the environment map and build geometry only. */

import { installDom } from './dom-stub.mjs';

installDom();

import * as THREE from 'three';
import * as store from '../js/store.js';
import { buildShop, ROOM } from '../js/scene-shop.js';
import { buildCorridor } from '../js/scene-corridor.js';
import { buildGarden, GARDEN } from '../js/scene-garden.js';
import { GardenGame } from '../js/garden-game.js';
import { CameraRig } from '../js/camera-rig.js';
import { renderBoard } from '../js/calendar.js';

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

const content = await store.load();

/* --- shop --------------------------------------------------------------- */

const shop = buildShop(content);

check('shop builds without a renderer', () => {
  assert(shop.root.children.length > 20, `sparse room: ${shop.root.children.length} children`);
  assert(shop.envTexture === null, 'no env map should be built without a renderer');
});

check('every geometry in the shop is finite', () => {
  let meshes = 0;
  shop.root.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    meshes += 1;
    const pos = o.geometry?.attributes?.position;
    assert(pos, `${o.name || o.type}: no positions`);
    for (let i = 0; i < pos.count * 3; i += 1) {
      assert(Number.isFinite(pos.array[i]), `${o.name || o.type}: non-finite vertex`);
    }
  });
  assert(meshes > 60, `expected a furnished room, found ${meshes} meshes`);
});

check('every display in content gets a slot and a stop', () => {
  for (const d of content.displays) {
    const entry = shop.displays.get(d.id);
    assert(entry, `${d.id}: no display built`);
    assert(entry.stop && entry.stop.position && entry.stop.target, `${d.id}: no camera stop`);
    assert(entry.bunch.children.length > 0, `${d.id}: empty bunch`);
  }
  assert(shop.displays.size === content.displays.length, 'display count mismatch');
});

check('table displays sit on the island top', () => {
  for (const d of content.displays.filter((x) => x.kind === 'vase-table')) {
    const entry = shop.displays.get(d.id);
    near(entry.group.position.y, ROOM.island.height, 0.001, `${d.id} height`);
    const halfW = ROOM.island.width / 2;
    const halfD = ROOM.island.depth / 2;
    assert(Math.abs(entry.group.position.x - ROOM.island.x) < halfW,
      `${d.id} hangs off the island in x`);
    assert(Math.abs(entry.group.position.z - ROOM.island.z) < halfD,
      `${d.id} hangs off the island in z`);
  }
});

check('shelf displays sit against the right wall, on a shelf height', () => {
  const shelfHeights = [1.02, 1.74];
  for (const d of content.displays.filter((x) => x.kind === 'shelf')) {
    const p = shop.displays.get(d.id).group.position;
    near(p.x, ROOM.width / 2 - 0.22, 0.1, `${d.id} distance from the right wall`);
    assert(shelfHeights.some((h) => Math.abs(p.y - h) < 0.06),
      `${d.id} at y=${p.y} is not on a shelf`);
  }
});

check('nothing is placed outside the room', () => {
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;
  for (const [id, entry] of shop.displays) {
    const p = entry.group.position;
    assert(Math.abs(p.x) < halfW && Math.abs(p.z) < halfD, `${id} is outside the walls`);
  }
});

check('every camera stop is inside the room and aimed somewhere else', () => {
  const halfW = ROOM.width / 2 + 0.6;   // the portal stop looks through the wall
  const halfD = ROOM.depth / 2;
  const seen = new Set();
  for (const stop of shop.stops) {
    const [x, y, z] = stop.position;
    assert(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),
      `${stop.id}: non-finite position`);
    assert(Math.abs(x) < halfW && Math.abs(z) < halfD, `${stop.id}: stop outside the room`);
    assert(y > 1.2 && y < 2.1, `${stop.id}: implausible eye height ${y}`);
    const d = new THREE.Vector3().fromArray(stop.position)
      .distanceTo(new THREE.Vector3().fromArray(stop.target));
    assert(d > 0.3, `${stop.id}: camera and target are on top of each other`);
    assert(!seen.has(stop.id), `duplicate stop id ${stop.id}`);
    seen.add(stop.id);
  }
  assert(shop.stops[0].id === 'entrance', 'the first stop must be the entrance');
  assert(shop.stops[shop.stops.length - 1].id === 'portal', 'the last stop should be the garden door');
});

check('the guided tour visits every display', () => {
  const visited = new Set(shop.stops.filter((s) => s.displayId).map((s) => s.displayId));
  for (const d of content.displays) {
    assert(visited.has(d.id), `${d.id} is unreachable from the Next button`);
  }
});

check('the tour includes the calendar and the frames', () => {
  assert(shop.stops.some((s) => s.kind === 'calendar'), 'no calendar stop');
  for (const f of content.frames.slice(0, 3)) {
    assert(shop.stops.some((s) => s.frameId === f.id), `${f.id} has no stop`);
  }
});

check('colliders enclose the room and the furniture', () => {
  assert(shop.colliders.length > 8, `too few colliders: ${shop.colliders.length}`);
  for (const box of shop.colliders) {
    assert(box.min.x <= box.max.x && box.min.z <= box.max.z, 'inverted collider box');
  }

  // Walking into the jade island must be blocked.
  const inside = (x, z) => shop.colliders.some((b) =>
    x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z);
  assert(inside(ROOM.island.x, ROOM.island.z), 'the island is walk-through');
  assert(inside(-3.9, -5.4), 'the concrete column is walk-through');
  assert(inside(0.6, -6.6), 'the olive tree pot is walk-through');
  assert(!inside(0, 7), 'the entrance floor should be clear');
  assert(inside(-8.2, 0), 'the left wall is walk-through');
  assert(inside(0, 11.2), 'the front wall is walk-through');
});

check('the entrance is inside the walkable bounds and not in a collider', () => {
  const [x, , z] = shop.entranceStop.position;
  assert(shop.bounds.min.x < x && x < shop.bounds.max.x, 'entrance outside bounds in x');
  assert(shop.bounds.min.z < z && z < shop.bounds.max.z, 'entrance outside bounds in z');
  const blocked = shop.colliders.some((b) =>
    x + 0.34 > b.min.x && x - 0.34 < b.max.x && z + 0.34 > b.min.z && z - 0.34 < b.max.z);
  assert(!blocked, 'the visitor would spawn inside something');
});

/** Moving furniture is the usual way a camera stop ends up inside a counter. */
check('no camera stop stands inside the furniture', () => {
  const radius = 0.34;   // matches CameraRig's playerRadius
  for (const stop of shop.stops) {
    if (stop.kind === 'portal') continue;   // the portal stop sits in the doorway
    const [x, , z] = stop.position;
    const blocked = shop.colliders.find((b) =>
      x + radius > b.min.x && x - radius < b.max.x &&
      z + radius > b.min.z && z - radius < b.max.z &&
      b.max.y > 0.5);
    assert(!blocked,
      `stop "${stop.id}" at (${x.toFixed(2)}, ${z.toFixed(2)}) is inside a collider`);
  }
});

check('the ceiling oculus lines up with the daylight', () => {
  const ceiling = shop.root.children.find((c) => c.isMesh && c.geometry.type === 'ShapeGeometry');
  assert(ceiling, 'no ceiling found');
  ceiling.geometry.computeBoundingBox();
  const b = ceiling.geometry.boundingBox;
  near(b.max.x - b.min.x, ROOM.width, 0.05, 'ceiling width');
  near(b.max.z - b.min.z, ROOM.depth, 0.05, 'ceiling depth');
  near(ceiling.position.y, ROOM.height, 0.001, 'ceiling height');

  const sun = shop.root.children.find((c) => c.isDirectionalLight && c.castShadow);
  assert(sun, 'no shadow-casting daylight');
  const drift = Math.hypot(sun.target.position.x - ROOM.oculus.x, sun.target.position.z - ROOM.oculus.z);
  assert(drift < 4, `the light pool misses the oculus by ${drift.toFixed(2)}m`);
});

check('the island is the size the layout asks for', () => {
  const top = shop.root.getObjectByName('island-top');
  assert(top, 'no island top');
  top.geometry.computeBoundingBox();
  const s = new THREE.Vector3();
  top.geometry.boundingBox.getSize(s);
  near(s.x, ROOM.island.width, 0.02, 'island length');
  // The raw edge is a deliberate overhang on the long sides only.
  assert(s.z >= ROOM.island.depth && s.z < ROOM.island.depth + 0.07,
    `island depth ${s.z.toFixed(3)} should exceed ${ROOM.island.depth} only by the raw edge`);
  near(top.position.y + s.y / 2, ROOM.island.height, 0.01, 'island working height');
});

/**
 * The doorways are cut out of wall panels rather than modelled as holes, so an
 * off-by-one on the rotated wall's local axis would leave a solid wall where
 * the portal should be. Raycasting from the stop is the only honest check.
 */
function wallBlocks(scene, stop, exclude = []) {
  const origin = new THREE.Vector3().fromArray(stop.position);
  const target = new THREE.Vector3().fromArray(stop.target);
  const dir = target.clone().sub(origin).normalize();
  const ray = new THREE.Raycaster(origin, dir, 0.01, origin.distanceTo(target) + 0.4);
  scene.root.updateMatrixWorld(true);
  /* Walls are meshes. Collecting them rather than casting at the whole root
     also keeps the sprite blooms out of it — a sprite cannot be raycast
     without a camera, and a flower has never stopped anyone seeing a door. */
  const meshes = [];
  scene.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return ray.intersectObjects(meshes, false).filter((h) => {
    if (exclude.includes(h.object)) return false;
    // Ignore the invisible click plates and the glow cards standing in the gap.
    if (h.object.material?.visible === false) return false;
    if (h.object.material?.isMeshBasicMaterial) return false;
    return true;
  });
}

check('the garden doorway is really cut through the shop wall', () => {
  const hits = wallBlocks(shop, shop.portalStop);
  assert(hits.length === 0,
    `the portal is walled up — ray hit ${hits.map((h) => h.object.name || h.object.type).join(', ')}`);
});

check('a wall without a doorway still stops the ray', () => {
  // Control case: aim at the back wall and confirm the test above can fail.
  const solid = { position: [0, 1.58, -6], target: [0, 1.5, -11.2] };
  assert(wallBlocks(shop, solid).length > 0, 'the back wall is missing');
});

check('interactive targets cover flowers, calendar, printer, vase and portal', () => {
  const kinds = new Set();
  for (const o of shop.interactive) {
    const d = o.userData || {};
    if (d.displayId) kinds.add('flower');
    if (d.calendar) kinds.add('calendar');
    if (d.printer) kinds.add('printer');
    if (d.vase) kinds.add('vase');
    if (d.portal) kinds.add('portal');
    if (d.frameId) kinds.add('frame');
  }
  for (const want of ['flower', 'calendar', 'printer', 'vase', 'portal', 'frame']) {
    assert(kinds.has(want), `nothing in the room responds as a ${want}`);
  }
});

check('gathering stems fills the vase and clearing empties it', () => {
  const holder = shop.vase.holder;
  assert(holder.children.length === 0, 'the vase should start empty');
  assert(shop.vase.water.visible === false, 'no water until the first stem');
  for (let i = 0; i < 5; i += 1) shop.addPickedStem('rose', '#f7d9e0', i);
  assert(holder.children.length === 5, `expected 5 stems, got ${holder.children.length}`);
  assert(shop.vase.water.visible === true, 'water should appear with the stems');
  // Stems must fan, not stack in one place.
  const spread = Math.max(...holder.children.map((s) => Math.hypot(s.position.x, s.position.z)));
  assert(spread > 0.005, 'gathered stems are all in the same spot');
  shop.clearVase();
  assert(holder.children.length === 0, 'clearVase left stems behind');
  assert(shop.vase.water.visible === false, 'water should drain with the stems');
});

/* --- the wrapping moment ------------------------------------------------ */

/** Run the shop's clock forward, as the render loop would. */
function tick(seconds, step = 1 / 60) {
  const frames = Math.ceil(seconds / step);
  for (let i = 0; i < frames; i += 1) shop.update(step, i * step);
}

function drawnSegments(mesh) {
  return mesh.geometry.drawRange.count;
}

check('there is nothing to wrap in an empty shop', () => {
  shop.clearVase();
  assert(shop.wrap() === 0, 'wrapping an empty vase should be a no-op');
  assert(shop.isWrapped === false, 'no wrap state without stems');
});

check('wrapping takes the stems out of the vase and into the bouquet', () => {
  shop.clearVase();
  for (let i = 0; i < 6; i += 1) shop.addPickedStem('peony', '#f3b3c6', i);
  const holder = shop.vase.holder;
  const bouquet = shop.bouquet.group;
  const permanent = 4;   // two sheets, ribbon, tails

  assert(holder.children.length === 6, 'stems should start in the vase');
  const duration = shop.wrap();
  assert(duration > 2 && duration < 8, `implausible duration ${duration}`);
  assert(holder.children.length === 0, 'stems should leave the vase');
  assert(bouquet.children.length === permanent + 6, 'stems should join the bouquet');
  assert(shop.isWrapped, 'wrap state not set');
});

check('the paper sweeps around, in whole segments only', () => {
  const inner = shop.bouquet.paperInner;
  const total = inner.userData.indexTotal;
  assert(total > 0 && total % 6 === 0, `odd index count ${total}`);
  assert(drawnSegments(inner) === 0, 'no paper before the sweep starts');

  const samples = [];
  for (let i = 0; i < 24; i += 1) {
    tick(0.1);
    samples.push(drawnSegments(inner));
  }
  for (const n of samples) {
    assert(n % 6 === 0, `partial triangle drawn: ${n} indices`);
    assert(n <= total, `drew past the end: ${n} of ${total}`);
  }
  // Monotonic: paper only ever comes further around.
  for (let i = 1; i < samples.length; i += 1) {
    assert(samples[i] >= samples[i - 1], 'the paper unwrapped itself');
  }
  assert(samples.some((n) => n > 0 && n < total), 'never caught the paper mid-sweep');
});

check('the sequence completes: paper closed, tied, and laid down', () => {
  tick(4.2);
  const b = shop.bouquet;
  assert(drawnSegments(b.paperInner) === b.paperInner.userData.indexTotal,
    'the inner sheet never closed');
  assert(drawnSegments(b.paperOuter) === b.paperOuter.userData.indexTotal,
    'the outer sheet never closed');
  assert(b.paperInner.visible && b.paperOuter.visible, 'paper should be visible');
  assert(b.ribbon.visible, 'no ribbon');
  assert(b.tails.visible, 'no ribbon tails');
  assert(b.state.phase === 'wrapped', `phase stuck at ${b.state.phase}`);
  // Laid over on its side, along the island's long axis.
  assert(Math.abs(b.group.rotation.z) > 1.2, `not laid down: rotation.z ${b.group.rotation.z}`);
  assert(Math.abs(b.group.rotation.x) < 0.01, 'should not tip toward the viewer');
});

check('the finished bouquet rests on the island, not through it or off it', () => {
  const box = new THREE.Box3();
  shop.root.updateMatrixWorld(true);
  const b = shop.bouquet.group;
  box.setFromObject(b);

  // Above the marble, and not floating.
  assert(box.min.y > ROOM.island.height - 0.05,
    `bouquet sinks into the island: min y ${box.min.y.toFixed(3)} vs top ${ROOM.island.height}`);
  assert(box.min.y < ROOM.island.height + 0.09,
    `bouquet floats above the island by ${(box.min.y - ROOM.island.height).toFixed(3)}m`);

  // Inside the island footprint, with a little tolerance for petal overhang.
  const halfW = ROOM.island.width / 2 + 0.12;
  const halfD = ROOM.island.depth / 2 + 0.12;
  assert(box.min.x > ROOM.island.x - halfW && box.max.x < ROOM.island.x + halfW,
    `bouquet overhangs the ends: x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)}`);
  assert(box.min.z > ROOM.island.z - halfD && box.max.z < ROOM.island.z + halfD,
    `bouquet overhangs front or back: z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}`);

  // And clear of the printer, which is about to run.
  const printerBox = new THREE.Box3().setFromObject(shop.printer);
  assert(!box.intersectsBox(printerBox), 'the bouquet was laid on top of the printer');
});

/**
 * The one that matters. The island carries the displays, the paper roll, the
 * shears, the vase and the printer, and a wrapped bouquet is nearly a metre
 * long — placing it took several attempts before it stopped landing on top of
 * a display vase. Every gatherable flower, at every plausible count, must come
 * to rest on clear marble.
 */
check('a finished bouquet never lands on anything, whatever was gathered', () => {
  const island = {
    x0: ROOM.island.x - ROOM.island.width / 2,
    x1: ROOM.island.x + ROOM.island.width / 2,
    z0: ROOM.island.z - ROOM.island.depth / 2,
    z1: ROOM.island.z + ROOM.island.depth / 2,
  };
  const blooms = [...new Set(
    content.displays.filter((d) => d.pickable !== false).map((d) => d.bloom)
  )];
  assert(blooms.length >= 5, 'expected several gatherable flower types');

  /* Gathered in a colour the variety is actually bucketed in, so the pixel
     heads are in the bouquet rather than the fallback petals. They are the
     largest thing in it — a hydrangea mophead is most of what has to fit on
     the marble — so an off-stock hex would test the easy case. */
  const stockedHex = (bloom) => {
    const d = content.displays.find((x) => x.bloom === bloom && x.pickable !== false);
    return content.stockColors.find((c) => c.id === d.colors[0].id).hex;
  };

  const obstacles = { 'the vase': shop.vase.hero, 'the printer': shop.printer };
  for (const d of shop.displays.values()) {
    if (d.data.kind === 'vase-table') obstacles[d.id] = d.group;
  }

  const box = new THREE.Box3();
  let cases = 0;

  for (const bloom of blooms) {
    for (const count of [1, 6, 12, 18]) {
      shop.clearVase();
      const hex = stockedHex(bloom);
      for (let i = 0; i < count; i += 1) shop.addPickedStem(bloom, hex, i);
      shop.wrap({ instant: true });
      shop.root.updateMatrixWorld(true);
      box.setFromObject(shop.bouquet.group);
      cases += 1;

      for (const [name, obj] of Object.entries(obstacles)) {
        const other = new THREE.Box3().setFromObject(obj);
        assert(!box.intersectsBox(other),
          `${bloom} ×${count} was laid on ${name}`);
      }

      assert(box.min.y > ROOM.island.height - 0.02,
        `${bloom} ×${count} sinks into the marble`);

      // Petals may overhang the counter a little; a whole bouquet may not.
      const overhang = Math.max(
        0,
        island.x0 - box.min.x, box.max.x - island.x1,
        island.z0 - box.min.z, box.max.z - island.z1
      );
      assert(overhang < 0.06,
        `${bloom} ×${count} hangs ${overhang.toFixed(3)}m off the island`);
    }
  }

  assert(cases >= 20, `only covered ${cases} cases`);
  shop.clearVase();
});

check('the paper actually covers the stem cuts', () => {
  shop.clearVase();
  for (let i = 0; i < 6; i += 1) shop.addPickedStem('peony', '#f3b3c6', i);
  shop.wrap({ instant: true });
  shop.root.updateMatrixWorld(true);
  const paper = new THREE.Box3().setFromObject(shop.bouquet.paperInner);
  const stems = shop.bouquet.group.children.filter((c) => c.name === 'stem');
  assert(stems.length > 0, 'no stems in the bouquet');
  for (const stem of stems) {
    const base = stem.getWorldPosition(new THREE.Vector3());
    // Cut ends must sit inside the cone, not poke out below it.
    assert(base.y > paper.min.y - 0.02,
      `a stem cut hangs below the paper by ${(paper.min.y - base.y).toFixed(3)}m`);
  }
});

check('reduced motion jumps straight to the wrapped state', () => {
  shop.clearVase();
  for (let i = 0; i < 4; i += 1) shop.addPickedStem('rose', '#f7d9e0', i);
  assert(shop.wrap({ instant: true }) === 0, 'instant wrap should report no duration');
  const b = shop.bouquet;
  assert(b.state.phase === 'wrapped', 'phase should be wrapped immediately');
  assert(drawnSegments(b.paperInner) === b.paperInner.userData.indexTotal, 'paper not closed');
  assert(b.ribbon.visible && Math.abs(b.group.rotation.z) > 1.2, 'not in the resting pose');
});

check('gathering again after a wrap opens the bouquet back up', () => {
  const holder = shop.vase.holder;
  const b = shop.bouquet;
  assert(b.state.phase === 'wrapped', 'expected a wrapped bouquet to start from');

  shop.addPickedStem('dahlia', '#b83a3f', 99);
  assert(b.state.phase === 'idle', 'the wrap should have been undone');
  assert(holder.children.length === 5, `stems should be back in the vase, got ${holder.children.length}`);
  assert(!b.ribbon.visible && !b.paperInner.visible, 'paper and ribbon should be put away');
  assert(b.group.position.lengthSq() < 1e-6, 'the bouquet did not return to the vase');
  assert(Math.abs(b.group.rotation.z) < 1e-6, 'the bouquet is still lying down');
  assert(drawnSegments(b.paperInner) === 0, 'the paper is still drawn');
});

check('stems return to the poses they had before wrapping', () => {
  shop.clearVase();
  for (let i = 0; i < 5; i += 1) shop.addPickedStem('lisianthus', '#a58ac0', i);
  tick(0.7);   // let the drop-in animations finish
  const before = shop.vase.holder.children.map((s) => ({
    x: s.position.x, y: s.position.y, z: s.position.z, rz: s.rotation.z,
  }));

  shop.wrap();
  tick(4.2);
  shop.resetWrap();

  const after = shop.vase.holder.children.map((s) => ({
    x: s.position.x, y: s.position.y, z: s.position.z, rz: s.rotation.z,
  }));
  assert(after.length === before.length, 'lost a stem in the round trip');
  before.forEach((b, i) => {
    for (const key of ['x', 'y', 'z', 'rz']) {
      near(after[i][key], b[key], 1e-6, `stem ${i} ${key} not restored`);
    }
  });
});

check('clearing the vase also clears any wrap', () => {
  shop.clearVase();
  for (let i = 0; i < 3; i += 1) shop.addPickedStem('rose', '#fff', i);
  shop.wrap({ instant: true });
  shop.clearVase();
  assert(shop.bouquet.state.phase === 'idle', 'wrap survived clearVase');
  assert(shop.vase.holder.children.length === 0, 'stems survived clearVase');
  assert(shop.bouquet.group.children.length === 4, 'stems left behind in the bouquet');
  assert(!shop.bouquet.ribbon.visible, 'ribbon left visible');
});

check('the wrap never produces a non-finite transform', () => {
  shop.clearVase();
  for (let i = 0; i < 7; i += 1) shop.addPickedStem('ranunculus', '#f6c9a8', i);
  shop.wrap();
  for (let i = 0; i < 300; i += 1) {
    shop.update(1 / 60, i / 60);
    const g = shop.bouquet.group;
    for (const v of [g.position.x, g.position.y, g.position.z,
      g.rotation.x, g.rotation.y, g.rotation.z, g.scale.x]) {
      assert(Number.isFinite(v), 'bouquet transform went non-finite');
    }
    for (const stem of g.children) {
      assert(Number.isFinite(stem.position.x) && Number.isFinite(stem.rotation.z),
        'stem transform went non-finite');
    }
  }
  shop.clearVase();
});

check('the wrapping shears and paper roll sit on the island', () => {
  shop.root.updateMatrixWorld(true);
  const halfW = ROOM.island.width / 2;
  const halfD = ROOM.island.depth / 2;
  let checked = 0;
  for (const child of shop.root.children) {
    const isRoll = child.isMesh && child.geometry?.type === 'CylinderGeometry'
      && Math.abs(child.rotation.z - Math.PI / 2) < 0.01;
    if (!isRoll && !(child.isGroup && child.children.length === 4
      && child.position.y > ROOM.island.height - 0.01
      && child.position.y < ROOM.island.height + 0.05)) continue;
    const box = new THREE.Box3().setFromObject(child);
    if (box.max.y > ROOM.island.height + 0.3) continue;   // not on the island
    checked += 1;
    assert(box.min.x > ROOM.island.x - halfW && box.max.x < ROOM.island.x + halfW,
      `a working tool overhangs the island ends: x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)}`);
    assert(box.min.z > ROOM.island.z - halfD && box.max.z < ROOM.island.z + halfD,
      `a working tool overhangs the island sides: z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}`);
  }
  assert(checked >= 1, 'found neither the paper roll nor the shears');
});

check('the printer runs its cycle and resets', () => {
  const paper = shop.printer.userData.paper;
  assert(paper.visible === false, 'paper should be hidden at rest');
  shop.print();
  assert(paper.visible === true, 'printing should show the paper');
  const startZ = paper.position.z;
  for (let i = 0; i < 40; i += 1) shop.update(0.1, i * 0.1);
  assert(shop.printer.userData.printing === 0, 'the print never finished');
  assert(paper.position.z > startZ, 'the paper never fed out');
  shop.resetPrinter();
  assert(paper.visible === false, 'resetPrinter should hide the paper');
});

check('highlighting a display fades its halo up and the others down', () => {
  const id = content.displays[0].id;
  shop.highlight(id);
  for (let i = 0; i < 30; i += 1) shop.update(1 / 60, i / 60);
  const chosen = shop.displays.get(id).halo.material.opacity;
  const other = shop.displays.get(content.displays[1].id).halo.material.opacity;
  assert(chosen > 0.3, `selected halo too faint: ${chosen}`);
  assert(other < 0.05, `unselected halo still showing: ${other}`);
  shop.highlight(null);
});

check('the shop animates without producing NaN', () => {
  const motes = shop.root.getObjectByName('motes');
  assert(motes, 'no dust motes');
  for (let i = 0; i < 120; i += 1) shop.update(1 / 60, i / 60);
  const a = motes.geometry.attributes.position.array;
  for (let i = 0; i < a.length; i += 1) {
    assert(Number.isFinite(a[i]), `mote ${i} went non-finite`);
  }
});

check('frames start with a titled placeholder and accept a photo', () => {
  const withPhoto = JSON.parse(JSON.stringify(content));
  withPhoto.frames = [
    { id: 'a', title: 'No photo yet', caption: 'plaster', photo: '' },
    { id: 'b', title: 'Has a photo', caption: 'hung', photo: 'images/whatever.jpg' },
  ];
  const s2 = buildShop(withPhoto);
  assert(s2.frames.length === 2, `expected 2 frames, got ${s2.frames.length}`);

  for (const mount of s2.frames) {
    // Every frame shows something from the start — never a bare black plane.
    assert(mount.material.map, `${mount.id}: no image on the frame`);
    assert(mount.opening.width > 0 && mount.opening.height > 0, `${mount.id}: no opening size`);
  }
  // A photo path must be swappable at runtime for the owner panel to be live.
  assert(typeof s2.setFramePhoto === 'function', 'setFramePhoto missing');
  assert(s2.setFramePhoto('a', '') === true, 'clearing a photo should succeed');
  assert(s2.setFramePhoto('nope', 'x.jpg') === false, 'unknown frame should report failure');
  assert(s2.frames[0].material.map, 'clearing should restore the placeholder');
});

check('the room still builds when the owner has emptied things out', () => {
  // An owner can legitimately delete every frame or every display, and a stale
  // saved snapshot can arrive missing them entirely. Neither may throw.
  const bare = JSON.parse(JSON.stringify(content));
  bare.frames = [];
  bare.displays = [];
  const empty = buildShop(bare);
  assert(empty.root.children.length > 20, 'the room itself should still be there');
  assert(empty.displays.size === 0, 'no displays expected');
  assert(empty.stops.length >= 4, 'the entrance and fixed stops should remain');

  delete bare.frames;
  delete bare.displays;
  const missing = buildShop(bare);
  assert(missing.root.children.length > 20, 'missing arrays should not stop the build');
});

/* --- the interior, against the reference -------------------------------- --
   The room was rebuilt to match a photograph: low and wide, tumbled travertine
   underfoot rather than tile, window bays with linen down the right, a banded
   onyx table in place of the jade one. These check the parts of that a reader
   would otherwise have to take on trust.
   ---------------------------------------------------------------------- */

check('the room is low and wide, as the reference reads', () => {
  assert(ROOM.height > 3.6 && ROOM.height < 5,
    `${ROOM.height} m is not the low, horizontal space in the reference`);
  const ceiling = [];
  shop.root.traverse((o) => {
    if (o.isMesh && Math.abs(o.position.y - ROOM.height) < 0.02) ceiling.push(o);
  });
  assert(ceiling.length > 20,
    `expected a ceiling and its downlight grid at y = ${ROOM.height}, found ${ceiling.length}`);
});

check('the window bays are really cut through the right wall', () => {
  for (const bay of ROOM.windows) {
    // Mid-pane, not mid-bay: a mullion sits at the centre of an even bay and
    // is supposed to stop a ray.
    const z = bay.z0 + (bay.z1 - bay.z0) * 0.375;
    const stop = { position: [4.5, 1.7, z], target: [ROOM.width / 2 + 0.6, 1.7, z] };
    // The glazing itself is allowed to stop the ray; plaster is not.
    const hits = wallBlocks(shop, stop).filter((h) => (
      h.object.material?.transparent !== true
    ));
    assert(hits.length === 0,
      `the bay at z = ${z} is walled up — hit ${hits.map((h) => h.object.name || h.object.type).join(', ')}`);
  }
});

check('the wall shelves are left exactly where they were', () => {
  // The reference does not show them, and they were asked to stay put: three
  // boards on the right wall at the original heights.
  const boards = [];
  shop.root.traverse((o) => {
    if (!o.isMesh) return;
    if (Math.abs(o.position.x - (ROOM.width / 2 - 0.15)) > 0.01) return;
    if (Math.abs(o.rotation.y - Math.PI / 2) > 0.01) return;
    boards.push(Number(o.position.y.toFixed(2)));
  });
  for (const y of [1.02, 1.74, 2.46]) {
    assert(boards.includes(y), `no shelf board at y = ${y}; found ${boards.join(', ')}`);
  }
  // And nothing on the right wall may cut through them.
  for (const bay of ROOM.windows) {
    assert(bay.z1 < -1.05 || bay.z0 > 2.25,
      `the window bay z ${bay.z0}…${bay.z1} runs through the shelves`);
  }
});

check('the floor is one continuous stone, not a tiled grid', () => {
  const floor = shop.root.getObjectByName('floor');
  assert(floor, 'no floor');
  assert(floor.material.map, 'the floor has no stone on it');
  // A slab period of 2.7 m: three different slabs to a repeat. Repeating on
  // every slab is exactly what made it read as tile.
  const { x } = floor.material.map.repeat;
  const period = ROOM.width / x;
  assert(period > 2 && period < 4,
    `the stone repeats every ${period.toFixed(2)} m, which will read as a pattern`);
  assert(floor.userData.walkable, 'the floor should be clickable to walk to');
  assert(shop.interactive.includes(floor), 'the floor is not in the interactive list');
});

check('the long table is banded onyx, at the working height it always was', () => {
  const top = shop.root.getObjectByName('island-top');
  assert(top.material.map, 'the table top has no stone on it');
  // The top is thicker than the old jade slab — a raw-edged monolith, not a
  // worktop — but the surface a visitor works on has not moved.
  const size = new THREE.Vector3();
  top.geometry.computeBoundingBox();
  top.geometry.boundingBox.getSize(size);
  assert(size.y > 0.12, `the top is ${size.y.toFixed(3)} m thick; it should read as a slab`);
  near(top.position.y + size.y / 2, ROOM.island.height, 0.01, 'working height');

  // Solid sides down to the floor, and the concealed strip under the overhang.
  let faces = 0;
  let glow = 0;
  shop.root.traverse((o) => {
    if (!o.isMesh) return;
    const y = o.position.y;
    const onTable = Math.abs(o.position.x - ROOM.island.x) < ROOM.island.width / 2 + 0.1
      && Math.abs(o.position.z - ROOM.island.z) < ROOM.island.depth / 2 + 0.1;
    if (!onTable) return;
    if (o.material.map && y > 0.2 && y < ROOM.island.height - 0.2) faces += 1;
    if (o.material.isMeshBasicMaterial && o.material.toneMapped === false
      && y > 0.6 && y < ROOM.island.height) glow += 1;
  });
  assert(faces >= 4, `expected four slab faces to the floor, found ${faces}`);
  assert(glow >= 2, `expected the light strip under the overhang, found ${glow}`);
});

check('the customer vase is unmistakably not one of the stock vases', () => {
  const hero = shop.vase.hero;
  assert(hero, 'no customer vase');
  assert(hero.material.transparent !== true,
    'the customer vase should be opaline, not clear like the stock');
  assert(hero.geometry.attributes.color,
    'the opaline gradient is missing from the customer vase');

  // Every stock vase, by contrast, stays clear glass.
  for (const d of shop.displays.values()) {
    const vessel = d.group.children.find((c) => c.isMesh && c.geometry.type === 'LatheGeometry');
    assert(vessel, `${d.id}: no vase`);
    assert(vessel.material.transparent === true, `${d.id}: stock vase is not clear glass`);
  }
});

check('gathered stems stay inside the customer vase', () => {
  // This vase draws in at the shoulder, unlike the straight cylinder it
  // replaced, so a fan that used to clear the rim would now cross the glass.
  shop.clearVase();
  for (let i = 0; i < 18; i += 1) shop.addPickedStem('rose', '#c62430', i);
  const neckY = 0.294;
  const neckR = 0.092;
  for (const stem of shop.vase.holder.children) {
    // Where the stem crosses the neck, measured along its own lean.
    const rise = neckY - stem.position.y;
    const out = Math.hypot(stem.position.x, stem.position.z)
      + Math.abs(Math.sin(Math.max(Math.abs(stem.rotation.x), Math.abs(stem.rotation.z)))) * rise;
    assert(out < neckR,
      `a stem passes through the neck: ${out.toFixed(3)} m out at a ${neckR} m opening`);
  }
  shop.clearVase();
});

check('the wall frames are larger and reproduce the file faithfully', () => {
  assert(shop.frames.length === 3, `expected 3 frames, got ${shop.frames.length}`);
  for (const mount of shop.frames) {
    assert(mount.opening.width > 1 && mount.opening.height > 1.3,
      `frame ${mount.id} is ${mount.opening.width}×${mount.opening.height} m — too small`);
    // Lit and tone-mapped, a photograph came out dimmer and flatter than the
    // same file shown as an <img> in the side panel.
    assert(mount.material.isMeshBasicMaterial,
      `frame ${mount.id} is lit, so its colours will not match the panel`);
    assert(mount.material.toneMapped === false,
      `frame ${mount.id} is tone-mapped, which will desaturate the photograph`);
  }
  // No two frames may overlap, now that they are half again as wide.
  const xs = shop.frames.map((m) => m.mesh.position.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i += 1) {
    assert(xs[i] - xs[i - 1] > shop.frames[0].opening.width,
      'the frames overlap each other');
  }
});

check('every interactive kind gives hover feedback', () => {
  const glowing = new Set();
  for (const o of shop.interactive) {
    const d = o.userData || {};
    if (d.walkable) continue;              // the floor gets a cursor, not a glow
    if (d.displayId) {
      // Flowers glow by way of the halo under their own display.
      assert(shop.displays.get(d.displayId)?.halo, `${d.displayId}: no halo`);
      glowing.add('flower');
      continue;
    }
    const kind = d.calendar ? 'calendar' : d.printer ? 'printer'
      : d.vase ? 'vase' : d.frameId ? 'frame' : d.portal ? 'portal' : 'other';
    assert(d.hoverGlow, `the ${kind} has nothing to light up under the pointer`);
    glowing.add(kind);
  }
  for (const want of ['flower', 'calendar', 'printer', 'vase', 'frame', 'portal']) {
    assert(glowing.has(want), `no hover feedback on the ${want}`);
  }
});

check('hovering lights one thing at a time and can be cleared', () => {
  const frame = shop.interactive.find((o) => o.userData.frameId);
  const printer = shop.interactive.find((o) => o.userData.printer);
  const step = () => { for (let i = 0; i < 40; i += 1) shop.update(1 / 60, i / 60); };

  shop.setHover(frame);
  step();
  assert(frame.userData.hoverGlow.material.opacity > 0.3, 'the hovered frame did not light');
  assert(printer.userData.hoverGlow.material.opacity < 0.05, 'the printer lit too');

  shop.setHover(printer);
  step();
  assert(frame.userData.hoverGlow.material.opacity < 0.05, 'the frame stayed lit');

  shop.setHover(null);
  step();
  assert(printer.userData.hoverGlow.material.opacity < 0.05, 'a hover was left lit');
});

/* --- the stock ---------------------------------------------------------- --
   The shop is meant to look full: every colour of every variety standing in
   real numbers, grouped by variety, no vase looking picked over. The counts
   are content, so this checks the content and the room agree about them.
   ---------------------------------------------------------------------- */

/* A variety is bucketed in exactly the colours it has pixel art for, so this
   is both what the shop promises and what public/flowers/ can draw. */
const REQUIRED_STOCK = {
  rose: ['Red', 'Pink', 'Purple', 'White', 'Orange'],
  peony: ['Light Pink', 'White'],
  dahlia: ['Red', 'Pink', 'Orange'],
  hydrangea: ['Purple', 'Green', 'Dark Blue', 'Pink'],
  tropical: ['Red', 'Pink', 'Green', 'White'],
  lisianthus: ['Purple', 'Pink'],
  delphinium: ['Light Blue', 'Dark Blue', 'Purple'],
  gerbera: ['Pink', 'Peach', 'Yellow', 'Red'],
  tulip: ['Red', 'Orange', 'Pink', 'Purple'],
  orchid: ['White', 'Pink'],
  calla: ['Yellow', 'White'],
  iris: ['Purple', 'Yellow'],
  ranunculus: ['Orange'],
  sweetpea: ['Light Pink'],
  craspedia: ['Yellow'],
};

check('every variety and colour the shop promises is standing in the room', () => {
  // Built from the room, not from the content, so a colour that fails to reach
  // a vase counts as missing.
  const built = new Map();
  for (const d of shop.displays.values()) {
    for (const stem of d.bunch.children) {
      const key = `${d.data.bloom}/${stem.userData.colorLabel}`;
      built.set(key, (built.get(key) || 0) + 1);
    }
  }

  const gaps = [];
  for (const [bloom, colours] of Object.entries(REQUIRED_STOCK)) {
    for (const colour of colours) {
      // "Light Pink" satisfies pink: it is the same bucket to a customer.
      const n = (built.get(`${bloom}/${colour}`) || 0)
        + (colour === 'Pink' ? built.get(`${bloom}/Light Pink`) || 0 : 0);
      if (n < 5) gaps.push(`${bloom} ${colour} (${n})`);
    }
  }
  assert(gaps.length === 0, `too few stems of: ${gaps.join(', ')}`);
});

check('no colour group is sparse, and none is absurd', () => {
  for (const d of shop.displays.values()) {
    if (d.data.pickable === false) continue;
    const counts = new Map();
    for (const stem of d.bunch.children) {
      counts.set(stem.userData.colorLabel, (counts.get(stem.userData.colorLabel) || 0) + 1);
    }
    for (const [label, n] of counts) {
      assert(n >= 5, `${d.id}: only ${n} ${label} stems — that reads as picked over`);
      assert(n <= 10, `${d.id}: ${n} ${label} stems is beyond a bucket`);
    }
  }
});

check('a mixed vase groups its colours instead of speckling them', () => {
  const mixed = [...shop.displays.values()].find((d) => (d.colours || []).length >= 3);
  assert(mixed, 'no vase holds three colours of one variety');
  // Each colour should occupy its own arc of the vase: the spread of angles
  // within a group has to be smaller than the whole circle it sits in.
  const arcs = new Map();
  for (const stem of mixed.bunch.children) {
    const angle = Math.atan2(stem.position.z, stem.position.x);
    const list = arcs.get(stem.userData.colorLabel) || [];
    list.push(angle);
    arcs.set(stem.userData.colorLabel, list);
  }
  for (const [label, angles] of arcs) {
    const mean = Math.atan2(
      angles.reduce((s, a) => s + Math.sin(a), 0) / angles.length,
      angles.reduce((s, a) => s + Math.cos(a), 0) / angles.length
    );
    const worst = Math.max(...angles.map((a) => Math.abs(
      Math.atan2(Math.sin(a - mean), Math.cos(a - mean))
    )));
    assert(worst < (Math.PI * 2) / arcs.size,
      `${mixed.id}: the ${label} stems are spread through the whole vase`);
  }
});

check('the room is fuller than it was, and not so full it will not run', () => {
  let stems = 0;
  for (const d of shop.displays.values()) stems += d.bunch.children.length;
  assert(stems > 200, `${stems} stems is still a sparse shop`);
  assert(stems < 340, `${stems} stems will cost too many draw calls`);
});

check('shelf arrangements fit under the board above them', () => {
  const boards = [1.02, 1.74, 2.46];
  const box = new THREE.Box3();
  shop.root.updateMatrixWorld(true);
  for (const d of shop.displays.values()) {
    if (d.data.kind !== 'shelf') continue;
    box.setFromObject(d.group);
    const above = boards.find((y) => y > d.group.position.y + 0.1);
    assert(above !== undefined, `${d.id}: no board above it`);
    assert(box.max.y < above - 0.02,
      `${d.id} grows to ${box.max.y.toFixed(2)} m, through the board at ${above}`);
  }
});

check('floor vases stand clear of each other and of the furniture', () => {
  const placed = [];
  for (const d of shop.displays.values()) {
    if (d.data.kind !== 'floor') continue;
    const p = d.group.position;
    for (const other of placed) {
      const gap = Math.hypot(p.x - other.x, p.z - other.z);
      assert(gap > 0.9, `two floor vases are ${gap.toFixed(2)} m apart`);
    }
    // Not standing inside the seating, the column, the tree or the low table.
    for (const box of shop.colliders) {
      const inside = p.x > box.min.x && p.x < box.max.x
        && p.z > box.min.z && p.z < box.max.z && box.max.y > 0.5;
      // Its own collider, of course, contains it.
      const isOwn = Math.abs((box.min.x + box.max.x) / 2 - p.x) < 0.01
        && Math.abs((box.min.z + box.max.z) / 2 - p.z) < 0.01;
      assert(!inside || isOwn, `${d.id} stands inside a collider`);
    }
    placed.push({ x: p.x, z: p.z });
  }
});

check('the guided tour still starts, ends, and takes the displays in runs', () => {
  const ids = shop.stops.map((s) => s.id);
  assert(ids[0] === 'entrance' && ids[ids.length - 1] === 'portal', 'tour endpoints moved');
  assert(shop.stops.length >= 20, `only ${shop.stops.length} stops`);

  /* Adding stock lengthened the tour, so the ordering matters more than it
     did: all the table vases, then all the shelf, then all the floor. A kind
     that appears in two separate runs means the visitor is being sent back and
     forth across the room. (The tour does cross the room once, from the
     shelves to the calendar on the back wall — that is the original ordering
     and is left alone.) */
  const runs = [];
  for (const stop of shop.stops) {
    const kind = stop.displayId ? shop.displays.get(stop.displayId).data.kind : null;
    if (kind && runs[runs.length - 1] !== kind) runs.push(kind);
  }
  assert(runs.length === new Set(runs).size,
    `the tour returns to a kind it had left: ${runs.join(' → ')}`);
});

/* --- navigation --------------------------------------------------------- --
   Free walking and the guided tour have to coexist: walking off the tour must
   not lose your place in it, and the tour must not take the movement keys
   away from you.
   ---------------------------------------------------------------------- */

function makeRig() {
  const camera = new THREE.PerspectiveCamera(52, 1.6, 0.05, 140);
  const rig = new CameraRig(camera, document.createElement('div'), { eyeHeight: 1.58 });
  rig.setColliders(shop.colliders);
  rig.bounds = shop.bounds;
  rig.jumpTo(shop.entranceStop);
  return rig;
}

check('a movement key walks from a guided stop, and the stops survive it', () => {
  const rig = makeRig();
  rig.goTo(shop.islandStop);
  for (let i = 0; i < 200; i += 1) rig.update(1 / 60);
  assert(rig.mode === 'guided', 'arriving at a stop should leave you on the tour');
  const parked = rig.position.clone();

  // Walk forward. No mode to turn on first.
  rig._keys.add('ArrowUp');
  for (let i = 0; i < 60; i += 1) rig.update(1 / 60);
  rig._keys.delete('ArrowUp');
  assert(rig.mode === 'free', 'an arrow key did not hand over to walking');
  assert(rig.position.distanceTo(parked) > 0.4,
    `barely moved: ${rig.position.distanceTo(parked).toFixed(2)} m`);

  // And the tour still works from wherever you ended up.
  rig.goTo(shop.stops[3]);
  for (let i = 0; i < 300; i += 1) rig.update(1 / 60);
  assert(rig.mode === 'guided', 'Next did not put you back on the tour');
  near(rig.position.x, shop.stops[3].position[0], 0.02, 'did not reach the stop');
});

check('walking is held off while a space transition is playing', () => {
  const rig = makeRig();
  rig.walkEnabled = false;
  rig._keys.add('ArrowUp');
  const before = rig.position.clone();
  for (let i = 0; i < 60; i += 1) rig.update(1 / 60);
  rig._keys.delete('ArrowUp');
  assert(rig.mode === 'guided' && rig.position.distanceTo(before) < 1e-6,
    'a held key walked the camera during a transition');
});

check('clicking the floor walks there, and stops at what is in the way', () => {
  const rig = makeRig();
  const yaw = rig.yaw;

  // Somewhere open, in front of the entrance.
  const open = new THREE.Vector3(-2, 0, 6);
  const seconds = rig.walkTo(open);
  assert(seconds > 0, 'a walk across the room took no time');
  for (let i = 0; i < 400; i += 1) rig.update(1 / 60);
  near(rig.position.x, open.x, 0.06, 'walked to the wrong x');
  near(rig.position.z, open.z, 0.06, 'walked to the wrong z');
  near(rig.position.y, 1.58, 0.001, 'left the floor');
  near(rig.yaw, yaw, 1e-6, 'the walk turned the camera; it should keep your view');
  assert(rig.mode === 'free', 'a walk should leave you free to keep walking');

  // Now aim at the floor on the far side of the long table. The visitor should
  // end up at the near edge of it, not standing inside the stone.
  const through = new THREE.Vector3(ROOM.island.x, 0, ROOM.island.z - 2);
  rig.walkTo(through);
  for (let i = 0; i < 400; i += 1) rig.update(1 / 60);
  const stopped = rig.position.z;
  assert(stopped > ROOM.island.z + ROOM.island.depth / 2,
    `walked into the table: stopped at z = ${stopped.toFixed(2)}`);
});

check('a walk cannot leave the room', () => {
  const rig = makeRig();
  rig.walkTo(new THREE.Vector3(40, 0, 40));
  for (let i = 0; i < 600; i += 1) rig.update(1 / 60);
  assert(Math.abs(rig.position.x) < ROOM.width / 2, 'walked through the right wall');
  assert(Math.abs(rig.position.z) < ROOM.depth / 2, 'walked through the front wall');
});

/* --- calendar board ----------------------------------------------------- */

check('the wall board renders at a sane size', () => {
  const canvas = renderBoard(content, 2026, 8, { selectedKey: '2026-09-10' });
  assert(canvas.width > 800 && canvas.height > 600, 'board canvas too small');
  const ratio = canvas.width / canvas.height;
  near(ratio, 2.06 / 1.48, 0.05, 'board aspect should match the plaster panel');
});

/* --- corridor ----------------------------------------------------------- */

const corridor = buildCorridor(content);

check('the threshold has a four-beat dolly that moves forward', () => {
  assert(corridor.path.length === 4, `expected 4 beats, got ${corridor.path.length}`);
  for (let i = 1; i < corridor.path.length; i += 1) {
    assert(corridor.path[i].position[2] < corridor.path[i - 1].position[2],
      `beat ${i} does not advance through the door`);
  }
  // Reversing the path must also advance, for the walk back.
  const back = [...corridor.path].reverse();
  for (let i = 1; i < back.length; i += 1) {
    assert(back[i].position[2] > back[i - 1].position[2], `return beat ${i} does not advance`);
  }
});

check('the door is ajar and breathes', () => {
  const before = [];
  corridor.root.traverse((o) => { if (o.isGroup) before.push(o.rotation.y); });
  corridor.update(1 / 60, 0);
  const pivot = corridor.root.children.find((c) => c.isGroup && Math.abs(c.rotation.y) > 0.3);
  assert(pivot, 'the door does not stand ajar');
  const first = pivot.rotation.y;
  corridor.update(1 / 60, 3.2);
  assert(pivot.rotation.y !== first, 'the door never moves');
  assert(Math.abs(pivot.rotation.y - first) < 0.1, 'the door swings too much');
});

check('the corridor geometry is finite', () => {
  corridor.root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count * 3; i += 1) {
      assert(Number.isFinite(pos.array[i]), `${o.name || o.type}: non-finite vertex`);
    }
  });
});

/* --- garden ------------------------------------------------------------- */

const garden = buildGarden(content);

check('the garden builds one bed per configured plot', () => {
  assert(garden.plots.length === content.garden.plotCount,
    `expected ${content.garden.plotCount} beds, got ${garden.plots.length}`);
  for (const plot of garden.plots) {
    assert(plot.host, `bed ${plot.index} has nowhere to put a plant`);
    assert(plot.soilTop.userData.plotIndex === plot.index, `bed ${plot.index} is mislabelled`);
  }
});

check('garden stops reach every bed, the gate and the shop link', () => {
  for (const plot of garden.plots) {
    assert(garden.stops.some((s) => s.plotIndex === plot.index), `bed ${plot.index} unreachable`);
  }
  assert(garden.stops.some((s) => s.kind === 'portal'), 'no way back to the shop');
  const link = garden.stops.find((s) => s.kind === 'link');
  assert(link && link.link === content.contact.siteUrl, 'the shop link stop is missing');
});

check('garden stops sit inside the walls', () => {
  const halfW = GARDEN.width / 2;
  const halfD = GARDEN.depth / 2;
  for (const stop of garden.stops) {
    const [x, y, z] = stop.position;
    assert(Math.abs(x) < halfW && Math.abs(z) < halfD, `${stop.id}: outside the garden walls`);
    assert(y > 1.2 && y < 2.1, `${stop.id}: implausible eye height ${y}`);
  }
});

check('the garden gate is really cut through the garden wall', () => {
  const gate = garden.stops.find((s) => s.kind === 'portal');
  assert(gate, 'no gate stop');
  const hits = wallBlocks(garden, gate);
  assert(hits.length === 0,
    `the gate is walled up — ray hit ${hits.map((h) => h.object.name || h.object.type).join(', ')}`);
});

check('garden colliders block the walls, beds and basin', () => {
  const inside = (x, z) => garden.colliders.some((b) =>
    x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z);
  assert(inside(0, 6.4), 'the basin is walk-through');
  assert(inside(0, 1.2), 'a raised bed is walk-through');
  assert(inside(0, -13.2), 'the back wall is walk-through');
  assert(!inside(0, 10), 'the path from the gate should be clear');
});

check('plants appear, change with growth, and can be removed', () => {
  const plot = garden.plots[0];
  assert(plot.plant === null, 'beds should start empty');

  garden.setPlant(0, { recipeId: 'rose', hex: '#f7d9e0', stage: 0, scale: 0.2, openness: 0 });
  assert(plot.plant && plot.plant.children.length > 0, 'sowing showed nothing');
  const seedChildren = plot.plant.children.length;

  garden.setPlant(0, { recipeId: 'rose', hex: '#f7d9e0', stage: 4, scale: 1, openness: 1 });
  assert(plot.plant.children.length > seedChildren,
    `a bloomed bed (${plot.plant.children.length}) should hold more than a sown one (${seedChildren})`);
  let verts = 0;
  plot.plant.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    verts += pos.count;
    for (let i = 0; i < pos.count * 3; i += 1) {
      assert(Number.isFinite(pos.array[i]), 'non-finite vertex in a grown plant');
    }
  });
  assert(verts > 100, 'a bloomed plant should have real geometry');

  garden.setPlant(0, null);
  assert(plot.plant === null, 'clearing the bed left a plant behind');
});

check('replanting does not stack sway animations', () => {
  for (let i = 0; i < 6; i += 1) {
    garden.setPlant(1, { recipeId: 'peony', hex: '#f3b3c6', stage: 3, scale: 0.8, openness: 0.5 });
  }
  garden.update(1 / 60, 2.5);
  const r = garden.plots[1].plant.rotation;
  assert(Number.isFinite(r.z) && Math.abs(r.z) < 0.1, `sway out of range: ${r.z}`);
  garden.setPlant(1, null);
  garden.update(1 / 60, 3);   // must not throw with an empty bed
});

check('the garden animates without producing NaN', () => {
  for (let i = 0; i < 120; i += 1) garden.update(1 / 60, i / 60);
  garden.root.traverse((o) => {
    if (!o.isPoints) return;
    const a = o.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 1) {
      assert(Number.isFinite(a[i]), 'pollen went non-finite');
    }
  });
});

check('the game drives the real garden scene end to end', () => {
  const game = new GardenGame(content, garden);
  const variety = game.seedVarieties[0];
  assert(game.plant(0, variety).ok, 'could not sow');
  assert(garden.plots[0].plant, 'the scene did not show the sown seed');

  game.state.plots[0].growthHours = 999;
  game.state.plots[0].lastUpdate = Date.now();
  game.syncScene(0);
  assert(garden.plots[0].plant.children.length > 1, 'a bloomed bed should be full');

  assert(game.harvest(0).ok, 'could not cut the bloom');
  assert(garden.plots[0].plant === null, 'cutting left the plant in the bed');
});

/* --- report ------------------------------------------------------------- */

console.log(`\n  scenes: ${pass} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
