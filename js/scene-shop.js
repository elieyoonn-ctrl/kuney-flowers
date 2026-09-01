/* ==========================================================================
   The shop interior.

   A tall, pale room: travertine floor, lime plaster walls, a circular oculus
   that drops a moving pool of daylight on the stone, curved plaster seating on
   the left, a raw concrete column, an olive tree in a weathered pot, a low
   white table with cylindrical stools, and — at the centre — the long jade
   marble island where flowers are gathered, wrapped and invoiced.

   The oculus light is a real shadow-casting directional light shining through
   a hole in the ceiling geometry, so the bright ellipse on the floor is cast,
   not painted.
   ========================================================================== */

import * as THREE from 'three';
import * as tex from './textures.js';
import { slab, planeWithHole, turned, amphitheatre, VASE_PROFILES, POT_PROFILE, seeded } from './geometry.js';
import { createBunch, createStem, createOliveTree } from './flowers.js';
import { CameraRig } from './camera-rig.js';

export const ROOM = {
  width: 16,      // x: -8 .. 8
  depth: 22,      // z: -11 .. 11
  height: 6.2,
  oculus: { radius: 2.15, x: 0.4, z: -1.2 },
  entrance: { z: 9.4 },
  island: { x: 0, z: 1.6, width: 4.4, depth: 1.06, height: 0.92 },
  portal: { x: -7.94, z: 5.4, width: 1.34, height: 2.55 },
};

const EYE = 1.58;

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
    { pos: [-0.30, ROOM.island.height, 1.20], profile: 'bud', from: [-0.1, 0, 1], distance: 1.85 },
  ],
  shelf: [
    { pos: [7.78, 1.04, -0.62], profile: 'bud', from: [-1, 0, 0.1] },
    { pos: [7.78, 1.04, 0.58], profile: 'cylinder', from: [-1, 0, 0] },
    { pos: [7.78, 1.04, 1.82], profile: 'bud', from: [-1, 0, -0.1] },
    { pos: [7.78, 1.76, -0.04], profile: 'bud', from: [-1, 0, 0.05] },
    { pos: [7.78, 1.76, 1.22], profile: 'cylinder', from: [-1, 0, -0.05] },
  ],
  floor: [
    { pos: [-2.70, 0, 4.40], profile: 'tall', from: [0.2, 0, 1] },
    { pos: [3.70, 0, -7.10], profile: 'tall', from: [-0.2, 0, 1] },
  ],
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

/** A wall panel, optionally with a rectangular opening built from four slabs. */
function wallWithOpening(width, height, material, opening) {
  const group = new THREE.Group();
  const add = (w, h, x, y) => {
    if (w <= 0.001 || h <= 0.001) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, 0);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  if (!opening) {
    add(width, height, 0, height / 2);
    return group;
  }

  const { x: ox, width: ow, height: oh } = opening;
  const left = ox - ow / 2 + width / 2;   // distance from the wall's left edge
  const right = width - (ox + ow / 2 + width / 2);

  add(left, height, -width / 2 + left / 2, height / 2);
  add(right, height, width / 2 - right / 2, height / 2);
  add(ow, height - oh, ox, oh + (height - oh) / 2);
  return group;
}

