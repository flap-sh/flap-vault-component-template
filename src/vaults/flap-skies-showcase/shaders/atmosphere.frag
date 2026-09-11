uniform vec3 glowColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - abs(dot(vNormal, viewDirection)), 2.7);
  float alpha = smoothstep(0.02, 0.95, fresnel) * 0.72;
  gl_FragColor = vec4(glowColor * (0.7 + fresnel * 1.5), alpha);
}
