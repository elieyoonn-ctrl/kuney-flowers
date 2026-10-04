/* ==========================================================================
   The shop interior.

   A low, wide, warm-white room in the manner of the reference: everything in
   one lime plaster, a flat ceiling pricked with a grid of small recessed
   downlights, tall window bays with floor-length linen on the right, a curved
   flight of plaster steps on the left with a vase on each of its upper treads
   and a bark-clad column standing up through them, an olive tree in a weathered pot,
   a low white table with cylindrical stools, and — at the centre — the long
   banded-onyx table where flowers are gathered, wrapped and invoiced.

   The floor is tumbled travertine laid as large slabs: no grout, edges worn
   pale, and a different figure in every slab. See `tex.tumbledTravertine`.

   The oculus light is a real shadow-casting directional light shining through
   a hole in the ceiling geometry, so the bright ellipse on the floor is cast,
   not painted.
   ========================================================================== */

import * as THREE from 'three';
import * as tex from './textures.js';
import {
  slab, planeWithHole, turned, amphitheatre,
  VASE_PROFILES, SPECIAL_VASE_PROFILE, POT_PROFILE, seeded,
} from './geometry.js';
import { createGroupedBunch, createStem, createOliveTree } from './flowers.js';
import {
  displayColorGroups, colorById, interiorColour, floorJointColour, floorJointContrast,
} from './content.js';
import { CameraRig } from './camera-rig.js';

export const ROOM = {
  width: 16,      // x: -8 .. 8
  depth: 22,      // z: -11 .. 11
  // Low and wide, as the reference reads: the old 6.2 m made a tall well of a
  // room, where the photograph is a long horizontal space you look across.
  height: 4.4,
  oculus: { radius: 1.85, x: 0.4, z: -1.2 },
  entrance: { z: 9.4 },
  island: { x: 0, z: 1.6, width: 4.4, depth: 1.06, height: 0.92 },
  portal: { x: -7.94, z: 5.4, width: 1.34, height: 2.55 },
  /* Window bays on the right wall, given as spans in z. They are deliberately
     placed clear of the wall shelves (z −1.05 … 2.25), which stay exactly
     where they were. */
  windows: [
    { z0: -9.6, z1: -2.4 },
    { z0: 3.4, z1: 9.6 },
  ],
  window: { sill: 0.35, head: 3.55 },
};

const EYE = 1.58;

/* Phones and small tablets. iOS Safari kills a tab outright — "A problem
   repeatedly occurred" — once decoded images and GPU uploads pass a few
   hundred MB, so these get the smaller texture sets, smaller shadow maps and
   one photographic download decoding at a time. */
const LOW_MEMORY = typeof window !== 'undefined' && (
  window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ||
  Math.min(window.innerWidth, window.innerHeight) < 600 ||
  (navigator.deviceMemory ?? 8) <= 4
);

/**
 * Load photographic textures one after another rather than all at once. Each
 * JPEG is decoded to raw RGBA before upload; queuing them keeps only one of
 * those buffers alive at a time instead of seven.
 */
let textureQueue = Promise.resolve();
const queuedLoader = new THREE.TextureLoader();
function loadQueued(path, onLoad, onProgress, onError) {
  textureQueue = textureQueue.then(() => new Promise((done) => {
    queuedLoader.load(
      path,
      (t) => { try { onLoad(t); } finally { done(); } },
      onProgress,
      (err) => { try { onError?.(err); } finally { done(); } }
    );
  }));
}

/* --- the plaster steps, on the left ------------------------------------- --
   A curved four-tread bank, lathed as one stepped profile swept through part
   of a circle. Because `amphitheatre` rises outward from the lathe's centre,
   the lowest tread is the innermost one and the form faces that centre — so
   moving the centre is how the steps are aimed.

   They used to be centred hard against the left wall and swept the other way,
   which pointed the first tread at the plaster and turned the 1.6 m back of
   them toward the room. Rotated anticlockwise and brought off the wall, the
   centre now sits out on the open floor: the risers face the room and the long
   table, the bank climbs away toward the back-left corner, and the bark
   column at (-3.9, -5.4) comes up through the third tread, which runs on past
   it to either side — the steps wrap the column rather than stopping at it.
   ---------------------------------------------------------------------- */

const STAIRS = {
  x: -2.9,
  z: -3.0,
  innerRadius: 1.1,
  tiers: 4,
  tread: 0.6,
  rise: 0.36,
  back: 0.5,          // a flight of steps, not a room to sit around
  thetaStart: Math.PI * 0.89,
  thetaLength: Math.PI * 0.72,
};

/** Radius of the middle of tread `tier` — tread 0 is the one on the floor. */
const stepRadius = (tier) => STAIRS.innerRadius + STAIRS.tread * (tier + 0.5);

/**
 * A display slot standing on the steps: on tread `tier`, `turn` of the way
 * along the arc. The camera stands back in from it, on the open floor inside
 * the bank, which is where a visitor looks up at the treads from.
 */
function stepSlot(tier, turn, distance, profile) {
  const a = STAIRS.thetaStart + STAIRS.thetaLength * turn;
  const r = stepRadius(tier);
  return {
    pos: [STAIRS.x + Math.sin(a) * r, STAIRS.rise * tier, STAIRS.z + Math.cos(a) * r],
    profile,
    from: [-Math.sin(a), 0, -Math.cos(a)],
    distance,
  };
}

/* Layout slots, in world space. `from` is the direction the camera stands in. */
const SLOTS = {
  /* Two along the front-left, the third pushed to the back rail. The front of
     the counter from about x = -0.9 rightward is kept clear as the wrapping
     bench, which is where a finished bouquet is laid down. */
  'vase-table': [
    { pos: [-1.85, ROOM.island.height, 1.62], profile: 'bulb', from: [0.1, 0, 1] },
    { pos: [-1.15, ROOM.island.height, 1.74], profile: 'cylinder', from: [0, 0, 1] },
    // On the back rail, so it has to be viewed from further off: the whole
    // depth of the counter is between the visitor and the flowers.
    { pos: [-0.38, ROOM.island.height, 1.14], profile: 'bud', from: [-0.1, 0, 1], distance: 1.85 },
  ],
  /* Two of the three shelf boards, six vases on the lower and five above.
     The top board keeps its empty vessels. Straight glass cylinders, as in the
     reference: the stock stands in plain glass and the flowers do the work. */
  shelf: [
    { pos: [7.78, 1.04, -0.90], profile: 'column', from: [-1, 0, 0.22] },
    { pos: [7.78, 1.04, -0.28], profile: 'column', from: [-1, 0, 0.14] },
    { pos: [7.78, 1.04, 0.34], profile: 'column', from: [-1, 0, 0.06] },
    { pos: [7.78, 1.04, 0.96], profile: 'column', from: [-1, 0, -0.06] },
    { pos: [7.78, 1.04, 1.58], profile: 'column', from: [-1, 0, -0.14] },
    { pos: [7.78, 1.04, 2.10], profile: 'bud', from: [-1, 0, -0.22] },
    { pos: [7.78, 1.76, -0.72], profile: 'column', from: [-1, 0, 0.18] },
    { pos: [7.78, 1.76, -0.06], profile: 'column', from: [-1, 0, 0.08] },
    { pos: [7.78, 1.76, 0.60], profile: 'bud', from: [-1, 0, 0] },
    { pos: [7.78, 1.76, 1.26], profile: 'bud', from: [-1, 0, -0.08] },
    { pos: [7.78, 1.76, 1.92], profile: 'bud', from: [-1, 0, -0.18] },
  ],
  /* On the plaster treads, one to a step and clear of the column that comes
     up through the third of them. Stood well apart along the arc so each one
     is a stop of its own rather than a row seen at an angle. */
  steps: [
    stepSlot(1, 0.20, 1.4, 'cylinder'),
    stepSlot(2, 0.71, 1.6, 'cylinder'),
    stepSlot(3, 0.48, 2.2, 'bud'),
  ],
  /* Tall glass on the stone, cut long. Kept out of the steps, the column,
     the olive tree, the low table and the frame and calendar viewing lines. */
  floor: [
    { pos: [-2.70, 0, 4.40], profile: 'tall', from: [0.2, 0, 1] },
    { pos: [3.70, 0, -7.10], profile: 'tall', from: [-0.2, 0, 1] },
    { pos: [-1.10, 0, -8.90], profile: 'tall', from: [0.1, 0, 1] },
    { pos: [6.55, 0, -3.40], profile: 'tall', from: [-1, 0, 0.15] },
    { pos: [6.55, 0, -8.20], profile: 'tall', from: [-0.8, 0, 0.6] },
    { pos: [-6.40, 0, 8.20], profile: 'tall', from: [0.7, 0, -0.6] },
    { pos: [5.90, 0, 8.60], profile: 'tall', from: [-0.5, 0, -0.85] },
  ],
};

/* Per-kind arrangement: how wide the bunch fans, how long the stems are cut,
   and how far they lean. The floor vases are cut long and stand tall; the
   shelf vases are short because the boards are 0.72 m apart and stay that way. */
const ARRANGEMENT = {
  /* The table bunches are full but held upright rather than fanned. A wrapped
     bouquet is nearly a metre long and is laid down along this counter, so the
     span from about x = −0.4 rightward has to stay clear; leaning the stems out
     any further puts flowers where the finished bouquet goes. Density comes
     from the stem count, not from the fan. */
  'vase-table': { spread: 0.075, scale: 1, tilt: 0.26 },
  /* Cut short. The three shelf boards are 0.72 m apart and were asked to stay
     exactly where they are, so shelf stock is cut to the gap — the blooms stay
     full size, only the stems come down. */
  shelf: { spread: 0.055, scale: 0.8, tilt: 0.24, height: 0.42 },
  /* On the treads: cut longer than the shelves, because a step has open air
     above it rather than a board 0.72 m up, but not as long as the floor
     glass — the tread behind each vase is only 0.36 m higher. */
  steps: { spread: 0.085, scale: 1, tilt: 0.3, height: 0.55 },
  /* Cut long, standing in tall glass on the stone, as in the reference. */
  floor: { spread: 0.15, scale: 1.45, tilt: 0.4, height: 0.78 },
};

/* --- small builders ----------------------------------------------------- */

function plasterMaterial(theme, extra = {}) {
  const t = tex.plaster(theme.plaster);
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: t.map,
    normalMap: t.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.92,
    metalness: 0,
    ...extra,
  });
}

/**
 * Plaster for one of the shop's own surfaces, coloured from `theme[key]`.
 *
 * Unset, it is exactly the material it always was: the shared plaster texture
 * under the surface's old fixed tint. Set, the plaster is ground in the chosen
 * colour instead — same trowel figure and relief — and the tint is dropped, so
 * the colour picked is the colour seen. Each surface gets its own material, so
 * one control never reaches another surface.
 */
function shopPlasterMaterial(theme, key, extra = {}) {
  const chosen = interiorColour(theme, key);
  if (!chosen) return plasterMaterial(theme, extra);
  const t = tex.plaster(chosen);
  return plasterMaterial(theme, { ...extra, color: 0xffffff, map: t.map, normalMap: t.normalMap });
}

/**
 * A wall panel with any number of rectangular openings cut out of it.
 *
 * Openings are given in the wall's own local x, are assumed not to overlap,
 * and each may sit off the floor: a doorway has `sill: 0`, a window bay does
 * not. The wall is assembled from full-height piers between the openings plus
 * a head panel over each one and an apron under it, which is cheaper and
 * cleaner than punching holes in a shape.
 */
