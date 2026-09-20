/* ==========================================================================
   Vector flower sprites.

   A trial alternative to `flowers.js`'s parametric petals: the bloom is drawn
   once onto a canvas as flat vector art with a single soft-depth pass over its
   own silhouette, then hung on a THREE.Sprite so it billboards to whatever the
   camera is doing. Only the head is a sprite — the stem and foliage stay real
   geometry, so a stem still leans, still raycasts and still gathers.

   Sprites billboard in the vertex shader, so a head costs nothing per frame
   and works under the shop's frozen-matrix stock arrangement.

   The stock is drawn from hand-painted 16-bit pixel PNGs in public/flowers/,
   one per species and colour variation, and every species is stocked only in
   the colours it has art for. The vector drawings below are what is left of
   the first pass: they are the fallback for a colour with no PNG, which the
   shop's stock no longer contains.

   Textures are cached per species / colour / bud-or-open, because a shop holds
   many stems of a handful of colours and they can all share one drawing.
   ========================================================================== */

import * as THREE from 'three';

const TEX = 256;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* Light comes from the upper left, as it does in the room. In canvas space y
   runs down, so that direction is this angle. */
const LIGHT = -Math.PI * 0.75;

const cache = new Map();
const scratch = new THREE.Color();

/* --- colour ------------------------------------------------------------- */

/**
 * A CSS colour derived from the stock hex, shifted in HSL.
 * Everything here is sRGB: it is paint on a canvas, not a lit surface.
 */
function tone(hex, dl = 0, ds = 0, alpha = 1) {
  scratch.set(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  scratch.getHSL(hsl, THREE.SRGBColorSpace);
  scratch.setHSL(
    hsl.h,
    clamp01(hsl.s + ds),
    clamp01(hsl.l + dl),
    THREE.SRGBColorSpace
  );
  const style = scratch.getStyle(THREE.SRGBColorSpace);
  return alpha >= 1 ? style : style.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
}

/* --- drawing helpers ---------------------------------------------------- */

/**
 * One petal, as a two-curve leaf pointing along `ang` from (cx, cy).
 * `round` near 1 gives the broad, blunt petal a cabbage rose is built from;
 * lower values pinch it to a point.
 */
function petalPath(ctx, cx, cy, ang, len, wid, round = 0.7) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  // u runs outward along the petal, v across it.
  const px = (u, v) => [cx + ca * u - sa * v, cy + sa * u + ca * v];
  const base = px(0, 0);
  ctx.beginPath();
  ctx.moveTo(base[0], base[1]);
  ctx.bezierCurveTo(...px(len * round * 0.6, wid), ...px(len, wid * round), ...px(len * 1.02, 0));
  ctx.bezierCurveTo(...px(len, -wid * round), ...px(len * round * 0.6, -wid), base[0], base[1]);
  ctx.closePath();
}

/** How lit a point facing `ang` is: +1 toward the light, -1 away from it. */
const litBy = (ang) => Math.cos(ang - LIGHT);

/**
 * The soft-depth pass: one light sweep laid over whatever has already been
 * drawn and nothing else. `source-atop` clips it to the bloom's own
 * silhouette, so the shape stays a crisp vector cut-out while its interior
 * gains a light side, a shaded side and a little grounding at the rim.
 */
