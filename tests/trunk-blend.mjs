/* Checks the two places the tree trunk meets the room.

   The trunk is a photoscan with one closed end and one torn, open one, and it
   is stretched across a 4.4 m room and pushed through a stepped plaster bank
   at the bottom and a flat ceiling at the top. Neither end is meant to be
   seen. This measures the tear straight off the .glb, works out where the
   scene's own arithmetic puts it, and fails if it is anywhere a visitor could
   see into it — so re-exporting the asset, or retuning the trunk by eye,
   cannot quietly open the bottom of the tree again.

   Then the same for the moss: both collars are built against the real plaster
   and checked to be lying on it rather than floating over it or sunk into it.

   Run with `npm test`. No WebGL: the loader is the vendored one, reached by
   path, and the shop is built without a renderer as the other scene tests
   build it. */

import { readFileSync } from 'node:fs';
import { installDom } from './dom-stub.mjs';

installDom();

/* GLTFLoader reaches for `self.URL` to hand each of its textures a blob, and
   then waits on an <img> for every one before it will give back a scene. The
   DOM stub's <img> never answers, which is a deadlock rather than a failure —
   so the images are answered here, immediately, and left empty.

   None of them matter: this file measures vertices. The loader's complaint
   about what it got is kept out of the run. */
globalThis.self = globalThis;
URL.createObjectURL = () => 'blob:trunk-blend';
URL.revokeObjectURL = () => {};
const createElementNS = globalThis.document.createElementNS;
globalThis.document.createElementNS = (ns, tag) => {
  if (tag !== 'img') return createElementNS(ns, tag);
  return {
    width: 0,
    height: 0,
    style: {},
    setAttribute() {},
    removeAttribute() {},
    addEventListener(type, fn) { if (type === 'load') setTimeout(fn, 0); },
    removeEventListener() {},
  };
};
const noise = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('load texture')) return;
  noise(...args);
};

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { buildShop, ROOM, fitTrunk, addMossCollars } from '../js/scene-shop.js';
import { DEFAULT_CONTENT as content } from '../js/content.js';

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

/* --- the pillar's address ------------------------------------------------ --
   Restated here rather than imported, because the scene states it as a literal
   too. The check below is what keeps the two honest: the concrete column that
   stands in for the trunk until it downloads is built at the same spot, so if
   the pillar is ever moved and this is not, there will be no column here and
   the whole file fails rather than quietly measuring bare floor. */
const TRUNK = { x: -3.9, z: -5.4 };

/* --- the model ---------------------------------------------------------- */

const glb = readFileSync(new URL('../public/models/tree_trunk.glb', import.meta.url));
const model = (await new Promise((resolve, reject) => new GLTFLoader().parse(
  glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '', resolve, reject,
))).scene;
model.updateMatrixWorld(true);

const bounds = new THREE.Box3().setFromObject(model, true);
const size = bounds.getSize(new THREE.Vector3());
const middle = bounds.getCenter(new THREE.Vector3());

/**
 * The highest point of the scan's torn end, in the model's own space.
 *
 * Found from the boundary edges — the ones with a single triangle to them
 * rather than two — welded by position first, because a scan carries split
 * vertices all over its surface and counting raw indices would call every
 * seam an open edge.
 */
function tornRimTop() {
  const v = new THREE.Vector3();
  let top = -Infinity;
  let open = 0;

  model.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const index = o.geometry.index ? o.geometry.index.array : null;
    const triangles = index ? index.length / 3 : pos.count / 3;

    const world = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      world[i * 3] = v.x; world[i * 3 + 1] = v.y; world[i * 3 + 2] = v.z;
    }

    const welded = new Array(pos.count);
    const key = (i) => {
      if (welded[i] === undefined) {
        welded[i] = `${Math.round(world[i * 3] * 1e5)},`
          + `${Math.round(world[i * 3 + 1] * 1e5)},`
          + `${Math.round(world[i * 3 + 2] * 1e5)}`;
      }
      return welded[i];
    };

    const edges = new Map();
    for (let t = 0; t < triangles; t += 1) {
      const a = index ? index[t * 3] : t * 3;
      const b = index ? index[t * 3 + 1] : t * 3 + 1;
      const c = index ? index[t * 3 + 2] : t * 3 + 2;
      for (const [i, j] of [[a, b], [b, c], [c, a]]) {
        const ki = key(i);
        const kj = key(j);
        const id = ki < kj ? `${ki}|${kj}` : `${kj}|${ki}`;
        const seen = edges.get(id);
        if (seen) seen.count += 1;
        else edges.set(id, { count: 1, i, j });
      }
    }

    for (const edge of edges.values()) {
      if (edge.count !== 1) continue;
      open += 1;
      top = Math.max(top, world[edge.i * 3 + 1], world[edge.j * 3 + 1]);
    }
  });

  return { top, open };
}