function wallWithOpening(width, height, material, openings) {
  const group = new THREE.Group();
  const add = (w, h, x, y) => {
    if (w <= 0.001 || h <= 0.001) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, 0);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const list = (Array.isArray(openings) ? openings : [openings])
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);

  if (!list.length) {
    add(width, height, 0, height / 2);
    return group;
  }

  // Piers: from the wall's left edge to the first opening, between each
  // consecutive pair, and from the last opening to the right edge.
  let edge = -width / 2;
  for (const o of list) {
    const start = o.x - o.width / 2;
    add(start - edge, height, (edge + start) / 2, height / 2);
    edge = o.x + o.width / 2;
  }
  add(width / 2 - edge, height, (edge + width / 2) / 2, height / 2);

  // Head over each opening, and an apron under it where there is a sill.
  for (const o of list) {
    const sill = o.sill ?? 0;
    const top = sill + o.height;
    add(o.width, height - top, o.x, top + (height - top) / 2);
    add(o.width, sill, o.x, sill / 2);
  }
  return group;
}

/**
 * A floor-length linen curtain, hung open at the side of a window bay.
 *
 * Folds are a displaced plane rather than cloth simulation: a vertical sine
 * across the width, tightening toward the top where the fabric gathers on the
 * track, which under this room's soft light is all the reading it needs.
 */
function curtainGeometry(width, height, { folds = 7, depth = 0.09 } = {}) {
  const geo = new THREE.PlaneGeometry(width, height, folds * 4, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // 0 at the hem, 1 at the track: the gather is tightest where it hangs from.
    const up = (y + height / 2) / height;
    const gather = 0.45 + Math.pow(up, 1.5) * 0.55;
    pos.setZ(i, Math.sin((x / width) * Math.PI * 2 * folds) * depth * gather);
    // Drawn back to the side, so the panel is narrower at the top.
    pos.setX(i, x * (1 - up * 0.12));
  }
  geo.computeVertexNormals();
  return geo;
}

/** Clear glass for every stock vase in the room. */
function glassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf2f6f4,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.26,
    side: THREE.DoubleSide,
    envMapIntensity: 1.6,
    depthWrite: false,
  });
}

/**
 * Opaline glass for the customer's vase: milky, not clear, and warmer at the
 * lip and the foot than through the belly — which is how blown opaline pools
 * where the glass is thickest. Done with vertex colours over the lathe rather
 * than with a texture, since the gradient only runs one way.
 *
 * No transmission on purpose. The reference vase is opaque opaline, and a
 * transmissive material would also cost the renderer a whole extra pass.
 */
function opalineMaterial() {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.085,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xffe6d2),
    sheenRoughness: 0.5,
    emissive: new THREE.Color(0xf6b98c),
    emissiveIntensity: 0.05,
    envMapIntensity: 1.3,
    side: THREE.DoubleSide,
  });
}

/** Tint a lathed vessel from its foot to its lip. */
function shadeOpaline(geo, height) {
  const body = new THREE.Color('#f8d8c6').convertSRGBToLinear();
  const warm = new THREE.Color('#f0a869').convertSRGBToLinear();
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / height, 0, 1);
    // Deepest at the foot, palest through the belly, warm again at the lip.
    const deep = Math.max(Math.pow(1 - t / 0.22, 2), Math.pow((t - 0.86) / 0.14, 2));
    c.copy(body).lerp(warm, THREE.MathUtils.clamp(deep, 0, 1) * 0.85);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geo;
}

function waterMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xdfeee8,
    transmission: 0.9,
    thickness: 0.05,
    roughness: 0.06,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
}

/* --- the printer -------------------------------------------------------- */

function buildPrinter() {
  const group = new THREE.Group();
  group.name = 'printer';

  const shell = new THREE.MeshStandardMaterial({
    color: 0xf1efe9, roughness: 0.42, metalness: 0.04,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x2f2d29, roughness: 0.55, metalness: 0.1,
  });

  const body = new THREE.Mesh(slab(0.42, 0.30, 0.17, { radius: 0.05, bevel: 0.018 }), shell);
  body.position.y = 0.085;
  body.castShadow = true;
  group.add(body);

  // Sloped top with a paper slot.
  const lid = new THREE.Mesh(slab(0.40, 0.24, 0.045, { radius: 0.045, bevel: 0.014 }), shell);
  lid.position.set(0, 0.185, -0.02);
  lid.rotation.x = -0.14;
  lid.castShadow = true;
  group.add(lid);

  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.03), dark);
  slot.position.set(0, 0.152, 0.135);
  group.add(slot);

  const tray = new THREE.Mesh(slab(0.34, 0.10, 0.012, { radius: 0.02, bevel: 0.004 }), shell);
  tray.position.set(0, 0.128, 0.185);
  tray.rotation.x = 0.2;
  group.add(tray);

  // Status lamp — turns sage while printing.
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x8c9a82, emissive: new THREE.Color(0x8c9a82), emissiveIntensity: 0.35, roughness: 0.4,
  });
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), lampMat);
  lamp.position.set(-0.14, 0.155, 0.152);
  group.add(lamp);

  // The paper that emerges. Hidden until a print is requested.
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xfbfaf6, roughness: 0.86, side: THREE.DoubleSide,
  });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.42, 1, 8), paperMat);
  paper.rotation.x = -Math.PI / 2 + 0.16;
  paper.position.set(0, 0.148, 0.14);
  paper.visible = false;
  paper.name = 'paper';
  group.add(paper);

  group.userData = { lamp: lampMat, paper, printing: 0 };
  return group;
}

/* --- main --------------------------------------------------------------- */

