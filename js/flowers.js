/* ==========================================================================
   Procedural flowers.

   Each bloom is real geometry, not a sprite: petals are parametric surfaces
   (tapered, cupped, curled) arranged in phyllotactic layers, on a bent tube
   stem with foliage. Petals are merged into one mesh per head so a full shop
   of ninety stems still renders in a couple of hundred draw calls.

   `openness` (0 → 1) drives bud-to-bloom, which is what the garden animates.
   ========================================================================== */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/* --- attribute helpers -------------------------------------------------- */

/** Ensure a geometry carries a colour attribute so it can be merged. */
function withColor(geo, color) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return geo;
}

function safeMerge(list) {
  const clean = list.filter(Boolean);
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0];
  return mergeGeometries(clean, false);
}

/* --- petal -------------------------------------------------------------- */

/**
 * A single petal as a parametric sheet.
 *   length / width  overall size
 *   taper           >1 pinches the tip, <1 keeps it broad
 *   cup             curls the cross-section into a spoon
 *   curl            bends the petal back along its length
 *   ruffle          adds a wavy edge (peonies, ranunculus)
 *   tipColor        pale or saturated fade toward the tip
 */
function petalGeometry({
  length = 0.05,
  width = 0.032,
  taper = 1.3,
  cup = 0.45,
  curl = 0.35,
  ruffle = 0,
  notch = 0,
  segU = 9,
  segV = 5,
  baseColor,
  tipColor,
}) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let iu = 0; iu <= segU; iu += 1) {
    const u = iu / segU;
    // Width profile: narrow at the base, widest around 45%, pinched at the tip.
    let w = Math.sin(Math.PI * Math.pow(u, 1 / taper)) * width;
    if (notch > 0) w *= 1 - notch * Math.pow(u, 6);

    for (let iv = 0; iv <= segV; iv += 1) {
      const v = iv / segV - 0.5;
      const edge = Math.abs(v) * 2;

      let x = v * w;
      let y = u * length;
      // Cup across the width, curl back along the length.
      let z = cup * (v * v) * w * 2.6 + curl * Math.pow(u, 2) * length * 0.9;
      if (ruffle > 0) {
        z += Math.sin(v * Math.PI * 3.2 + u * 5.5) * ruffle * w * edge * 0.6;
        y += Math.sin(v * Math.PI * 2.1) * ruffle * w * 0.12;
      }

      positions.push(x, y, z);
      uvs.push(v + 0.5, u);
      const c = baseColor.clone().lerp(tipColor, Math.pow(u, 1.4) * 0.85);
      colors.push(c.r, c.g, c.b);
    }
  }

  const rowLen = segV + 1;
  for (let iu = 0; iu < segU; iu += 1) {
    for (let iv = 0; iv < segV; iv += 1) {
      const a = iu * rowLen + iv;
      indices.push(a, a + rowLen, a + 1, a + 1, a + rowLen, a + rowLen + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* --- leaf --------------------------------------------------------------- */

function leafGeometry({ length = 0.09, width = 0.038, color, tip, serrate = 0 }) {
  return petalGeometry({
    length,
    width,
    taper: 1.05,
    cup: 0.22,
    curl: 0.18,
    ruffle: serrate,
    segU: 7,
    segV: 3,
    baseColor: color,
    tipColor: tip,
  });
}

/* --- stem --------------------------------------------------------------- */

function stemGeometry({ height = 0.5, radius = 0.0035, bend = 0.05, lean = 0, rng = Math.random }) {
  const dir = rng() * Math.PI * 2;
  const points = [];
  const steps = 7;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    // Stems bow gently and taper; the bend accumulates toward the head.
    const sway = Math.pow(t, 1.7) * bend;
    points.push(
      new THREE.Vector3(
        Math.cos(dir) * sway + Math.sin(t * 2.4) * bend * 0.18 + lean * t,
        t * height,
        Math.sin(dir) * sway + Math.cos(t * 1.9) * bend * 0.14
      )
    );
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 14, radius, 6, false);
  // Taper the tube toward the top.
  const pos = geo.attributes.position;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    tmp.fromBufferAttribute(pos, i);
    const t = THREE.MathUtils.clamp(tmp.y / height, 0, 1);
    const shrink = 1 - t * 0.35;
    const on = curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
    tmp.x = on.x + (tmp.x - on.x) * shrink;
    tmp.z = on.z + (tmp.z - on.z) * shrink;
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  geo.computeVertexNormals();
  return { geo, curve, tip: curve.getPointAt(1), tangent: curve.getTangentAt(1) };
}

/* --- recipes ------------------------------------------------------------ */

/**
 * head: how the bloom is assembled
 *   'layered'  concentric rings of petals, pitch opening outward (rose, peony)
 *   'radial'   one or two flat rings (dahlia, anemone-like)
 *   'spiral'   dense phyllotaxis on a dome (ranunculus)
 *   'spike'    florets distributed up the stem (delphinium)
 *   'floret'   a few florets on side branches (sweet pea)
 *   'globe'    dotted sphere, no petals (craspedia)
 *   'spathe'   single spathe + spadix (anthurium)
 *   'branch'   bare woody branching, sparse blossom
 */
export const RECIPES = {
  rose: {
    label: 'Garden Rose',
    head: 'layered',
    stem: { height: 0.52, radius: 0.0042, bend: 0.045 },
    layers: [
      { count: 5, radius: 0.004, pitch: 0.18, scale: 0.5 },
      { count: 6, radius: 0.011, pitch: 0.5, scale: 0.72 },
      { count: 7, radius: 0.019, pitch: 0.82, scale: 0.9 },
      { count: 8, radius: 0.027, pitch: 1.12, scale: 1 },
      { count: 8, radius: 0.033, pitch: 1.42, scale: 0.96 },
    ],
    petal: { length: 0.036, width: 0.033, taper: 0.8, cup: 0.75, curl: -0.15, notch: 0.15 },
    leaves: 3,
    leaf: { length: 0.055, width: 0.026, serrate: 0.25 },
    tipShift: 0.14,
  },
  peony: {
    label: 'Peony',
    head: 'layered',
    stem: { height: 0.55, radius: 0.005, bend: 0.06 },
    layers: [
      { count: 7, radius: 0.006, pitch: 0.25, scale: 0.42 },
      { count: 9, radius: 0.014, pitch: 0.6, scale: 0.62 },
      { count: 10, radius: 0.024, pitch: 0.95, scale: 0.85 },
      { count: 11, radius: 0.034, pitch: 1.25, scale: 1 },
      { count: 9, radius: 0.042, pitch: 1.55, scale: 1.05 },
    ],
    petal: { length: 0.042, width: 0.038, taper: 0.7, cup: 0.6, curl: -0.1, ruffle: 0.55, notch: 0.3 },
    leaves: 3,
    leaf: { length: 0.07, width: 0.028, serrate: 0.35 },
    tipShift: 0.22,
  },
  ranunculus: {
    label: 'Ranunculus',
    head: 'spiral',
    stem: { height: 0.42, radius: 0.0038, bend: 0.055 },
    spiral: { count: 46, radius: 0.03, dome: 0.55 },
    petal: { length: 0.019, width: 0.021, taper: 0.65, cup: 0.9, curl: -0.05 },
    core: { radius: 0.008, color: '#4a4436' },
    leaves: 2,
    leaf: { length: 0.05, width: 0.03, serrate: 0.4 },
    tipShift: 0.1,
  },
  dahlia: {
    label: 'Dahlia',
    head: 'radial',
    stem: { height: 0.5, radius: 0.0048, bend: 0.04 },
    layers: [
      { count: 8, radius: 0.008, pitch: 0.55, scale: 0.5 },
      { count: 11, radius: 0.018, pitch: 0.95, scale: 0.72 },
      { count: 14, radius: 0.028, pitch: 1.25, scale: 0.9 },
      { count: 16, radius: 0.036, pitch: 1.5, scale: 1 },
    ],
    petal: { length: 0.038, width: 0.017, taper: 2.2, cup: 1.15, curl: 0.1 },
    core: { radius: 0.006, color: '#2a1f1c' },
    leaves: 2,
    leaf: { length: 0.06, width: 0.03, serrate: 0.3 },
    tipShift: -0.28,
  },
  lisianthus: {
    label: 'Lisianthus',
    head: 'layered',
    stem: { height: 0.5, radius: 0.0036, bend: 0.05 },
    layers: [
      { count: 5, radius: 0.006, pitch: 0.4, scale: 0.6 },
      { count: 6, radius: 0.016, pitch: 0.85, scale: 0.85 },
      { count: 6, radius: 0.024, pitch: 1.2, scale: 1 },
    ],
    petal: { length: 0.034, width: 0.03, taper: 0.85, cup: 0.55, curl: -0.05, ruffle: 0.3 },
    core: { radius: 0.005, color: '#e8e0b8' },
    buds: 2,
    leaves: 2,
    leaf: { length: 0.05, width: 0.018 },
    tipShift: 0.2,
  },
  sweetpea: {
    label: 'Sweet Pea',
    head: 'floret',
    stem: { height: 0.46, radius: 0.0028, bend: 0.09 },
    floret: { count: 4, spread: 0.055, from: 0.62 },
    petal: { length: 0.026, width: 0.03, taper: 0.6, cup: 0.95, curl: -0.3, ruffle: 0.4, notch: 0.2 },
    petalsPerFloret: 4,
    leaves: 2,
    leaf: { length: 0.04, width: 0.02 },
    tipShift: 0.3,
  },
  delphinium: {
    label: 'Delphinium',
    head: 'spike',
    stem: { height: 0.72, radius: 0.005, bend: 0.03 },
    spike: { count: 22, from: 0.42, radius: 0.03 },
    petal: { length: 0.016, width: 0.014, taper: 1.1, cup: 0.7, curl: -0.1 },
    petalsPerFloret: 5,
    core: { radius: 0.0035, color: '#f0ead2' },
    leaves: 2,
    leaf: { length: 0.05, width: 0.03, serrate: 0.5 },
    tipShift: 0.16,
  },
  craspedia: {
    label: 'Craspedia',
    head: 'globe',
    stem: { height: 0.5, radius: 0.0032, bend: 0.035 },
    globe: { radius: 0.016, bumps: 34 },
    leaves: 0,
    tipShift: 0.05,
  },
  tropical: {
    label: 'Anthurium',
    head: 'spathe',
    stem: { height: 0.56, radius: 0.0045, bend: 0.05 },
    spathe: { length: 0.1, width: 0.085 },
    leaves: 1,
    leaf: { length: 0.12, width: 0.075 },
    tipShift: -0.15,
  },
  branches: {
    label: 'Branch',
    head: 'branch',
    stem: { height: 0.95, radius: 0.008, bend: 0.12 },
    branch: { count: 5, blossoms: 3 },
    petal: { length: 0.014, width: 0.013, taper: 0.9, cup: 0.5, curl: -0.1 },
    leaves: 0,
    tipShift: 0.3,
  },
};

/* --- materials ---------------------------------------------------------- */

const materialCache = new Map();

function petalMaterial() {
  if (!materialCache.has('petal')) {
    materialCache.set(
      'petal',
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.58,
        metalness: 0,
        sheen: 0.6,
        sheenRoughness: 0.7,
        sheenColor: new THREE.Color('#ffffff'),
        clearcoat: 0.06,
        side: THREE.DoubleSide,
        flatShading: false,
      })
    );
  }
  return materialCache.get('petal');
}

