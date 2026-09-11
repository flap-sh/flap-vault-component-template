import { Float, OrbitControls, Sparkles, Stars, Trail } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";
import atmosphereFragmentShader from "../shaders/atmosphere.frag";
import atmosphereVertexShader from "../shaders/atmosphere.vert";

export type SkyZone = "forest" | "portal" | "summit";

interface WorldProps {
  phase: "intro" | "explore";
  selectedZone: SkyZone;
  speed: number;
  reducedMotion: boolean;
}

interface IslandDefinition {
  latitude: number;
  longitude: number;
  scale: number;
  zone: SkyZone;
  feature: "forest" | "village" | "portal" | "summit";
}

const ISLANDS: IslandDefinition[] = [
  { latitude: 48, longitude: -35, scale: 0.92, zone: "forest", feature: "forest" },
  { latitude: 22, longitude: 12, scale: 0.72, zone: "forest", feature: "village" },
  { latitude: -12, longitude: 38, scale: 0.84, zone: "portal", feature: "portal" },
  { latitude: -38, longitude: 8, scale: 0.64, zone: "portal", feature: "forest" },
  { latitude: 8, longitude: 112, scale: 0.92, zone: "summit", feature: "summit" },
  { latitude: -28, longitude: 146, scale: 0.66, zone: "summit", feature: "village" },
  { latitude: 42, longitude: 166, scale: 0.7, zone: "forest", feature: "forest" },
  { latitude: -48, longitude: -124, scale: 0.74, zone: "portal", feature: "portal" },
  { latitude: 6, longitude: -152, scale: 0.82, zone: "summit", feature: "summit" },
  { latitude: 62, longitude: 78, scale: 0.54, zone: "forest", feature: "forest" },
  { latitude: -62, longitude: 76, scale: 0.52, zone: "portal", feature: "village" },
  { latitude: 18, longitude: -78, scale: 1.16, zone: "summit", feature: "village" },
];

const ZONE_COLORS: Record<SkyZone, string> = {
  forest: "#66d475",
  portal: "#8d69ff",
  summit: "#62dff4",
};