/** Glass: full transmission for the hero vase, cheap fake glass elsewhere. */
function glassMaterial({ hero = false } = {}) {
  if (hero) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.98,
      thickness: 0.22,
      ior: 1.48,
      roughness: 0.045,
      metalness: 0,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      envMapIntensity: 1.25,
      specularIntensity: 1,
    });
  }
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

  const floorTex = tex.travertine(theme.floor, { tiles: 2 });
  floorTex.map.repeat.set(8, 11);
  floorTex.normalMap.repeat.set(8, 11);
  floorTex.roughnessMap.repeat.set(8, 11);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    new THREE.MeshStandardMaterial({
      map: floorTex.map,
      normalMap: floorTex.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: floorTex.roughnessMap,
      roughness: 0.78,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  root.add(floor);

  /* --- walls ------------------------------------------------------------ */

  const wallMat = plasterMaterial(theme, { side: THREE.FrontSide });

  const back = wallWithOpening(ROOM.width, ROOM.height, wallMat, null);
  back.position.set(0, 0, -halfD);
  root.add(back);

  const front = wallWithOpening(ROOM.width, ROOM.height, wallMat, {
    x: 0, width: 3.0, height: 2.9,
  });
  front.position.set(0, 0, halfD);
  front.rotation.y = Math.PI;
  root.add(front);

  const right = wallWithOpening(ROOM.depth, ROOM.height, wallMat, null);
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

  const ceilingMat = plasterMaterial(theme, { color: 0xfbf9f5, side: THREE.DoubleSide });
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

  // Small recessed downlights.
  const recessMat = new THREE.MeshBasicMaterial({ color: 0xfff4e4, toneMapped: false });
  const recessRing = plasterMaterial(theme, { color: 0xf4f1ea });
  const recessSpots = [
    [-4.6, -6.0], [-4.6, 0.5], [-4.6, 6.0],
    [4.6, -6.0], [4.6, 0.5], [4.6, 6.0],
    [0, -8.4], [0, 5.6],
  ];
  recessSpots.forEach(([x, z], i) => {
    const rim = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), recessRing);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, ROOM.height - 0.004, z);
    root.add(rim);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), recessMat);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(x, ROOM.height - 0.012, z);
    root.add(bulb);
    // Only a few carry real lights; the rest are geometry only.
    if (i % 3 === 0) {
      const p = new THREE.PointLight(0xfff1dd, 5.5, 9, 2);
      p.position.set(x, ROOM.height - 0.3, z);
      root.add(p);
    }
  });

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
  sun.shadow.mapSize.set(2048, 2048);
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
  const fill = new THREE.DirectionalLight(0xf6ece0, 0.5);
  fill.position.set(-3, 4, 12);
  root.add(fill);

  /* --- amphitheatre seating (left) -------------------------------------- */

  const seatMat = plasterMaterial(theme, { color: 0xfaf8f4, side: THREE.DoubleSide });
  const seating = new THREE.Mesh(
    amphitheatre({
      tiers: 4,
      innerRadius: 1.5,
      tread: 0.66,
      rise: 0.40,
      fillet: 0.08,
      thetaStart: Math.PI * 0.34,
      thetaLength: Math.PI * 0.72,
      segments: 96,
    }),
    seatMat
  );
  seating.position.set(-7.4, 0, -2.6);
  seating.castShadow = true;
  seating.receiveShadow = true;
  root.add(seating);
  addCollider(-8, 0, -5.6, -4.1, 1.7, 0.6);

  /* --- concrete column -------------------------------------------------- */

  const concreteTex = tex.concrete(theme.concrete);
  concreteTex.map.repeat.set(2, 3);
  concreteTex.normalMap.repeat.set(2, 3);
  const column = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, ROOM.height, 0.72),
    new THREE.MeshStandardMaterial({
      map: concreteTex.map,
      normalMap: concreteTex.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: concreteTex.roughnessMap,
      roughness: 0.94,
      metalness: 0,
    })
  );
  column.position.set(-3.9, ROOM.height / 2, -5.4);
  column.castShadow = true;
  column.receiveShadow = true;
  root.add(column);
  addCollider(-4.4, 0, -5.9, -3.4, ROOM.height, -4.9);

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

  const lowTableMat = plasterMaterial(theme, { color: 0xfbfaf6, roughness: 0.72 });
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
      lowTableMat
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

  /* --- the jade marble island ------------------------------------------- */

  const jade = tex.jadeMarble(theme.island, theme.islandVein);
  const jadeMat = new THREE.MeshPhysicalMaterial({
    map: jade.map,
    normalMap: jade.normalMap,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: jade.roughnessMap,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.1,
  });

  const islandTop = new THREE.Mesh(
    slab(ROOM.island.width, ROOM.island.depth, 0.11, {
      radius: 0.075,
      bevel: 0.032,
      wobble: 0.022,        // the raw, hand-finished edge
      wobbleFrequency: 3.1,
    }),
    jadeMat
  );
  islandTop.position.set(ROOM.island.x, ROOM.island.height - 0.055, ROOM.island.z);
  islandTop.castShadow = true;
  islandTop.receiveShadow = true;
  islandTop.name = 'island-top';
  root.add(islandTop);

  const islandBody = new THREE.Mesh(
    slab(ROOM.island.width - 0.22, ROOM.island.depth - 0.16, ROOM.island.height - 0.11, {
      radius: 0.05, bevel: 0.02,
    }),
    jadeMat
  );
  islandBody.position.set(ROOM.island.x, (ROOM.island.height - 0.11) / 2, ROOM.island.z);
  islandBody.castShadow = true;
  islandBody.receiveShadow = true;
  root.add(islandBody);

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

  const shears = new THREE.Group();
  for (const side of [-1, 1]) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.004, 0.011),
      new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.28, metalness: 0.75 })
    );
    blade.position.set(0.07, 0, side * 0.006);
    blade.rotation.y = side * 0.06;
    blade.castShadow = true;
    shears.add(blade);

    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.021, 0.005, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0x2f2d29, roughness: 0.5 })
    );
    handle.position.set(-0.02, 0, side * 0.012);
    handle.rotation.y = Math.PI / 2;
    shears.add(handle);
  }
  shears.position.set(-0.92, ROOM.island.height + 0.006, 1.20);
  shears.rotation.y = -0.5;
  root.add(shears);

  /* --- the customer's vase (hero glass) -------------------------------- */

  const vaseGroup = new THREE.Group();
  vaseGroup.name = 'customer-vase';
  vaseGroup.position.set(0.92, ROOM.island.height, 1.46);
  root.add(vaseGroup);

  const heroVase = new THREE.Mesh(turned(VASE_PROFILES.cylinder, { segments: 56 }), glassMaterial({ hero: true }));
  heroVase.scale.setScalar(1.18);
  heroVase.name = 'hero-vase';
  vaseGroup.add(heroVase);

  // A closed column of water filling the lower two thirds of the vase.
  const water = new THREE.Mesh(
    turned([[0.001, 0.004], [0.082, 0.004], [0.082, 0.19], [0.001, 0.19]], { segments: 40, smooth: 1 }),
    waterMaterial()
  );
  water.scale.setScalar(1.18);
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
    // Stems are cut at y = 0.1 and lift by 0.15, so the paper has to start at
    // the cut end (0.20) and rise over the lower stems — not at the group
    // origin, which is down inside the vase.
    coneBase: 0.20,
    ribbonY: 0.30,
    /* Where the finished bouquet comes to rest, relative to the vase.

       It is laid flat along the island's long axis, in the clear span kept
       between the last display and the customer's vase — the wrapping bench.
       Tipping it toward the viewer instead would cantilever the flower heads
       half a metre past the front edge, which reads as falling off.

       `y` is measured at wrap time — see `settleHeight` — because a bouquet on
       its side has to clear its own radius, and that depends on the paper cone
       and on whatever the visitor happened to gather. */
    /* A tilt about +Z lays the stems toward -X, so the pivot sits at the right
       end of the bench, just clear of the vase, and the bouquet extends left. */
    rest: { x: -0.18, y: 0.02, z: 0.12, tilt: 1.45, turn: 0.34 },
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
  vaseHit.position.y = 0.25;
  vaseHit.userData = { vase: true, label: 'Your vase' };
  vaseGroup.add(vaseHit);
  interactive.push(vaseHit);

  /* --- printer ---------------------------------------------------------- */

  const printer = buildPrinter();
  printer.position.set(1.86, ROOM.island.height, 1.72);
  printer.rotation.y = -0.28;
  root.add(printer);

  const printerHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.34, 0.42),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  printerHit.position.set(1.86, ROOM.island.height + 0.15, 1.72);
  printerHit.userData = { printer: true, label: 'Printer' };
  root.add(printerHit);
  interactive.push(printerHit);

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

    const vessel = new THREE.Mesh(turned(profile, { segments: 40 }), glassMaterial());
    vessel.scale.setScalar(vaseScale);
    vessel.castShadow = false;
    group.add(vessel);

    const vaseTop = profile[profile.length - 1][1] * vaseScale;

    const colour = content.palette.find((c) => c.id === display.colorId) || content.palette[0];
    const count = isFloor ? 7 : display.kind === 'shelf' ? 6 : 9;
    const bunch = createBunch(display.bloom, colour.hex, count, {
      rng,
      spread: isFloor ? 0.13 : 0.06,
      scale: isFloor ? 1.5 : 1,
      lift: vaseTop * 0.45,
      tilt: display.kind === 'shelf' ? 0.2 : 0.3,
    });
    bunch.position.y = 0;
    group.add(bunch);

    // Per-stem pick targets.
    let tallest = 0;
    bunch.children.forEach((stem, i) => {
      stem.userData.displayId = display.id;
      stem.userData.stemIndex = i;
      stem.userData.pickable = display.pickable !== false;
      tallest = Math.max(tallest, stem.userData.height || 0);
      stem.traverse((o) => {
        if (o.isMesh) {
          o.userData.displayId = display.id;
          o.userData.stemIndex = i;
          o.userData.pickable = display.pickable !== false;
          interactive.push(o);
        }
      });
    });

    const headHeight = slot.pos[1] + vaseTop * 0.45 + tallest * (isFloor ? 1.5 : 1) * 0.82;

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
    });
    stops.push({ ...stop, kind: 'display', label: display.title, displayId: display.id });
  }

  /* --- photographic frames + calendar (back wall) ----------------------- */

  const frameMounts = [];
  const frameMat = plasterMaterial(theme, { color: 0xf7f4ee });
  const textureLoader = new THREE.TextureLoader();

  /**
   * Hang a photograph in a frame.
   *
   * The frame opening is portrait; a photograph of any shape is fitted inside
   * it rather than stretched to fill, by scaling the plane down on one axis
   * once the real pixel dimensions are known. If the file is missing the
   * placeholder simply stays, so a wrong path degrades quietly instead of
   * leaving a black rectangle on the wall.
   */
  function loadFramePhoto(mount, path) {
    textureLoader.load(
      path,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;

        const { width: ow, height: oh } = mount.opening;
        const img = texture.image;
        const ratio = (img?.width || 1) / (img?.height || 1);
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
    const w = 0.78;
    const h = 1.04;
    const x = 2.0 + i * 1.15;
    const y = 1.92;
    const openW = w - 0.09;
    const openH = h - 0.09;

    const surround = new THREE.Mesh(slab(w, h, 0.045, { radius: 0.02, bevel: 0.01 }), frameMat);
    surround.rotation.x = Math.PI / 2;
    surround.position.set(x, y, -halfD + 0.03);
    surround.castShadow = true;
    root.add(surround);

    const imageMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: framePlaceholder(f.title, f.caption),
      roughness: 0.86,
      metalness: 0,
    });
    const image = new THREE.Mesh(new THREE.PlaneGeometry(openW, openH), imageMat);
    image.position.set(x, y, -halfD + 0.056);
    image.userData = { frameId: f.id, label: f.title };
    root.add(image);
    interactive.push(image);

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
      ...CameraRig.focusStop(focus, {
        distance: 1.55, from: new THREE.Vector3(0, 0, 1), eyeHeight: 1.62, id: `frame-${f.id}`,
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

  const seatingStop = {
    id: 'seating',
    kind: 'view',
    label: 'The Steps',
    position: [-3.0, EYE, -1.0],
    target: [-6.6, 1.1, -2.6],
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
      for (const [id, d] of displays) {
        d.halo.material.userData.target = id === displayId ? 0.5 : 0;
      }
    },

    update(dt, elapsed) {
      for (const fn of tickers) fn(elapsed, dt);

      // Ease halo opacities.
      for (const d of displays.values()) {
        const mat = d.halo.material;
        const target = mat.userData.target ?? 0;
        mat.opacity += (target - mat.opacity) * Math.min(1, dt * 5);
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
      const r = Math.min(0.055, 0.012 + n * 0.006);
      stem.position.set(Math.cos(yaw) * r, 0.1, Math.sin(yaw) * r);
      const lean = Math.min(0.34, 0.08 + n * 0.025);
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
        child.traverse((o) => o.geometry?.dispose?.());
      }
      water.visible = false;
    },

    applyEnvironment(scene) {
      if (envTexture) {
        scene.environment = envTexture;
        scene.environmentIntensity = 0.9;
      }
      scene.background = new THREE.Color(theme.wall).multiplyScalar(0.92);
    },
  };

  return api;
}