function foliageMaterial() {
  if (!materialCache.has('foliage')) {
    materialCache.set(
      'foliage',
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0,
        side: THREE.DoubleSide,
      })
    );
  }
  return materialCache.get('foliage');
}

export function disposeFlowerMaterials() {
  for (const m of materialCache.values()) m.dispose();
  materialCache.clear();
}

/* --- head builders ------------------------------------------------------ */

function placePetal(geo, { radius, pitch, yaw, scale, y = 0 }) {
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(pitch, 0, 0);
  const q = new THREE.Quaternion().setFromEuler(e);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  yawQ.multiply(q);
  m.compose(
    new THREE.Vector3(Math.sin(yaw) * radius, y, Math.cos(yaw) * radius),
    yawQ,
    new THREE.Vector3(scale, scale, scale)
  );
  return geo.clone().applyMatrix4(m);
}

function buildLayered(recipe, colors, openness, rng) {
  const parts = [];
  const base = petalGeometry({ ...recipe.petal, baseColor: colors.base, tipColor: colors.tip });
  let index = 0;
  recipe.layers.forEach((layer, li) => {
    // Outer layers open first; inner ones stay furled until fully open.
    const layerOpen = THREE.MathUtils.clamp(
      (openness - li * 0.06) / Math.max(0.2, 1 - li * 0.06),
      0,
      1
    );
    const pitch = layer.pitch * (0.12 + layerOpen * 0.88);
    const radius = layer.radius * (0.45 + layerOpen * 0.55);
    for (let i = 0; i < layer.count; i += 1) {
      const yaw = index * GOLDEN + rng() * 0.12;
      index += 1;
      parts.push(
        placePetal(base, {
          radius,
          pitch: pitch + (rng() - 0.5) * 0.12,
          yaw,
          scale: layer.scale * (0.92 + rng() * 0.16),
          y: (1 - li / recipe.layers.length) * 0.012 * openness,
        })
      );
    }
  });
  base.dispose();
  return parts;
}

