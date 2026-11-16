// Gray-Scott reaction-diffusion on the CPU, after Karl Sims' tutorial
// (https://www.karlsims.com/rd.html).
//
// Two chemicals, A and B, live on a square grid whose edges wrap around.
// Every step applies
//
//   A' = A + (dA * lap(A) - A*B*B + f * (1 - A)) * dt
//   B' = B + (dB * lap(B) + A*B*B - (k + f) * B) * dt
//
// with dt = 1 and a 3x3 Laplacian (center -1, adjacent 0.2, diagonal 0.05).

const SEED_MODES = ['Random spots', 'Center blob', 'Noise'];

// Brush. Spots planted closer than SPOT_SPACING cells compete for A and most
// of them die, so the brush keeps that distance between the spots it plants,
// for as long as a new spot takes to settle (SPOT_SETTLE steps).
const SPOT_SPACING = 16;
const SPOT_SETTLE = 400;

// Pattern presets. Only f (feed) and k (kill) change between them.
const PATTERNS = {
  Jaguar: { f: 0.0367, k: 0.0649 },  // rosettes: spots that split until they fill the skin
  Leopard: { f: 0.030, k: 0.062 },   // small, tightly packed spots
  Stripes: { f: 0.029, k: 0.057 },   // stripes that fold into a maze
  Coral: { f: 0.0545, k: 0.062 },    // branching coral growth
};

class ReactionDiffusion {
  constructor(size = 256) {
    this.size = size;
    const n = size * size;

    // Double buffer: read from a/b, write into a2/b2, then swap.
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a2 = new Float32Array(n);
    this.b2 = new Float32Array(n);

    // Wrapped neighbor indices, precomputed so the inner loop has no modulo:
    // the column to the right of x, and the start of the row above/below y.
    this.right = new Int32Array(size);
    this.up = new Int32Array(size);
    this.down = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      this.right[i] = (i + 1) % size;
      this.up[i] = ((i + size - 1) % size) * size;
      this.down[i] = ((i + 1) % size) * size;
    }

    // t = clamp(A - B) per cell, as a byte. This is what the palette colors.
    this.t = new Uint8Array(n);

