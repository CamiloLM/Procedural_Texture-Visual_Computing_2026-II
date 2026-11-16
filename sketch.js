// Reaction-diffusion jaguar: a Gray-Scott texture that grows live on a 3D
// jaguar, lit by our own Phong shader.

const GRID = 256;          // simulation resolution
const SAVE_SIZE = 1024;    // resolution of the PNG that "Save texture" writes
const FOV = 0.6;           // vertical field of view, in radians
const CAMERA_START = [120, -55, 300];
const LIGHT_RADIUS = 240;  // the light orbits the jaguar at this distance...
const LIGHT_HEIGHT = 150;  // ...and this far above it
const GIF_SECONDS = 5;
const GIF_FPS = 20;
const GIF_WIDTH = 480;

let rd;        // ReactionDiffusion
let skin;      // Skin: palette and body coloring
let jaguar;    // { geometry, setSmooth }
let phong;     // p5.Shader
let panel;     // { gui, setRecording }

let preview;        // p5.Graphics with the composited texture (shown in the panel)
let previewImage;   // its ImageData...
let previewPixels;  // ...as one Uint32 per pixel

let textureDirty = true; // the field or the palette changed since the last composite
let modelAngle = 0;
let lightAngle = 0.9;
let recording = false;
let fps = 60;

async function setup() {
  const holder = document.querySelector('main');
  createCanvas(holder.clientWidth, holder.clientHeight, WEBGL).parent(holder);

  // p5 2.x has no preload(): load everything here.
  let base;
  [jaguar, base, phong] = await Promise.all([
    loadJaguar(),
    loadImage(JAGUAR_TEXTURE),
    loadShader('shaders/phong.vert', 'shaders/phong.frag'),
  ]);

  rd = new ReactionDiffusion(GRID);
  rd.createField();
  skin = new Skin(base);
  jaguar.setSmooth(params.smoothNormals);

  preview = createGraphics(GRID, GRID);
  preview.pixelDensity(1);
  previewImage = preview.drawingContext.createImageData(GRID, GRID);
  previewPixels = new Uint32Array(previewImage.data.buffer);
  setupPreview(preview.canvas, paint);

  panel = buildGui({
    applyPattern, applyPalette, reseed, togglePause, resetView,
    screenshot, saveTexture, recordGif,
    setSmoothNormals: (on) => jaguar.setSmooth(on),
    changed: () => { textureDirty = true; },
  });

  resetView();
  noStroke();
  document.body.classList.remove('loading');
}

function draw() {
  const dt = Math.min(deltaTime, 100) / 1000;

  // --- Simulation and texture ---
  if (!params.paused) {
    rd.step(params.f, params.k, params.dA, params.dB, params.stepsPerFrame);
    textureDirty = true;
  }
  if (textureDirty) {
    rd.updateField();
    updatePreview();
    textureDirty = false;
  }

  // --- Scene ---
  background(24, 26, 32);
  orbitControl();

  if (params.autoRotate) modelAngle += dt * 0.5;
  if (params.lightOrbit) lightAngle += dt * 0.7;
  const lightPosition = [
    Math.cos(lightAngle) * LIGHT_RADIUS,
    -LIGHT_HEIGHT, // p5's Y points down
    Math.sin(lightAngle) * LIGHT_RADIUS,
  ];
  const lightColor = color(params.lightColor);
  const lightRGB = [red(lightColor) / 255, green(lightColor) / 255, blue(lightColor) / 255];

  // The pattern is periodic, so repeating the field has no seams.
  textureWrap(REPEAT);

  shader(phong);
  phong.setUniform('uField', rd.field);
  phong.setUniform('uPalette', skin.paletteImage);
  phong.setUniform('uBody', skin.bodyImage);
  phong.setUniform('uMask', skin.maskImage);
  phong.setUniform('uOriginal', skin.originalImage);
  phong.setUniform('uBodyColor', skin.palette.body.map((c) => c / 255));
  phong.setUniform('uUVScale', params.spotScale);
  phong.setUniform('uUseBody', params.useOriginalBody);
  phong.setUniform('uUseMask', params.spotMask);
  phong.setUniform('uShowOriginal', !!skin.palette.showOriginal);
  phong.setUniform('uLightPosition', lightPosition);
  phong.setUniform('uLightColor', lightRGB);
  phong.setUniform('uKa', params.ka);
  phong.setUniform('uKd', params.kd);
  phong.setUniform('uKs', params.ks);
  phong.setUniform('uShininess', params.shininess);

  push();
  rotateY(modelAngle);
  model(jaguar.geometry);
  pop();

  // A small marker where the light is. It is not lit: just a flat color.
  resetShader();
  push();
  translate(lightPosition[0], lightPosition[1], lightPosition[2]);
  fill(lightColor);
  sphere(4, 12, 8);
  pop();

  updateStats();
}