function buildSpiral(recipe, colors, openness, rng) {
  const parts = [];
  const base = petalGeometry({ ...recipe.petal, baseColor: colors.base, tipColor: colors.tip });
  const { count, radius, dome } = recipe.spiral;
  const n = Math.max(6, Math.round(count * (0.4 + openness * 0.6)));
  for (let i = 0; i < n; i += 1) {
    const t = i / count;
    const r = radius * Math.sqrt(t) * (0.4 + openness * 0.6);
    const yaw = i * GOLDEN;
    const pitch = (0.15 + t * 1.5) * (0.25 + openness * 0.75);
    parts.push(
      placePetal(base, {
        radius: r,
        pitch,
        yaw,
        scale: 0.7 + t * 0.5,
        y: Math.cos(t * Math.PI * 0.5) * radius * dome,
      })
    );
  }
  base.dispose();
  return parts;
}

function buildRadial(recipe, colors, openness, rng) {
  return buildLayered(recipe, colors, openness, rng);
}

function floretGeometry(recipe, colors, openness, rng, count, scale = 1) {
  const parts = [];
  const base = petalGeometry({ ...recipe.petal, baseColor: colors.base, tipColor: colors.tip });
  for (let i = 0; i < count; i += 1) {
    const yaw = i * ((Math.PI * 2) / count) + rng() * 0.3;
    parts.push(
      placePetal(base, {
        radius: 0.004 * scale,
        pitch: (0.6 + rng() * 0.4) * (0.2 + openness * 0.8),
        yaw,
        scale: scale * (0.9 + rng() * 0.2),
      })
    );
  }
  base.dispose();
  return safeMerge(parts);
}

