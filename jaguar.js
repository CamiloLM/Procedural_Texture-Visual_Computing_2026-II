// Loads the jaguar model, stands it upright and computes smooth normals.

const JAGUAR_OBJ = 'assets/models/Jaguar.obj';
const JAGUAR_TEXTURE = 'assets/models/Jaguar_BaseColor.png';

// Returns { geometry, setSmooth(on) }.
async function loadJaguar() {
  // normalize: true centers the model and scales it to fit a 200-unit box.
  // The loader already flips V (1 - v), so the UVs are used as they come.
  // fileType is required: without it, p5 2.3.1 throws when given options.
  const geometry = await loadModel(JAGUAR_OBJ, { normalize: true, fileType: '.obj' });

  // The OBJ is Y-up with the body along Z, head toward +Z. p5's Y points
  // down, so rotate it: the body goes along X (head to the right) and up
  // becomes -Y. This is a pure rotation, so the triangles keep their winding.
  for (const v of geometry.vertices) v.set(v.z, -v.y, v.x);
  for (const n of geometry.vertexNormals) n.set(n.z, -n.y, n.x);

  // The model is low-poly and its normals are flat: one per face corner.
  const flat = geometry.vertexNormals.map((n) => n.copy());
  const smooth = smoothNormals(geometry.vertices, flat);

  return {
    geometry,
    // Switch between smooth and faceted shading.
    setSmooth(on) {
      geometry.vertexNormals = on ? smooth : flat;
      geometry.dirtyFlags.vertexNormals = true; // makes p5 upload the buffer again
    },
  };
}

// Average the normals of all vertices that share a position.
//
// The loader keeps one vertex per position/UV/normal combination, so a corner
// of the mesh is several vertices at the same place, one for each face around
// it. They are not welded (as computeNormals(SMOOTH) would do), because each
// keeps its own UV: only their normals are replaced by the common average.
function smoothNormals(vertices, normals) {
  const key = (v) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;

  const sums = new Map();
  vertices.forEach((v, i) => {
    const k = key(v);
    if (!sums.has(k)) sums.set(k, createVector(0, 0, 0));
    sums.get(k).add(normals[i]);
  });

  return vertices.map((v, i) => {
    const sum = sums.get(key(v));
    return sum.magSq() > 0 ? sum.copy().normalize() : normals[i].copy();
  });
}
