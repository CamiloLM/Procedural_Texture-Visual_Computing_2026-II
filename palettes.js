// Palettes and skin coloring.
//
// The simulation gives t = clamp(A - B) per cell: 1 on bare skin, falling to 0
// in the middle of a spot. A palette is a lookup table that maps t to a spot
// color with opacity, and that color is composited over a body color: either
// one solid color, or the model's original coloring with its painted spots
// removed.
//
// The same lookup runs in two places: here on the CPU, for the texture
// preview and the saved PNG, and per pixel in shaders/phong.frag, so the
// edges of the spots stay sharp when the texture is magnified on the model.

// Each stop is [t, r, g, b, opacity]. Colors are 0-255, opacity is 0-1.
const PALETTES = {
  // Black ring with a dark orange center: a jaguar rosette.
  Jaguar: {
    body: [226, 160, 62],
    originalBody: true,
    stops: [
      [0.00, 172, 96, 30, 1],
      [0.09, 172, 96, 30, 1],
      [0.17, 14, 10, 8, 1],
      [0.50, 14, 10, 8, 1],
      [0.60, 14, 10, 8, 0],
      [1.00, 14, 10, 8, 0],
    ],
  },
  // Black coat. The rosettes are still there, only a little darker.
  Panther: {
    body: [38, 36, 42],
    originalBody: false,
    stops: [
      [0.00, 30, 28, 34, 1],
      [0.09, 30, 28, 34, 1],
      [0.17, 6, 6, 9, 1],
      [0.50, 6, 6, 9, 1],
      [0.60, 6, 6, 9, 0],
      [1.00, 6, 6, 9, 0],
    ],
  },
  // Pale coat, charcoal rings with a gray center.
  'Snow Leopard': {
    body: [226, 222, 212],
    originalBody: false,
    stops: [
      [0.00, 150, 146, 140, 1],
      [0.09, 150, 146, 140, 1],
      [0.17, 44, 44, 50, 1],
      [0.50, 44, 44, 50, 1],
      [0.60, 44, 44, 50, 0],
      [1.00, 44, 44, 50, 0],
    ],
  },
  // Solid black marks on orange. Meant for the Stripes pattern: only the
  // core of each stripe is inked, so the orange stays dominant.
  Tiger: {
    body: [232, 126, 30],
    originalBody: false,
    stops: [
      [0.00, 16, 10, 8, 1],
      [0.16, 16, 10, 8, 1],
      [0.26, 16, 10, 8, 0],
      [1.00, 16, 10, 8, 0],
    ],
  },
  // The texture the model came with, for comparison. No simulation spots.
  Original: {
    body: [226, 160, 62],
    originalBody: true,
    showOriginal: true,
    stops: [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0]],
  },
};

const LUT_SIZE = 256;

// Where the spot mask is 0, t is raised by this much (out of 255) before the
// lookup, which is enough to push every spot past the transparent end.
const MASK_SHIFT = 255;

// Build the lookup table for a list of stops: LUT_SIZE entries of RGBA bytes,
// linearly interpolated between stops.
function buildLUT(stops) {
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  let s = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const p = stops[s], q = stops[s + 1];
    const w = Math.min(Math.max((t - p[0]) / (q[0] - p[0] || 1), 0), 1);
    for (let c = 0; c < 3; c++) lut[i * 4 + c] = p[c + 1] + (q[c + 1] - p[c + 1]) * w;
    lut[i * 4 + 3] = (p[4] + (q[4] - p[4]) * w) * 255;
  }
  return lut;
}

// --- Body coloring -------------------------------------------------------------

// A pixel of the original texture is "ink" (a painted spot) if it is black, or
// the dark brown of a rosette center. The pink nose is just as dark, but its
// blue is not lower than its green, so it is kept.
function isInk(r, g, b) {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma < 60 || (luma < 140 && b < g - 8);
}