function softDepth(ctx, S, { x = 0.32, y = 0.30, warm = 0.3, shade = 0.34 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createRadialGradient(S * x, S * y, S * 0.02, S * 0.5, S * 0.52, S * 0.72);
  g.addColorStop(0, `rgba(255,252,245,${warm})`);
  g.addColorStop(0.42, 'rgba(255,250,240,0.05)');
  g.addColorStop(1, `rgba(38,22,26,${shade})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
}

/* --- the three species -------------------------------------------------- */

/**
 * Garden rose: rings of blunt petals spiralling inward, each ring smaller,
 * turned off the last and a shade deeper, so the eye reads a cupped cabbage
 * head with a dense, shadowed centre rather than a flat rosette.
 */
function drawRose(ctx, S, hex, open) {
  const cx = S * 0.5;
  const cy = S * 0.52;
  const R = S * 0.47 * (0.78 + open * 0.22);

  // Outer shoulder: the petals never quite close the silhouette on their own.
  ctx.fillStyle = tone(hex, -0.05, 0.02);
  ctx.beginPath();
  ctx.ellipse(cx, cy, R * 0.9, R * 0.86, 0, 0, TAU);
  ctx.fill();

  const rings = [
    { n: 9, dist: 0.50, len: 0.50, wid: 0.30, dl: 0.055, spin: 0.00 },
    { n: 8, dist: 0.40, len: 0.41, wid: 0.26, dl: 0.020, spin: 0.42 },
    { n: 7, dist: 0.31, len: 0.33, wid: 0.22, dl: -0.020, spin: 0.86 },
    { n: 6, dist: 0.22, len: 0.25, wid: 0.18, dl: -0.055, spin: 1.28 },
    { n: 5, dist: 0.14, len: 0.18, wid: 0.14, dl: -0.085, spin: 1.78 },
  ];

  ctx.lineWidth = S * 0.006;
  for (const ring of rings) {
    // A bud keeps its outer petals furled: the whole head draws in toward
    // the centre rather than simply shrinking.
    const reach = ring.dist * (0.62 + open * 0.38);
    for (let i = 0; i < ring.n; i += 1) {
      const ang = ring.spin + (i / ring.n) * TAU;
      const dl = ring.dl + litBy(ang) * 0.045;
      ctx.fillStyle = tone(hex, dl, 0.02);
      petalPath(
        ctx,
        cx + Math.cos(ang) * R * reach * 0.42,
        cy + Math.sin(ang) * R * reach * 0.42,
        ang,
        R * ring.len,
        R * ring.wid,
        0.82
      );
      ctx.fill();
      ctx.strokeStyle = tone(hex, dl - 0.12, 0.03, 0.5);
      ctx.stroke();
    }
  }

  // The eye of the rose: a short furl of petals on their edge, then the core.
  for (let i = 0; i < 3; i += 1) {
    const ang = 2.1 + i * 2.2;
    ctx.fillStyle = tone(hex, -0.11 + litBy(ang) * 0.03, 0.03);
    petalPath(ctx, cx, cy, ang, R * 0.13, R * 0.085, 0.95);
    ctx.fill();
  }
  ctx.fillStyle = tone(hex, -0.16, 0.05);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.055, 0, TAU);
  ctx.fill();

  softDepth(ctx, S, { warm: 0.26, shade: 0.36 });
}

/**
 * Craspedia: a drumstick of packed florets. Phyllotaxis dots shrink and dim
 * toward the rim, which is what turns a flat disc into a ball.
 */
function drawCraspedia(ctx, S, hex, open) {
  const cx = S * 0.5;
  const cy = S * 0.5;
  const R = S * 0.45 * (0.66 + open * 0.34);

  ctx.fillStyle = tone(hex, -0.06, 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  const dots = 132;
  for (let i = 0; i < dots; i += 1) {
    const t = (i + 0.5) / dots;
    const rr = Math.sqrt(t) * R * 0.96;
    const ang = i * GOLDEN;
    const nx = Math.cos(ang) * (rr / R);
    const ny = Math.sin(ang) * (rr / R);
    const edge = rr / R;
    // Curvature: a floret near the rim is turned away from both the light
    // and the camera, so it is smaller and darker.
    const lit = -(nx * 0.7 + ny * 0.72);
    ctx.fillStyle = tone(hex, 0.07 + lit * 0.08 - edge * 0.1, 0.03, 0.92);
    ctx.beginPath();
    ctx.arc(cx + nx * R, cy + ny * R, R * (0.082 - edge * 0.034), 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = tone(hex, -0.2, 0.06, 0.55);
  ctx.lineWidth = S * 0.009;
  ctx.beginPath();
  ctx.arc(cx, cy, R - S * 0.004, 0, TAU);
  ctx.stroke();

  softDepth(ctx, S, { x: 0.33, y: 0.31, warm: 0.34, shade: 0.3 });
}

/**
 * Anthurium: one broad heart-shaped spathe, cleft at the bottom where the
 * stem arrives and tapering to a point at the top, with the spadix standing
 * clear of it. The blade is lacquered, so the highlight is a hard sweep
 * rather than the diffuse bloom the other two get.
 */
function drawAnthurium(ctx, S, hex, open) {
  const cx = S * 0.5;
  const cleft = S * 0.79;
  const apex = S * 0.07;
  const w = S * 0.46 * (0.7 + open * 0.3);

  ctx.beginPath();
  ctx.moveTo(cx, cleft);
  // Down and out into the left lobe, up the flank, in to the tip, and back.
  ctx.bezierCurveTo(cx - w * 0.36, S * 0.92, cx - w * 1.02, S * 0.80, cx - w, S * 0.50);
  ctx.bezierCurveTo(cx - w * 0.97, S * 0.24, cx - w * 0.46, apex, cx, apex);
  ctx.bezierCurveTo(cx + w * 0.46, apex, cx + w * 0.97, S * 0.24, cx + w, S * 0.50);
  ctx.bezierCurveTo(cx + w * 1.02, S * 0.80, cx + w * 0.36, S * 0.92, cx, cleft);
  ctx.closePath();
  ctx.fillStyle = tone(hex, 0, 0.05);
  ctx.fill();
  ctx.strokeStyle = tone(hex, -0.17, 0.04, 0.6);
  ctx.lineWidth = S * 0.007;
  ctx.stroke();

  /* Veins and gloss, clipped to the blade by the same trick the soft-depth
     pass uses — no second path to keep in step with the outline. */
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';

  ctx.strokeStyle = tone(hex, -0.1, 0.02, 0.28);
  ctx.lineWidth = S * 0.006;
  for (let i = -3; i <= 3; i += 1) {
    const spread = i / 3;
    ctx.beginPath();
    ctx.moveTo(cx, cleft - S * 0.02);
    ctx.quadraticCurveTo(
      cx + spread * w * 0.5,
      S * 0.42,
      cx + spread * w * 1.02,
      S * 0.12 + Math.abs(spread) * S * 0.42
    );
    ctx.stroke();
  }

  // Waxed sheen: one long highlight down the lit flank, one small hot spot.
  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.36, S * 0.36, w * 0.22, S * 0.21, -0.32, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.3, S * 0.29, w * 0.1, S * 0.08, -0.32, 0, TAU);
  ctx.fill();
  ctx.restore();

  softDepth(ctx, S, { x: 0.3, y: 0.28, warm: 0.14, shade: 0.32 });

  /* Spadix last: it stands in front of the blade, so it is neither clipped
     to it nor shaded with it. */
  const sx = cx - w * 0.02;
  const tipX = cx + w * 0.30;
  const tipY = S * 0.20;
  const half = S * 0.019;
  ctx.beginPath();
  ctx.moveTo(sx - half, cleft - S * 0.01);
  ctx.bezierCurveTo(sx - half, S * 0.52, tipX - half * 0.5, S * 0.34, tipX, tipY);
  ctx.bezierCurveTo(tipX + half * 0.7, S * 0.34, sx + half, S * 0.52, sx + half, cleft - S * 0.01);
  ctx.closePath();
  ctx.fillStyle = '#f1e4bb';
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,128,74,0.55)';
  ctx.lineWidth = S * 0.005;
  ctx.stroke();

  // Beaded florets up its shaded side.
  ctx.fillStyle = 'rgba(203,182,121,0.5)';
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    ctx.beginPath();
    ctx.arc(
      sx + (tipX - sx) * t * t + half * 0.45,
      cleft - (cleft - tipY) * t,
      half * 0.34,
      0,
      TAU
    );
    ctx.fill();
  }
}

const DRAW = {
  rose: drawRose,
  craspedia: drawCraspedia,
  tropical: drawAnthurium,
};

/* --- pixel-art heads ---------------------------------------------------- */

/* Hand-painted heads, one PNG per species and colour. They carry their own
   geometry rather than reusing the recipe's `sprite` spec: the art sits inside
   a 500 px frame it does not fill, so `size` is the square quad in metres that
   puts the bloom itself at the right size, and `anchor` is where up that quad
   the stem arrives.

   `size` is not eyeballed. Every frame is 500x500 but the art fills a very
   different share of it — a tulip covers 66% of the frame's height, a garden
   rose 96%, a craspedia 54% — so sizing by the quad alone would make species
   that are meant to match look nothing alike. Each `size` below is therefore
   derived as `target bloom height / measured alpha coverage`, against the tulip
   as the standard: a tulip's visible bloom is 143 mm tall and everything else
   is a multiple of that. The coverage figure used is noted per species. */
const PIXEL_SCALE = 1.5;

/* The Rose bench is two different flowers under one recipe. `rose_*` is the
   softer, broader-petalled form and `gardenrose_*` the dense cabbage form, and
   they are cut at different sizes, so the colours that have both point at the
   form they belong to and carry their own `size`. Where both exist for a
   colour the `rose_*` art wins. */
const GARDEN_ROSE = { size: 0.159, anchor: 0.42 };   // 96% coverage, 1.5x its old size

const PIXEL = {
  /* --- the standard: a tulip's bloom is 143 mm tall ---------------------- */
  tulip: {
    size: 0.144,        // 66% coverage
    anchor: 0.20,
    colors: { red: 'tulip_red', orange: 'tulip_orange', pink: 'tulip_pink', purple: 'tulip_purple' },
  },
  craspedia: {
    size: 0.176,        // 54% coverage — a small ball in a large frame
    anchor: 0.24,
    colors: { yellow: 'craspedia_yellow' },
  },
  ranunculus: {
    size: 0.136,        // 70% coverage
    anchor: 0.42,
    colors: { orange: 'ranunuculus_orange' },
  },

  /* --- medium-large heads, 1.15x the tulip ------------------------------- */
  rose: {
    size: 0.121,        // 90% coverage
    anchor: 0.42,
    colors: {
      pink: 'rose_pink',
      purple: 'rose_purplr',
      white: 'rose_white',
      red: { file: 'gardenrose_red', ...GARDEN_ROSE },
      orange: { file: 'gardenrose_orange', ...GARDEN_ROSE },
    },
  },
  calla: {
    size: 0.161,        // 68% coverage — a tall, narrow trumpet
    anchor: 0.16,
    colors: { white: 'callalily_white', yellow: 'callalily_yellow' },
  },
  dahlia: {
    size: 0.120,        // 92% coverage
    anchor: 0.42,
    colors: { orange: 'dahlia_orange', pink: 'dahlia_pink', red: 'dahlia_red' },
  },
  gerbera: {
    size: 0.119,        // 93% coverage
    anchor: 0.42,
    colors: {
      peach: 'gerbera_peach', pink: 'gerbera_pink',
      red: 'gerbera_red', yellow: 'gerbera_yellow',
    },
  },
  iris: {
    size: 0.137,        // 80% coverage
    anchor: 0.42,
    colors: { purple: 'iris_purple', yellow: 'iris_yellow' },
  },
  lisianthus: {
    size: 0.137,        // 80% coverage
    anchor: 0.42,
    colors: { pink: 'lisianthus_pink', purple: 'lisianthus_purple' },
  },

  /* --- the outsized two --------------------------------------------------
     Peony is cut to 2x and hydrangea to 5x the rose's quad, and both skip the
     global 1.5x so the numbers land where they were asked for rather than
     half again on top. That still puts a mophead at 563 mm of visible bloom on
     a 400 mm stem: deliberate, not a slip. */
  peony: {
    size: 0.320,        // 2x rose, 96% coverage
    pixelScale: 1,
    anchor: 0.42,
    colors: { lightpink: 'peony_lightpink', pink: 'peony_pink', white: 'peony_white' },
  },
  hydrangea: {
    size: 0.800,        // 5x rose, 70% coverage
    pixelScale: 1,
    // A mophead is heavy enough to sit down into the stem rather than on it.
    anchor: 0.40,
    /* `hydrangea_blue` is painted a soft cornflower, not the navy that
       `stock-dark-blue` carries, so the mophead is bucketed as Light Blue.
       Dark Blue stays a delphinium colour — no hydrangea is painted in it. */
    colors: {
      lightblue: 'hydrangea_blue', green: 'hydrangea_green',
      pink: 'hydrangea_pink', purple: 'hydrangea_purple',
    },
  },

  /* --- and the stems that carry more than one head -----------------------
     `multi` distributes copies of the same PNG up the stem instead of standing
     one on the tip. `from`/`to` are positions along the stem curve, `scale`
     runs from the lowest bloom to the highest, and `spread` is how far off the
     stem each one sits. The heads are children of the stem like any other, so
     they lean, raycast and gather with it. */
  orchid: {
    // One flat face per node, spaced up the arching cane as `buildRaceme` does.
    size: 0.075,        // 66% coverage
    anchor: 0.5,
    multi: { count: 6, from: 0.40, to: 1.0, scale: [1.0, 0.62], spread: 0.012 },
    colors: { pink: 'orchid_pink', white: 'orchid_white' },
  },
  sweetpea: {
    // A few florets on short side stalks, opening toward the tip.
    size: 0.055,        // 60% coverage
    anchor: 0.5,
    multi: { count: 4, from: 0.62, to: 0.96, scale: [0.82, 1.15], spread: 0.026 },
    colors: { lightpink: 'sweetpea_lightpink' },
  },
  delphinium: {
    /* The art is already a tapered spike, not one floret, so the stem gets
       three of them overlapping by half up its top 53% — the full 720 mm stem
       is kept and the spike reads as one continuous column rather than three
       separate clusters. The topmost lands its point on the stem tip. */
    size: 0.183,        // 69% coverage
    anchor: 0.5,
    multi: { count: 3, from: 0.60, to: 0.90, scale: [1.0, 0.74], spread: 0 },
    colors: {
      blue: 'delphinium_blue', lightblue: 'delphinium_lightblue',
      purple: 'delphinium_purple',
    },
  },

  tropical: {
    // Drawn cleft-up, point-down, so the stem meets the foot of the spathe.
    size: 0.2175,       // 93% coverage, 1.5x its old size
    anchor: 0.20,
    colors: {
      red: 'anthurium_red',
      pink: 'anthurium_pink',
      green: 'anthurium_green',
      white: 'anthurium_white',
    },
  },
};

/* A stem only ever carries its hex, and the shop and the garden name their
   colours from two different palettes, so both are folded into one name here.
   The names are the ones the PNG filenames use, because a species is only
   stocked in the colours it has art for. See `stockColors` in js/content.js. */
const COLOR_NAMES = {
  // Shop stock.
  '#c62430': 'red',
  '#e8699b': 'pink',
  '#f3b3c6': 'lightpink',
  '#f6a473': 'peach',
  '#ee7420': 'orange',
  '#f2c01e': 'yellow',
  '#8dab5e': 'green',
  '#8cc2e8': 'lightblue',
  '#2f4ea6': 'blue',
  '#8b5cb6': 'purple',
  '#f8f5ef': 'white',
  // Garden palette.
  '#b83a3f': 'red',
  '#e0703f': 'red',
  '#f7d9e0': 'lightpink',
  '#a58ac0': 'purple',
  '#f7f4ee': 'white',
};

/** The pixel head for a species in a colour, or null if there is not one. */
function pixelFor(recipeId, hex) {
  const spec = PIXEL[recipeId];
  const name = COLOR_NAMES[String(hex).toLowerCase()];
  const entry = spec && name ? spec.colors[name] : null;
  if (!entry) return null;
  // A colour is either a filename or a filename with its own size, for the
  // species that are really two flowers filed together.
  const { file, size = spec.size, anchor = spec.anchor } =
    typeof entry === 'string' ? { file: entry } : entry;
  return {
    url: `public/flowers/${file}_pixel_head.png`,
    size: size * (spec.pixelScale ?? PIXEL_SCALE),
    anchor,
    multi: spec.multi ?? null,
  };
}

/**
 * Whether this species and colour can be a sprite head at all — a pixel PNG
 * or a vector drawing. Every colour the shop stocks has a PNG; the drawings
 * only catch a colour that was retired from the buckets but is still asked
 * for somewhere, and a species with neither goes back to real petals.
 */
export function canSpriteHead(recipeId, hex) {
  return Boolean(pixelFor(recipeId, hex)) || recipeId in DRAW;
}

/**
 * The PNG a species and colour is painted in, or null if it is not painted.
 *
 * Exported for the stock guard in tests/scene.mjs: a colour with no PNG falls
 * through to a vector drawing or to procedural petals, and neither is art the
 * shop is willing to stand in a bucket.
 */
export function pixelHeadUrl(recipeId, hex) {
  return pixelFor(recipeId, hex)?.url ?? null;
}

/**
 * How many heads this stem carries and where, or null for a single head on
 * the tip. Positions are along the stem curve, so the caller needs the curve.
 */
export function spriteLayout(recipeId, hex) {
  return pixelFor(recipeId, hex)?.multi ?? null;
}

/* --- sprite ------------------------------------------------------------- */

function materialFor(recipeId, hex, open, pixel) {
  // Two states per colour, not a continuum: the shop stands its stock at full
  // bloom and only the garden shows buds, so one of each is plenty. A pixel
  // head is painted once and has no furled variant, so it needs only the one.
  const state = pixel ? 'pixel' : open < 0.45 ? 'bud' : 'open';
  const key = `${recipeId}|${hex}|${state}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let map;
  if (pixel) {
    map = new THREE.TextureLoader().load(pixel.url);
    /* Nearest both ways, and no mipmaps: every softening filter three.js would
       otherwise apply smears the pixel grid the art is drawn on. */
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestFilter;
    map.generateMipmaps = false;
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = TEX;
    canvas.height = TEX;
    const ctx = canvas.getContext('2d');
    DRAW[recipeId](ctx, TEX, hex, state === 'bud' ? 0.3 : 1);
    map = new THREE.CanvasTexture(canvas);
    map.anisotropy = 4;
  }
  map.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map,
    transparent: true,
    /* Cut the transparent margin away rather than blending it, so a vase of
       forty overlapping heads depth-sorts against itself and against the
       glass instead of flickering through it. */
    alphaTest: 0.25,
    depthWrite: true,
  });
  cache.set(key, material);
  return material;
}

