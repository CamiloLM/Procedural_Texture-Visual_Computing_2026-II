#version 300 es
precision highp float;

// Phong fragment shader: per-pixel lighting of the reaction-diffusion skin.
//
//   I = Ka * C + Kd * max(N.L, 0) * C * Lc + Ks * max(R.V, 0)^n * Lc
//
// C is the skin color and Lc the light color.

in vec3 vPosition;
in vec3 vNormal;
in vec2 vTexCoord;

uniform mat4 uViewMatrix;

// Skin
uniform sampler2D uField;    // t = clamp(A - B) from the simulation, periodic
uniform sampler2D uPalette;  // 256x2: row 0 is the spot color, row 1 its opacity
uniform sampler2D uBody;     // the model's original coloring, without its spots
uniform sampler2D uMask;     // where spots show in full (1) or shrink (toward 0)
uniform sampler2D uOriginal; // the model's original texture
uniform vec3 uBodyColor;     // solid body color of the palette
uniform float uUVScale;      // how many times the pattern repeats over the body
uniform bool uUseBody;       // body color from uBody instead of uBodyColor
uniform bool uUseMask;
uniform bool uShowOriginal;

// Phong
uniform vec3 uLightPosition; // world space
uniform vec3 uLightColor;
uniform float uKa;
uniform float uKd;
uniform float uKs;
uniform float uShininess;

out vec4 fragColor;

// Color of the skin at a point of the UV map. Same math as Skin.composite()
// in palettes.js.
//
// The palette lookup happens here, after the GPU has interpolated t between
// texels, so the edge of a spot stays sharp however much the texture is
// magnified. The pattern repeats with uUVScale, but the body coloring and
// the mask belong to the body, so they are read at the unscaled UV.
vec3 skinColor(vec2 uv) {
  if (uShowOriginal) return texture(uOriginal, uv).rgb;

  float t = texture(uField, uv * uUVScale).r;
  if (uUseMask) t = min(t + (1.0 - texture(uMask, uv).r), 1.0);

  // Sample the palette at the center of its texel.
  float u = (t * 255.0 + 0.5) / 256.0;
  vec3 spot = texture(uPalette, vec2(u, 0.25)).rgb;
  float opacity = texture(uPalette, vec2(u, 0.75)).r;

  vec3 body = uUseBody ? texture(uBody, uv).rgb : uBodyColor;
  return mix(body, spot, opacity);
}

void main() {
  // The light is given in world space: bring it to camera space, so it stays
  // put when the camera orbits.
  vec3 lightPosEye = (uViewMatrix * vec4(uLightPosition, 1.0)).xyz;

  vec3 N = normalize(vNormal);
  vec3 L = normalize(lightPosEye - vPosition);
  vec3 V = normalize(-vPosition);
  vec3 R = reflect(-L, N);

  vec3 tex      = skinColor(vTexCoord);
  vec3 ambient  = uKa * tex;
  vec3 diffuse  = uKd * max(dot(N, L), 0.0) * tex * uLightColor;
  vec3 specular = uKs * pow(max(dot(R, V), 0.0), uShininess) * uLightColor;

  fragColor = vec4(ambient + diffuse + specular, 1.0);
}