// Composite the texture into the preview: the palette applied to the field,
// over the body coloring. See Skin.composite().
function updatePreview() {
  const ctx = preview.drawingContext;
  if (skin.palette.showOriginal) {
    ctx.drawImage(skin.originalImage.canvas, 0, 0, GRID, GRID);
    return;
  }
  skin.composite(previewPixels, GRID, rd, params.spotScale, params.useOriginalBody, params.spotMask);
  ctx.putImageData(previewImage, 0, 0);
}

function updateStats() {
  fps += (frameRate() - fps) * 0.05;
  if (frameCount % 20 === 0) {
    document.getElementById('stats').textContent = `${GRID}×${GRID} · ${fps.toFixed(0)} fps`;
  }
}

// --- Actions -------------------------------------------------------------------

// Brush of the texture preview: adds chemical B around (u, v).
function paint(u, v) {
  // The preview shows the texture as it lies on the body, where the pattern
  // repeats spotScale times. Go back to the coordinates of the field.
  rd.paint(u * params.spotScale, v * params.spotScale, params.brushSize);
  textureDirty = true;
}

function applyPattern(name) {
  params.f = PATTERNS[name].f;
  params.k = PATTERNS[name].k;
  reseed();
}

function applyPalette(name) {
  params.palette = name;
  params.useOriginalBody = PALETTES[name].originalBody;
  skin.setPalette(name);
  textureDirty = true;
}

function reseed() {
  rd.seed(params.seedMode);
  textureDirty = true;
}

function togglePause() {
  params.paused = !params.paused;
}

function resetView() {
  camera(...CAMERA_START, 0, 0, 0, 0, 1, 0);
  setProjection();
}

function setProjection() {
  perspective(FOV, width / height, 10, 5000);
}

function windowResized() {
  if (recording) return;
  const holder = document.querySelector('main');
  resizeCanvas(holder.clientWidth, holder.clientHeight);
  setProjection();
}

// --- Export --------------------------------------------------------------------

function screenshot() {
  saveCanvas('jaguar', 'png');
}

// Save the texture as a PNG, composited at a higher resolution than the
// preview. The spots stay sharp, because the palette is applied after the
// field is interpolated.
function saveTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAVE_SIZE;
  const ctx = canvas.getContext('2d');

  if (skin.palette.showOriginal) {
    ctx.drawImage(skin.originalImage.canvas, 0, 0, SAVE_SIZE, SAVE_SIZE);
  } else {
    const image = ctx.createImageData(SAVE_SIZE, SAVE_SIZE);
    skin.composite(new Uint32Array(image.data.buffer), SAVE_SIZE, rd,
      params.spotScale, params.useOriginalBody, params.spotMask);
    ctx.putImageData(image, 0, 0);
  }
  saveCanvas(canvas, 'jaguar-texture', 'png');
}

// Record a GIF of the canvas. saveGif() keeps every frame in memory, so the
// canvas is made smaller and slower while it records.
async function recordGif() {
  if (recording) return;
  recording = true;
  panel.setRecording(true);

  const size = [width, height];
  resizeCanvas(GIF_WIDTH, Math.round((GIF_WIDTH * height) / width));
  setProjection();
  frameRate(GIF_FPS);

  try {
    await saveGif('jaguar', GIF_SECONDS, { units: 'seconds', silent: true });
  } finally {
    frameRate(60);
    resizeCanvas(size[0], size[1]);
    setProjection();
    recording = false;
    panel.setRecording(false);
    windowResized();
  }
}