function buildSpike(recipe, colors, openness, rng, stem) {
  const parts = [];
  const { count, from, radius } = recipe.spike;
  const n = Math.max(4, Math.round(count * (0.35 + openness * 0.65)));
  const floret = floretGeometry(recipe, colors, openness, rng, recipe.petalsPerFloret, 1);
  if (!floret) return parts;

  for (let i = 0; i < n; i += 1) {
    const t = from + (1 - from) * (i / Math.max(1, n - 1));
    const on = stem.curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
    const yaw = i * GOLDEN * 2.4;
    // Florets shrink toward the tip of the spike.
    const s = 1.15 - (t - from) / (1 - from) * 0.55;
    const out = radius * (1 - (t - from) / (1 - from) * 0.55) * (0.5 + openness * 0.5);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(on.x + Math.sin(yaw) * out, on.y, on.z + Math.cos(yaw) * out),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.42, yaw, 0)),
      new THREE.Vector3(s, s, s)
    );
    parts.push(floret.clone().applyMatrix4(m));
  }
  floret.dispose();
  return parts;
}

function buildFloret(recipe, colors, openness, rng, stem) {
  const parts = [];
  const { count, spread, from } = recipe.floret;
  const n = Math.max(2, Math.round(count * (0.5 + openness * 0.5)));
  const floret = floretGeometry(recipe, colors, openness, rng, recipe.petalsPerFloret, 1);
  if (!floret) return parts;

  for (let i = 0; i < n; i += 1) {
    const t = from + (1 - from) * (i / Math.max(1, n - 1)) * 0.9;
    const on = stem.curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
    const yaw = i * 2.1 + rng() * 0.4;
    const s = 0.75 + (i / n) * 0.5;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(on.x + Math.sin(yaw) * spread, on.y - 0.004, on.z + Math.cos(yaw) * spread),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.55, yaw, 0.2)),
      new THREE.Vector3(s, s, s)
    );
    parts.push(floret.clone().applyMatrix4(m));
  }
  floret.dispose();
  return parts;
}