export function buildShop(content, { renderer } = {}) {
  const theme = content.theme;
  const rng = seeded(20250831);
  const root = new THREE.Group();
  root.name = 'shop';

  const colliders = [];
  const interactive = [];
  const displays = new Map();
  const stops = [];
  const tickers = [];

  const addCollider = (minX, minY, minZ, maxX, maxY, maxZ) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ)
    ));
  };

  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;

  /* --- floor ------------------------------------------------------------ */

  /* Tumbled travertine in large 1.3 m slabs. The texture carries three slabs
     across, each with its own figure, so the repeat lands every 3.9 m instead
     of on every slab — which is what stops large-format stone reading as tile.

     They were 0.9 m, which put eighteen slabs across the room: at that size the
     seams read as a busy grid rather than as a stone floor. */
  const SLABS_PER_TILE = 3;
  const SLAB_SIZE = 1.3;
  const floorTex = tex.tumbledTravertine(theme.floor, {
    slabs: SLABS_PER_TILE,
    jointHex: floorJointColour(theme),
    jointContrast: floorJointContrast(theme),
  });
  const repeatX = ROOM.width / (SLAB_SIZE * SLABS_PER_TILE);
  const repeatZ = ROOM.depth / (SLAB_SIZE * SLABS_PER_TILE);
  for (const map of [floorTex.map, floorTex.normalMap, floorTex.roughnessMap]) {
    map.repeat.set(repeatX, repeatZ);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    new THREE.MeshStandardMaterial({
      map: floorTex.map,
      normalMap: floorTex.normalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughnessMap: floorTex.roughnessMap,
      roughness: 1,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  // Clicking the stone walks there: `pickAt` in js/app.js hands the hit point
  // to the rig's `walkTo`, which stops at whatever is in the way.
  floor.userData = { walkable: true, label: 'Walk here' };
  root.add(floor);
  interactive.push(floor);

  /* --- walls ------------------------------------------------------------ */

  const wallMat = shopPlasterMaterial(theme, 'shopWall', { side: THREE.FrontSide });

  const back = wallWithOpening(ROOM.width, ROOM.height, wallMat, null);
  back.position.set(0, 0, -halfD);
  root.add(back);

  const front = wallWithOpening(ROOM.width, ROOM.height, wallMat, {
    x: 0, width: 3.0, height: 2.9,
  });
  front.position.set(0, 0, halfD);
  front.rotation.y = Math.PI;
  root.add(front);

  // The right wall is rotated −90° about Y, which maps its local +X onto world
  // +Z — so a window bay's local x is its world z directly.
  const windowHeight = ROOM.window.head - ROOM.window.sill;
  const bays = ROOM.windows.map((w) => ({
    x: (w.z0 + w.z1) / 2,
    width: w.z1 - w.z0,
    height: windowHeight,
    sill: ROOM.window.sill,
    z0: w.z0,
    z1: w.z1,
  }));

  const right = wallWithOpening(ROOM.depth, ROOM.height, wallMat, bays);
  right.position.set(halfW, 0, 0);
  right.rotation.y = -Math.PI / 2;
  root.add(right);

  // The left wall is rotated +90° about Y, which maps its local +X onto world
  // -Z — so the opening's local x is the negated world z.
  const left = wallWithOpening(ROOM.depth, ROOM.height, wallMat, {
    x: -ROOM.portal.z, width: ROOM.portal.width, height: ROOM.portal.height,
  });
  left.position.set(-halfW, 0, 0);
  left.rotation.y = Math.PI / 2;
  root.add(left);

  /* --- window bays + linen (right wall) --------------------------------- */

  const glassPane = new THREE.MeshPhysicalMaterial({
    color: 0xeef3f4,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.4,
  });
  const frameDark = new THREE.MeshStandardMaterial({
    color: 0x6f6a63, roughness: 0.42, metalness: 0.2,
  });
  // Outside is a blown-out, warm sky. Kept a little under white so the glazing
  // still reads as an opening rather than as a hole in the render.
  const outside = new THREE.MeshBasicMaterial({
    color: new THREE.Color(theme.daylight).multiplyScalar(0.94),
    toneMapped: false,
  });
  const revealMatWindow = plasterMaterial(theme, { color: 0xfaf8f3, side: THREE.DoubleSide });
  const linenMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.curtain || '#dbd0bd'),
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const midHeight = ROOM.window.sill + windowHeight / 2;

  for (const bay of bays) {
    const group = new THREE.Group();

    // Glazing, just inside the wall plane.
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(bay.width, windowHeight), glassPane);
    pane.rotation.y = -Math.PI / 2;
    pane.position.set(halfW - 0.02, midHeight, bay.x);
    group.add(pane);

    // The daylight beyond, a little further out so the reveal has depth.
    const beyondWindow = new THREE.Mesh(
      new THREE.PlaneGeometry(bay.width, windowHeight), outside
    );
    beyondWindow.rotation.y = -Math.PI / 2;
    beyondWindow.position.set(halfW + 0.26, midHeight, bay.x);
    group.add(beyondWindow);

    // Plaster returns around the opening: head, sill and two jambs.
    const depth = 0.28;
    const head = new THREE.Mesh(new THREE.PlaneGeometry(depth, bay.width), revealMatWindow);
    head.rotation.x = Math.PI / 2;
    head.position.set(halfW + depth / 2, ROOM.window.sill + windowHeight, bay.x);
    group.add(head);

    const sillBoard = new THREE.Mesh(new THREE.PlaneGeometry(depth, bay.width), revealMatWindow);
    sillBoard.rotation.x = -Math.PI / 2;
    sillBoard.position.set(halfW + depth / 2, ROOM.window.sill, bay.x);
    group.add(sillBoard);

    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.PlaneGeometry(depth, windowHeight), revealMatWindow);
      jamb.rotation.y = side > 0 ? 0 : Math.PI;
      jamb.position.set(halfW + depth / 2, midHeight, bay.x + (side * bay.width) / 2);
      group.add(jamb);
    }

    // Slim mullions, roughly every 1.8 m.
    const panes = Math.max(2, Math.round(bay.width / 1.8));
    for (let i = 1; i < panes; i += 1) {
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, windowHeight, 0.055), frameDark
      );
      mullion.position.set(halfW - 0.03, midHeight, bay.z0 + (bay.width * i) / panes);
      group.add(mullion);
    }

    // Linen hung open at both ends of the bay, from a track above the head to
    // just off the stone.
    const curtainWidth = Math.min(1.15, bay.width * 0.3);
    const curtainHeight = ROOM.window.head + 0.28;
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(
        curtainGeometry(curtainWidth, curtainHeight, { folds: 7, depth: 0.085 }),
        linenMat
      );
      panel.rotation.y = -Math.PI / 2;
      panel.position.set(
        halfW - 0.16,
        curtainHeight / 2 + 0.02,
        bay.x + side * (bay.width / 2 - curtainWidth / 2 + 0.08)
      );
      panel.castShadow = true;
      panel.receiveShadow = true;
      group.add(panel);
    }

    root.add(group);
  }

  /* Daylight through the glazing: soft, unshadowed, aimed across the room.
     One light for both bays, not one each — a directional light has no
     position to speak of, so a second would differ only in the direction it
     points, and every light in the scene is paid for on every lit surface.
     The oculus keeps the only shadow-casting light; two would fight. */
  const dayIn = new THREE.DirectionalLight(new THREE.Color(theme.daylight), 0.78);
  dayIn.position.set(halfW + 3.4, 3.2, 1.0);
  dayIn.target.position.set(halfW - 7.5, 0.6, -1.0);
  root.add(dayIn);
  root.add(dayIn.target);

  // Wall colliders, pushed slightly inside so the camera cannot clip through.
  addCollider(-halfW - 1, 0, -halfD - 1, -halfW + 0.05, ROOM.height, halfD + 1);
  addCollider(halfW - 0.05, 0, -halfD - 1, halfW + 1, ROOM.height, halfD + 1);
  addCollider(-halfW - 1, 0, -halfD - 1, halfW + 1, ROOM.height, -halfD + 0.05);
  addCollider(-halfW - 1, 0, halfD - 0.05, halfW + 1, ROOM.height, halfD + 1);

  /* --- portal reveal ---------------------------------------------------- */

  const portalGroup = new THREE.Group();
  const revealMat = plasterMaterial(theme, { color: 0xf7f5f0, side: THREE.DoubleSide });
  const revealDepth = 0.55;

  // A short lined reveal so the opening reads as a thick plaster wall.
  // rotation.x = +90° puts the plane's width on X and its height on Z, facing down.
  const revealTop = new THREE.Mesh(
    new THREE.PlaneGeometry(revealDepth, ROOM.portal.width), revealMat
  );
  revealTop.rotation.x = Math.PI / 2;
  revealTop.position.set(-halfW - revealDepth / 2, ROOM.portal.height, ROOM.portal.z);
  portalGroup.add(revealTop);

  for (const side of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.PlaneGeometry(revealDepth, ROOM.portal.height), revealMat);
    // Each jamb faces back toward the centre of the opening.
    jamb.rotation.y = side > 0 ? Math.PI : 0;
    jamb.position.set(
      -halfW - revealDepth / 2,
      ROOM.portal.height / 2,
      ROOM.portal.z + (side * ROOM.portal.width) / 2
    );
    portalGroup.add(jamb);
  }

  // Glowing card at the end of the reveal: the light of the garden beyond.
  const beyond = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.portal.width, ROOM.portal.height),
    new THREE.MeshBasicMaterial({ color: 0xfaf6ee })
  );
  beyond.rotation.y = Math.PI / 2;
  beyond.position.set(-halfW - revealDepth, ROOM.portal.height / 2, ROOM.portal.z);
  portalGroup.add(beyond);

  const portalLight = new THREE.PointLight(0xfff2e0, 6, 5, 2);
  portalLight.position.set(-halfW + 0.4, 1.7, ROOM.portal.z);
  portalGroup.add(portalLight);
  root.add(portalGroup);

  // Invisible plate that catches clicks on the doorway.
  const portalHit = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.portal.width, ROOM.portal.height),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  portalHit.rotation.y = Math.PI / 2;
  portalHit.position.set(-halfW + 0.06, ROOM.portal.height / 2, ROOM.portal.z);
  portalHit.userData = { portal: 'garden', label: 'The Garden' };
  root.add(portalHit);
  interactive.push(portalHit);

  /* --- ceiling + oculus ------------------------------------------------- */

  const ceilingMat = shopPlasterMaterial(theme, 'shopCeiling', { color: 0xfbf9f5, side: THREE.DoubleSide });
  const ceiling = new THREE.Mesh(
    planeWithHole(ROOM.width, ROOM.depth, ROOM.oculus.radius, {
      holeX: ROOM.oculus.x,
      holeZ: ROOM.oculus.z,
      segments: 64,
    }),
    ceilingMat
  );
  ceiling.position.set(0, ROOM.height, 0);
  ceiling.castShadow = true;
  ceiling.receiveShadow = true;
  root.add(ceiling);

  // Thickness of the oculus opening, plus a bright sky disc above it.
  const oculusWell = new THREE.Mesh(
    new THREE.CylinderGeometry(ROOM.oculus.radius, ROOM.oculus.radius, 0.5, 48, 1, true),
    plasterMaterial(theme, { color: 0xffffff, side: THREE.BackSide })
  );
  oculusWell.position.set(ROOM.oculus.x, ROOM.height + 0.25, ROOM.oculus.z);
  root.add(oculusWell);

  const sky = new THREE.Mesh(
    new THREE.CircleGeometry(ROOM.oculus.radius * 0.99, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.daylight), toneMapped: false })
  );
  sky.rotation.x = Math.PI / 2;
  sky.position.set(ROOM.oculus.x, ROOM.height + 0.49, ROOM.oculus.z);
  root.add(sky);

  /* Recessed downlights on a regular grid, as in the reference: small, plain
     pinholes rather than fittings, reading as a field of points across the
     plaster. Most are geometry only — every light in a three.js scene costs
     shader work on every lit surface, so a handful carry the actual room
     lighting and the rest are there because the ceiling is what you see. */
  const recessMat = new THREE.MeshBasicMaterial({ color: 0xfff4e4, toneMapped: false });
  const recessRing = plasterMaterial(theme, { color: 0xf4f1ea });
  const rimGeo = new THREE.CircleGeometry(0.085, 16);
  const bulbGeo = new THREE.CircleGeometry(0.062, 16);
  let spotIndex = 0;
  for (const x of [-5.8, -2.9, 0, 2.9, 5.8]) {
    for (const z of [-9.2, -6.4, -3.6, -0.8, 2.0, 4.8, 7.6, 9.9]) {
      // Nothing sits inside the oculus, or in its plaster margin.
      if (Math.hypot(x - ROOM.oculus.x, z - ROOM.oculus.z) < ROOM.oculus.radius + 0.4) continue;
      const rim = new THREE.Mesh(rimGeo, recessRing);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, ROOM.height - 0.004, z);
      root.add(rim);
      const bulb = new THREE.Mesh(bulbGeo, recessMat);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(x, ROOM.height - 0.012, z);
      root.add(bulb);
      if (spotIndex % 13 === 0) {
        const p = new THREE.PointLight(0xfff1dd, 4.2, 8.5, 2);
        p.position.set(x, ROOM.height - 0.3, z);
        root.add(p);
      }
      spotIndex += 1;
    }
  }

  /* --- lighting --------------------------------------------------------- */

  const hemi = new THREE.HemisphereLight(
    new THREE.Color(theme.daylight), new THREE.Color(theme.floor), 0.72
  );
  root.add(hemi);

  const sun = new THREE.DirectionalLight(
    new THREE.Color(theme.daylight), theme.daylightIntensity ?? 3.1
  );
  sun.position.set(ROOM.oculus.x + 2.6, 15, ROOM.oculus.z + 3.4);
  sun.target.position.set(ROOM.oculus.x - 0.6, 0, ROOM.oculus.z - 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(LOW_MEMORY ? 1024 : 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 34;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.024;
  root.add(sun);
  root.add(sun.target);

  // A gentle fill from the entrance so the front of the room is not muddy.
  // Lighter than it was: the window bays now do most of this work.
  const fill = new THREE.DirectionalLight(0xf6ece0, 0.26);
  fill.position.set(-3, 4, 12);
  root.add(fill);

  /* --- the plaster steps (left) ----------------------------------------- */

  const seatMat = shopPlasterMaterial(theme, 'shopStairs', { color: 0xfaf8f4, side: THREE.DoubleSide });
  const seating = new THREE.Mesh(
    amphitheatre({
      tiers: STAIRS.tiers,
      innerRadius: STAIRS.innerRadius,
      tread: STAIRS.tread,
      rise: STAIRS.rise,
      fillet: 0.08,
      back: STAIRS.back,
      thetaStart: STAIRS.thetaStart,
      thetaLength: STAIRS.thetaLength,
      segments: 96,
    }),
    seatMat
  );
  /* Three millimetres off the stone. The lowest tread is a flat ring at y = 0,
     which is exactly the plane of the floor: coplanar with it, the two surfaces
     fight for depth and the ring shimmers. It mattered less when the steps were
     tucked against the left wall than it does with them out on the floor. */
  seating.name = 'plaster-steps';
  seating.position.set(STAIRS.x, 0.003, STAIRS.z);
  seating.castShadow = true;
  seating.receiveShadow = true;
  root.add(seating);

  /* Colliders for a curved bank.

     One box around the whole of it would either wall off the open floor inside
     the arc — which is exactly where a visitor stands to look up at the treads,
     and where the tread stops put the camera — or leave a corner of plaster
     walk-through. A ring of boxes around the arc follows it closely instead,
     each starting at the first riser rather than at the lathe's centre, so the
     floor-level tread stays walkable.

     Ten of them because a box around a slice of an arc reaches a little inside
     the arc at its corners, and enough slices keeps that overshoot below the
     clearance a camera stop on the floor inside needs. */
  const STEP_COLLIDER_CHUNKS = 10;
  const stepInner = STAIRS.innerRadius + STAIRS.tread;   // the first riser
  const stepOuter = STAIRS.innerRadius + STAIRS.tiers * STAIRS.tread + STAIRS.back;
  const stepHeight = STAIRS.tiers * STAIRS.rise;
  for (let i = 0; i < STEP_COLLIDER_CHUNKS; i += 1) {
    const from = STAIRS.thetaStart + (STAIRS.thetaLength * i) / STEP_COLLIDER_CHUNKS;
    const to = STAIRS.thetaStart + (STAIRS.thetaLength * (i + 1)) / STEP_COLLIDER_CHUNKS;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    // Both ends and the middle: the middle is what catches the bulge of the arc.
    for (const a of [from, (from + to) / 2, to]) {
      for (const r of [stepInner, stepOuter]) {
        const x = STAIRS.x + Math.sin(a) * r;
        const z = STAIRS.z + Math.cos(a) * r;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
    }
    addCollider(minX, 0, minZ, maxX, stepHeight, maxZ);
  }

  /* --- the pillar through the steps -------------------------------------- --
     The structural column, standing straight through the stepped bank from
     floor to ceiling as it always did — turned from a rectangular prism to a
     cylinder of the same 0.72 m thickness, and clad in photographed bark
     rather than board-formed concrete.

     Open-ended on purpose. The column spans exactly 0 to ROOM.height, so its
     caps would land coplanar with the floor plane and the ceiling plane and
     the two would fight for depth; neither cap is reachable by any view from
     inside the room, so the cheapest fix is not to build them.
     ---------------------------------------------------------------------- */

  const COLUMN = { x: -3.9, z: -5.4, radius: 0.36 };

  /* One texture repeat covers this much bark, the same tiles-per-metre idea
     the long table's stone uses. The repeat around the turn has to be a whole
     number or the wrap leaves a seam down one side of the cylinder, so that
     one is chosen first: two tiles around a 2.26 m circumference is 1.13 m of
     bark apiece, and four up the room's 4.4 m is 1.10 m — square enough that
     the grain does not stretch either way. */
  const BARK_REPEAT_U = 2;
  const BARK_REPEAT_V = 4;
  /* 2K on desktop, 1K on phones. Not 4K: four of those decode to over 300 MB,
     which is what was taking mobile Safari down, and a 1.1 m tile never shows
     the difference. */
  const BARK_RES = LOW_MEMORY ? '1K' : '2K';
  const BARK_FILES = {
    map: `public/textures/Bark014_${BARK_RES}-JPG_Color.jpg`,
    normalMap: `public/textures/Bark014_${BARK_RES}-JPG_NormalGL.jpg`,
    roughnessMap: `public/textures/Bark014_${BARK_RES}-JPG_Roughness.jpg`,
    aoMap: `public/textures/Bark014_${BARK_RES}-JPG_AmbientOcclusion.jpg`,
  };

  /* Standing in until the JPEGs land, for the same reason the table is built
     in procedural onyx first: the pillar holds up that corner of the room and
     it should never be caught blank. A flat bark brown reads as wood at a
     glance and is what the colour map replaces. */
  const columnMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6f6152'),
    // Multiplied by the roughness map once it lands; bark is never glossy.
    roughness: 0.92,
    metalness: 0,
    /* Positive on both axes, unlike the long table's stone: this set ships a
       GL-handed normal map, which is the way three reads tangent space, so
       there is no v to flip. */
    normalScale: new THREE.Vector2(1, 1),
  });

  const column = new THREE.Mesh(
    // Open-ended, one height segment: the caps are buried in floor and ceiling.
    new THREE.CylinderGeometry(COLUMN.radius, COLUMN.radius, ROOM.height, 48, 1, true),
    columnMat
  );
  column.name = 'column';
  column.position.set(COLUMN.x, ROOM.height / 2, COLUMN.z);
  column.castShadow = true;
  column.receiveShadow = true;
  root.add(column);
  addCollider(-4.4, 0, -5.9, -3.4, ROOM.height, -4.9);

  /* The bark itself. Gated on the renderer for the same reason the
     environment map is: without one there is no browser to fetch the
     JPEGs with, and the tests build the room that way. The collider above is
     the pillar's and stands either way, so what a visitor can walk into never
     depends on the download.

     Bark relief is only legible if it is lit as relief, which is what the
     normal and ambient-occlusion maps buy: the grooves take the room's light
     on one side and hold their own shade on the other. `aoMap` reads the
     standard `uv` here — three's textures default to channel 0, so the
     cylinder needs no second UV set. */
  if (renderer) {
    const barkAnisotropy = renderer.capabilities?.getMaxAnisotropy?.() ?? 8;
    for (const [slot, path] of Object.entries(BARK_FILES)) {
      loadQueued(
        path,
        (loaded) => {
          // Colour is the only one of the four that is colour; the normal,
          // roughness and occlusion maps are data and must stay linear.
          if (slot === 'map') {
            loaded.colorSpace = THREE.SRGBColorSpace;
            // The map carries the bark's own colour from here on.
            columnMat.color.set(0xffffff);
          }
          loaded.wrapS = THREE.RepeatWrapping;
          loaded.wrapT = THREE.RepeatWrapping;
          loaded.repeat.set(BARK_REPEAT_U, BARK_REPEAT_V);
          loaded.anisotropy = barkAnisotropy;
          loaded.needsUpdate = true;
          columnMat[slot]?.dispose();
          columnMat[slot] = loaded;
          columnMat.needsUpdate = true;
        },
        undefined,
        () => {
          console.warn(`KUNEY: ${path} did not load; the column keeps its plain bark brown.`);
        }
      );
    }
  }

  /* --- olive tree in a weathered pot ------------------------------------ */

  const potTex = tex.terracotta(theme.terracotta);
  const pot = new THREE.Mesh(
    turned(POT_PROFILE, { segments: 44 }),
    new THREE.MeshStandardMaterial({
      map: potTex.map,
      normalMap: potTex.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: potTex.roughnessMap,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    })
  );
  pot.position.set(0.6, 0, -6.6);
  pot.castShadow = true;
  pot.receiveShadow = true;
  root.add(pot);

  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.40, 28),
    new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 })
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(0.6, 0.66, -6.6);
  root.add(soil);

  const tree = createOliveTree({ height: 3.1, rng });
  tree.position.set(0.6, 0.64, -6.6);
  tree.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(tree);
  addCollider(0.1, 0, -7.1, 1.1, 0.75, -6.1);

  const canopy = tree.getObjectByName('canopy');
  if (canopy) {
    const base = canopy.rotation.z;
    tickers.push((t) => {
      canopy.rotation.z = base + Math.sin(t * 0.42) * 0.012;
      canopy.rotation.x = Math.sin(t * 0.31 + 1.2) * 0.009;
    });
  }

  /* --- low white table + stools (right, front) -------------------------- */

  const lowTableMat = shopPlasterMaterial(theme, 'shopTable', { color: 0xfbfaf6, roughness: 0.72 });
  // Its own material, though it starts identical: the stools are a separate control.
  const stoolMat = shopPlasterMaterial(theme, 'shopStools', { color: 0xfbfaf6, roughness: 0.72 });
  const lowTable = new THREE.Mesh(slab(2.9, 0.86, 0.075, { radius: 0.035, bevel: 0.02 }), lowTableMat);
  lowTable.position.set(5.0, 0.44, 4.3);
  lowTable.castShadow = true;
  lowTable.receiveShadow = true;
  root.add(lowTable);

  for (const dx of [-1.28, 1.28]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 0.78), lowTableMat);
    leg.position.set(5.0 + dx, 0.22, 4.3);
    leg.castShadow = true;
    root.add(leg);
  }
  addCollider(3.4, 0, 3.8, 6.6, 0.5, 4.8);

  [[3.7, 3.2], [5.0, 3.15], [6.3, 3.25], [4.35, 5.5], [5.7, 5.45]].forEach(([x, z]) => {
    const stool = new THREE.Mesh(
      turned([[0.001, 0], [0.19, 0], [0.20, 0.02], [0.185, 0.40], [0.20, 0.42], [0.205, 0.44], [0.001, 0.44]], { segments: 30 }),
      stoolMat
    );
    stool.position.set(x, 0, z);
    stool.castShadow = true;
    stool.receiveShadow = true;
    root.add(stool);
    addCollider(x - 0.22, 0, z - 0.22, x + 0.22, 0.45, z + 0.22);
  });

  /* --- wall shelves (right wall) ---------------------------------------- */

  const shelfMat = plasterMaterial(theme, { color: 0xfaf8f3 });
  [1.02, 1.74, 2.46].forEach((y, i) => {
    const board = new THREE.Mesh(slab(3.3, 0.30, 0.055, { radius: 0.02, bevel: 0.014 }), shelfMat);
    board.rotation.y = Math.PI / 2;
    board.position.set(halfW - 0.15, y, 0.6);
    board.castShadow = true;
    board.receiveShadow = true;
    root.add(board);
    // Slim brackets, barely there.
    for (const dz of [-1.35, 1.35]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), shelfMat);
      bracket.position.set(halfW - 0.13, y - 0.05, 0.6 + dz);
      root.add(bracket);
    }
    if (i === 2) {
      // Top shelf holds a few empty vessels rather than a display.
      [-0.9, 0.2, 1.4].forEach((dz, k) => {
        const vessel = new THREE.Mesh(
          turned(VASE_PROFILES[k === 1 ? 'bulb' : 'bud'], { segments: 26 }),
          glassMaterial()
        );
        vessel.position.set(halfW - 0.22, y + 0.03, 0.6 + dz);
        vessel.scale.setScalar(0.85);
        root.add(vessel);
      });
    }
  });
  addCollider(halfW - 0.45, 0.9, -1.2, halfW, 2.6, 2.4);

  /* --- the long table: raw-edged green travertine -----------------------
     A monolith, not a table on legs: a thick top with a chiselled raw edge
     over solid slab sides that run to the floor, and a concealed strip under
     the overhang washing light up the stone. Footprint, working height and
     the clear span kept as the wrapping bench are all exactly as before, so
     the vase, the printer, the paper roll and the whole wrapping sequence are
     untouched by the change.

     The stone itself is photographed: a 2K PBR set in public/textures/. The
     procedural onyx below is kept as the material the table is built with, so
     the room is never missing a surface while the JPEGs are still in flight,
     and a missing file leaves the table clad in stone rather than blank.
     ---------------------------------------------------------------------- */

  const TOP_THICKNESS = 0.16;
  const onyx = tex.bandedOnyx(theme.island, theme.islandVein);

  /* One texture repeat covers this much real stone, on every face. The top's
     UVs come out of ExtrudeGeometry in metres and the body faces are unit
     planes scaled by their own size, so the two meet at the same grain and
     nothing stretches along the length of the table. */
  const STONE_TILE = 1.25;
  const STONE_RES = LOW_MEMORY ? '1K' : '2K';
  const STONE_FILES = {
    map: `public/textures/Travertine011_${STONE_RES}-JPG_Color.jpg`,
    normalMap: `public/textures/Travertine011_${STONE_RES}-JPG_NormalDX.jpg`,
    roughnessMap: `public/textures/Travertine011_${STONE_RES}-JPG_Roughness.jpg`,
  };
  /* A 4.4 m table is nearly always seen down its length, at exactly the raking
     angle where a low anisotropy sample turns the grain to mush. */
  const stoneAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;

  /**
   * The stone, with the grain scaled to the face it runs across.
   *
   * A cloned texture is a separate upload to the GPU even when it shares its
   * image, so this is memoised by repeat: the two long faces are the same size
   * as each other and so are the two ends, which brings five faces down to
   * three sets of maps.
   */
  const stoneMaterials = new Map();
  const stoneMaterial = (repeatU, repeatV) => {
    const key = `${repeatU.toFixed(3)}:${repeatV.toFixed(3)}`;
    if (!stoneMaterials.has(key)) {
      const maps = {};
      for (const name of ['map', 'normalMap', 'roughnessMap']) {
        const t = onyx[name].clone();
        t.needsUpdate = true;
        t.repeat.set(repeatU, repeatV);
        maps[name] = t;
      }
      stoneMaterials.set(key, new THREE.MeshPhysicalMaterial({
        ...maps,
        // Left white: the colour map carries the green of the stone itself.
        // Negative on v because the downloaded normal map is DirectX-handed
        // and three reads tangent-space normals the OpenGL way round.
        normalScale: new THREE.Vector2(0.6, -0.6),
        /* The photographed roughness is authored for a mirror-polished slab —
           it averages 0.07, which under an env map reads as glass rather than
           stone. `roughness` multiplies the map, so this lifts the surface to
           around 0.2: a long wet highlight down the table, grain still there. */
        roughness: 2.6,
        metalness: 0,
        clearcoat: 0.25,
        clearcoatRoughness: 0.18,
        envMapIntensity: 1.1,
      }));
    }
    return stoneMaterials.get(key);
  };

  // ExtrudeGeometry lays the top's UVs out in metres, so the repeat here is
  // tiles per metre — the same grain as the sides, and square in both axes.
  const islandTop = new THREE.Mesh(
    slab(ROOM.island.width, ROOM.island.depth, TOP_THICKNESS, {
      radius: 0.05,
      bevel: 0.022,
      wobble: 0.026,        // the raw, chiselled edge
      wobbleFrequency: 2.6,
    }),
    stoneMaterial(1 / STONE_TILE, 1 / STONE_TILE)
  );
  islandTop.position.set(ROOM.island.x, ROOM.island.height - TOP_THICKNESS / 2, ROOM.island.z);
  islandTop.castShadow = true;
  islandTop.receiveShadow = true;
  islandTop.name = 'island-top';
  root.add(islandTop);

  /* The body: four slab faces, inset under the top so the overhang reads and
     so the light strip has somewhere to hide. BoxGeometry rather than `slab`
     because its UVs put v on the face's own vertical, which is the only way
     the strata come out level on a standing panel. */
  const bodyHeight = ROOM.island.height - TOP_THICKNESS;
  const bodyWidth = ROOM.island.width - 0.16;
  const bodyDepth = ROOM.island.depth - 0.14;
  const bodyY = bodyHeight / 2;

  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(bodyWidth, bodyHeight),
      stoneMaterial(bodyWidth / STONE_TILE, bodyHeight / STONE_TILE)
    );
    face.rotation.y = side > 0 ? 0 : Math.PI;
    face.position.set(ROOM.island.x, bodyY, ROOM.island.z + (side * bodyDepth) / 2);
    face.castShadow = true;
    face.receiveShadow = true;
    root.add(face);
  }
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(
      new THREE.PlaneGeometry(bodyDepth, bodyHeight),
      stoneMaterial(bodyDepth / STONE_TILE, bodyHeight / STONE_TILE)
    );
    end.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    end.position.set(ROOM.island.x + (side * bodyWidth) / 2, bodyY, ROOM.island.z);
    end.castShadow = true;
    end.receiveShadow = true;
    root.add(end);
  }

  /* Now that every face is standing, fetch the photographed stone and repaint
     them. Each map is loaded once and handed to all three materials, differing
     only in repeat; clones of one image share a single GPU upload, so the
     table costs three textures rather than nine. Run after the meshes on
     purpose — a material built later would never be reached. */
  /* Settles once every stone map has landed (or failed), so a still of the
     room can wait for the finished table rather than the onyx stand-in. */
  const stoneLoads = [];
  for (const [slot, path] of Object.entries(STONE_FILES)) {
    let settle;
    stoneLoads.push(new Promise((resolve) => { settle = resolve; }));
    loadQueued(path, (loaded) => {
      // Colour is the only one of the three that is colour; the normal and
      // roughness maps are data and must stay linear.
      if (slot === 'map') loaded.colorSpace = THREE.SRGBColorSpace;
      for (const [key, material] of stoneMaterials) {
        const [repeatU, repeatV] = key.split(':').map(Number);
        const t = loaded.clone();
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeatU, repeatV);
        t.anisotropy = stoneAnisotropy;
        t.needsUpdate = true;
        material[slot]?.dispose();
        material[slot] = t;
        material.needsUpdate = true;
      }
      settle();
    }, undefined, () => settle());
  }
  const stoneReady = Promise.all(stoneLoads);

  /* The concealed strip. An emissive band tucked into the shadow gap under the
     overhang, plus two real lights so the stone above it actually lifts. */
  const glowColour = new THREE.Color(theme.tableGlow || '#ffe4bd');
  const glowMat = new THREE.MeshBasicMaterial({ color: glowColour, toneMapped: false });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(bodyWidth * 0.98, 0.022), glowMat);
    strip.rotation.y = side > 0 ? 0 : Math.PI;
    strip.position.set(
      ROOM.island.x,
      bodyHeight - 0.014,
      ROOM.island.z + (side * (bodyDepth + 0.012)) / 2
    );
    root.add(strip);
  }
  const wash = new THREE.PointLight(glowColour, 2.2, 1.6, 2);
  wash.position.set(ROOM.island.x, bodyHeight + 0.02, ROOM.island.z);
  root.add(wash);

  addCollider(
    ROOM.island.x - ROOM.island.width / 2 - 0.1, 0, ROOM.island.z - ROOM.island.depth / 2 - 0.1,
    ROOM.island.x + ROOM.island.width / 2 + 0.1, ROOM.island.height, ROOM.island.z + ROOM.island.depth / 2 + 0.1
  );

  // Wrapping paper and shears, to say the island is worked at.
  // The roll lies along X, so it is centred well inside the island's left end
  // rather than overhanging it.
  const paperMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.wrapPaper || '#efe7d8'),
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const paperRoll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.62, 20),
    paperMat
  );
  paperRoll.rotation.z = Math.PI / 2;
  // Pushed to the back of the counter, out of the wrapping bench.
  paperRoll.position.set(-1.50, ROOM.island.height + 0.045, 1.18);
  paperRoll.castShadow = true;
  root.add(paperRoll);

  /* The painted scissors from public/scissors.png, laid flat on the stone.
     The art spans ~72% of its square's diagonal, so a 0.34 m quad draws them
     at 1.3x the ~0.19 m of the modelled pair they replace. Raised 2 mm so
     the quad neither clips into nor flickers against the marble. */
  const SCISSORS_SIZE = 0.34;
  const scissorsMap = new THREE.TextureLoader().load('public/scissors.png');
  scissorsMap.colorSpace = THREE.SRGBColorSpace;
  scissorsMap.magFilter = THREE.NearestFilter;
  scissorsMap.minFilter = THREE.NearestFilter;
  scissorsMap.generateMipmaps = false;
  const shears = new THREE.Mesh(
    new THREE.PlaneGeometry(SCISSORS_SIZE, SCISSORS_SIZE),
    new THREE.MeshStandardMaterial({ map: scissorsMap, alphaTest: 0.5, roughness: 0.6 })
  );
  shears.name = 'scissors';
  /* Turned 30° about the vertical, then tipped 7° up toward the camera so the
     quad catches the light and reads with a little perspective. Raised by the
     height the tilt swings its low edge down, so that edge rests on the stone. */
  const SCISSORS_TURN = -0.52;
  const SCISSORS_TILT = 0.12;
  shears.rotation.order = 'YXZ';
  shears.rotation.set(-Math.PI / 2 + SCISSORS_TILT, SCISSORS_TURN, 0);
  shears.position.set(
    -0.92,
    ROOM.island.height + 0.002 + (SCISSORS_SIZE / 2) * Math.sin(SCISSORS_TILT),
    1.20
  );
  shears.castShadow = true;
  root.add(shears);

  // A soft contact shadow on the marble: the scissors' own silhouette in
  // translucent black, flat on the stone and nudged just off the art.
  const shearsShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(SCISSORS_SIZE * 1.04, SCISSORS_SIZE * 1.04),
    new THREE.MeshBasicMaterial({
      map: scissorsMap,
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    })
  );
  shearsShadow.name = 'scissors-shadow';
  shearsShadow.rotation.order = 'YXZ';
  shearsShadow.rotation.set(-Math.PI / 2, SCISSORS_TURN, 0);
  shearsShadow.position.set(-0.912, ROOM.island.height + 0.001, 1.208);
  shearsShadow.renderOrder = 1;
  root.add(shearsShadow);

  /* --- the customer's vase --------------------------------------------- --
     The one vase in the room that is not clear glass. The stock stands in
     plain cylinders so the flowers do the talking; what a visitor gathers goes
     into a footed opaline urn in peach, which is a different object at a
     glance from across the room — the point being that you can always tell
     which vase is yours.
     ---------------------------------------------------------------------- */

  const vaseGroup = new THREE.Group();
  vaseGroup.name = 'customer-vase';
  vaseGroup.position.set(0.92, ROOM.island.height, 1.46);
  root.add(vaseGroup);

  /* Half again the size it is drawn at, so it carries across the room.

     Scaled on the meshes rather than on vaseGroup: the group also holds the
     finished bouquet, and a bouquet half again as long would not fit on the
     wrapping bench. The vase and its water scale; the stems do not. */
  const SPECIAL_VASE_SCALE = 1.5;
  const SPECIAL_VASE_HEIGHT = SPECIAL_VASE_PROFILE[SPECIAL_VASE_PROFILE.length - 1][1];
  const heroVase = new THREE.Mesh(
    shadeOpaline(turned(SPECIAL_VASE_PROFILE, { segments: 64 }), SPECIAL_VASE_HEIGHT),
    opalineMaterial()
  );
  heroVase.name = 'hero-vase';
  heroVase.scale.setScalar(SPECIAL_VASE_SCALE);
  heroVase.castShadow = true;
  vaseGroup.add(heroVase);

  /* Where a gathered stem is cut off to, inside the vase.

     It follows the vase: the lip is now at 0.53 m rather than 0.35, and stems
     left at the old depth would have stood a ranunculus entirely inside the
     glass. At 0.28 the cut ends are still under the water surface and the
     shortest thing the shop stocks still stands proud of the lip. The wrap
     measures its paper and ribbon off this, so the sequence is unchanged. */
  const STEM_BASE_Y = 0.28;

  /* A closed column of water. It starts above the waist rather than at the
     origin, because this vase stands on a foot: water at y = 0 would show
     through the stem of it. */
  const water = new THREE.Mesh(
    turned([
      [0.001, 0.095], [0.088, 0.095], [0.102, 0.14],
      [0.110, 0.19], [0.104, 0.228], [0.001, 0.228],
    ], { segments: 44, smooth: 1 }),
    waterMaterial()
  );
  water.scale.setScalar(SPECIAL_VASE_SCALE);
  water.visible = false;
  vaseGroup.add(water);

  const stemHolder = new THREE.Group();
  stemHolder.name = 'gathered';
  vaseGroup.add(stemHolder);

  /* --- the wrapping station -------------------------------------------- --
     When an order is confirmed the gathered stems lift out of the vase, a
     sheet of paper sweeps around them, a ribbon cinches, and the finished
     bouquet settles onto the marble beside the vase.

     `bouquetGroup` shares the vase's transform exactly, so stems can be
     reparented into it mid-sequence without anything appearing to move. The
     paper's sweep is done with setDrawRange rather than by rebuilding the
     geometry each frame: an open-ended CylinderGeometry emits its indices in
     order around theta, so revealing them progressively *is* the wrap.
     ---------------------------------------------------------------------- */

  const bouquetGroup = new THREE.Group();
  bouquetGroup.name = 'bouquet';
  vaseGroup.add(bouquetGroup);

  const WRAP = {
    height: 0.34,
    rBottom: 0.032,
    rTop: 0.125,
    segments: 44,
    lift: 0.15,
    // Stems are cut at STEM_BASE_Y and lift by 0.15, so the paper has to start
    // at the cut end and rise over the lower stems — not at the group origin,
    // which is down inside the vase. Both are measured off the cut so they
    // follow the vase when it changes size.
    coneBase: STEM_BASE_Y + 0.10,
    ribbonY: STEM_BASE_Y + 0.20,
    /* Where the finished bouquet comes to rest, relative to the vase.

       It is laid flat along the island's long axis, in the clear span kept
       between the last display and the customer's vase — the wrapping bench.
       Tipping it toward the viewer instead would cantilever the flower heads
       half a metre past the front edge, which reads as falling off.

       `y` is measured at wrap time — see `settleHeight` — because a bouquet on
       its side has to clear its own radius, and that depends on the paper cone
       and on whatever the visitor happened to gather. */
    /* A tilt about +Z lays the stems toward -X, so the pivot sits at the right
       end of the bench, just clear of the vase, and the bouquet extends left.

       Both x and z are pulled in from where they were (-0.18, 0.12). The tilt
       is about the group origin, so cutting the stems higher up carries the
       whole bouquet further along the lay of its own accord — and because the
       bunch is turned in the hand first, that lay is a little across the
       counter as well as along it, which was putting the flower heads out over
       the front edge of the stone. What it still has to clear is the vase, now
       0.41 m across rather than 0.27. */
    rest: { x: -0.07, y: 0.02, z: 0.05, tilt: 1.45, turn: 0.34 },
    clearance: 0.004,
  };

  function wrapCone(scale, opacity) {
    const geo = new THREE.CylinderGeometry(
      WRAP.rTop * scale, WRAP.rBottom * scale, WRAP.height * scale,
      WRAP.segments, 1, true
    );
    const mesh = new THREE.Mesh(geo, paperMat.clone());
    mesh.material.transparent = true;
    mesh.material.opacity = opacity;
    mesh.castShadow = true;
    mesh.visible = false;
    mesh.userData.indexTotal = geo.index.count;
    geo.setDrawRange(0, 0);
    return mesh;
  }

  bouquetGroup.rotation.order = 'YZX';

  // Two sheets, the second trailing the first, for a double-wrapped look.
  const paperInner = wrapCone(1, 1);
  paperInner.position.y = WRAP.coneBase + WRAP.height / 2;
  bouquetGroup.add(paperInner);

  const paperOuter = wrapCone(1.1, 0.96);
  paperOuter.position.y = WRAP.coneBase + 0.02 + (WRAP.height * 1.1) / 2;
  paperOuter.rotation.y = 1.9;
  bouquetGroup.add(paperOuter);

  const ribbon = new THREE.Mesh(
    new THREE.TorusGeometry(0.052, 0.0055, 8, 26),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.ribbon || '#8c9a82'),
      roughness: 0.62,
      metalness: 0,
    })
  );
  ribbon.rotation.x = Math.PI / 2;
  ribbon.position.y = WRAP.ribbonY;
  ribbon.visible = false;
  ribbon.castShadow = true;
  bouquetGroup.add(ribbon);

  // The trailing tails of the bow.
  const tails = new THREE.Group();
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.008, 0.075),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(theme.ribbon || '#8c9a82'),
        roughness: 0.62,
        side: THREE.DoubleSide,
      })
    );
    tail.position.set(side * 0.012, -0.036, 0.048);
    tail.rotation.set(0.3, 0, side * 0.22);
    tails.add(tail);
  }
  tails.position.y = WRAP.ribbonY;
  tails.visible = false;
  bouquetGroup.add(tails);

  /** Live state of the wrapping sequence. */
  const wrapState = { phase: 'idle', t: 0, duration: 0, stems: [] };

  const WRAP_TIMELINE = {
    gather: [0.00, 0.95],   // stems rise out of the water and draw together
    sheet: [0.70, 2.15],   // the first sheet sweeps around
    second: [1.15, 2.55],   // the second follows it
    tie: [2.45, 3.15],   // ribbon cinches
    settle: [3.05, 4.00],   // laid down on the marble
  };
  const WRAP_DURATION = 4.0;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const span = ([from, to], t) => clamp01((t - from) / (to - from));

  /** Snapshot each stem's pose so the gather can interpolate away from it. */
  function captureStemPoses() {
    wrapState.stems = bouquetGroup.children
      .filter((child) => child.name === 'stem')
      .map((stem) => ({
        stem,
        from: stem.position.clone(),
        fromRot: { x: stem.rotation.x, z: stem.rotation.z },
      }));
  }

  function applyWrap(t) {
    // --- stems gather into a hand-held bunch ---
    const gather = easeOut(span(WRAP_TIMELINE.gather, t));
    for (const entry of wrapState.stems) {
      const { stem, from, fromRot } = entry;
      // Draw in toward the axis and stand upright, keeping a little of the fan.
      // Gripped fairly tight: a loose bunch spreads wide enough to overhang
      // the counter, and a hand-tie is gripped tight anyway.
      stem.position.x = from.x * (1 - gather * 0.78);
      stem.position.z = from.z * (1 - gather * 0.78);
      stem.position.y = from.y + WRAP.lift * gather;
      stem.rotation.x = fromRot.x * (1 - gather * 0.70);
      stem.rotation.z = fromRot.z * (1 - gather * 0.70);
    }

    // --- the paper comes around ---
    const reveal = (mesh, progress) => {
      const total = mesh.userData.indexTotal;
      // Indices come in groups of six per radial segment; snap to whole
      // segments so a partially drawn triangle never flickers.
      const segments = Math.floor((total / 6) * progress);
      mesh.geometry.setDrawRange(0, segments * 6);
      mesh.visible = segments > 0;
    };
    reveal(paperInner, easeInOut(span(WRAP_TIMELINE.sheet, t)));
    reveal(paperOuter, easeInOut(span(WRAP_TIMELINE.second, t)));

    // The bunch turns in the hand while it is being wrapped.
    const turning = span([WRAP_TIMELINE.sheet[0], WRAP_TIMELINE.second[1]], t);
    bouquetGroup.rotation.y = easeInOut(turning) * WRAP.rest.turn;

    // --- ribbon ---
    const tie = span(WRAP_TIMELINE.tie, t);
    if (tie > 0) {
      ribbon.visible = true;
      // Drops on from above, then cinches tight.
      const drop = easeOut(clamp01(tie / 0.55));
      const cinch = easeInOut(clamp01((tie - 0.45) / 0.55));
      ribbon.scale.setScalar((1.5 - drop * 0.5) - cinch * 0.14);
      ribbon.position.y = WRAP.ribbonY + (1 - drop) * 0.10;
      tails.visible = cinch > 0.25;
      tails.scale.setScalar(0.4 + cinch * 0.6);
    } else {
      ribbon.visible = false;
      tails.visible = false;
    }

    // --- laid down on the wrapping bench ---
    const settle = easeInOut(span(WRAP_TIMELINE.settle, t));
    bouquetGroup.position.set(
      WRAP.rest.x * settle,
      WRAP.rest.y * settle,
      WRAP.rest.z * settle
    );
    bouquetGroup.rotation.z = WRAP.rest.tilt * settle;
  }

  function advanceWrap(dt) {
    wrapState.t = Math.min(WRAP_DURATION, wrapState.t + dt);
    applyWrap(wrapState.t);
    if (wrapState.t >= WRAP_DURATION) wrapState.phase = 'wrapped';
  }

  const measureBox = new THREE.Box3();

  /**
   * How far to raise the bouquet so that, once tipped onto its side, its lowest
   * point just touches the marble. Done by measuring the finished pose rather
   * than by guessing a constant: the paper cone's radius and the size of the
   * flower heads both push the resting height up, and both change with what
   * the visitor gathered.
   */
  function settleHeight() {
    WRAP.rest.y = 0;
    applyWrap(WRAP_DURATION);
    root.updateMatrixWorld(true);
    measureBox.setFromObject(bouquetGroup);
    // vaseGroup sits on the island top, so local y = 0 is the marble surface.
    const lowest = measureBox.min.y - ROOM.island.height;
    return Number.isFinite(lowest) ? WRAP.clearance - lowest : 0.02;
  }

  // Invisible click target so the vase is easy to select on a phone.
  const vaseHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.5, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  vaseHit.scale.setScalar(SPECIAL_VASE_SCALE);
  vaseHit.position.y = 0.25 * SPECIAL_VASE_SCALE;
  vaseHit.userData = { vase: true, label: 'Your vase' };
  vaseGroup.add(vaseHit);
  interactive.push(vaseHit);

  /* --- printer ---------------------------------------------------------- */

  /* Half again as big, and moved 0.11 m in along the counter so that all four
     corners of it stay on the stone at that size. The paper is a child of the
     group, so the print animation scales with it and needs no other change. */
  const PRINTER_SCALE = 1.5;
  const PRINTER_X = 1.75;
  /* Back from 1.72 as well: the invoice feeds out toward the visitor, and a
     sheet half again as long was hanging over the front edge of the stone. */
  const PRINTER_Z = 1.58;

  const printer = buildPrinter();
  printer.position.set(PRINTER_X, ROOM.island.height, PRINTER_Z);
  printer.rotation.y = -0.28;
  printer.scale.setScalar(PRINTER_SCALE);
  root.add(printer);

  const printerHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.34, 0.42),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  printerHit.scale.setScalar(PRINTER_SCALE);
  printerHit.position.set(PRINTER_X, ROOM.island.height + 0.15 * PRINTER_SCALE, PRINTER_Z);
  printerHit.userData = { printer: true, label: 'Printer' };
  root.add(printerHit);
  interactive.push(printerHit);

  /* --- hover feedback --------------------------------------------------- --
     Nothing in a 3D room announces itself as clickable, so every interactive
     thing gets a glow that fades in under the pointer: a ring on the stone for
     things standing on it, a rim behind the frame for things hung on the wall.
     One shared easing pass in `update` drives all of them, and `setHover` is
     the only thing that moves the targets — so a stale hover cannot be left
     lit when the pointer leaves the canvas.
     ---------------------------------------------------------------------- */

  const accent = new THREE.Color(theme.accent || '#8c9a82');
  const hoverGlows = [];
  let hovered = null;
  let selectedDisplayId = null;

  const glowMaterial = () => new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });

  /** Register `glow` as the hover response for whatever `target` is hit. */
  function registerHover(target, glow) {
    glow.material.userData.target = 0;
    glow.renderOrder = -1;
    hoverGlows.push(glow);
    target.userData.hoverGlow = glow;
    return glow;
  }

  /** A ring laid on a surface, for objects standing on the stone. */
  function hoverRing(inner, outer, position, parent = root) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 44), glowMaterial());
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    parent.add(ring);
    return ring;
  }

  /** A rim standing just proud of a wall-hung panel. */
  function hoverRim(width, height, position) {
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glowMaterial());
    rim.position.copy(position);
    root.add(rim);
    return rim;
  }

  registerHover(vaseHit, hoverRing(
    0.15 * SPECIAL_VASE_SCALE, 0.2 * SPECIAL_VASE_SCALE,
    new THREE.Vector3(0, 0.004, 0), vaseGroup
  ));
  /* Sized by hand rather than by PRINTER_SCALE: it has to clear the bigger
     shell, but at 1.5x it would hang over the raw edge of the table. */
  registerHover(printerHit, hoverRing(
    0.38, 0.44, new THREE.Vector3(PRINTER_X, ROOM.island.height + 0.004, PRINTER_Z)
  ));
  registerHover(portalHit, hoverRim(
    ROOM.portal.width + 0.14, ROOM.portal.height + 0.1,
    new THREE.Vector3(-halfW + 0.05, ROOM.portal.height / 2, ROOM.portal.z)
  ));
  portalHit.userData.hoverGlow.rotation.y = Math.PI / 2;

  /* --- displays --------------------------------------------------------- */

  const highlightMat = new THREE.MeshBasicMaterial({
    color: 0x8c9a82, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });

  for (const display of content.displays || []) {
    const slotList = SLOTS[display.kind] || SLOTS['vase-table'];
    const slot = slotList[display.slot % slotList.length];
    if (!slot) continue;

    const group = new THREE.Group();
    group.name = `display:${display.id}`;
    group.position.fromArray(slot.pos);
    root.add(group);

    const isFloor = display.kind === 'floor';
    const profile = VASE_PROFILES[slot.profile] || VASE_PROFILES.cylinder;
    const vaseScale = isFloor ? 1.9 : 1;

    // Stock vases stay clear glass, whatever is standing in them.
    const vessel = new THREE.Mesh(turned(profile, { segments: 40 }), glassMaterial());
    vessel.scale.setScalar(vaseScale);
    vessel.castShadow = false;
    group.add(vessel);

    const vaseTop = profile[profile.length - 1][1] * vaseScale;

    /* Colour groups: several colours of one variety to a vase, each bucketed
       into its own wedge. `displayColorGroups` falls back to the display's
       single palette colour, so a display added from the admin panel still
       builds. */
    const groups = displayColorGroups(content, display);
    const colour = colorById(content, display.colorId);
    const arrangement = ARRANGEMENT[display.kind] || ARRANGEMENT['vase-table'];

    const bunch = createGroupedBunch(display.bloom, groups, {
      rng,
      spread: arrangement.spread,
      scale: arrangement.scale,
      tilt: arrangement.tilt,
      height: arrangement.height,
      lift: vaseTop * 0.45,
    });
    bunch.position.y = 0;
    group.add(bunch);

    // Per-stem pick targets. Each stem carries its own colour, so gathering a
    // light pink peony out of a mixed vase drops a light pink peony in your vase.
    let tallest = 0;
    bunch.children.forEach((stem, i) => {
      const stemData = {
        displayId: display.id,
        stemIndex: i,
        pickable: display.pickable !== false,
        hex: stem.userData.hex,
        colorId: stem.userData.colorId || colour.id,
        colorLabel: stem.userData.colorLabel || colour.label,
      };
      Object.assign(stem.userData, stemData);
      tallest = Math.max(tallest, stem.userData.height || 0);
      stem.traverse((o) => {
        // Sprite heads are pick targets too — the bloom is most of what there
        // is to aim at, and on the sprite species it is the only part of the
        // stem that is not a mesh.
        if (o.isMesh || o.isSprite) {
          Object.assign(o.userData, stemData);
          interactive.push(o);
        }
      });
    });

    /* Freeze the arrangement's transforms.
       Stock stems never move once cut — gathering one only hides it — so their
       matrices can be baked here instead of being recomputed for every one of
       them on every frame. With this much stock standing in the room that is
       hundreds of objects a frame that no longer need touching. Stems the
       visitor gathers are built separately by `addPickedStem` and are animated,
       so they keep their automatic updates. */
    group.updateMatrixWorld(true);
    bunch.traverse((o) => { o.matrixAutoUpdate = false; });

    const headHeight = slot.pos[1] + vaseTop * 0.45 + tallest * arrangement.scale * 0.82;

    // Subtle selection halo on the surface under the display.
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.13 * vaseScale, 0.2 * vaseScale, 40), highlightMat.clone());
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.004;
    group.add(halo);

    if (isFloor) {
      addCollider(slot.pos[0] - 0.3, 0, slot.pos[2] - 0.3, slot.pos[0] + 0.3, 1.2, slot.pos[2] + 0.3);
    }

    const focus = new THREE.Vector3(slot.pos[0], headHeight, slot.pos[2]);
    const stop = CameraRig.focusStop(focus, {
      distance: slot.distance ?? (isFloor ? 1.75 : display.kind === 'shelf' ? 1.3 : 1.35),
      from: new THREE.Vector3().fromArray(slot.from),
      eyeHeight: THREE.MathUtils.clamp(headHeight + 0.06, 1.32, 1.72),
      id: display.id,
    });

    displays.set(display.id, {
      id: display.id,
      data: display,
      group,
      bunch,
      halo,
      focus,
      stop,
      colour,
      colours: groups,
    });
    stops.push({ ...stop, kind: 'display', label: display.title, displayId: display.id });
  }

  /* --- photographic frames + calendar (back wall) ----------------------- */

  const frameMounts = [];
  const frameMat = plasterMaterial(theme, { color: 0xf7f4ee });

  /**
   * Hang a photograph in a frame.
   *
   * The frame opening is portrait; a photograph of any shape is fitted inside
   * it rather than stretched to fill, by scaling the plane down on one axis
   * once the real pixel dimensions are known. If the file is missing the
   * placeholder simply stays, so a wrong path degrades quietly instead of
   * leaving a black rectangle on the wall.
   */
  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;

  /* A photograph off a phone is around 4000 px on its long edge, which as a
     texture is 4000 × 3000 × 4 bytes — 48 MB before mipmaps, and three of them
     would be most of a mobile GPU's budget. The frames are 1.5 m tall and are
     never seen larger than the window, so 2048 px is past the point of any
     visible difference. Cheaper than asking the owner to resize files, and it
     protects the room from whatever gets dropped into images/ later. */
  const PHOTO_MAX_EDGE = LOW_MEMORY ? 1024 : 2048;

  function fitPhoto(image) {
    const longest = Math.max(image.width, image.height);
    if (!longest || longest <= PHOTO_MAX_EDGE) return null;
    const k = PHOTO_MAX_EDGE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * k);
    canvas.height = Math.round(image.height * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function loadFramePhoto(mount, path) {
    loadQueued(
      path,
      (loaded) => {
        const img = loaded.image;
        // Proportions come from the original pixels either way: the resample
        // is uniform, so it cannot change the shape of the photograph.
        const ratio = (img?.width || 1) / (img?.height || 1);

        const reduced = img ? fitPhoto(img) : null;
        const texture = reduced ? new THREE.CanvasTexture(reduced) : loaded;
        if (reduced) loaded.dispose();

        texture.colorSpace = THREE.SRGBColorSpace;
        // A photograph on a wall is seen at a raking angle more often than
        // square on, which is exactly where a low anisotropy sample turns fine
        // detail to mush. Take whatever the device will give.
        texture.anisotropy = maxAnisotropy;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        const { width: ow, height: oh } = mount.opening;
        const openRatio = ow / oh;
        // Fit inside the opening, preserving the photograph's proportions.
        const scaleX = ratio > openRatio ? 1 : ratio / openRatio;
        const scaleY = ratio > openRatio ? openRatio / ratio : 1;
        mount.mesh.scale.set(scaleX, scaleY, 1);

        mount.material.map?.dispose();
        mount.material.map = texture;
        mount.material.color.set(0xffffff);
        mount.material.needsUpdate = true;
        mount.photo = path;
      },
      undefined,
      () => {
        console.warn(`[KUNEY] frame photo not found: ${path} — keeping the placeholder`);
        globalThis.KUNEY_REPORT?.(`frame photo missing: ${path}`);
      }
    );
  }

  /** A soft plaster card bearing the title, shown until a photo is supplied. */
  function framePlaceholder(title, caption) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 682;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ece7de';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(44,42,38,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

    ctx.fillStyle = 'rgba(44,42,38,0.42)';
    ctx.textAlign = 'center';
    ctx.font = '300 40px "Cormorant Garamond", Georgia, serif';
    // Wrap the title across at most three lines.
    const words = String(title || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > canvas.width - 120 && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    let ty = canvas.height / 2 - (lines.length - 1) * 26;
    for (const l of lines.slice(0, 3)) {
      ctx.fillText(l, canvas.width / 2, ty);
      ty += 52;
    }

    if (caption) {
      ctx.fillStyle = 'rgba(44,42,38,0.3)';
      ctx.font = '400 20px Inter, Helvetica, Arial, sans-serif';
      ctx.fillText(String(caption), canvas.width / 2, ty + 18);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  (content.frames || []).slice(0, 3).forEach((f, i) => {
    const w = 1.18;
    const h = 1.56;
    const x = 1.9 + i * 1.34;
    const y = 1.95;
    const openW = w - 0.11;
    const openH = h - 0.11;

    const surround = new THREE.Mesh(slab(w, h, 0.045, { radius: 0.02, bevel: 0.01 }), frameMat);
    surround.rotation.x = Math.PI / 2;
    surround.position.set(x, y, -halfD + 0.03);
    surround.castShadow = true;
    root.add(surround);

    /* Unlit, and out of the tone mapper.
       A photograph in a frame was a lit MeshStandardMaterial, which meant the
       room's soft wall light dimmed it and ACES then pulled the saturation out
       of what was left — so the print on the wall never matched the same file
       shown as an <img> in the side panel. Basic and untone-mapped puts the
       file's own sRGB values on the wall, which is what the panel does too. */
    const imageMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: framePlaceholder(f.title, f.caption),
      toneMapped: false,
    });
    const image = new THREE.Mesh(new THREE.PlaneGeometry(openW, openH), imageMat);
    image.position.set(x, y, -halfD + 0.056);
    image.userData = { frameId: f.id, label: f.title };
    root.add(image);
    interactive.push(image);

    registerHover(image, hoverRim(w + 0.13, h + 0.13, new THREE.Vector3(x, y, -halfD + 0.018)));

    const mount = {
      id: f.id,
      data: f,
      mesh: image,
      material: imageMat,
      opening: { width: openW, height: openH },
    };
    frameMounts.push(mount);
    if (f.photo) loadFramePhoto(mount, f.photo);

    const focus = new THREE.Vector3(x, y, -halfD + 0.06);
    stops.push({
      // Backed off from 1.55 m: the frames are half again as large as they were.
      ...CameraRig.focusStop(focus, {
        distance: 2.0, from: new THREE.Vector3(0, 0, 1), eyeHeight: 1.66, id: `frame-${f.id}`,
      }),
      kind: 'frame',
      label: f.title,
      frameId: f.id,
    });
  });

  // The calendar board — a plaster panel with a canvas face, filled in by
  // js/calendar.js so stock numbers stay live.
  const calBoard = new THREE.Mesh(slab(2.2, 1.62, 0.05, { radius: 0.025, bevel: 0.012 }), frameMat);
  calBoard.rotation.x = Math.PI / 2;
  calBoard.position.set(-3.1, 2.0, -halfD + 0.035);
  calBoard.castShadow = true;
  root.add(calBoard);

  const calMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 });
  const calFace = new THREE.Mesh(new THREE.PlaneGeometry(2.06, 1.48), calMat);
  calFace.position.set(-3.1, 2.0, -halfD + 0.062);
  calFace.userData = { calendar: true, label: 'Availability calendar' };
  root.add(calFace);
  interactive.push(calFace);

  registerHover(calFace, hoverRim(2.34, 1.76, new THREE.Vector3(-3.1, 2.0, -halfD + 0.018)));

  const calFocus = new THREE.Vector3(-3.1, 2.0, -halfD + 0.06);
  const calendarStop = {
    ...CameraRig.focusStop(calFocus, {
      distance: 1.85, from: new THREE.Vector3(0, 0, 1), eyeHeight: 1.95, id: 'calendar',
    }),
    kind: 'calendar',
    label: 'Availability',
  };

  /* --- dust in the light shaft ------------------------------------------ */

  const moteCount = 220;
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * ROOM.oculus.radius * 1.35;
    motePos[i * 3] = ROOM.oculus.x + Math.cos(a) * r;
    motePos[i * 3 + 1] = rng() * ROOM.height;
    motePos[i * 3 + 2] = ROOM.oculus.z + Math.sin(a) * r;
    moteSeed[i] = rng() * 10;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: 0xfff6e6,
      size: 0.022,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    })
  );
  motes.name = 'motes';
  root.add(motes);

  tickers.push((t) => {
    const attr = moteGeo.attributes.position;
    for (let i = 0; i < moteCount; i += 1) {
      const s = moteSeed[i];
      attr.array[i * 3 + 1] += (0.004 + Math.sin(t * 0.3 + s) * 0.0025) * 0.2;
      if (attr.array[i * 3 + 1] > ROOM.height) attr.array[i * 3 + 1] = 0.1;
      attr.array[i * 3] += Math.sin(t * 0.21 + s) * 0.0009;
      attr.array[i * 3 + 2] += Math.cos(t * 0.17 + s * 1.3) * 0.0009;
    }
    attr.needsUpdate = true;
  });

  /* --- camera stops ----------------------------------------------------- */

  const entranceStop = {
    id: 'entrance',
    kind: 'entrance',
    label: 'Entrance',
    position: [0, EYE, ROOM.entrance.z],
    target: [0.2, 1.45, -2],
  };

  const islandStop = {
    id: 'island',
    kind: 'island',
    label: 'The Long Table',
    position: [0.35, EYE, 3.45],
    target: [0.3, 1.02, 1.6],
  };

  /* Stood well back on the open floor, square to the middle of the arc, so
     the whole run of risers is seen front-on rather than edge-on. */
  const seatingStop = {
    id: 'seating',
    kind: 'view',
    label: 'The Steps',
    position: [-0.65, EYE, -0.75],
    target: [-4.60, 0.95, -4.70],
  };

  const portalStop = {
    id: 'portal',
    kind: 'portal',
    label: 'To the Garden',
    position: [-6.1, EYE, ROOM.portal.z + 0.15],
    target: [-halfW - 0.3, 1.5, ROOM.portal.z],
  };

  const orderedStops = [
    entranceStop,
    islandStop,
    ...stops.filter((s) => s.kind === 'display' && s.displayId && displays.get(s.displayId)?.data.kind === 'vase-table'),
    ...stops.filter((s) => s.kind === 'display' && displays.get(s.displayId)?.data.kind === 'shelf'),
    calendarStop,
    ...stops.filter((s) => s.kind === 'frame'),
    seatingStop,
    ...stops.filter((s) => s.kind === 'display' && displays.get(s.displayId)?.data.kind === 'steps'),
    ...stops.filter((s) => s.kind === 'display' && displays.get(s.displayId)?.data.kind === 'floor'),
    portalStop,
  ];

  /* --- environment map -------------------------------------------------- */

  let envTexture = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = tex.environmentScene(theme);
    envTexture = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
  }

  /* --- public surface --------------------------------------------------- */

  const api = {
    root,
    colliders,
    interactive,
    displays,
    frames: frameMounts,
    stops: orderedStops,
    entranceStop,
    islandStop,
    portalStop,
    calendarStop,
    calendarMaterial: calMat,
    stoneReady,
    envTexture,
    vase: { group: vaseGroup, holder: stemHolder, water, hero: heroVase },
    bouquet: { group: bouquetGroup, paperInner, paperOuter, ribbon, tails, state: wrapState },
    printer,
    bounds: new THREE.Box3(
      new THREE.Vector3(-halfW + 0.5, 0, -halfD + 0.5),
      new THREE.Vector3(halfW - 0.5, ROOM.height, halfD - 0.5)
    ),

    /**
     * Hang (or replace) a photograph in one of the wall frames.
     * @param {string} frameId  id from content.frames
     * @param {string} path     e.g. 'images/wrapped-01.jpg'; empty restores the
     *                          plaster placeholder
     */
    setFramePhoto(frameId, path) {
      const mount = frameMounts.find((m) => m.id === frameId);
      if (!mount) return false;
      if (!path) {
        mount.material.map?.dispose();
        mount.material.map = framePlaceholder(mount.data.title, mount.data.caption);
        mount.material.needsUpdate = true;
        mount.mesh.scale.set(1, 1, 1);
        mount.photo = '';
        return true;
      }
      loadFramePhoto(mount, path);
      return true;
    },

    /** Fade the halo under one display up and everything else down. */
    highlight(displayId) {
      selectedDisplayId = displayId;
      for (const [id, d] of displays) {
        d.halo.material.userData.target = id === displayId ? 0.5 : 0;
      }
    },

    /**
     * Light whatever the pointer is over.
     *
     * Takes the hit object rather than an id so it works for every kind of
     * target without the caller having to know which is which, and clears
     * everything first so a hover can never be left lit. Pass null to clear.
     */
    setHover(object) {
      hovered = object || null;
      const glow = object?.userData?.hoverGlow || null;
      for (const g of hoverGlows) {
        g.material.userData.target = g === glow ? 0.5 : 0;
      }
      const displayId = object?.userData?.displayId || null;
      for (const [id, d] of displays) {
        if (id === selectedDisplayId) continue;   // selection outranks hover
        d.halo.material.userData.target = id === displayId ? 0.3 : 0;
      }
    },

    get hovered() {
      return hovered;
    },

    update(dt, elapsed) {
      for (const fn of tickers) fn(elapsed, dt);

      // Ease halo and hover-glow opacities.
      const ease = Math.min(1, dt * 7);
      for (const d of displays.values()) {
        const mat = d.halo.material;
        const target = mat.userData.target ?? 0;
        mat.opacity += (target - mat.opacity) * ease;
      }
      for (const g of hoverGlows) {
        const mat = g.material;
        const target = mat.userData.target ?? 0;
        mat.opacity += (target - mat.opacity) * ease;
        g.visible = mat.opacity > 0.004;
      }

      // Printer: paper creeps out, then settles.
      const p = printer.userData;
      if (p.printing > 0) {
        p.printing = Math.max(0, p.printing - dt / 2.6);
        const progress = 1 - p.printing;
        p.paper.visible = true;
        const out = Math.min(1, progress * 1.25);
        p.paper.scale.y = 0.08 + out * 0.92;
        p.paper.position.z = 0.14 + out * 0.19;
        p.paper.position.y = 0.148 - out * 0.02;
        p.lamp.emissiveIntensity = 0.35 + Math.sin(progress * 40) * 0.3;
        if (p.printing === 0) p.lamp.emissiveIntensity = 0.35;
      }

      if (wrapState.phase === 'running') advanceWrap(dt);
    },

    print() {
      printer.userData.printing = 1;
      printer.userData.paper.visible = true;
    },

    resetPrinter() {
      printer.userData.printing = 0;
      printer.userData.paper.visible = false;
      printer.userData.lamp.emissiveIntensity = 0.35;
    },

    /**
     * Wrap the gathered stems: they rise out of the water, draw together, take
     * two sheets of paper and a ribbon, and are laid on the marble.
     * @param {{instant?: boolean}} opts `instant` jumps to the finished state,
     *        for anyone who prefers reduced motion.
     * @returns {number} seconds the sequence will take — 0 if there is nothing
     *        to wrap, so the caller can go straight to the printer.
     */
    wrap({ instant = false } = {}) {
      if (stemHolder.children.length === 0 && bouquetGroup.children.length <= 4) return 0;
      if (wrapState.phase !== 'idle') return 0;

      // Take the stems out of the vase's holder and into the bouquet, which
      // shares the same transform — nothing appears to move.
      for (const stem of [...stemHolder.children]) bouquetGroup.add(stem);
      captureStemPoses();
      WRAP.rest.y = settleHeight();

      if (instant) {
        wrapState.phase = 'wrapped';
        wrapState.t = WRAP_DURATION;
        applyWrap(WRAP_DURATION);
        return 0;
      }

      wrapState.phase = 'running';
      wrapState.t = 0;
      applyWrap(0);
      return WRAP_DURATION;
    },

    /** Undo the wrap so more stems can be gathered. */
    resetWrap() {
      if (wrapState.phase === 'idle') return;
      for (const entry of wrapState.stems) {
        entry.stem.position.copy(entry.from);
        entry.stem.rotation.x = entry.fromRot.x;
        entry.stem.rotation.z = entry.fromRot.z;
        stemHolder.add(entry.stem);
      }
      wrapState.stems = [];
      wrapState.phase = 'idle';
      wrapState.t = 0;

      bouquetGroup.position.set(0, 0, 0);
      bouquetGroup.rotation.set(0, 0, 0);
      for (const sheet of [paperInner, paperOuter]) {
        sheet.visible = false;
        sheet.geometry.setDrawRange(0, 0);
      }
      ribbon.visible = false;
      ribbon.scale.setScalar(1);
      ribbon.position.y = WRAP.ribbonY;
      tails.visible = false;
    },

    get isWrapped() {
      return wrapState.phase !== 'idle';
    },

    /** Drop a picked stem into the customer's vase. */
    addPickedStem(recipeId, hex, index) {
      // Gathering again after a wrap means the bouquet is being opened up.
      if (wrapState.phase !== 'idle') api.resetWrap();

      const stem = createStem(recipeId, hex, {
        rng,
        scale: 0.94,
        openness: 0.85 + rng() * 0.15,
      });
      const n = stemHolder.children.length;
      const yaw = n * 2.399;
      // Held a little tighter than they used to be: this vase draws in at the
      // shoulder, and a wider fan put stems out through the glass.
      const r = Math.min(0.046, 0.010 + n * 0.005);
      stem.position.set(Math.cos(yaw) * r, STEM_BASE_Y, Math.sin(yaw) * r);
      const lean = Math.min(0.26, 0.06 + n * 0.02);
      stem.rotation.z = -Math.cos(yaw) * lean;
      stem.rotation.x = Math.sin(yaw) * lean;
      stem.userData.dropFrom = 0.42;
      stemHolder.add(stem);
      water.visible = true;

      // Small drop-in animation.
      const startY = stem.position.y + 0.42;
      const endY = stem.position.y;
      stem.position.y = startY;
      let t = 0;
      const stop = () => {
        const i = tickers.indexOf(anim);
        if (i >= 0) tickers.splice(i, 1);
      };
      const anim = (_e, dt) => {
        // If the stem has been taken for wrapping, get out of the way rather
        // than fighting the wrap for control of its position.
        if (stem.parent !== stemHolder) {
          stem.position.y = endY;
          stop();
          return;
        }
        t = Math.min(1, t + dt / 0.55);
        const e = 1 - Math.pow(1 - t, 3);
        stem.position.y = startY + (endY - startY) * e;
        if (t >= 1) stop();
      };
      tickers.push(anim);
      return stem;
    },

    clearVase() {
      api.resetWrap();
      for (const child of [...stemHolder.children]) {
        stemHolder.remove(child);
        /* Sprites are skipped: every THREE.Sprite in the app shares one
           geometry, so disposing a bloom's would take every other bloom in
           the room with it. Their textures are cached and shared too. */
        child.traverse((o) => { if (!o.isSprite) o.geometry?.dispose?.(); });
      }
      water.visible = false;
    },

    applyEnvironment(scene) {
      if (envTexture) {
        scene.environment = envTexture;
        scene.environmentIntensity = 0.9;
      }
      // `theme.wall` is the background colour only, behind the room's geometry.
      scene.background = new THREE.Color(theme.wall).multiplyScalar(0.92);
    },
  };

  return api;
}
