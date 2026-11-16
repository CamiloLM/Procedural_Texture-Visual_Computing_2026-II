// Control panel (lil-gui) and the paintable texture preview above it.

// Everything the panel controls. The sketch reads these every frame.
const params = {
  // Pattern (Gray-Scott parameters)
  f: PATTERNS.Jaguar.f,
  k: PATTERNS.Jaguar.k,
  dA: 1.0,
  dB: 0.5,

  // Palette
  palette: 'Jaguar',
  useOriginalBody: PALETTES.Jaguar.originalBody,
  spotMask: true,

  // Simulation
  stepsPerFrame: 10,
  brushSize: 8,
  seedMode: SEED_MODES[0],
  paused: false,

  // Mapping
  spotScale: 2,
  smoothNormals: true,

  // Phong
  ka: 0.3,
  kd: 0.7,
  ks: 0.35,
  shininess: 32,
  lightColor: '#ffffff',

  // View
  lightOrbit: true,
  autoRotate: false,
};

// Builds the panel inside #gui. `actions` holds the callbacks the buttons
// run: applyPattern(name), applyPalette(name), reseed(), togglePause(),
// setSmoothNormals(on), resetView(), screenshot(), saveTexture(), recordGif()
// and changed(), which the sketch uses to redraw the texture.
function buildGui(actions) {
  const gui = new lil.GUI({ container: document.getElementById('gui'), title: 'Controls' });
  const changed = () => actions.changed();

  // A row of preset buttons. Returns the controllers by preset name.
  const presetButtons = (folder, names, onClick) => {
    const handlers = {};
    const buttons = {};
    for (const name of names) {
      handlers[name] = () => onClick(name);
      buttons[name] = folder.add(handlers, name);
      buttons[name].domElement.classList.add('preset');
    }
    return buttons;
  };
  // Mark the button of the preset in use, if any.
  const highlight = (buttons, isActive) => {
    for (const [name, button] of Object.entries(buttons)) {
      button.domElement.classList.toggle('active', isActive(name));
    }
  };

  // Show an equation inside a folder, with a note about its symbols. The
  // lines are HTML: the symbols a slider controls are marked with <b>, and
  // each slider's label ends with its symbol, e.g. "Feed rate (f)".
  const addEquation = (folder, lines, note) => {
    const box = document.createElement('div');
    box.className = 'equation';
    box.innerHTML = `<pre>${lines.join('\n')}</pre><p>${note}</p>`;
    folder.$children.appendChild(box);
  };

  // --- Pattern ---
  const pattern = gui.addFolder('Pattern');
  const patternButtons = presetButtons(pattern, Object.keys(PATTERNS), (name) => {
    actions.applyPattern(name);
    fSlider.updateDisplay();
    kSlider.updateDisplay();
    highlightPattern();
  });
  const highlightPattern = () =>
    highlight(patternButtons, (name) => PATTERNS[name].f === params.f && PATTERNS[name].k === params.k);
  addEquation(pattern, [
    'A′ = A + <b>dA</b>·∇²A − A·B² + <b>f</b>·(1 − A)',
    'B′ = B + <b>dB</b>·∇²B + A·B² − (<b>k</b> + <b>f</b>)·B',
  ], 'Each step, in every cell. A and B are the two chemicals: A is fed in, B is removed, ' +
    'and A turns into B where they meet (A·B²). ∇² spreads each one to its neighbors.');
  const fSlider = pattern.add(params, 'f', 0.01, 0.08, 0.0001).name('Feed rate (f)').onChange(highlightPattern);
  const kSlider = pattern.add(params, 'k', 0.045, 0.07, 0.0001).name('Kill rate (k)').onChange(highlightPattern);
  pattern.add(params, 'dA', 0.2, 1, 0.01).name('Diffusion A (dA)');
  pattern.add(params, 'dB', 0.1, 0.8, 0.01).name('Diffusion B (dB)');
  highlightPattern();

  // --- Palette ---
  const palette = gui.addFolder('Palette');
  const paletteButtons = presetButtons(palette, Object.keys(PALETTES), (name) => {
    actions.applyPalette(name);
    bodyToggle.updateDisplay();
    highlightPalette();
  });
  const highlightPalette = () => highlight(paletteButtons, (name) => name === params.palette);
  const bodyToggle = palette.add(params, 'useOriginalBody').name('Use original body coloring').onChange(changed);
  palette.add(params, 'spotMask').name('Spot mask').onChange(changed);
  highlightPalette();

  // --- Simulation ---
  const simulation = gui.addFolder('Simulation');
  simulation.add(params, 'stepsPerFrame', 1, 40, 1).name('Steps/frame');
  simulation.add(params, 'brushSize', 1, 30, 1).name('Brush size');
  simulation.add(params, 'seedMode', SEED_MODES).name('Seed mode');
  simulation.add(actions, 'reseed').name('Reseed');
  const pauseButton = simulation.add(actions, 'togglePause').name('Pause')
    .onChange(() => pauseButton.name(params.paused ? 'Play' : 'Pause'));

  // --- Mapping ---
  const mapping = gui.addFolder('Mapping');
  mapping.add(params, 'spotScale', 0.5, 4, 0.1).name('Spot scale').onChange(changed);
  mapping.add(params, 'smoothNormals').name('Smooth normals').onChange(actions.setSmoothNormals);

  // --- Phong ---
  const phong = gui.addFolder('Phong');
  addEquation(phong, [
    'I = <b>Ka</b>·C',
    '  + <b>Kd</b>·(N·L)·C·<b>Lc</b>',
    '  + <b>Ks</b>·(R·V)<sup><b>n</b></sup>·<b>Lc</b>',
  ], 'Color of each pixel. C is the skin color. N·L is how directly the light hits the ' +
    'surface, and R·V how close the camera is to the mirror reflection of the light.');
  phong.add(params, 'ka', 0, 1, 0.01).name('Ambient (Ka)');
  phong.add(params, 'kd', 0, 1.5, 0.01).name('Diffuse (Kd)');
  phong.add(params, 'ks', 0, 1, 0.01).name('Specular (Ks)');
  phong.add(params, 'shininess', 1, 128, 1).name('Shininess (n)');
  phong.addColor(params, 'lightColor').name('Light color (Lc)');

  // --- View ---
  const view = gui.addFolder('View');
  view.add(params, 'lightOrbit').name('Light orbit');
  view.add(params, 'autoRotate').name('Auto-rotate');
  view.add(actions, 'resetView').name('Reset view');

  // --- Export ---
  const exporting = gui.addFolder('Export');
  exporting.add(actions, 'screenshot').name('Screenshot');
  exporting.add(actions, 'saveTexture').name('Save texture');
  const gifButton = exporting.add(actions, 'recordGif').name('Record GIF');

  return {
    gui,
    // Show that a GIF is being recorded, and block a second recording.
    setRecording(on) {
      gifButton.name(on ? 'Recording…' : 'Record GIF');
      gifButton.enable(!on);
    },
  };
}

// Puts the texture canvas in the panel and lets the user paint on it.
// onPaint(u, v) gets the position in texture coordinates (0-1).
function setupPreview(canvas, onPaint) {
  canvas.removeAttribute('style'); // p5 hides its graphics and sizes them in px
  canvas.removeAttribute('id');
  canvas.className = 'preview';
  document.getElementById('preview').appendChild(canvas);

  let last = null; // previous position of the stroke, or null between strokes

  const position = (event) => {
    const box = canvas.getBoundingClientRect();
    return { u: (event.clientX - box.left) / box.width, v: (event.clientY - box.top) / box.height };
  };

  // Paint from the previous position to this one, so a fast drag leaves a
  // continuous line instead of separate dots.
  const stroke = (event) => {
    const now = position(event);
    const from = last || now;
    const steps = Math.max(1, Math.ceil(Math.hypot(now.u - from.u, now.v - from.v) * 400));
    for (let i = 1; i <= steps; i++) {
      onPaint(from.u + ((now.u - from.u) * i) / steps, from.v + ((now.v - from.v) * i) / steps);
    }
    last = now;
  };

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    last = null;
    stroke(event);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (last) stroke(event);
  });
  const end = () => { last = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
