/* ==========================================================================
   Geometry helpers.

   The interior is all soft, monolithic forms — rounded slabs, lathe-turned
   vessels, curved stepped seating — so these builders do most of the modelling
   work and the scene files stay readable.
   ========================================================================== */

import * as THREE from 'three';

/* --- rounded / raw-edge slabs ------------------------------------------- */

function roundedRectPoints(width, depth, radius, segments = 6) {
  const w = width / 2;
  const d = depth / 2;
  const r = Math.min(radius, w, d);
  const pts = [];

  // Corner centres, walked anticlockwise from bottom-right.
  const corners = [
    [w - r, -(d - r), -Math.PI / 2, 0],
    [w - r, d - r, 0, Math.PI / 2],
    [-(w - r), d - r, Math.PI / 2, Math.PI],
    [-(w - r), -(d - r), Math.PI, (3 * Math.PI) / 2],
  ];

  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= segments; i += 1) {
      const a = a0 + ((a1 - a0) * i) / segments;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  }
  return pts;
}

/**
 * A slab with softly rounded corners and bevelled top/bottom edges — the
 * profile of the jade island, the plaster door and the low benches.
 *
 * `wobble` displaces the two long edges with a smooth wave so a stone top
 * reads as a raw, hand-finished edge rather than a machined one.
 * Returned geometry is centred, lying in XZ with `thickness` on Y.
 */
export function slab(width, depth, thickness, opts = {}) {
  const {
    radius = Math.min(width, depth) * 0.12,
    wobble = 0,
    wobbleFrequency = 3.4,
    curveSegments = 8,
  } = opts;

  // ExtrudeGeometry's bevel grows the outline outward by bevelSize on every
  // side and the extrusion by bevelThickness at each end, so the base shape is
  // inset first. Callers then get exactly the dimensions they asked for.
  const bevel = Math.max(0, Math.min(
    opts.bevel ?? Math.min(0.035, thickness * 0.32),
    width / 2 - 0.001,
    depth / 2 - 0.001,
    thickness / 2 - 0.0005
  ));

  const innerWidth = width - bevel * 2;
  const innerDepth = depth - bevel * 2;
  const pts = roundedRectPoints(innerWidth, innerDepth, Math.max(0.001, radius - bevel), 7);

  if (wobble > 0) {
    const halfDepth = innerDepth / 2;
    for (const p of pts) {
      // Taper the displacement out near the short ends so corners stay clean.
      const alongEdge = Math.min(1, Math.abs(p.y) / halfDepth);
      const taper = Math.pow(alongEdge, 2.2);
      const wave =
        Math.sin(p.x * wobbleFrequency) * 0.6 +
        Math.sin(p.x * wobbleFrequency * 2.7 + 1.3) * 0.3 +
        Math.sin(p.x * wobbleFrequency * 5.1 + 0.4) * 0.1;
      p.y += Math.sign(p.y) * wave * wobble * taper;
    }
  }

  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, thickness - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 4,
    curveSegments,
  });

  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/**
 * A flat plane with a circular hole — the ceiling around the oculus.
 * Returned lying in XZ, facing down, centred on the origin; the hole sits at
 * (holeX, holeZ) so the slab itself stays aligned with the walls.
 */
export function planeWithHole(width, depth, holeRadius, { holeX = 0, holeZ = 0, segments = 48 } = {}) {
  const shape = new THREE.Shape(roundedRectPoints(width, depth, 0.001, 1));
  const hole = new THREE.Path();
  // rotateX(+90°) maps shape-Y onto world +Z, so the hole's Y is its world Z.
  hole.absarc(holeX, holeZ, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, segments);
  geo.rotateX(Math.PI / 2); // faces down
  return geo;
}

/* --- lathe forms -------------------------------------------------------- */

/** Lathe geometry from [[radius, height], ...] control points, smoothed. */
export function turned(profile, { segments = 48, thetaStart = 0, thetaLength = Math.PI * 2, smooth = 4 } = {}) {
  let pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));

  if (smooth > 1 && pts.length > 2) {
    const curve = new THREE.SplineCurve(pts);
    pts = curve.getPoints(Math.max(pts.length, pts.length * smooth));
    // A spline through tight profile corners can overshoot; a negative radius
    // would turn the lathe inside out.
    for (const p of pts) p.x = Math.max(0.0001, p.x);
  }

  const geo = new THREE.LatheGeometry(pts, segments, thetaStart, thetaLength);
  geo.computeVertexNormals();
  return geo;
}

/** Glass vessel profiles. Heights are in metres. */
export const VASE_PROFILES = {
  cylinder: [
    [0.001, 0], [0.085, 0], [0.088, 0.012], [0.088, 0.30], [0.086, 0.32], [0.083, 0.32],
  ],
  bulb: [
    [0.001, 0], [0.06, 0], [0.062, 0.02], [0.10, 0.10], [0.105, 0.16],
    [0.07, 0.24], [0.062, 0.28], [0.066, 0.30], [0.063, 0.30],
  ],
  bud: [
    [0.001, 0], [0.045, 0], [0.048, 0.015], [0.05, 0.09], [0.028, 0.15],
    [0.026, 0.19], [0.029, 0.20], [0.026, 0.20],
  ],
  tall: [
    [0.001, 0], [0.10, 0], [0.102, 0.02], [0.095, 0.30], [0.11, 0.52],
    [0.113, 0.58], [0.109, 0.58],
  ],
};

/** Weathered pot for the olive tree. */
export const POT_PROFILE = [
  [0.001, 0], [0.28, 0], [0.30, 0.03], [0.34, 0.22], [0.40, 0.52],
  [0.43, 0.62], [0.455, 0.66], [0.45, 0.70], [0.425, 0.70], [0.42, 0.66], [0.40, 0.30],
];

/**
 * Curved, multi-tiered amphitheatre seating: one lathe of a stepped profile
 * swept through part of a circle. Each tread gets a small fillet so the form
 * stays soft rather than architectural.
 */
export function amphitheatre({
  tiers = 4,
  innerRadius = 2.6,
  tread = 0.62,
  rise = 0.42,
  fillet = 0.07,
  thetaStart = 0,
  thetaLength = Math.PI * 0.62,
  segments = 72,
} = {}) {
  const profile = [[innerRadius, 0]];
  for (let i = 0; i < tiers; i += 1) {
    const r0 = innerRadius + i * tread;
    const y0 = i * rise;
    // Tread, then a filleted nose, then the riser up to the next tier.
    profile.push([r0 + tread - fillet, y0]);
    profile.push([r0 + tread, y0 + fillet * 0.6]);
    profile.push([r0 + tread, y0 + rise - fillet]);
    profile.push([r0 + tread + fillet * 0.5, y0 + rise]);
  }
  const top = innerRadius + tiers * tread;
  profile.push([top + 0.9, tiers * rise]);
  profile.push([top + 0.9, tiers * rise - 0.12]);
  profile.push([innerRadius, 0]);

  return turned(profile, { segments, thetaStart, thetaLength, smooth: 1 });
}

/* --- misc --------------------------------------------------------------- */

/** Thin ring, used for recessed ceiling lights and frame surrounds. */
export function ring(inner, outer, segments = 32) {
  const geo = new THREE.RingGeometry(inner, outer, segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Deterministic pseudo-random, so a reload rebuilds the identical shop. */
export function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967295;
  };
}