function buildGlobe(recipe, colors, openness, rng) {
  const parts = [];
  const { radius, bumps } = recipe.globe;
  const r = radius * (0.3 + openness * 0.7);
  const sphere = new THREE.SphereGeometry(r, 14, 10);
  parts.push(withColor(sphere, colors.base));

  const bump = new THREE.SphereGeometry(r * 0.19, 6, 5);
  withColor(bump, colors.tip);
  for (let i = 0; i < bumps; i += 1) {
    const t = i / bumps;
    const phi = Math.acos(1 - 2 * t);
    const theta = i * GOLDEN;
    const m = new THREE.Matrix4().setPosition(
      Math.sin(phi) * Math.cos(theta) * r * 0.94,
      Math.cos(phi) * r * 0.94,
      Math.sin(phi) * Math.sin(theta) * r * 0.94
    );
    parts.push(bump.clone().applyMatrix4(m));
  }
  bump.dispose();
  return parts;
}

function buildSpathe(recipe, colors, openness, rng) {
  const parts = [];
  const { length, width } = recipe.spathe;
  // One broad, heart-shaped, lacquered spathe.
  const spathe = petalGeometry({
    length: length * (0.5 + openness * 0.5),
    width: width * (0.4 + openness * 0.6),
    taper: 1.9,
    cup: 0.35,
    curl: 0.12,
    notch: 0.05,
    segU: 12,
    segV: 7,
    baseColor: colors.base,
    tipColor: colors.tip,
  });
  spathe.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.34, 0, 0)),
      new THREE.Vector3(1, 1, 1)
    )
  );
  parts.push(spathe);

  const spadix = new THREE.CylinderGeometry(0.004, 0.0025, length * 0.62, 8);
  withColor(spadix, colors.tip.clone().lerp(new THREE.Color('#f5e9c8'), 0.7));
  spadix.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, length * 0.3, length * 0.16),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)),
      new THREE.Vector3(1, 1, 1)
    )
  );
  parts.push(spadix);
  return parts;
}