// Remove the painted spots from the original texture, leaving only the body
// coloring: golden back, cream belly, pink nose. `rgba` is size x size and is
// modified in place. Ink pixels are filled inward from their edges with the
// average of the neighbors that already have a color, then smoothed.
function removeSpots(rgba, size) {
  const n = size * size;
  const hole = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (isInk(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])) hole[i] = 1;
  }

  // Grow the holes by 2 pixels, to also cover the blurry rim of each spot.
  for (let pass = 0; pass < 2; pass++) {
    const src = hole.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (src[y * size + x]) continue;
        const x0 = Math.max(x - 1, 0), x1 = Math.min(x + 1, size - 1);
        const y0 = Math.max(y - 1, 0), y1 = Math.min(y + 1, size - 1);
        if (src[y * size + x0] || src[y * size + x1] || src[y0 * size + x] || src[y1 * size + x]) {
          hole[y * size + x] = 1;
        }
      }
    }
  }
  const filled = hole.slice(); // remembers which pixels were holes

  // Fill the holes ring by ring, from the outside in.
  let remaining = 1;
  for (let pass = 0; pass < size && remaining > 0; pass++) {
    remaining = 0;
    const src = hole.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (!src[i]) continue;
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= size) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= size) continue;
            const j = yy * size + xx;
            if (src[j]) continue;
            r += rgba[j * 4]; g += rgba[j * 4 + 1]; b += rgba[j * 4 + 2]; count++;
          }
        }
        if (count === 0) { remaining++; continue; }
        rgba[i * 4] = r / count; rgba[i * 4 + 1] = g / count; rgba[i * 4 + 2] = b / count;
        hole[i] = 0;
      }
    }
  }

  // Smooth the filled pixels, so the fill doesn't show streaks.
  const tmp = new Float32Array(n * 3);
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < n; i++) {
      tmp[i * 3] = rgba[i * 4]; tmp[i * 3 + 1] = rgba[i * 4 + 1]; tmp[i * 3 + 2] = rgba[i * 4 + 2];
    }
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        if (!filled[i]) continue;
        for (let c = 0; c < 3; c++) {
          rgba[i * 4 + c] = (tmp[(i - 1) * 3 + c] + tmp[(i + 1) * 3 + c] +
            tmp[(i - size) * 3 + c] + tmp[(i + size) * 3 + c]) * 0.25;
        }
      }
    }
  }
  for (let i = 0; i < n; i++) rgba[i * 4 + 3] = 255;
}

// Build the spot mask from the body coloring: 255 where spots show in full
// (the saturated golden back), lower on the pale belly and face, where spots
// shrink into small solid dots as on a real jaguar, and 0 on the pink nose.
function buildSpotMask(rgba, size) {
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < mask.length; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    if (r > g + 50 && b > g - 12) { mask[i] = 0; continue; } // nose
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const saturation = max > 0 ? (max - min) / max : 0;
    let w = Math.min(Math.max((saturation - 0.30) / (0.50 - 0.30), 0), 1);
    w = w * w * (3 - 2 * w);
    mask[i] = 255 * (0.66 + 0.34 * w);
  }
  return mask;
}

// --- Skin ----------------------------------------------------------------------

const BODY_SIZE = 512;      // resolution of the body coloring and the spot mask
const ORIGINAL_SIZE = 1024; // resolution of the original texture on the model

// Holds the palette and the body coloring, as typed arrays for the CPU and as
// p5.Images for the shader.
class Skin {
  // `base` is the model's original texture (p5.Image).
  constructor(base) {
    // Original texture, scaled down so it doesn't shimmer without mipmaps.
    this.originalImage = createImage(ORIGINAL_SIZE, ORIGINAL_SIZE);
    this.originalImage.copy(base, 0, 0, base.width, base.height, 0, 0, ORIGINAL_SIZE, ORIGINAL_SIZE);

    // Body coloring: the original texture with its spots removed.
    this.bodyImage = createImage(BODY_SIZE, BODY_SIZE);
    this.bodyImage.copy(this.originalImage, 0, 0, ORIGINAL_SIZE, ORIGINAL_SIZE, 0, 0, BODY_SIZE, BODY_SIZE);
    this.bodyImage.loadPixels();
    removeSpots(this.bodyImage.pixels, BODY_SIZE);
    this.bodyImage.updatePixels();
    this.body = this.bodyImage.pixels.slice(); // RGBA bytes

    // Spot mask, as a gray image.
    this.mask = buildSpotMask(this.body, BODY_SIZE);
    this.maskImage = createImage(BODY_SIZE, BODY_SIZE);
    this.maskImage.loadPixels();
    for (let i = 0; i < this.mask.length; i++) {
      this.maskImage.pixels.set([this.mask[i], this.mask[i], this.mask[i], 255], i * 4);
    }
    this.maskImage.updatePixels();

    // Palette, as a LUT_SIZE x 2 image: row 0 is the spot color and row 1 its
    // opacity as gray. Both rows are opaque, so nothing is premultiplied.
    this.paletteImage = createImage(LUT_SIZE, 2);
    this.setPalette('Jaguar');
  }