    this.field = null; // p5.Graphics holding t as a grayscale image
    this.steps = 0;    // iterations since the last seed
    this.planted = []; // spots the brush planted recently: { x, y, step }
    this.seed('Random spots');
  }

  // --- Seeding ---------------------------------------------------------------

  // Restart with A = 1 everywhere and B = 1 in a few places.
  seed(mode) {
    const { size, a, b } = this;
    a.fill(1);
    b.fill(0);
    this.steps = 0;
    this.planted.length = 0;

    if (mode === 'Center blob') {
      // A small cluster of seeds in the middle; the pattern grows outward
      // from it. (One big solid blob would use up its A and die out.)
      const c = size / 2;
      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 8;
        this.fillSquare(Math.round(c + Math.cos(angle) * dist), Math.round(c + Math.sin(angle) * dist), 3);
      }
    } else if (mode === 'Noise') {
      // Blocky noise: every 6x6 block has a 15% chance of starting as B = 1,
      // so the pattern starts everywhere at once. (Finer noise dies out.)
      const block = 6;
      for (let y = 0; y < size; y += block) {
        for (let x = 0; x < size; x += block) {
          if (Math.random() < 0.15) this.fillSquare(x, y, block);
        }
      }
    } else {
      // Random spots: small squares scattered over the grid.
      const count = Math.round((size * size) / 700);
      for (let i = 0; i < count; i++) {
        const s = 3 + Math.floor(Math.random() * 4);
        this.fillSquare(Math.floor(Math.random() * size), Math.floor(Math.random() * size), s);
      }
    }
  }

  // Set B = 1 in an s-by-s square whose top-left cell is (x0, y0). Wraps.
  fillSquare(x0, y0, s) {
    const { size, b } = this;
    for (let dy = 0; dy < s; dy++) {
      const row = ((y0 + dy) % size) * size;
      for (let dx = 0; dx < s; dx++) b[row + ((x0 + dx) % size)] = 1;
    }
  }

  // The brush of the texture preview: plant one spot at a random place within
  // `radius` cells of (u, v), which is in texture coordinates (0-1, wrapping).
  // Dragging calls this many times, so the brush sprays spots over its area.
  // Returns whether a spot was planted.
  //
  // A spot is planted as it looks once settled (B high and A low in the
  // middle, fading out), not as a block of B = 1: in the spot patterns a
  // large or crowded patch of B uses up its A and dies.
  paint(u, v, radius) {
    const { size, a, b, planted } = this;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius;
    const wrap = (c) => ((Math.round(c) % size) + size) % size;
    const cx = wrap((u - Math.floor(u)) * size + Math.cos(angle) * dist);
    const cy = wrap((v - Math.floor(v)) * size + Math.sin(angle) * dist);

    // Forget the spots that have settled, then check there is room.
    while (planted.length > 0 && this.steps - planted[0].step > SPOT_SETTLE) planted.shift();
    for (const spot of planted) {
      let dx = Math.abs(spot.x - cx), dy = Math.abs(spot.y - cy);
      dx = Math.min(dx, size - dx); // shortest way around the wrapping grid
      dy = Math.min(dy, size - dy);
      if (dx * dx + dy * dy < SPOT_SPACING * SPOT_SPACING) return false;
    }

    // Core of 2 cells, then a smooth rim of 3.
    const core = 2, rim = 3, reach = core + rim;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        let g = 1 - (Math.hypot(dx, dy) - core) / rim;
        if (g <= 0) continue;
        g = g >= 1 ? 1 : g * g * (3 - 2 * g);
        const i = ((cy + dy + size) % size) * size + ((cx + dx + size) % size);
        b[i] = Math.max(b[i], 0.36 * g);
        a[i] = Math.min(a[i], 1 - 0.7 * g);
      }
    }
    planted.push({ x: cx, y: cy, step: this.steps });
    return true;
  }

  // --- Simulation ------------------------------------------------------------

  // Advance the simulation by `steps` iterations. Allocation-free.
  //
  // The Laplacian of a cell needs its 8 neighbors. Walking along a row, each
  // column contributes its middle cell and the sum of the cells above and
  // below it, so the loop keeps those two numbers for the previous, current
  // and next column and only reads three new cells per chemical per step.
  step(f, k, dA, dB, steps = 1) {
    const { size, right, up, down } = this;
    const last = size - 1;

    // Weights with the diffusion rate folded in. The Laplacian's "- center"
    // and the other terms that multiply the center cell are folded into
    // centerA and centerB.
    const adjA = dA * 0.2, diagA = dA * 0.05, centerA = 1 - dA - f;
    const adjB = dB * 0.2, diagB = dB * 0.05, centerB = 1 - dB - k - f;

    for (let s = 0; s < steps; s++) {
      const a = this.a, b = this.b, a2 = this.a2, b2 = this.b2;

      for (let y = 0; y < size; y++) {
        const mid = y * size, top = up[y], bot = down[y];

        // Previous column (wraps to the last one) and current column.
        let aSidePrev = a[top + last] + a[bot + last], aMidPrev = a[mid + last];
        let bSidePrev = b[top + last] + b[bot + last], bMidPrev = b[mid + last];
        let aSide = a[top] + a[bot], aMid = a[mid];
        let bSide = b[top] + b[bot], bMid = b[mid];

        for (let x = 0; x < size; x++) {
          const r = right[x];
          const aSideNext = a[top + r] + a[bot + r], aMidNext = a[mid + r];
          const bSideNext = b[top + r] + b[bot + r], bMidNext = b[mid + r];

          const reaction = aMid * bMid * bMid;
          const na = aMid * centerA + (aMidPrev + aMidNext + aSide) * adjA +
            (aSidePrev + aSideNext) * diagA + f - reaction;
          const nb = bMid * centerB + (bMidPrev + bMidNext + bSide) * adjB +
            (bSidePrev + bSideNext) * diagB + reaction;

          // Keep both in 0-1: with dt = 1 a hard seed (B = 1) would overshoot
          // and blow up. Tiny B is flushed to 0, because denormal floats make
          // the loop several times slower.
          a2[mid + x] = na < 0 ? 0 : na > 1 ? 1 : na;
          b2[mid + x] = nb < 1e-12 ? 0 : nb > 1 ? 1 : nb;

          // Slide the window one column to the right.
          aSidePrev = aSide; aMidPrev = aMid; aSide = aSideNext; aMid = aMidNext;
          bSidePrev = bSide; bMidPrev = bMid; bSide = bSideNext; bMid = bMidNext;
        }
      }

      // Swap the buffers.
      this.a = a2; this.a2 = a;
      this.b = b2; this.b2 = b;
    }
    this.steps += steps;
  }

  // --- Output ----------------------------------------------------------------

  // Create the p5.Graphics that holds the field. Call once, from setup().
  createField() {
    const g = createGraphics(this.size, this.size);
    g.pixelDensity(1);
    this.field = g;
    this.fieldImage = g.drawingContext.createImageData(this.size, this.size);
    this.fieldPixels = new Uint32Array(this.fieldImage.data.buffer);
    this.updateField();
    return g;
  }

  // Compute t = clamp(A - B) for every cell and write it into the field
  // graphics as an opaque gray pixel.
  updateField() {
    const { a, b, t, fieldPixels } = this;
    for (let i = 0; i < t.length; i++) {
      let v = (a[i] - b[i]) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v | 0;
      t[i] = v;
      if (fieldPixels) fieldPixels[i] = 0xff000000 | (v << 16) | (v << 8) | v;
    }
    if (this.field) this.field.drawingContext.putImageData(this.fieldImage, 0, 0);
  }
}