function buildBranch(recipe, colors, openness, rng, stem) {
  const parts = [];
  const blossom = floretGeometry(recipe, colors, openness, rng, 5, 1);
  const { count, blossoms } = recipe.branch;

  for (let b = 0; b < count; b += 1) {
    const t = 0.32 + (b / count) * 0.6;
    const on = stem.curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
    const yaw = b * 2.4 + rng();
    const len = 0.18 + rng() * 0.16;
    const pts = [];
    for (let i = 0; i <= 4; i += 1) {
      const s = i / 4;
      pts.push(
        new THREE.Vector3(
          on.x + Math.sin(yaw) * len * s,
          on.y + len * s * (0.55 + rng() * 0.1),
          on.z + Math.cos(yaw) * len * s
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const twig = new THREE.TubeGeometry(curve, 8, 0.0032 * (1 - b / (count * 2)), 5, false);
    parts.push(withColor(twig, colors.branch || new THREE.Color('#6b5a4a')));

    if (blossom) {
      for (let k = 0; k < blossoms; k += 1) {
        const bt = 0.45 + (k / blossoms) * 0.5;
        const p = curve.getPointAt(bt);
        const s = 0.8 + rng() * 0.4;
        parts.push(
          blossom.clone().applyMatrix4(
            new THREE.Matrix4().compose(
              p,
              new THREE.Quaternion().setFromEuler(
                new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, 0)
              ),
              new THREE.Vector3(s, s, s)
            )
          )
        );
      }
    }
  }
  blossom?.dispose();
  return parts;
}

/* --- assembly ----------------------------------------------------------- */

function paletteFor(hex, recipe) {
  const base = new THREE.Color(hex).convertSRGBToLinear();
  const tip = base.clone();
  const shift = recipe.tipShift ?? 0.15;
  if (shift >= 0) tip.lerp(new THREE.Color(0xffffff).convertSRGBToLinear(), shift);
  else tip.lerp(new THREE.Color(0x2b1418).convertSRGBToLinear(), -shift);
  return {
    base,
    tip,
    leaf: new THREE.Color('#5f7355').convertSRGBToLinear(),
    leafTip: new THREE.Color('#8ba17c').convertSRGBToLinear(),
    stem: new THREE.Color('#6b7f5e').convertSRGBToLinear(),
    branch: new THREE.Color('#6b5a4a').convertSRGBToLinear(),
  };
}

/**
 * Build one stem.
 * @param {string} recipeId key of RECIPES
 * @param {string} hex      petal colour
 * @param {object} opts     { openness, rng, scale, height }
 * @returns {THREE.Group}   origin at the cut end of the stem, +Y up
 */
export function createStem(recipeId, hex, opts = {}) {
  const recipe = RECIPES[recipeId] || RECIPES.rose;
  const { openness = 1, rng = Math.random, scale = 1, height } = opts;
  const colors = paletteFor(hex, recipe);

  const group = new THREE.Group();
  group.name = 'stem';

  const stemHeight = (height ?? recipe.stem.height) * scale;
  const stem = stemGeometry({
    ...recipe.stem,
    height: stemHeight,
    radius: recipe.stem.radius * scale,
    bend: recipe.stem.bend * scale,
    rng,
  });

  const green = [withColor(stem.geo, colors.stem)];

  // Foliage up the lower stem.
  if (recipe.leaves > 0 && recipe.leaf) {
    const leaf = leafGeometry({
      ...recipe.leaf,
      length: recipe.leaf.length * scale,
      width: recipe.leaf.width * scale,
      color: colors.leaf,
      tip: colors.leafTip,
    });
    for (let i = 0; i < recipe.leaves; i += 1) {
      const t = 0.24 + (i / Math.max(1, recipe.leaves)) * 0.42;
      const on = stem.curve.getPointAt(t);
      const yaw = i * 2.4 + rng() * 0.8;
      const s = (0.85 + rng() * 0.3) * scale;
      green.push(
        leaf.clone().applyMatrix4(
          new THREE.Matrix4().compose(
            on,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.36, yaw, 0)),
            new THREE.Vector3(s, s, s)
          )
        )
      );
    }
    leaf.dispose();
  }

  const greenGeo = safeMerge(green);
  if (greenGeo) {
    const mesh = new THREE.Mesh(greenGeo, foliageMaterial());
    mesh.castShadow = false;
    mesh.name = 'foliage';
    group.add(mesh);
  }

  // Head — built at the origin, then moved to the stem tip.
  let parts = [];
  switch (recipe.head) {
    case 'layered': parts = buildLayered(recipe, colors, openness, rng); break;
    case 'radial': parts = buildRadial(recipe, colors, openness, rng); break;
    case 'spiral': parts = buildSpiral(recipe, colors, openness, rng); break;
    case 'globe': parts = buildGlobe(recipe, colors, openness, rng); break;
    case 'spathe': parts = buildSpathe(recipe, colors, openness, rng); break;
    case 'spike': parts = buildSpike(recipe, colors, openness, rng, stem); break;
    case 'floret': parts = buildFloret(recipe, colors, openness, rng, stem); break;
    case 'branch': parts = buildBranch(recipe, colors, openness, rng, stem); break;
    default: parts = buildLayered(recipe, colors, openness, rng);
  }

  if (recipe.core && ['layered', 'radial', 'spiral'].includes(recipe.head)) {
    const core = new THREE.SphereGeometry(recipe.core.radius, 10, 8);
    withColor(core, new THREE.Color(recipe.core.color).convertSRGBToLinear());
    parts.push(core);
  }

  const headGeo = safeMerge(parts);
  if (headGeo) {
    const head = new THREE.Mesh(headGeo, petalMaterial());
    head.name = 'head';
    // Spikes, florets and branches are already positioned along the stem.
    if (!['spike', 'floret', 'branch'].includes(recipe.head)) {
      head.position.copy(stem.tip);
      head.scale.setScalar(scale);
      // Let the head follow the stem's lean so it never looks pinned on.
      const lean = new THREE.Vector3(stem.tangent.x, 0, stem.tangent.z);
      if (lean.lengthSq() > 1e-6) {
        head.rotation.z = -lean.x * 0.9;
        head.rotation.x = lean.z * 0.9;
      }
    }
    group.add(head);
  }

  group.userData.height = stemHeight;
  group.userData.recipeId = recipeId;
  group.userData.hex = hex;
  return group;
}

