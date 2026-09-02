/* ==========================================================================
   Procedural textures.

   The shop has to look like stone and plaster without shipping a single image,
   so every surface is generated on a canvas at load: value-noise fbm for the
   grain, a warped sine for marble veining, and height-derived normal maps for
   the fine relief that sells travertine under raking light.

   All generators are memoised — the floor texture is built once, not per mesh.
   ========================================================================== */

import * as THREE from 'three';

const cache = new Map();

function memo(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

/* --- noise -------------------------------------------------------------- */

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

/** Fractal Brownian motion. Tiles cleanly when `period` divides the frequency. */
function fbm(x, y, { octaves = 5, frequency = 4, gain = 0.5, lacunarity = 2, seed = 1 } = {}) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = frequency;
  for (let o = 0; o < octaves; o += 1) {
    sum += valueNoise(x * f, y * f, seed + o * 91) * amp;
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/* --- canvas helpers ----------------------------------------------------- */

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
}

function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Build a colour map plus a matching height field in one pass. */
function generate(size, shade) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const { rgb, h } = shade(x / size, y / size, x, y);
      image.data[i * 4] = rgb[0];
      image.data[i * 4 + 1] = rgb[1];
      image.data[i * 4 + 2] = rgb[2];
      image.data[i * 4 + 3] = 255;
      height[i] = h;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, height, size };
}

/** Sobel-ish derivative of the height field into a tangent-space normal map. */
function normalFromHeight(height, size, strength = 1.6) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normalise (-dx, -dy, 1)
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      image.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function grayscaleFromHeight(height, size, lo = 0.4, hi = 1) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < height.length; i += 1) {
    const v = Math.max(0, Math.min(1, lo + height[i] * (hi - lo))) * 255;
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function toTexture(canvas, { repeat = 1, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* --- surfaces ----------------------------------------------------------- */

/** Light travertine with subtle veining and shallow pitting, tile-grouted. */
export function travertine(baseHex = '#e3dbcd', { size = 512, tiles = 2 } = {}) {
  return memo(`travertine:${baseHex}:${tiles}`, () => {
    const base = hexToRgb(baseHex);
    const dark = mixRgb(base, [120, 106, 88], 0.45);
    const pale = mixRgb(base, [255, 252, 244], 0.55);

    const { canvas, height, size: s } = generate(size, (u, v) => {
      const grain = fbm(u, v, { frequency: 6, octaves: 5, seed: 11 });
      // Warped horizontal veining, characteristic of travertine bedding planes.
      const warp = fbm(u, v, { frequency: 2.5, octaves: 3, seed: 27 });
      const vein = Math.abs(Math.sin((v * 9 + warp * 2.4) * Math.PI));
      const pit = fbm(u, v, { frequency: 34, octaves: 2, seed: 51 });

      let h = grain * 0.55 + (1 - vein) * 0.25 + pit * 0.2;

      // Tile grout lines.
      const gu = (u * tiles) % 1;
      const gv = (v * tiles) % 1;
      const edge = Math.min(gu, 1 - gu, gv, 1 - gv);
      const grout = edge < 0.008 ? 1 : 0;

      let rgb = mixRgb(base, pale, grain * 0.7);
      rgb = mixRgb(rgb, dark, (1 - vein) * 0.16 + (pit < 0.32 ? 0.08 : 0));
      if (grout) {
        rgb = mixRgb(rgb, dark, 0.42);
        h -= 0.5;
      }
      return { rgb, h };
    });

    return {
      map: toTexture(canvas, { repeat: 1 }),
      normalMap: toTexture(normalFromHeight(height, s, 1.1), { srgb: false }),
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.62, 0.9), { srgb: false }),
    };
  });
}

/**
 * Tumbled travertine, laid as large-format slabs — the shop floor.
 *
 * The difference from `travertine` above is deliberate and is the whole point:
 * that one draws dark grout lines and repeats the same grain in every square,
 * which is what makes a floor read as *tile*. Tumbled stone has no grout. The
 * slabs are laid tight and their edges are worn pale and slightly dished, so
 * the joint is a soft chalky seam rather than a drawn line. Each slab also
 * gets its own offset into the noise field, so no two carry the same figure.
 */
export function tumbledTravertine(baseHex = '#e6dece', { size = 1024, slabs = 3 } = {}) {
  return memo(`tumbled:${baseHex}:${slabs}`, () => {
    const base = hexToRgb(baseHex);
    const warm = mixRgb(base, [206, 184, 152], 0.5);    // ochre bedding planes
    const dark = mixRgb(base, [132, 116, 94], 0.5);     // open pores
    const pale = mixRgb(base, [255, 253, 246], 0.7);    // worn, chalky edges

    const { canvas, height, size: s } = generate(size, (u, v) => {
      // One offset per slab, so the figure never repeats slab to slab.
      const su = Math.floor(u * slabs);
      const sv = Math.floor(v * slabs);
      const ou = u + hash(su, sv, 917) * 7.3;
      const ov = v + hash(su, sv, 431) * 5.1;

      // Bedding planes: the noise is stretched along u so the grain lies in
      // long horizontal drifts rather than in blobs.
      const drift = fbm(ou * 0.55, ov * 3.4, { frequency: 2.2, octaves: 4, seed: 13 });
      const bands = fbm(ou * 0.32, ov * 6.2, { frequency: 3, octaves: 5, seed: 29 });
      const grain = fbm(ou, ov, { frequency: 7, octaves: 5, seed: 11 });

      // Vugs — the open pores that say travertine rather than limestone.
      // Elongated with the bedding, and genuinely recessed in the height field.
      const pores = fbm(ou * 0.8, ov * 2.6, { frequency: 26, octaves: 2, seed: 57 });
      const vug = Math.max(0, pores - 0.6) * 2.6;

      let h = 0.58 + bands * 0.2 + grain * 0.16 - vug * 0.55;

      let rgb = mixRgb(base, pale, bands * 0.46 + grain * 0.2);
      rgb = mixRgb(rgb, warm, Math.pow(drift, 1.7) * 0.4);
      rgb = mixRgb(rgb, dark, Math.min(0.55, vug * 0.5));

      // The tumbled edge. A high power keeps it to the last few per cent of
      // the slab, and it lightens rather than darkens — no grout.
      const eu = Math.abs(((u * slabs) % 1) - 0.5) * 2;
      const ev = Math.abs(((v * slabs) % 1) - 0.5) * 2;
      const edge = Math.pow(Math.max(eu, ev), 16);
      rgb = mixRgb(rgb, pale, edge * 0.5);
      h -= edge * 0.34;

      return { rgb, h };
    });

    return {
      map: toTexture(canvas, { repeat: 1 }),
      normalMap: toTexture(normalFromHeight(height, s, 1.25), { srgb: false }),
      // Matte throughout — honed, not polished — with the pores rougher still.
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.94, 0.7), { srgb: false }),
    };
  });
}

