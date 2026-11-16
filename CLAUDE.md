# CLAUDE.md

A reaction-diffusion texture (Gray-Scott, after https://www.karlsims.com/rd.html) that evolves live on a 3D jaguar, lit by a custom Phong shader, with controls to personalize the texture. Course assignment, Visual Computing 2026-II.

`README.md` (Spanish) is the spec for everything user-facing: control labels, presets, theory and credits. Keep it in sync with the code.

## Requirements (all must stay met)
- The **jaguar OBJ** in `assets/models/` is the model, with the reaction-diffusion texture applied to it.
- The texture comes from a **Gray-Scott simulation**, computed in this project.
- **Phong illumination is per pixel, in our own GLSL shader.** Don't replace it with p5's `lights()` or `specularMaterial()`.
- **Buttons and sliders** personalize the texture.

## Run
```bash
python -m http.server 8000   # or: npx serve .
```
Open http://localhost:8000. `file://` doesn't work, because `loadModel`, `loadImage` and `loadShader` fetch over HTTP. There is no build step.

## Conventions
- **Platform:** p5.js **2.3.1** in global mode, `WEBGL`.
- **Libraries** are local copies in `assets/libs/` (no CDN, no npm, no build):
  - `p5.js` for 3D, model loading and the camera
  - `lil-gui.umd.min.js` (**lil-gui 0.21.0**, MIT) for the control panel
  - Load order in `index.html`: p5, then lil-gui, then the project scripts.
- **Write the core yourself:** the Gray-Scott simulation and the Phong shader are what the assignment grades. Never take them from a library.
- **Language:** the README and `docs/` are in **Spanish**. UI labels, identifiers and code comments are in **English**.
- **Paths:** every asset path is relative (`assets/...`) and never starts with `/`, because GitHub Pages serves the site under `/<repo>/`.
- **Model credit:** the line below must appear verbatim in the README and in the page footer (CC-BY 3.0 requires it):
  > Jaguar by Poly by Google [CC-BY 3.0] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/4fb-oMr2uUF)

## Architecture
| File | Role |
|---|---|
| `index.html` | Canvas in `<main>`, controls in `<aside id="panel">`, credit in the footer |
| `style.css` | Two columns (canvas, 300px panel); the panel goes below the canvas under 620px |
| `sketch.js` | `async setup()` and `draw()`, `orbitControl()`, light orbit, shader uniforms, the button actions and the exports |
| `reactionDiffusion.js` | Gray-Scott on the CPU: `Float32Array` grids at 256², double-buffered, wrapping edges, values clamped to 0–1. Seeds, the brush, and the pattern presets (`PATTERNS`). Writes `t = clamp(A−B)` as gray into a `p5.Graphics` (`rd.field`) |
| `palettes.js` | Palettes (`PALETTES`) and the `Skin` class: a 256-entry lookup table that maps `t` to a spot color with opacity, composited over a body color (solid, or `Jaguar_BaseColor.png` at 512² with its painted spots removed), plus the spot mask. `Skin.composite()` does this on the CPU for the preview and `Save texture` |
| `jaguar.js` | Loads the OBJ, orients it upright, computes smooth normals |
| `gui.js` | `params` (all panel state) and the lil-gui panel inside `#gui` (`new lil.GUI({ container })`), with folders for Pattern, Palette, Simulation, Mapping, Phong, View and Export. Presets and actions are buttons (`gui.add(obj, 'fnName')`), parameters are sliders, toggles are checkboxes, and the light color uses `addColor`. The Pattern and Phong folders show their equation (`addEquation`), and those sliders are labeled `Description (symbol)`, with the symbol as it appears in the equation. Above the GUI, the composited texture (a `p5.Graphics`) is shown as a live preview that the user can paint on (custom code, not lil-gui) |
| `shaders/phong.{vert,frag}` | Phong: `Ka·tex + Kd·(N·L)·tex·Lc + Ks·(R·V)^n·Lc`, where `tex = skinColor(uv)` |

**The palette lookup runs twice, and the two copies must stay in sync:** `Skin.composite()` in `palettes.js` (CPU) and `skinColor()` in `phong.frag` (GPU). The shader gets the field, the palette (256×2 image: color row, opacity row), the body coloring and the mask as separate textures. It looks up the palette after the GPU interpolates `t`, which keeps spot edges sharp at any magnification, and it reads body and mask at the unscaled UV so only the pattern repeats with `uUVScale`.