/**
 * A gathered bunch, as it sits in a vase: stems fanned from a shared collar,
 * each a separate child so it can be raycast and picked individually.
 */
export function createBunch(recipeId, hex, count, opts = {}) {
  const { rng = Math.random, spread = 0.055, lift = 0, scale = 1, tilt = 0.26 } = opts;
  const group = new THREE.Group();
  group.name = 'bunch';

  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2 + rng() * 0.5;
    const r = spread * (0.25 + rng() * 0.75);
    const stem = createStem(recipeId, hex, {
      rng,
      scale: scale * (0.86 + rng() * 0.28),
      openness: 0.72 + rng() * 0.28,
    });
    stem.position.set(Math.cos(yaw) * r * 0.4, lift, Math.sin(yaw) * r * 0.4);
    // Fan outward: lean away from the centre, proportional to distance.
    const leanAmount = (r / spread) * tilt;
    stem.rotation.z = -Math.cos(yaw) * leanAmount;
    stem.rotation.x = Math.sin(yaw) * leanAmount;
    stem.userData.index = i;
    group.add(stem);
  }
  return group;
}

/** Olive-like tree for the terracotta pot: trunk, boughs, dense small leaves. */
export function createOliveTree({ height = 2.6, rng = Math.random } = {}) {
  const group = new THREE.Group();
  const bark = new THREE.Color('#8d8377').convertSRGBToLinear();
  const leafA = new THREE.Color('#6b7a63').convertSRGBToLinear();
  const leafB = new THREE.Color('#96a58b').convertSRGBToLinear();

  const woody = [];
  const trunkPts = [];
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    trunkPts.push(
      new THREE.Vector3(
        Math.sin(t * 2.6) * 0.06 + t * 0.05,
        t * height * 0.52,
        Math.cos(t * 2.1) * 0.05
      )
    );
  }
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
  woody.push(withColor(new THREE.TubeGeometry(trunkCurve, 18, 0.055, 8, false), bark));

  const canopyCentres = [];
  const boughCount = 5;
  for (let b = 0; b < boughCount; b += 1) {
    const start = trunkCurve.getPointAt(0.62 + rng() * 0.3);
    const yaw = b * ((Math.PI * 2) / boughCount) + rng() * 0.5;
    const len = height * (0.3 + rng() * 0.18);
    const pts = [start];
    for (let i = 1; i <= 4; i += 1) {
      const t = i / 4;
      pts.push(
        new THREE.Vector3(
          start.x + Math.sin(yaw) * len * t * 0.75,
          start.y + len * t * (0.8 - t * 0.18),
          start.z + Math.cos(yaw) * len * t * 0.75
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    woody.push(withColor(new THREE.TubeGeometry(curve, 10, 0.02, 6, false), bark));
    for (let k = 0; k < 4; k += 1) canopyCentres.push(curve.getPointAt(0.45 + k * 0.18));
  }

  const woodyGeo = safeMerge(woody);
  if (woodyGeo) group.add(new THREE.Mesh(woodyGeo, foliageMaterial()));

  // Leaves: small lanceolate blades clustered around the bough tips.
  const blade = leafGeometry({ length: 0.055, width: 0.011, color: leafA, tip: leafB });
  const leaves = [];
  for (const centre of canopyCentres) {
    for (let i = 0; i < 26; i += 1) {
      const dir = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
      const d = 0.1 + rng() * 0.24;
      const pos = centre.clone().addScaledVector(dir, d);
      const s = 0.8 + rng() * 0.5;
      leaves.push(
        blade.clone().applyMatrix4(
          new THREE.Matrix4().compose(
            pos,
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI)
            ),
            new THREE.Vector3(s, s, s)
          )
        )
      );
    }
  }
  blade.dispose();
  const leafGeo = safeMerge(leaves);
  if (leafGeo) {
    const mesh = new THREE.Mesh(leafGeo, foliageMaterial());
    mesh.name = 'canopy';
    group.add(mesh);
  }

  return group;
}