const rim = tornRimTop();
const fit = fitTrunk(size, bounds.min.y, ROOM.height);
const toRoom = (modelY) => modelY * fit.up + fit.offsetY;

const rimTop = toRoom(rim.top);
const trunkBottom = toRoom(bounds.min.y);
const trunkTop = toRoom(bounds.max.y);

check('the scan is open at one end only', () => {
  assert(rim.open > 0, 'no boundary edges at all — is this still the torn scan?');
  /* The tear is in the bottom fifth. If a re-export ever caps it, or tears the
     other end too, the numbers this file is built on stop meaning anything. */
  const rise = (rim.top - bounds.min.y) / size.y;
  assert(rise < 0.5, `the tear reaches ${rise.toFixed(3)} of the way up the scan, not the bottom fifth`);
});

/* --- the room ----------------------------------------------------------- */

const shop = buildShop(content).root;
/* The raycaster reads `matrixWorld`, and nothing has asked the room for one
   yet — without this the steps are probed at the lathe's origin rather than
   where they stand, and every ray below sails past them. */
shop.updateMatrixWorld(true);
const steps = shop.getObjectByName('plaster-steps');

check('the steps are in the room to be measured', () => {
  assert(steps && steps.isMesh, "no mesh named 'plaster-steps' in the shop");
});

check('the pillar still stands where this file looks for it', () => {
  const columns = [];
  shop.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'BoxGeometry') return;
    if (Math.abs(o.position.x - TRUNK.x) < 0.01 && Math.abs(o.position.z - TRUNK.z) < 0.01) {
      columns.push(o);
    }
  });
  assert(columns.length === 1, `expected one column at (${TRUNK.x}, ${TRUNK.z}), found ${columns.length}`);
});

/**
 * The topmost plaster under a point, in the room's frame — the surface a
 * visitor sees, and so the one that has to be doing the hiding.
 */
const probe = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
function plasterUnder(x, z) {
  probe.set(new THREE.Vector3(x, ROOM.height, z), down);
  const hits = probe.intersectObject(steps, false);
  return hits.length ? hits[0].point.y : null;
}

/* The trunk's own footprint, taken off the model rather than off TRUNK_WIDTH,
   because the widest reach from the axis is not half the width of the box. */
let footprint = 0;
model.traverse((o) => {
  if (!o.isMesh) return;
  const pos = o.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
    footprint = Math.max(footprint, Math.hypot(
      (v.x - middle.x) * fit.across,
      (v.z - middle.z) * fit.across,
    ));
  }
});

let shallowest = Infinity;
let offPlaster = 0;
for (let i = 0; i < 96; i += 1) {
  const a = (i / 96) * Math.PI * 2;
  for (let r = 0; r <= footprint + 1e-9; r += footprint / 6) {
    const y = plasterUnder(TRUNK.x + Math.cos(a) * r, TRUNK.z + Math.sin(a) * r);
    if (y === null) offPlaster += 1;
    else shallowest = Math.min(shallowest, y);
  }
}

check('the trunk comes up through plaster the whole way round', () => {
  assert(offPlaster === 0, `${offPlaster} samples of the footprint found no plaster beneath them`);
  assert(Number.isFinite(shallowest), 'no plaster found under the trunk at all');
});

check('the torn end finishes inside the steps', () => {
  assert(
    rimTop < shallowest - 0.10,
    `the tear surfaces at y ${rimTop.toFixed(3)} and the shallowest plaster over it is `
      + `${shallowest.toFixed(3)} — it wants to be at least 0.10 below that`,
  );
});

check('the trunk is not seen to start or stop', () => {
  assert(trunkBottom < -0.2, `the base sits at y ${trunkBottom.toFixed(3)}, not clear of the floor`);
  assert(
    trunkTop > ROOM.height + 0.1,
    `the top sits at y ${trunkTop.toFixed(3)}, not clear of the ${ROOM.height} m ceiling`,
  );
});

check('nothing is left coplanar to fight over', () => {
  /* The floor is at 0 and the ceiling at ROOM.height; the trunk's own ends
     have to be a visible distance off both, not merely on the far side. */
  assert(Math.abs(trunkBottom) > 0.05, 'the base is level with the floor');
  assert(Math.abs(trunkTop - ROOM.height) > 0.05, 'the top is level with the ceiling');
});

/* --- the moss ----------------------------------------------------------- --
   The collars are built inside `addTreeTrunk`, behind the loader, so the trunk
   is stood up here the same way that does it — through the same exported
   `fitTrunk`, so the placement cannot drift apart from the real one — and the
   collars asked for against the real plaster.
   ---------------------------------------------------------------------- */

