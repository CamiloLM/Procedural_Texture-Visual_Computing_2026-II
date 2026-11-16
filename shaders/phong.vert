#version 300 es
precision highp float;

// Phong vertex shader: passes position and normal in camera (eye) space to
// the fragment shader, where the lighting is computed per pixel.

in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;

out vec3 vPosition; // camera space
out vec3 vNormal;   // camera space, not normalized
out vec2 vTexCoord;

void main() {
  vec4 position = uModelViewMatrix * vec4(aPosition, 1.0);
  vPosition = position.xyz;
  vNormal = uNormalMatrix * aNormal;
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * position;
}
