uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv;

void main() {
  vec2 centered = vUv - 0.5;
  float radius = length(centered) * 2.0;
  float angle = atan(centered.y, centered.x);
  float rings = smoothstep(0.88, 1.0, sin(radius * 48.0 - uTime * 2.2) * 0.5 + 0.5);
  float spokes = smoothstep(0.92, 1.0, sin(angle * 20.0 + radius * 8.0 + uTime * 0.8) * 0.5 + 0.5);
  float edge = smoothstep(1.0, 0.12, radius) * smoothstep(0.08, 0.26, radius);
  vec3 color = mix(uColorA, uColorB, radius + sin(uTime * 0.4) * 0.12);
  float alpha = (rings * 0.22 + spokes * 0.12 + 0.04) * edge;
  gl_FragColor = vec4(color, alpha);
}
