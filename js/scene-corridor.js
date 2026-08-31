/* ==========================================================================
   The threshold.

   A short, almost empty white space that carries the visitor between the shop
   and the garden. Thick curved plaster, a freestanding door panel standing
   slightly ajar with a matte spherical knob, a low plaster bench, and a flush
   white door at the far end holding the light of whatever comes next.

   The camera is driven through it on a scripted dolly (see js/app.js), so the
   only thing this module owns is the geometry and a couple of soft animations.
   ========================================================================== */

import * as THREE from 'three';
import * as tex from './textures.js';
import { slab, turned } from './geometry.js';

const EYE = 1.58;

export function buildCorridor(content) {
  const theme = content.theme;
  const root = new THREE.Group();
  root.name = 'corridor';
  const tickers = [];

  const plasterTex = tex.plaster(theme.plaster);
  const plaster = (color = 0xf8f6f1, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      map: plasterTex.map,
      normalMap: plasterTex.normalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.94,
      metalness: 0,
      ...extra,
    });

  const wallMat = plaster(0xfaf8f4, { side: THREE.DoubleSide });
  const height = 3.5;

  /* --- floor ------------------------------------------------------------ */

  const floorTex = tex.travertine(theme.floor, { tiles: 2 });
  const floorMap = floorTex.map.clone();
  floorMap.needsUpdate = true;
  floorMap.repeat.set(3, 7);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 18),
    new THREE.MeshStandardMaterial({
      map: floorMap,
      normalMap: floorTex.normalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.8,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -3;
  floor.receiveShadow = true;
  root.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(7, 18), plaster(0xfcfbf8));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, -3);
  root.add(ceiling);

  /* --- curved walls ----------------------------------------------------- */

  // Two very large-radius cylinder sections: the walls bow inward gently, so
  // there is not a single hard corner in the space.
  for (const side of [-1, 1]) {
    const bow = new THREE.Mesh(
      new THREE.CylinderGeometry(26, 26, height, 64, 1, true, Math.PI * 0.47, Math.PI * 0.06),
      wallMat
    );
    bow.position.set(side * (2.2 + 26), height / 2, -3);
    bow.rotation.y = side > 0 ? 0 : Math.PI;
    bow.receiveShadow = true;
    root.add(bow);
  }

  // Softly rounded pilasters where the corridor narrows around the door.
  for (const side of [-1, 1]) {
    const pier = new THREE.Mesh(
      turned([[0.001, 0], [0.42, 0], [0.44, 0.06], [0.44, height - 0.06], [0.42, height], [0.001, height]],
        { segments: 28, thetaStart: side > 0 ? Math.PI / 2 : -Math.PI / 2, thetaLength: Math.PI }),
      wallMat
    );
    pier.position.set(side * 1.55, 0, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    root.add(pier);
  }

  /* --- the freestanding door -------------------------------------------- */

  const doorPivot = new THREE.Group();
  // Hinge at the left edge of the opening.
  doorPivot.position.set(-1.12, 0, 0);
  root.add(doorPivot);

  const doorMat = plaster(0xfbfaf7, { roughness: 0.88 });
  // slab(width, depth, thickness) lies in XZ; rotating +90° about X stands it
  // up, so the `depth` argument becomes the height and `thickness` the panel depth.
  const leaf = new THREE.Mesh(
    slab(1.02, 2.42, 0.14, { radius: 0.055, bevel: 0.03 }),
    doorMat
  );
  leaf.rotation.x = Math.PI / 2;
  leaf.position.set(0.51, 1.21, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  doorPivot.add(leaf);

  const knobMat = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.55, metalness: 0.02 });
  for (const z of [-0.09, 0.09]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), knobMat);
    knob.position.set(0.9, 1.02, z);
    knob.castShadow = true;
    doorPivot.add(knob);
  }

  // Ajar, and breathing very slightly as though air moves through the room.
  const ajar = -0.62;
  doorPivot.rotation.y = ajar;
  tickers.push((t) => {
    doorPivot.rotation.y = ajar + Math.sin(t * 0.35) * 0.016;
  });

  /* --- the room beyond -------------------------------------------------- */

  const bench = new THREE.Mesh(slab(2.2, 0.46, 0.14, { radius: 0.05, bevel: 0.03 }), plaster(0xf9f7f3));
  bench.position.set(-1.85, 0.42, -6.2);
  bench.rotation.y = Math.PI / 2;
  bench.castShadow = true;
  bench.receiveShadow = true;
  root.add(bench);

  for (const dz of [-0.85, 0.85]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.14), plaster(0xf9f7f3));
    support.position.set(-1.9, 0.21, -6.2 + dz);
    support.castShadow = true;
    root.add(support);
  }

  // Far wall with a flush door — the light beyond it is the garden.
  const farWall = new THREE.Mesh(new THREE.PlaneGeometry(7, height), plaster(0xfaf8f4));
  farWall.position.set(0, height / 2, -11.5);
  root.add(farWall);

  const flushDoor = new THREE.Mesh(
    slab(1.06, 2.36, 0.06, { radius: 0.04, bevel: 0.016 }),
    plaster(0xfcfbf8)
  );
  flushDoor.rotation.x = Math.PI / 2;
  flushDoor.position.set(0, 1.18, -11.46);
  root.add(flushDoor);

  const flushKnob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 18, 12), knobMat);
  flushKnob.position.set(0.42, 1.02, -11.4);
  root.add(flushKnob);

  // A hairline of light around the far door.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xfff8ec, toneMapped: false })
  );
  halo.position.set(0, 1.2, -11.49);
  root.add(halo);

  /* --- light ------------------------------------------------------------ */

  root.add(new THREE.HemisphereLight(0xfffaf0, 0xe4ddd0, 1.15));

  const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
  key.position.set(2.6, 5.2, 2.0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.normalBias = 0.02;
  root.add(key);

  const beyondLight = new THREE.PointLight(0xfff1de, 9, 9, 2);
  beyondLight.position.set(0, 1.8, -10.4);
  root.add(beyondLight);

  const doorGlow = new THREE.PointLight(0xfff6ea, 3.2, 5, 2);
  doorGlow.position.set(0.4, 1.5, -0.8);
  root.add(doorGlow);

  /* --- the dolly -------------------------------------------------------- */

  // Four beats: standing before the door, easing through the gap, into the
  // room beyond, then up to the far door as the light takes over.
  const path = [
    { position: [0.1, EYE, 4.6], target: [0.0, 1.46, 0.4] },
    { position: [0.34, EYE, 1.35], target: [-0.15, 1.44, -3.2] },
    { position: [0.05, EYE, -2.6], target: [0.0, 1.42, -7.6] },
    { position: [0.0, EYE, -8.4], target: [0.0, 1.28, -11.4] },
  ];

  return {
    root,
    path,
    entryStop: { id: 'threshold', kind: 'threshold', label: 'Threshold', ...path[0] },
    update(dt, elapsed) {
      for (const fn of tickers) fn(elapsed, dt);
    },
    applyEnvironment(scene, envTexture) {
      if (envTexture) {
        scene.environment = envTexture;
        scene.environmentIntensity = 1.05;
      }
      scene.background = new THREE.Color(0xf3efe8);
    },
  };
}