function sphericalPoint(latitude: number, longitude: number, radius: number) {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function FeatureTrees({ scale }: { scale: number }) {
  const trees = [
    [-0.26, -0.12, 0.82],
    [0.04, 0.16, 1],
    [0.3, -0.03, 0.72],
    [-0.02, -0.26, 0.68],
  ] as const;
  return (
    <group>
      {trees.map(([x, z, treeScale], index) => (
        <group key={`${x}-${z}`} position={[x * scale, 0.18 * scale, z * scale]} scale={treeScale * scale}>
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.18, 6]} />
            <meshStandardMaterial color="#6b3f2f" roughness={1} />
          </mesh>
          <mesh position={[0, 0.24, 0]} rotation={[0, index * 0.7, 0]}>
            <coneGeometry args={[0.13, 0.34, 7]} />
            <meshStandardMaterial color={index % 2 === 0 ? "#2c9a58" : "#53c46b"} roughness={0.88} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FeatureVillage({ scale }: { scale: number }) {
  return (
    <group scale={scale} position={[0, 0.2, 0]}>
      {[-0.2, 0.06, 0.27].map((x, index) => (
        <group key={x} position={[x, index === 1 ? 0.02 : -0.08, (index - 1) * 0.12]} rotation={[0, index * 0.6, 0]}>
          <mesh>
            <boxGeometry args={[0.18, 0.16, 0.16]} />
            <meshStandardMaterial color={index === 1 ? "#f6d45d" : "#f3f0dd"} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.14, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.15, 0.15, 4]} />
            <meshStandardMaterial color={index === 1 ? "#7748e8" : "#ef6a56"} roughness={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FeaturePortal({ scale, active }: { scale: number; active: boolean }) {
  return (
    <Float speed={active ? 2.2 : 0.7} rotationIntensity={0.35} floatIntensity={0.18}>
      <group scale={scale} position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.22, 0.045, 12, 32]} />
          <meshStandardMaterial color="#b49cff" emissive="#754cff" emissiveIntensity={active ? 5 : 1.4} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.17, 32]} />
          <meshBasicMaterial color="#72e8ff" transparent opacity={active ? 0.72 : 0.28} />
        </mesh>
      </group>
    </Float>
  );
}

function FeatureSummit({ scale, active }: { scale: number; active: boolean }) {
  return (
    <group scale={scale} position={[0, 0.24, 0]}>
      <mesh rotation={[0, 0.35, 0]}>
        <coneGeometry args={[0.32, 0.68, 7]} />
        <meshStandardMaterial color="#8ba8b6" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.26, 0]} rotation={[0, 0.35, 0]}>
        <coneGeometry args={[0.14, 0.23, 7]} />
        <meshStandardMaterial color="#eef9ff" emissive="#b8edff" emissiveIntensity={active ? 1.8 : 0.1} roughness={0.8} />
      </mesh>
    </group>
  );
}

function PlanetIsland({ definition, active }: { definition: IslandDefinition; active: boolean }) {
  const anchor = useMemo(() => {
    const position = sphericalPoint(definition.latitude, definition.longitude, 2.11);
    const normal = position.clone().normalize();
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal);
    return { position, quaternion };
  }, [definition.latitude, definition.longitude]);
  const color = active ? ZONE_COLORS[definition.zone] : definition.zone === "forest" ? "#3f9e5e" : "#5c9d75";

  return (
    <group position={anchor.position} quaternion={anchor.quaternion}>
      <mesh position={[0, 0.055, 0]} scale={[1, 1, 0.78]}>
        <cylinderGeometry args={[definition.scale * 0.47, definition.scale * 0.58, 0.17, 8]} />
        <meshStandardMaterial color={color} emissive={active ? color : "#000000"} emissiveIntensity={active ? 0.23 : 0} roughness={0.84} />
      </mesh>
      {definition.feature === "forest" ? <FeatureTrees scale={definition.scale} /> : null}
      {definition.feature === "village" ? <FeatureVillage scale={definition.scale} /> : null}
      {definition.feature === "portal" ? <FeaturePortal scale={definition.scale} active={active} /> : null}
      {definition.feature === "summit" ? <FeatureSummit scale={definition.scale} active={active} /> : null}
    </group>
  );
}

function LowPolyPlane({ reducedMotion }: { reducedMotion: boolean }) {
  const propellerRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (propellerRef.current && !reducedMotion) propellerRef.current.rotation.z += delta * 18;
  });

  return (
    <group rotation={[0.06, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.22, 0.2, 1.15]} />
        <meshStandardMaterial color="#f7f5ff" roughness={0.36} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[1.45, 0.06, 0.34]} />
        <meshStandardMaterial color="#7957ff" emissive="#4520d0" emissiveIntensity={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.16, 0.43]}>
        <boxGeometry args={[0.52, 0.05, 0.2]} />
        <meshStandardMaterial color="#d7d0ff" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.2, 0.48]}>
        <boxGeometry args={[0.05, 0.34, 0.18]} />
        <meshStandardMaterial color="#7957ff" roughness={0.42} />
      </mesh>
      <group ref={propellerRef} position={[0, 0, -0.64]}>
        <mesh>
          <boxGeometry args={[0.06, 0.56, 0.035]} />
          <meshStandardMaterial color="#ffffff" emissive="#c6ebff" emissiveIntensity={0.65} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.06, 0.56, 0.035]} />
          <meshStandardMaterial color="#ffffff" emissive="#c6ebff" emissiveIntensity={0.65} />
        </mesh>
      </group>
      <pointLight position={[0, 0.08, 0.62]} color="#8666ff" intensity={5} distance={2.4} />
    </group>
  );
}