/**
 * A billboarded bloom, ready to hang on a stem tip.
 *
 * @param {string} recipeId       species key, one of `DRAW`
 * @param {object} spec           recipe.sprite — { width, height, anchor }
 * @param {string} hex            stock colour
 * @param {{openness?:number, scale?:number, sizeMul?:number}} opts
 * @returns {THREE.Sprite} named 'head', sized in metres, anchored at the cut
 */
export function spriteHead(recipeId, spec, hex, { openness = 1, scale = 1, sizeMul = 1 } = {}) {
  const open = clamp01(openness);
  const pixel = pixelFor(recipeId, hex);
  const sprite = new THREE.Sprite(materialFor(recipeId, hex, open, pixel));
  sprite.name = 'head';
  // `anchor` is where up the drawing the stem arrives, so the bloom sits on
  // the stem instead of being skewered through the middle.
  sprite.center.set(0.5, (pixel ? pixel.anchor : spec?.anchor) ?? 0.5);
  const grow = (0.55 + 0.45 * open) * scale * sizeMul;
  if (pixel) {
    // Square, because the frame is: anything else would stretch the pixels.
    // `size` already carries the species' pixel scale.
    const s = pixel.size * grow;
    sprite.scale.set(s, s, 1);
  } else {
    sprite.scale.set(spec.width * grow, spec.height * grow, 1);
  }
  return sprite;
}

export function disposeFlowerSprites() {
  for (const material of cache.values()) {
    material.map?.dispose();
    material.dispose();
  }
  cache.clear();
}