  setPalette(name) {
    this.name = name;
    this.palette = PALETTES[name];
    this.lut = buildLUT(this.palette.stops);

    const img = this.paletteImage;
    img.loadPixels();
    for (let i = 0; i < LUT_SIZE; i++) {
      const r = this.lut[i * 4], g = this.lut[i * 4 + 1], b = this.lut[i * 4 + 2], a = this.lut[i * 4 + 3];
      img.pixels.set([r, g, b, 255], i * 4);
      img.pixels.set([a, a, a, 255], (LUT_SIZE + i) * 4);
    }
    img.updatePixels();
  }

  // Composite the skin texture on the CPU into `out`, a Uint32Array view of
  // size x size RGBA pixels. `rd` is the simulation, `scale` repeats its
  // pattern over the body, and the two flags are the panel's checkboxes.
  //
  // This is the same math as skinColor() in shaders/phong.frag.
  composite(out, size, rd, scale, useOriginalBody, useMask) {
    const { lut, body, mask } = this;
    const [solidR, solidG, solidB] = this.palette.body;
    const n = rd.size, t = rd.t;
    const { cell0, cell1, weight, bodyCell } = this.sampleTable(size, n, scale);

    for (let y = 0; y < size; y++) {
      const row0 = cell0[y] * n, row1 = cell1[y] * n, wy = weight[y];
      const bodyRow = bodyCell[y] * BODY_SIZE;

      for (let x = 0; x < size; x++) {
        // t, blended between the four nearest cells of the field.
        const c0 = cell0[x], c1 = cell1[x], wx = weight[x];
        const top = t[row0 + c0] + (t[row0 + c1] - t[row0 + c0]) * wx;
        const bot = t[row1 + c0] + (t[row1 + c1] - t[row1 + c0]) * wx;
        let ti = (top + (bot - top) * wy) | 0;

        const bi = bodyRow + bodyCell[x];
        if (useMask) {
          ti += ((255 - mask[bi]) * MASK_SHIFT) >> 8;
          if (ti > 255) ti = 255;
        }

        let r = solidR, g = solidG, b = solidB;
        if (useOriginalBody) { r = body[bi * 4]; g = body[bi * 4 + 1]; b = body[bi * 4 + 2]; }

        const li = ti * 4, alpha = lut[li + 3];
        if (alpha > 0) {
          r += ((lut[li] - r) * alpha) >> 8;
          g += ((lut[li + 1] - g) * alpha) >> 8;
          b += ((lut[li + 2] - b) * alpha) >> 8;
        }
        out[y * size + x] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }
  }

  // For each output column (or row, the texture is square): the two field
  // cells to blend between, the blend weight, and the body-coloring cell.
  // The field wraps. Cached, so compositing every frame allocates nothing.
  sampleTable(size, n, scale) {
    const c = this.table;
    if (c && c.size === size && c.n === n && c.scale === scale) return c;

    const table = {
      size, n, scale,
      cell0: new Int32Array(size),
      cell1: new Int32Array(size),
      weight: new Float32Array(size),
      bodyCell: new Int32Array(size),
    };
    for (let i = 0; i < size; i++) {
      const pos = ((i + 0.5) / size) * scale * n - 0.5;
      const cell = Math.floor(pos);
      table.cell0[i] = ((cell % n) + n) % n;
      table.cell1[i] = (((cell + 1) % n) + n) % n;
      table.weight[i] = pos - cell;
      table.bodyCell[i] = Math.floor(((i + 0.5) / size) * BODY_SIZE);
    }
    this.table = table;
    return table;
  }
}
