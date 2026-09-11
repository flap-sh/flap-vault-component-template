import { useMemo, useRef } from "react";
import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { CanvasTexture, LinearFilter, type Mesh } from "three";
import modelUrl from "../assets/empty-scene.gltf";
import textureUrl from "../assets/checker.png";
import fragmentShader from "../shaders/orb.frag";
import vertexShader from "../shaders/orb.vert";

function RuntimeOrb({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<Mesh>(null);
  const textureSource = typeof textureUrl === "string" ? textureUrl : textureUrl.src;
  const importedTexture = useTexture(textureSource);
  const runtimeTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 128, 128);
      gradient.addColorStop(0, "#32d6ff");
      gradient.addColorStop(1, "#7357ff");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const texture = new CanvasTexture(canvas);
    texture.minFilter = LinearFilter;
    return texture;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current && !reducedMotion) meshRef.current.rotation.y += delta * 0.35;
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.35, 5]} />
        <shaderMaterial uniforms={{ runtimeTexture: { value: runtimeTexture } }} vertexShader={vertexShader} fragmentShader={fragmentShader} />
      </mesh>
      <mesh position={[0, -1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 64]} />
        <meshBasicMaterial map={importedTexture} transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

export function CapabilityScene({ reducedMotion }: { reducedMotion: boolean }) {
  const model = useGLTF(modelUrl);
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 2]} intensity={2.2} />
      <primitive object={model.scene} />
      <RuntimeOrb reducedMotion={reducedMotion} />
      <OrbitControls enablePan={false} enableZoom={false} autoRotate={!reducedMotion} autoRotateSpeed={0.5} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.65} luminanceThreshold={0.15} mipmapBlur />
      </EffectComposer>
    </>
  );
}
