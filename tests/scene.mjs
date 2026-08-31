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
  return ray.intersectObject(scene.root, true).filter((h) => {
    if (!h.object.isMesh) return false;
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
    garden.setPlant(1, { recipeId: 'peony', hex: '#eec3cb', stage: 3, scale: 0.8, openness: 0.5 });
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