model.scale.set(fit.across, fit.up, fit.across);
model.position.set(-middle.x * fit.across, fit.offsetY, -middle.z * fit.across);
const trunk = new THREE.Group();
trunk.position.set(TRUNK.x, 0, TRUNK.z);
trunk.rotation.y = 0.6;
trunk.add(model);
shop.add(trunk);

const collars = addMossCollars(shop, trunk, TRUNK.x, TRUNK.z, ROOM.height, steps);
const [cap, base] = collars.children;

check('there is a collar at each crossing', () => {
  assert(collars.children.length === 2, `expected two collars, got ${collars.children.length}`);
  assert(Math.abs(collars.position.x - TRUNK.x) < 1e-9, 'the collars are off the trunk axis');
  assert(Math.abs(collars.position.z - TRUNK.z) < 1e-9, 'the collars are off the trunk axis');
  for (const collar of collars.children) {
    const pos = collar.geometry.attributes.position.array;
    assert(pos.length > 0, 'an empty collar');
    assert(pos.every(Number.isFinite), 'a collar vertex came out NaN');
  }
});

/** Every vertex of a collar, in the room's frame. */
function vertices(collar) {
  const pos = collar.geometry.attributes.position;
  const out = [];
  for (let i = 0; i < pos.count; i += 1) {
    out.push({
      x: pos.getX(i) + collars.position.x,
      y: pos.getY(i),
      z: pos.getZ(i) + collars.position.z,
      t: collar.geometry.attributes.uv.getY(i),
    });
  }
  return out;
}

check('the cap is gathered under the ceiling, not through it', () => {
  const all = vertices(cap);
  const highest = Math.max(...all.map((v) => v.y));
  const lowest = Math.min(...all.map((v) => v.y));
  assert(highest < ROOM.height, `a cap vertex reaches y ${highest.toFixed(4)}, above the ceiling`);
  assert(
    highest > ROOM.height - 0.05,
    `the cap stops at y ${highest.toFixed(4)}, short of the ceiling it is meant to meet`,
  );
  assert(lowest > ROOM.height - 0.6, `the cap hangs down to y ${lowest.toFixed(3)}, further than it should`);
  assert(highest - lowest > 0.1, 'the cap is flat — no cove to it at all');
});

check('the base is lying on the plaster', () => {
  const fringe = vertices(base).filter((v) => v.t > 0.999);
  assert(fringe.length > 0, 'the base collar has no fringe ring');
  for (const v of fringe) {
    const plaster = plasterUnder(v.x, v.z);
    assert(plaster !== null, 'a fringe vertex hangs off the side of the steps');
    assert(v.y >= plaster, `a fringe vertex is sunk ${(plaster - v.y).toFixed(4)} into the plaster`);
    assert(
      v.y - plaster < 0.4,
      `a fringe vertex floats ${(v.y - plaster).toFixed(3)} over the plaster under it`,
    );
  }
});

check('the base follows the steps rather than one height', () => {
  const fringe = vertices(base).filter((v) => v.t > 0.999).map((v) => v.y);
  /* The plaster around this trunk climbs from 0.49 to 1.08, so a collar that
     came out level is one that is not being measured against anything. */
  assert(
    Math.max(...fringe) - Math.min(...fringe) > 0.25,
    'the base collar is level — it is not following the treads',
  );
});

check('neither collar is a circle', () => {
  for (const [name, collar] of [['cap', cap], ['base', base]]) {
    const outer = vertices(collar)
      .filter((v) => v.t > 0.999)
      .map((v) => Math.hypot(v.x - TRUNK.x, v.z - TRUNK.z));
    const spread = Math.max(...outer) - Math.min(...outer);
    assert(spread > 0.04, `the ${name} fringe is round to within ${spread.toFixed(4)} m`);
  }
});

check('the collars keep the trunk between themselves', () => {
  /* The point of them: the moss covers the crossings, and nothing else. */
  const capLow = Math.min(...vertices(cap).map((v) => v.y));
  const baseHigh = Math.max(...vertices(base).map((v) => v.y));
  assert(capLow > baseHigh, 'the collars overlap — they are not at two ends of a 4.4 m trunk');
  assert(baseHigh > shallowest, 'the base collar never reaches the plaster it is covering');
});

console.error = noise;

if (failures.length) {
  console.log(`\n  trunk: ${pass} passed, ${failures.length} failed\n`);
  for (const line of failures) console.log(`    ${line}`);
  console.log('');
  process.exitCode = 1;
} else {
  console.log(`\n  trunk: ${pass} passed, 0 failed\n`);
}