/**
 * Banded onyx for the long table: horizontal mineral strata in cream, honey
 * and sage, each bed with its own character and a crisp seam between them.
 *
 * Bands run along the texture's v axis, so a mesh whose UVs put v on world Y
 * gets strata that lie flat — which is how the stone was quarried and how it
 * reads in the reference.
 */
export function bandedOnyx(baseHex = '#ded2ba', veinHex = '#94a291', { size = 512 } = {}) {
  return memo(`onyx:${baseHex}:${veinHex}`, () => {
    const base = hexToRgb(baseHex);
    const vein = hexToRgb(veinHex);
    const pale = mixRgb(base, [253, 248, 238], 0.72);
    const honey = mixRgb(base, [178, 142, 100], 0.55);
    const deep = mixRgb(base, [84, 78, 62], 0.62);

    const BANDS = 26;

    const { canvas, height, size: s } = generate(size, (u, v) => {
      // The strata wander a little, as bedding does; nothing is ruler-straight.
      const wander = fbm(u, v, { frequency: 1.6, octaves: 3, seed: 17 });
      const y = v * BANDS + wander * 2.4 + Math.sin(u * 3.1) * 0.3;
      const bed = Math.floor(y);
      const within = y - bed;
      const character = hash(bed, 3, 205);
      const fine = fbm(u * 0.4, v * 5, { frequency: 22, octaves: 3, seed: 61 });

      let rgb;
      if (character < 0.28) {
        rgb = mixRgb(pale, vein, 0.5 + fine * 0.32);        // sage bed
      } else if (character < 0.52) {
        rgb = mixRgb(base, honey, 0.3 + fine * 0.42);       // honey bed
      } else {
        rgb = mixRgb(pale, base, fine * 0.72);              // cream bed
      }

      // A dark mineral seam at each bedding plane, thin and slightly recessed.
      const seam = Math.pow(1 - Math.abs(within - 0.5) * 2, 9);
      rgb = mixRgb(rgb, deep, seam * (0.2 + character * 0.35));

      return { rgb, h: fine * 0.5 + seam * 0.5 };
    });

    return {
      map: toTexture(canvas),
      normalMap: toTexture(normalFromHeight(height, s, 0.55), { srgb: false }),
      // Polished, but the seams catch: the raw edge needs somewhere to be dull.
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.1, 0.42), { srgb: false }),
    };
  });
}

