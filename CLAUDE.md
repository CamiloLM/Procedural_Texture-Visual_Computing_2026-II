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
| `sketch.js` | `async setup()` and `draw()`, `orbitControl()`, light orbit, shader uniforms |
| `reactionDiffusion.js` | Gray-Scott on the CPU: `Float32Array` grids at 256², double-buffered, wrapping edges. Writes the texture into a `p5.Graphics` |
| `palettes.js` | A lookup table that maps `t = clamp(A−B)` to a spot color with opacity, composited over a body color (solid, or `Jaguar_BaseColor.png` resampled to 256²) |
| `jaguar.js` | Loads the OBJ, orients it upright, computes smooth normals |
| `gui.js` | lil-gui panel inside `#panel` (`new lil.GUI({ container })`), with folders for Pattern, Palette, Simulation, Mapping, Phong, View and Export. Presets and actions are buttons (`gui.add(obj, 'fnName')`), parameters are sliders, toggles are checkboxes, and the light color uses `addColor`. Above the GUI, the texture `p5.Graphics` is shown as a live preview that the user can paint on (custom code, not lil-gui) |
| `shaders/phong.{vert,frag}` | Phong: `Ka·tex + Kd·(N·L)·tex·Lc + Ks·(R·V)^n·Lc` |

## Gotchas
- **p5 2.x:** there's no `preload()`. Use `await` inside `async setup()`.
  - `assets/libs/p5.js` is minified, so check an API by running `grep -o` on it.
  - These are confirmed to exist: `textureWrap`, `saveGif`, `saveCanvas`, `computeNormals`, the uniforms `uModelViewMatrix`, `uProjectionMatrix`, `uNormalMatrix`, `uModelMatrix` and `uViewMatrix`, and the attributes `aPosition`, `aNormal` and `aTexCoord`.
- **The OBJ loader already flips V** (`1 − v`), so don't flip again. It fan-triangulates quads. Use `loadModel(path, { normalize: true })`.
- **The model is Y-up, and p5's Y points down.** Rotate it to stand upright and check visually. The body runs along Z.
- **The UVs form one flattened pelt filling 0–1.** That's why the pattern flows continuously across the body; seams appear only along the belly and legs.
  - The simulation's wrapping edges make the texture periodic, so `uUVScale` with `textureWrap(REPEAT)` repeats it without seams.
- **The model's normals are flat** (low-poly). For smooth normals, average the normals of vertices that share a position, **without welding them**. `computeNormals(SMOOTH)` welds vertices and breaks the UVs.
- **The light position is in world space.** Convert it in the shader with `uViewMatrix`, so the light stays put while the camera orbits.
- **lil-gui:** it exposes the global `lil.GUI`.
  - Control labels set with `.name(...)` must match the labels in the README's Controles table.
  - When code changes a value (for example, a preset setting f and k), call `.updateDisplay()` on those controllers, or use `.listen()`, so the sliders follow.
- **Performance:** aim for about 60 fps at 256² with 10 steps per frame. Keep the inner loop allocation-free, and precompute the neighbor indices.

## Repo
- GitHub: `CamiloLM/Procedural_Texture-Visual_Computing_2026-II` (public, branch `main`). The three teammates are invited as collaborators.
- Licensing: the project's code is MIT (`LICENSE`, under all four team members). Third-party licenses are listed in the README's "Licencia" section. Keep that table current when adding assets or libraries.
- The downloaded `.zip` stays in the folder but is git-ignored.
- Model files keep their original names in `assets/models/`, because `Jaguar.mtl` references `Jaguar_BaseColor.png`.

## TODO
- **GitHub Pages is not enabled yet. Leave it until the user asks.** `.nojekyll` is already in place. When it's time: Pages → deploy from branch `main` / `(root)`, then replace the README's "Ver en línea" placeholder with the URL.
- Fill in the screenshots in `docs/screenshots/` (see the README's `<!-- TODO -->` comments).

## Verify
1. The console shows no errors.
2. With the `Original` palette, the PNG maps correctly: the nose is pink and the belly is cream. This confirms the V coordinate isn't flipped twice.
3. The rosettes form within a few seconds and cover the body.
4. The highlight follows the orbiting light and stays fixed while the camera orbits. Ks=0 removes the highlight.
5. Every control has a live effect, and painting on the preview adds spots in the matching place on the body.
6. Each export (Screenshot, Save texture, Record GIF) downloads a file.
7. The frame rate stays at about 60 fps.