function OrbitingPlane({ speed, reducedMotion }: { speed: number; reducedMotion: boolean }) {
  const orbitRef = useRef<Group>(null);
  useFrame((state, delta) => {
    if (!orbitRef.current) return;
    if (!reducedMotion) orbitRef.current.rotation.y -= delta * speed;
    orbitRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.45) * 0.1;
  });

  return (
    <group ref={orbitRef} rotation={[0.18, 0, -0.08]}>
      <group position={[3.18, 0.08, 0]} rotation={[0.02, -Math.PI / 2, -0.16]} scale={0.58}>
        <Trail width={0.42} length={5.5} color="#7957ff" attenuation={(value) => value * value}>
          <LowPolyPlane reducedMotion={reducedMotion} />
        </Trail>
      </group>
    </group>
  );
}

function Planet({ selectedZone, speed, phase, reducedMotion }: WorldProps) {
  const planetRef = useRef<Group>(null);
  const waterTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#44dfff");
      gradient.addColorStop(0.5, "#167bb4");
      gradient.addColorStop(1, "#0a315f");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "rgba(205,248,255,0.22)";
      context.lineWidth = 2;
      for (let row = 0; row < 11; row += 1) {
        context.beginPath();
        for (let x = -12; x <= canvas.width + 12; x += 8) {
          const y = 8 + row * 12 + Math.sin((x + row * 17) * 0.08) * 3;
          if (x === -12) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    }
    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(3, 2);
    texture.minFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, []);

  useFrame((state, delta) => {
    waterTexture.offset.x = (waterTexture.offset.x + delta * 0.012) % 1;
    if (planetRef.current && phase === "explore" && !reducedMotion) {
      planetRef.current.rotation.y += delta * 0.018;
      planetRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.16) * 0.025;
    }
  });

  return (
    <group ref={planetRef} rotation={[0.08, -0.38, -0.08]}>
      <mesh castShadow receiveShadow>
        <icosahedronGeometry args={[2.08, 6]} />
        <meshStandardMaterial map={waterTexture} color="#54c8ee" roughness={0.44} metalness={0.08} />
      </mesh>
      {ISLANDS.map((definition) => (
        <PlanetIsland
          key={`${definition.latitude}-${definition.longitude}`}
          definition={definition}
          active={selectedZone === definition.zone}
        />
      ))}
      <mesh scale={1.105}>
        <icosahedronGeometry args={[2.08, 5]} />
        <shaderMaterial
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={{ glowColor: { value: new Color(ZONE_COLORS[selectedZone]) } }}
          transparent
          depthWrite={false}
          side={BackSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <OrbitingPlane speed={phase === "intro" ? 0.24 : speed} reducedMotion={reducedMotion} />
    </group>
  );
}

export function FlapSkiesWorld(props: WorldProps) {
  return (
    <>
      <color attach="background" args={["#07091f"]} />
      <fog attach="fog" args={["#090a25", 8.5, 19]} />
      <ambientLight intensity={0.75} color="#bdc9ff" />
      <directionalLight position={[4, 6, 5]} intensity={3.4} color="#fff4db" castShadow />
      <pointLight position={[-5, -2, 3]} intensity={18} distance={14} color="#7957ff" />
      <pointLight position={[5, 2, -4]} intensity={10} distance={12} color="#56ddff" />
      <Stars radius={70} depth={32} count={1900} factor={3.3} saturation={0.25} fade speed={props.reducedMotion ? 0 : 0.45} />
      <Sparkles count={80} scale={[10, 7, 6]} size={2.2} speed={props.reducedMotion ? 0 : 0.24} color="#d9d2ff" opacity={0.55} />
      <Planet {...props} />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.55}
        autoRotate={props.phase === "intro" && !props.reducedMotion}
        autoRotateSpeed={0.22}
      />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom intensity={0.78} luminanceThreshold={0.58} luminanceSmoothing={0.35} mipmapBlur />
        <Vignette eskil={false} offset={0.18} darkness={0.72} />
      </EffectComposer>
    </>
  );
}