/** Soft lime plaster — very low contrast, trowel-swept. */
export function plaster(baseHex = '#f6f3ed', { size = 512 } = {}) {
  return memo(`plaster:${baseHex}`, () => {
    const base = hexToRgb(baseHex);
    const shade = mixRgb(base, [186, 178, 164], 0.6);

    const { canvas, height, size: s } = generate(size, (u, v) => {
      const sweep = fbm(u * 1.6, v, { frequency: 3, octaves: 4, seed: 7 });
      const fine = fbm(u, v, { frequency: 28, octaves: 3, seed: 19 });
      const h = sweep * 0.75 + fine * 0.25;
      const rgb = mixRgb(base, shade, sweep * 0.1 + fine * 0.05);
      return { rgb, h };
    });

    return {
      map: toTexture(canvas),
      normalMap: toTexture(normalFromHeight(height, s, 0.5), { srgb: false }),
    };
  });
}

/** Raw board-formed concrete for the column. */
export function concrete(baseHex = '#cfc9be', { size = 512 } = {}) {
  return memo(`concrete:${baseHex}`, () => {
    const base = hexToRgb(baseHex);
    const dark = mixRgb(base, [92, 88, 82], 0.55);

    const { canvas, height, size: s } = generate(size, (u, v) => {
      const grain = fbm(u, v, { frequency: 9, octaves: 5, seed: 33 });
      const blotch = fbm(u, v, { frequency: 2, octaves: 3, seed: 64 });
      const pores = fbm(u, v, { frequency: 52, octaves: 2, seed: 88 });
      // Board marks every 1/6 of the height.
      const board = Math.abs(((v * 6) % 1) - 0.5) > 0.482 ? 1 : 0;
      let h = grain * 0.5 + blotch * 0.3 + pores * 0.2;
      let rgb = mixRgb(base, dark, blotch * 0.18 + grain * 0.1);
      if (pores < 0.24) rgb = mixRgb(rgb, dark, 0.35);
      if (board) {
        rgb = mixRgb(rgb, dark, 0.22);
        h -= 0.3;
      }
      return { rgb, h };
    });

    return {
      map: toTexture(canvas),
      normalMap: toTexture(normalFromHeight(height, s, 1.4), { srgb: false }),
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.7, 0.98), { srgb: false }),
    };
  });
}

/** Jade green marble with pale mineral veins, for the island top. */
export function jadeMarble(baseHex = '#4f6b5a', veinHex = '#9fb9a4', { size = 512 } = {}) {
  return memo(`jade:${baseHex}:${veinHex}`, () => {
    const base = hexToRgb(baseHex);
    const vein = hexToRgb(veinHex);
    const deep = mixRgb(base, [22, 34, 28], 0.55);

    const { canvas, height, size: s } = generate(size, (u, v) => {
      const warp = fbm(u, v, { frequency: 2.2, octaves: 4, seed: 5 });
      const warp2 = fbm(u + 3.1, v - 1.7, { frequency: 4.5, octaves: 3, seed: 41 });
      // Two vein families at different angles, ridged for a crisp edge.
      const v1 = 1 - Math.abs(Math.sin((u * 3.2 + v * 1.1 + warp * 3.6) * Math.PI));
      const v2 = 1 - Math.abs(Math.sin((u * 1.4 - v * 4.1 + warp2 * 2.8) * Math.PI));
      const veins = Math.max(Math.pow(v1, 5), Math.pow(v2, 8) * 0.7);
      const cloud = fbm(u, v, { frequency: 6, octaves: 4, seed: 73 });

      let rgb = mixRgb(base, deep, cloud * 0.4);
      rgb = mixRgb(rgb, vein, Math.min(1, veins * 1.15));
      return { rgb, h: veins * 0.6 + cloud * 0.4 };
    });

    return {
      map: toTexture(canvas),
      normalMap: toTexture(normalFromHeight(height, s, 0.35), { srgb: false }),
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.06, 0.3), { srgb: false }),
    };
  });
}

/** Weathered terracotta for the olive tree pot. */
export function terracotta(baseHex = '#b5866b', { size = 256 } = {}) {
  return memo(`terracotta:${baseHex}`, () => {
    const base = hexToRgb(baseHex);
    const pale = mixRgb(base, [238, 232, 220], 0.72);
    const dark = mixRgb(base, [88, 58, 42], 0.5);

    const { canvas, height, size: s } = generate(size, (u, v) => {
      const grain = fbm(u, v, { frequency: 10, octaves: 4, seed: 3 });
      // Salt bloom gathers toward the rim and drifts down.
      const bloom = fbm(u * 2, v * 0.7, { frequency: 3, octaves: 3, seed: 21 });
      const rim = Math.pow(Math.max(0, 1 - v * 2.6), 1.6);
      const wash = Math.max(0, bloom - 0.52) * 1.9 + rim * 0.5;
      let rgb = mixRgb(base, dark, grain * 0.22);
      rgb = mixRgb(rgb, pale, Math.min(0.8, wash));
      return { rgb, h: grain * 0.7 + wash * 0.3 };
    });

    return {
      map: toTexture(canvas),
      normalMap: toTexture(normalFromHeight(height, s, 1.1), { srgb: false }),
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.72, 0.98), { srgb: false }),
    };
  });
}