## Gotchas
- **p5 2.x:** there's no `preload()`. Use `await` inside `async setup()`.
  - `assets/libs/p5.js` is minified, so check an API by running `grep -o` on it.
  - These are confirmed to exist: `textureWrap`, `saveGif`, `saveCanvas`, `computeNormals`, the uniforms `uModelViewMatrix`, `uProjectionMatrix`, `uNormalMatrix`, `uModelMatrix` and `uViewMatrix`, and the attributes `aPosition`, `aNormal` and `aTexCoord`.
  - **Camera:** use the global `camera(...)` and `perspective(...)`. A reference from `createCamera()` goes stale: it is not the active camera, and p5 swaps the active camera object between frames.
  - **Textures:** a `p5.Graphics` used as a texture is uploaded again every frame; a `p5.Image` only when it changes. So the static textures (palette, body, mask, original) are `p5.Image`s. Uploads are premultiplied, which is why the palette keeps color and opacity in separate opaque rows.
  - **Normals:** after replacing `geometry.vertexNormals`, set `geometry.dirtyFlags.vertexNormals = true`.
  - **`saveGif`** keeps every frame in memory and records at the sketch's frame rate, so `recordGif()` shrinks the canvas to 480px and sets 20 fps while it runs.
- **The OBJ loader already flips V** (`1 − v`), so don't flip again. It fan-triangulates quads. Use `loadModel(path, { normalize: true, fileType: '.obj' })`: without `fileType`, p5 2.3.1 throws `s.toLowerCase is not a function` when given an options object.
- **The model is Y-up, and p5's Y points down.** Rotate it to stand upright and check visually. The body runs along Z.
- **The UVs are mirrored:** the left and right halves of the body share one flattened half pelt (the tail and a few small pieces are separate islands), which covers about 40% of the texture. The pattern flows continuously from head to legs and comes out symmetric on both sides.
  - The simulation's wrapping edges make the field periodic, so `uUVScale` with `textureWrap(REPEAT)` repeats it without seams.
- **`Jaguar_BaseColor.png` already has spots painted on it.** `removeSpots()` in `palettes.js` fills them in at load time to get the bare body coloring. The `Original` palette shows the untouched texture.
- **Spot patterns only keep isolated spots.** With the `Jaguar` and `Leopard` parameters, a large patch of B, a continuous stroke, or seeds closer than about 16 cells use up their A and die. Seeds are small squares (6 cells at most) and the brush plants separate soft spots (`ReactionDiffusion.paint`).
- **The model's normals are flat** (low-poly). For smooth normals, average the normals of vertices that share a position, **without welding them**. `computeNormals(SMOOTH)` welds vertices and breaks the UVs.
- **The light position is in world space.** Convert it in the shader with `uViewMatrix`, so the light stays put while the camera orbits.
- **lil-gui:** it exposes the global `lil.GUI`.
  - Control labels set with `.name(...)` must match the labels in the README's Controles table.
  - When code changes a value (for example, a preset setting f and k), call `.updateDisplay()` on those controllers, or use `.listen()`, so the sliders follow.
- **Performance:** aim for about 60 fps at 256² with 10 steps per frame. Keep the inner loop allocation-free, and precompute the neighbor indices.
  - Measured on an i5-1035G4 in powersave: 10 steps cost about 6.5 ms and a whole frame about 8 ms. Tiny values of B are flushed to 0, because denormal floats slow the loop down.
  - Chrome throttles a tab that isn't on screen to about 1 fps. To test from a hidden window, drive frames with `await redraw()`.

## Repo
- GitHub: `CamiloLM/Procedural_Texture-Visual_Computing_2026-II` (public, branch `main`). The three teammates are invited as collaborators.
- Licensing: the project's code is MIT (`LICENSE`, under all four team members). Third-party licenses are listed in the README's "Licencia" section. Keep that table current when adding assets or libraries.
- The downloaded `.zip` stays in the folder but is git-ignored.
- Model files keep their original names in `assets/models/`, because `Jaguar.mtl` references `Jaguar_BaseColor.png`.

## TODO
- **GitHub Pages is not enabled yet. Leave it until the user asks.** `.nojekyll` is already in place. When it's time: Pages → deploy from branch `main` / `(root)`, then replace the README's "Ver en línea" placeholder with the URL.
- The images in `docs/screenshots/` were captured from the canvas at the default view (760×470, plus the 1024² texture). Replace them if the look changes.

## Verify
1. The console shows no errors.
2. With the `Original` palette, the PNG maps correctly: the nose is pink and the belly is cream. This confirms the V coordinate isn't flipped twice.
3. The rosettes form within a few seconds and cover the body.
4. The highlight follows the orbiting light and stays fixed while the camera orbits. Ks=0 removes the highlight.
5. Every control has a live effect, and painting on the preview adds spots in the matching place on the body.
6. Each export (Screenshot, Save texture, Record GIF) downloads a file.
7. The frame rate stays at about 60 fps.
