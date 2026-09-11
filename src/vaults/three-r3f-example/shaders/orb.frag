uniform sampler2D runtimeTexture;
varying vec2 vUv;
void main() {
  vec3 color = texture2D(runtimeTexture, vUv).rgb;
  gl_FragColor = vec4(color * vec3(0.55, 0.9, 1.25), 1.0);
}