/** Clipped lawn for the garden — fine blade noise over mown banding. */
export function lawn(baseHex = '#7d8f6b', { size = 512 } = {}) {
  return memo(`lawn:${baseHex}`, () => {
    const base = hexToRgb(baseHex);
    const dark = mixRgb(base, [40, 58, 38], 0.55);
    const pale = mixRgb(base, [198, 208, 168], 0.6);

    const { canvas, height, size: s } = generate(size, (u, v) => {
      const blades = fbm(u, v, { frequency: 60, octaves: 3, seed: 12 });
      const patch = fbm(u, v, { frequency: 5, octaves: 4, seed: 44 });
      // Mown stripes.
      const stripe = Math.sin(u * Math.PI * 12) * 0.5 + 0.5;
      let rgb = mixRgb(base, dark, patch * 0.35 + blades * 0.25);
      rgb = mixRgb(rgb, pale, stripe * 0.14 + blades * 0.12);
      return { rgb, h: blades * 0.8 + patch * 0.2 };
    });

    return {
      map: toTexture(canvas),
      normalMap: toTexture(normalFromHeight(height, s, 1.9), { srgb: false }),
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.78, 1), { srgb: false }),
    };
  });
}

/** Damp planting soil for the beds. */
export function soil(baseHex = '#4a3f34', { size = 256 } = {}) {
  return memo(`soil:${baseHex}`, () => {
    const base = hexToRgb(baseHex);
    const dark = mixRgb(base, [18, 14, 10], 0.6);
    const pale = mixRgb(base, [136, 118, 96], 0.55);

    const { canvas, height, size: s } = generate(size, (u, v) => {
      const clods = fbm(u, v, { frequency: 22, octaves: 4, seed: 6 });
      const damp = fbm(u, v, { frequency: 4, octaves: 3, seed: 58 });
      let rgb = mixRgb(base, dark, damp * 0.5);
      rgb = mixRgb(rgb, pale, Math.max(0, clods - 0.6) * 1.6);
      return { rgb, h: clods };
    });

    return {
      map: toTexture(canvas),
      normalMap: toTexture(normalFromHeight(height, s, 2.4), { srgb: false }),
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.82, 1), { srgb: false }),
    };
  });
}

/** Pale gravel for the garden paths. */
export function gravel(baseHex = '#d7cfc0', { size = 256 } = {}) {
  return memo(`gravel:${baseHex}`, () => {
    const base = hexToRgb(baseHex);
    const dark = mixRgb(base, [110, 100, 86], 0.6);
    const pale = mixRgb(base, [252, 248, 238], 0.7);

    const { canvas, height, size: s } = generate(size, (u, v) => {
      const stones = fbm(u, v, { frequency: 40, octaves: 2, seed: 71 });
      const grain = fbm(u, v, { frequency: 90, octaves: 2, seed: 15 });
      const rgb = mixRgb(mixRgb(base, dark, 1 - stones), pale, Math.max(0, stones - 0.62) * 2);
      return { rgb, h: stones * 0.7 + grain * 0.3 };
    });

    return {
      map: toTexture(canvas),
      normalMap: toTexture(normalFromHeight(height, s, 2.6), { srgb: false }),
      roughnessMap: toTexture(grayscaleFromHeight(height, s, 0.8, 1), { srgb: false }),
    };
  });
}

/* --- environment lighting ---------------------------------------------- */

/** A tiny scene used only as an IBL source: warm sky, cool bounce, bright
 *  overhead disc standing in for the oculus. Cheaper and calmer than loading
 *  an HDR, and it keeps the build asset-free. */
export function environmentScene(theme) {
  const scene = new THREE.Scene();
  const size = 64;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, theme.daylight || '#fff6e8');
  grad.addColorStop(0.45, '#f3ece1');
  grad.addColorStop(1, '#cfc7ba');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(12, 24, 16),
    new THREE.MeshBasicMaterial({
      map: toTexture(canvas),
      side: THREE.BackSide,
    })
  );
  scene.add(shell);

  const oculus = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  oculus.position.y = 9;
  oculus.rotation.x = Math.PI / 2;
  scene.add(oculus);

  return scene;
}

export function clearTextureCache() {
  for (const entry of cache.values()) {
    if (entry && typeof entry === 'object') {
      for (const value of Object.values(entry)) value?.dispose?.();
    }
  }
  cache.clear();
}
