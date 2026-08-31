/* ==========================================================================
   The garden.

   A walled garden in the same pale plaster language as the shop: gravel paths,
   six raised stone beds the visitor actually plants and waters, a long shallow
   basin, clipped hedging, a plaster bench, and a gate back inside.

   This module owns the place. What grows in it is driven by js/garden-game.js,
   which calls `setPlant(index, stageInfo)` whenever a plot changes.
   ========================================================================== */

import * as THREE from 'three';
import * as tex from './textures.js';
import { slab, turned, POT_PROFILE, seeded } from './geometry.js';
import { createStem, createOliveTree } from './flowers.js';
import { CameraRig } from './camera-rig.js';

const EYE = 1.58;

export const GARDEN = {
  width: 24,
  depth: 26,
  wallHeight: 2.9,
  gate: { x: 0, z: 12.9 },
};

/* Bed centres. Two rows of three, generous gravel between them. */
const BEDS = [
  [-3.6, 1.2], [0, 1.2], [3.6, 1.2],
  [-3.6, -3.6], [0, -3.6], [3.6, -3.6],
];

const BED = { width: 2.5, depth: 1.9, height: 0.44, rim: 0.13 };

export function buildGarden(content, { renderer } = {}) {
  const theme = content.theme;
  const rng = seeded(88112);
  const root = new THREE.Group();
  root.name = 'garden';

  const colliders = [];
  const interactive = [];
  const tickers = [];
  const plots = [];

  const addCollider = (minX, minY, minZ, maxX, maxY, maxZ) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ)
    ));
  };

  const halfW = GARDEN.width / 2;
  const halfD = GARDEN.depth / 2;

  const plasterTex = tex.plaster(theme.plaster);
  const plaster = (color = 0xf8f6f1, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      map: plasterTex.map,
      normalMap: plasterTex.normalMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.93,
      metalness: 0,
      ...extra,
    });

  /* --- ground: gravel with a lawn panel and stone paths ------------------ */

  const gravelTex = tex.gravel();
  const gravelMaps = {
    map: gravelTex.map.clone(),
    normalMap: gravelTex.normalMap.clone(),
    roughnessMap: gravelTex.roughnessMap.clone(),
  };
  for (const t of Object.values(gravelMaps)) {
    t.repeat.set(18, 20);
    t.needsUpdate = true;
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GARDEN.width, GARDEN.depth),
    new THREE.MeshStandardMaterial({
      ...gravelMaps,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.92,
      metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  const lawnTex = tex.lawn();
  const lawnMaps = {
    map: lawnTex.map.clone(),
    normalMap: lawnTex.normalMap.clone(),
    roughnessMap: lawnTex.roughnessMap.clone(),
  };
  for (const t of Object.values(lawnMaps)) {
    t.repeat.set(8, 6);
    t.needsUpdate = true;
  }
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 5.4),
    new THREE.MeshStandardMaterial({
      ...lawnMaps,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.95,
      metalness: 0,
    })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0.006, -8.4);
  grass.receiveShadow = true;
  root.add(grass);

  // Stone path running from the gate to the far end.
  const paveTex = tex.travertine(theme.floor, { tiles: 1 });
  const paveMaps = {
    map: paveTex.map.clone(),
    normalMap: paveTex.normalMap.clone(),
    roughnessMap: paveTex.roughnessMap.clone(),
  };
  for (const t of Object.values(paveMaps)) {
    t.repeat.set(2, 14);
    t.needsUpdate = true;
  }
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 24),
    new THREE.MeshStandardMaterial({
      ...paveMaps,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.8,
      metalness: 0,
    })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.012, 0);
  path.receiveShadow = true;
  root.add(path);

  /* --- walls ------------------------------------------------------------ */

  const wallMat = plaster(0xf7f4ee, { side: THREE.DoubleSide });
  const capMat = plaster(0xfbf9f5);

  const buildWall = (width, x, z, rotationY, opening) => {
    const group = new THREE.Group();
    const add = (w, h, ox, oy) => {
      if (w <= 0.001 || h <= 0.001) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.34), wallMat);
      m.position.set(ox, oy, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    };
    const h = GARDEN.wallHeight;
    if (opening) {
      const left = (opening.x - opening.width / 2) - (-width / 2);
      const right = (width / 2) - (opening.x + opening.width / 2);
      add(left, h, -width / 2 + left / 2, h / 2);
      add(right, h, width / 2 - right / 2, h / 2);
      add(opening.width, h - opening.height, opening.x, opening.height + (h - opening.height) / 2);
    } else {
      add(width, h, 0, h / 2);
    }
    // Soft coping along the top.
    const cap = new THREE.Mesh(slab(width, 0.5, 0.11, { radius: 0.05, bevel: 0.028 }), capMat);
    cap.position.set(0, h + 0.05, 0);
    cap.castShadow = true;
    group.add(cap);

    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    root.add(group);
  };

  buildWall(GARDEN.width, 0, -halfD, 0, null);
  buildWall(GARDEN.depth, -halfW, 0, Math.PI / 2, null);
  buildWall(GARDEN.depth, halfW, 0, Math.PI / 2, null);
  // The shop wall, with the doorway back inside.
  buildWall(GARDEN.width, 0, halfD, 0, { x: 0, width: 1.5, height: 2.6 });

  addCollider(-halfW - 1, 0, -halfD - 1, halfW + 1, GARDEN.wallHeight, -halfD + 0.25);
  addCollider(-halfW - 1, 0, -halfD - 1, -halfW + 0.25, GARDEN.wallHeight, halfD + 1);
  addCollider(halfW - 0.25, 0, -halfD - 1, halfW + 1, GARDEN.wallHeight, halfD + 1);
  addCollider(-halfW - 1, 0, halfD - 0.25, halfW + 1, GARDEN.wallHeight, halfD + 1);

  /* --- gate back to the shop -------------------------------------------- */

  const gateGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.6),
    new THREE.MeshBasicMaterial({ color: 0xf6f0e4, toneMapped: false })
  );
  gateGlow.position.set(GARDEN.gate.x, 1.3, halfD - 0.18);
  gateGlow.rotation.y = Math.PI;
  root.add(gateGlow);

  const gateHit = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  gateHit.position.set(GARDEN.gate.x, 1.3, halfD - 0.3);
  gateHit.rotation.y = Math.PI;
  gateHit.userData = { portal: 'shop', label: 'Back to the shop' };
  root.add(gateHit);
  interactive.push(gateHit);

  /* --- raised beds ------------------------------------------------------ */

  const soilTex = tex.soil();
  const soilMaps = {
    map: soilTex.map.clone(),
    normalMap: soilTex.normalMap.clone(),
    roughnessMap: soilTex.roughnessMap.clone(),
  };
  for (const t of Object.values(soilMaps)) {
    t.repeat.set(3, 2);
    t.needsUpdate = true;
  }
  const soilMat = new THREE.MeshStandardMaterial({
    ...soilMaps,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.98,
    metalness: 0,
  });

  const bedMat = plaster(0xf4f0e8, { roughness: 0.95 });

  BEDS.slice(0, Math.max(1, content.garden.plotCount)).forEach(([x, z], index) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    root.add(group);

    // Rim: four soft slabs so the bed reads as built, not extruded.
    const rimH = BED.height;
    for (const [w, d, ox, oz] of [
      [BED.width, BED.rim, 0, -BED.depth / 2 + BED.rim / 2],
      [BED.width, BED.rim, 0, BED.depth / 2 - BED.rim / 2],
      [BED.rim, BED.depth - BED.rim * 2, -BED.width / 2 + BED.rim / 2, 0],
      [BED.rim, BED.depth - BED.rim * 2, BED.width / 2 - BED.rim / 2, 0],
    ]) {
      const wall = new THREE.Mesh(slab(w, d, rimH, { radius: 0.035, bevel: 0.02 }), bedMat);
      wall.position.set(ox, rimH / 2, oz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
    }

    const soilTop = new THREE.Mesh(
      new THREE.PlaneGeometry(BED.width - BED.rim * 2, BED.depth - BED.rim * 2),
      soilMat
    );
    soilTop.rotation.x = -Math.PI / 2;
    soilTop.position.y = rimH - 0.07;
    soilTop.receiveShadow = true;
    soilTop.userData = { plotIndex: index, label: `Bed ${index + 1}` };
    group.add(soilTop);
    interactive.push(soilTop);

    // Where the plant lives.
    const plantHost = new THREE.Group();
    plantHost.position.y = rimH - 0.07;
    group.add(plantHost);

    // A little enamel label stake, so a bed always looks tended.
    const stake = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.16, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.5 })
    );
    stake.position.set(-BED.width / 2 + 0.32, rimH + 0.12, BED.depth / 2 - 0.22);
    stake.rotation.y = 0.2;
    group.add(stake);
    const stakeLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.6 })
    );
    stakeLeg.position.set(-BED.width / 2 + 0.32, rimH + 0.0, BED.depth / 2 - 0.22);
    group.add(stakeLeg);

    addCollider(x - BED.width / 2, 0, z - BED.depth / 2, x + BED.width / 2, rimH, z + BED.depth / 2);

    const focus = new THREE.Vector3(x, rimH + 0.32, z);
    const stop = {
      ...CameraRig.focusStop(focus, {
        distance: 1.95,
        from: new THREE.Vector3(0.15, 0, 1),
        eyeHeight: 1.42,
        id: `plot-${index}`,
      }),
      kind: 'plot',
      label: `Bed ${index + 1}`,
      plotIndex: index,
    };

    plots.push({ index, group, host: plantHost, soilTop, focus, stop, plant: null, sway: 0.008 });
  });

  /* --- basin ------------------------------------------------------------ */

  const basinGroup = new THREE.Group();
  basinGroup.position.set(0, 0, 6.4);
  root.add(basinGroup);

  const basinOuter = new THREE.Mesh(slab(7.4, 1.9, 0.32, { radius: 0.06, bevel: 0.03 }), plaster(0xf5f1ea));
  basinOuter.position.y = 0.16;
  basinOuter.castShadow = true;
  basinOuter.receiveShadow = true;
  basinGroup.add(basinOuter);

  const basinWell = new THREE.Mesh(
    new THREE.BoxGeometry(6.9, 0.3, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x9aa9a0, roughness: 0.5 })
  );
  basinWell.position.y = 0.19;
  basinGroup.add(basinWell);

  const basinWater = new THREE.Mesh(
    new THREE.PlaneGeometry(6.9, 1.4, 40, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0xcfe0dc,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
      transmission: 0.35,
      thickness: 0.3,
      envMapIntensity: 1.5,
    })
  );
  basinWater.rotation.x = -Math.PI / 2;
  basinWater.position.y = 0.295;
  basinGroup.add(basinWater);
  addCollider(-3.7, 0, 5.4, 3.7, 0.35, 7.4);

  // A slow ripple across the surface.
  const waterPos = basinWater.geometry.attributes.position;
  const waterBase = Float32Array.from(waterPos.array);
  tickers.push((t) => {
    for (let i = 0; i < waterPos.count; i += 1) {
      const x = waterBase[i * 3];
      const y = waterBase[i * 3 + 1];
      waterPos.array[i * 3 + 2] =
        Math.sin(x * 1.6 + t * 0.9) * 0.006 + Math.cos(y * 2.4 - t * 0.7) * 0.004;
    }
    waterPos.needsUpdate = true;
    basinWater.geometry.computeVertexNormals();
  });

  /* --- hedging, pots, bench, plaque ------------------------------------- */

  const hedgeMat = new THREE.MeshStandardMaterial({
    color: 0x5f7355, roughness: 0.9, metalness: 0,
  });
  for (const [x, z, w, d] of [
    [-8.4, -1.2, 1.1, 12], [8.4, -1.2, 1.1, 12],
    [-8.4, 8.2, 1.1, 5.4], [8.4, 8.2, 1.1, 5.4],
  ]) {
    const hedge = new THREE.Mesh(slab(w, d, 0.82, { radius: 0.16, bevel: 0.1 }), hedgeMat);
    hedge.position.set(x, 0.41, z);
    hedge.castShadow = true;
    hedge.receiveShadow = true;
    root.add(hedge);
    addCollider(x - w / 2, 0, z - d / 2, x + w / 2, 0.85, z + d / 2);
  }

  const potTex = tex.terracotta(theme.terracotta);
  const potMat = new THREE.MeshStandardMaterial({
    map: potTex.map,
    normalMap: potTex.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: potTex.roughnessMap,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const pot = new THREE.Mesh(turned(POT_PROFILE, { segments: 40 }), potMat);
    pot.position.set(side * 1.85, 0, halfD - 1.6);
    pot.castShadow = true;
    pot.receiveShadow = true;
    root.add(pot);

    const tree = createOliveTree({ height: 2.5, rng });
    tree.position.set(side * 1.85, 0.62, halfD - 1.6);
    tree.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(tree);
    addCollider(side * 1.85 - 0.5, 0, halfD - 2.1, side * 1.85 + 0.5, 0.8, halfD - 1.1);

    const canopy = tree.getObjectByName('canopy');
    if (canopy) {
      tickers.push((t) => {
        canopy.rotation.z = Math.sin(t * 0.5 + side) * 0.02;
        canopy.rotation.x = Math.cos(t * 0.4 + side) * 0.014;
      });
    }
  }

  const bench = new THREE.Mesh(slab(2.6, 0.5, 0.14, { radius: 0.05, bevel: 0.03 }), plaster(0xf9f7f3));
  bench.position.set(0, 0.44, -9.6);
  bench.castShadow = true;
  bench.receiveShadow = true;
  root.add(bench);
  for (const dx of [-1.0, 1.0]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.14), plaster(0xf9f7f3));
    leg.position.set(dx, 0.22, -9.6);
    leg.castShadow = true;
    root.add(leg);
  }
  addCollider(-1.4, 0, -9.9, 1.4, 0.5, -9.3);

  // A plaster stele with a plaque linking out to the real shop.
  // slab() puts `thickness` on Y, so this is already an upright plinth.
  const stele = new THREE.Mesh(slab(0.62, 0.36, 1.16, { radius: 0.05, bevel: 0.03 }), plaster(0xf8f5ef));
  stele.position.set(-4.9, 0.58, 8.6);
  stele.rotation.y = 0.32;
  stele.castShadow = true;
  stele.receiveShadow = true;
  root.add(stele);

  const plaqueMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), plaqueMat);
  plaque.position.set(-4.79, 0.86, 8.78);
  plaque.rotation.y = 0.32;
  plaque.userData = { link: content.contact.siteUrl, label: content.garden.ctaLabel };
  root.add(plaque);
  interactive.push(plaque);
  addCollider(-5.3, 0, 8.2, -4.5, 1.2, 9.0);

  /* --- sky + light ------------------------------------------------------ */

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 8;
  skyCanvas.height = 256;
  const sctx = skyCanvas.getContext('2d');
  const sgrad = sctx.createLinearGradient(0, 0, 0, 256);
  sgrad.addColorStop(0, '#9fbdd6');
  sgrad.addColorStop(0.42, '#d9e3e6');
  sgrad.addColorStop(0.66, '#f2ece1');
  sgrad.addColorStop(1, '#efe6d8');
  sctx.fillStyle = sgrad;
  sctx.fillRect(0, 0, 8, 256);
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, toneMapped: false })
  );
  root.add(skyDome);

  root.add(new THREE.HemisphereLight(0xdfeaf2, 0xcfc6b4, 1.05));

  const sun = new THREE.DirectionalLight(0xfff2dc, 3.0);
  sun.position.set(-9, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 46;
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.024;
  root.add(sun);

  /* --- drifting pollen -------------------------------------------------- */

  const count = 260;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = (rng() - 0.5) * GARDEN.width * 0.9;
    pos[i * 3 + 1] = rng() * 4.2 + 0.2;
    pos[i * 3 + 2] = (rng() - 0.5) * GARDEN.depth * 0.9;
    seed[i] = rng() * 10;
  }
  const pollenGeo = new THREE.BufferGeometry();
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pollen = new THREE.Points(
    pollenGeo,
    new THREE.PointsMaterial({
      color: 0xfff8e4, size: 0.03, transparent: true, opacity: 0.55,
      depthWrite: false, sizeAttenuation: true, toneMapped: false,
    })
  );
  root.add(pollen);

  tickers.push((t) => {
    const a = pollenGeo.attributes.position;
    for (let i = 0; i < count; i += 1) {
      const s = seed[i];
      a.array[i * 3] += Math.sin(t * 0.24 + s) * 0.0035 + 0.0012;
      a.array[i * 3 + 1] += Math.sin(t * 0.4 + s * 2) * 0.0022;
      a.array[i * 3 + 2] += Math.cos(t * 0.19 + s * 1.4) * 0.003;
      if (a.array[i * 3] > halfW) a.array[i * 3] = -halfW;
      if (a.array[i * 3 + 1] > 4.6) a.array[i * 3 + 1] = 0.2;
      if (a.array[i * 3 + 1] < 0.1) a.array[i * 3 + 1] = 4.4;
    }
    a.needsUpdate = true;
  });

  /* --- environment map -------------------------------------------------- */

  let envTexture = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(12, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide })
    );
    envScene.add(dome);
    envTexture = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }

  /* --- stops ------------------------------------------------------------ */

  const entranceStop = {
    id: 'garden-entrance',
    kind: 'entrance',
    label: 'Garden',
    position: [0, EYE, halfD - 2.6],
    target: [0, 1.3, -2],
  };

  const stops = [
    entranceStop,
    {
      id: 'basin', kind: 'view', label: 'The Basin',
      position: [0, EYE, 8.6], target: [0, 0.4, 6.2],
    },
    ...plots.map((p) => p.stop),
    {
      id: 'bench', kind: 'view', label: 'The Bench',
      position: [0, EYE, -6.6], target: [0, 1.0, -9.8],
    },
    {
      id: 'plaque', kind: 'link', label: content.garden.ctaLabel,
      position: [-4.1, 1.45, 9.7], target: [-4.79, 0.86, 8.78],
      link: content.contact.siteUrl,
    },
    {
      id: 'garden-gate', kind: 'portal', label: 'Back to the shop',
      position: [0, EYE, halfD - 4.2], target: [0, 1.4, halfD - 0.2],
    },
  ];

  /* --- public surface --------------------------------------------------- */

  return {
    root,
    colliders,
    interactive,
    plots,
    stops,
    entranceStop,
    envTexture,
    bounds: new THREE.Box3(
      new THREE.Vector3(-halfW + 0.8, 0, -halfD + 0.8),
      new THREE.Vector3(halfW - 0.8, GARDEN.wallHeight, halfD - 0.8)
    ),

    /**
     * Show a plant at a given growth stage.
     * @param {number} index plot index
     * @param {null|{recipeId:string, hex:string, openness:number, scale:number}} spec
     */
    setPlant(index, spec) {
      const plot = plots[index];
      if (!plot) return;
      if (plot.plant) {
        plot.host.remove(plot.plant);
        plot.plant.traverse((o) => o.geometry?.dispose?.());
        plot.plant = null;
      }
      if (!spec) return;

      const group = new THREE.Group();
      const localRng = seeded(1000 + index * 37);
      const clusters = spec.stage === 0 ? 0 : Math.min(5, 1 + spec.stage);

      if (spec.stage === 0) {
        // Just-sown: a few disturbed mounds of soil.
        const mound = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0x3f362c, roughness: 1 })
        );
        for (let i = 0; i < 4; i += 1) {
          const m = mound.clone();
          m.position.set((localRng() - 0.5) * 0.9, 0, (localRng() - 0.5) * 0.7);
          m.scale.setScalar(0.7 + localRng() * 0.6);
          group.add(m);
        }
      } else {
        for (let i = 0; i < clusters; i += 1) {
          const stem = createStem(spec.recipeId, spec.hex, {
            rng: localRng,
            scale: spec.scale,
            openness: spec.openness,
          });
          stem.position.set((localRng() - 0.5) * 1.5, 0, (localRng() - 0.5) * 1.05);
          stem.rotation.y = localRng() * Math.PI * 2;
          const lean = (localRng() - 0.5) * 0.14;
          stem.rotation.z = lean;
          stem.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          group.add(stem);
        }
      }

      plot.host.add(group);
      plot.plant = group;
      // Gentle sway, scaled down for seedlings. Stored on the plot rather than
      // pushed as a new ticker, so replanting does not stack animations.
      plot.sway = 0.006 + spec.stage * 0.004;
    },

    update(dt, elapsed) {
      for (const fn of tickers) fn(elapsed, dt);
      for (const plot of plots) {
        if (!plot.plant) continue;
        const phase = plot.index * 1.7;
        plot.plant.rotation.z = Math.sin(elapsed * 0.6 + phase) * plot.sway;
        plot.plant.rotation.x = Math.cos(elapsed * 0.45 + phase) * plot.sway * 0.7;
      }
    },

    applyEnvironment(scene) {
      if (envTexture) {
        scene.environment = envTexture;
        scene.environmentIntensity = 1.1;
      }
      scene.background = null; // the sky dome supplies it
    },
  };
}
