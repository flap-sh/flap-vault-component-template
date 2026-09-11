import { Float, Sparkles, Stars, Trail } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useMemo, useRef } from "react";
import type { Group, ShaderMaterial } from "three";
import { AdditiveBlending, Color, DoubleSide, MathUtils, Vector3 } from "three";
import energyFragmentShader from "../shaders/energy.frag";
import energyVertexShader from "../shaders/energy.vert";

export interface ArenaInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
}

interface ArenaWorldProps {
  phase: "briefing" | "playing" | "complete";
  inputRef: MutableRefObject<ArenaInput>;
  collectedIds: number[];
  reducedMotion: boolean;
  onCollect: (id: number) => void;
  onPlayerPosition: Dispatch<SetStateAction<{ x: number; z: number }>>;
}

const CORE_POSITIONS = [
  [-5.2, -4.2],
  [-1.8, -5.6],
  [3.8, -4.8],
  [5.4, -0.8],
  [3.1, 4.6],
  [-1.3, 5.3],
  [-5.4, 1.9],
] as const;

function EnergyFloor({ reducedMotion }: { reducedMotion: boolean }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new Color("#603cff") },
      uColorB: { value: new Color("#73f5ff") },
    }),
    [],
  );
  useFrame((state) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value = reducedMotion ? 0.5 : state.clock.elapsedTime;
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.22, 0]}>
        <circleGeometry args={[8.1, 96]} />
        <meshStandardMaterial color="#090b21" roughness={0.7} metalness={0.35} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.205, 0]}>
        <ringGeometry args={[1.7, 7.7, 96, 1]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={energyVertexShader}
          fragmentShader={energyFragmentShader}
          uniforms={uniforms}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      {[2.2, 4.3, 6.3, 7.75].map((radius) => (
        <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
          <ringGeometry args={[radius - 0.015, radius + 0.015, 96]} />
          <meshBasicMaterial color={radius === 7.75 ? "#885fff" : "#5a70b8"} transparent opacity={radius === 7.75 ? 0.9 : 0.36} />
        </mesh>
      ))}
    </group>
  );
}

function Core({ index, position, collected, reducedMotion }: { index: number; position: readonly [number, number]; collected: boolean; reducedMotion: boolean }) {
  const groupRef = useRef<Group>(null);
  useFrame((state, delta) => {
    if (!groupRef.current || collected || reducedMotion) return;
    groupRef.current.rotation.y += delta * (1.2 + index * 0.06);
    groupRef.current.position.y = 0.72 + Math.sin(state.clock.elapsedTime * 1.8 + index) * 0.12;
  });
  if (collected) return null;

  return (
    <group ref={groupRef} position={[position[0], 0.72, position[1]]}>
      <Float speed={reducedMotion ? 0 : 2.6} rotationIntensity={reducedMotion ? 0 : 0.42} floatIntensity={reducedMotion ? 0 : 0.25}>
        <mesh rotation={[0.32, 0.4, Math.PI / 4]}>
          <octahedronGeometry args={[0.38, 0]} />
          <meshStandardMaterial color="#9efbff" emissive="#43dff2" emissiveIntensity={5.5} roughness={0.18} metalness={0.42} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.62, 0.025, 8, 48]} />
          <meshBasicMaterial color="#c29cff" transparent opacity={0.85} />
        </mesh>
        <pointLight color="#6decff" intensity={6} distance={3.4} />
      </Float>
    </group>
  );
}

function ArenaArchitecture() {
  const pillars = [
    [-6.3, -5.5, 1.8],
    [-6.1, 5.1, 2.6],
    [6.2, -5.2, 2.4],
    [6.35, 4.9, 1.9],
    [-0.1, -7.2, 1.35],
    [0.3, 7.1, 1.55],
  ] as const;
  return (
    <group>
      {pillars.map(([x, z, height], index) => (
        <group key={`${x}-${z}`} position={[x, height * 0.5 - 0.18, z]} rotation={[0, index * 0.42, 0]}>
          <mesh>
            <boxGeometry args={[0.72, height, 0.72]} />
            <meshStandardMaterial color={index % 2 ? "#181c43" : "#242153"} emissive={index % 2 ? "#342888" : "#15104c"} emissiveIntensity={0.45} roughness={0.52} metalness={0.48} />
          </mesh>
          <mesh position={[0, height * 0.48, 0]} rotation={[0, Math.PI / 4, 0]}>
            <octahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial color="#ab8cff" emissive="#7550ff" emissiveIntensity={4.2} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 18 }, (_, index) => {
        const angle = (index / 18) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * 8, 0.05, Math.sin(angle) * 8]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[0.08, 0.42, 0.72]} />
            <meshStandardMaterial color="#6f50e8" emissive="#4b2bd0" emissiveIntensity={2.2} />
          </mesh>
        );
      })}
    </group>
  );
}

function HoverRunner({ playerRef, boosting, reducedMotion }: { playerRef: MutableRefObject<Group | null>; boosting: boolean; reducedMotion: boolean }) {
  const rotorRef = useRef<Group>(null);
  useFrame((state, delta) => {
    if (rotorRef.current && !reducedMotion) rotorRef.current.rotation.y += delta * (boosting ? 18 : 9);
    if (playerRef.current) playerRef.current.position.y = 0.35 + (reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 4) * 0.045);
  });
  return (
    <group ref={playerRef} position={[0, 0.35, 0]}>
      <Trail width={boosting ? 0.62 : 0.34} length={boosting ? 5 : 2.5} color={boosting ? "#83f9ff" : "#9b76ff"} attenuation={(value) => value * value}>
        <group>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.22, 0.72, 6, 12]} />
            <meshStandardMaterial color="#f5f2ff" emissive="#7f5cff" emissiveIntensity={0.44} roughness={0.28} metalness={0.52} />
          </mesh>
          <mesh position={[0, 0.04, 0.2]}>
            <boxGeometry args={[1.2, 0.08, 0.32]} />
            <meshStandardMaterial color="#7958ff" emissive="#5430df" emissiveIntensity={1.25} roughness={0.32} metalness={0.36} />
          </mesh>
          <mesh position={[0, 0.23, 0.08]}>
            <sphereGeometry args={[0.18, 18, 12]} />
            <meshStandardMaterial color="#8ef8ff" emissive="#43d9e8" emissiveIntensity={2.2} transparent opacity={0.88} />
          </mesh>
          <group ref={rotorRef} position={[0, -0.04, -0.55]}>
            <mesh>
              <torusGeometry args={[0.26, 0.035, 8, 30]} />
              <meshStandardMaterial color="#ad93ff" emissive="#7750ff" emissiveIntensity={3.2} />
            </mesh>
          </group>
          <pointLight position={[0, 0, -0.5]} color="#7bf5ff" intensity={boosting ? 8 : 3.5} distance={4} />
        </group>
      </Trail>
    </group>
  );
}

function PlayerController({ phase, inputRef, collectedIds, reducedMotion, onCollect, onPlayerPosition }: ArenaWorldProps) {
  const playerRef = useRef<Group>(null);
  const positionRef = useRef(new Vector3(0, 0.35, 0));
  const velocityRef = useRef(new Vector3());
  const directionRef = useRef(new Vector3());
  const cameraTargetRef = useRef(new Vector3());
  const frameCountRef = useRef(0);
  const { camera } = useThree();
  const collectedSet = useMemo(() => new Set(collectedIds), [collectedIds]);

  useFrame((_, delta) => {
    const player = playerRef.current;
    if (!player) return;
    const input = inputRef.current;
    const direction = directionRef.current.set(
      (input.right ? 1 : 0) - (input.left ? 1 : 0),
      0,
      (input.backward ? 1 : 0) - (input.forward ? 1 : 0),
    );
    if (direction.lengthSq() > 0) direction.normalize();
    const speed = input.boost ? 7.2 : 4.35;
    const targetVelocity = direction.multiplyScalar(phase === "playing" ? speed : 0);
    velocityRef.current.lerp(targetVelocity, 1 - Math.exp(-delta * 9));
    positionRef.current.addScaledVector(velocityRef.current, delta);
    const radial = Math.hypot(positionRef.current.x, positionRef.current.z);
    if (radial > 7.25) {
      const scale = 7.25 / radial;
      positionRef.current.x *= scale;
      positionRef.current.z *= scale;
      velocityRef.current.multiplyScalar(0.35);
    }
    player.position.x = positionRef.current.x;
    player.position.z = positionRef.current.z;
    if (velocityRef.current.lengthSq() > 0.04) {
      const targetRotation = Math.atan2(velocityRef.current.x, velocityRef.current.z);
      player.rotation.y = MathUtils.lerp(player.rotation.y, targetRotation, 1 - Math.exp(-delta * 10));
    }

    CORE_POSITIONS.forEach(([x, z], id) => {
      if (!collectedSet.has(id) && Math.hypot(positionRef.current.x - x, positionRef.current.z - z) < 0.78) onCollect(id);
    });

    cameraTargetRef.current.set(positionRef.current.x + 7.2, 8.2, positionRef.current.z + 8.7);
    camera.position.lerp(cameraTargetRef.current, 1 - Math.exp(-delta * 3.8));
    camera.lookAt(positionRef.current.x, 0, positionRef.current.z);

    frameCountRef.current += 1;
    if (frameCountRef.current % 12 === 0) onPlayerPosition({ x: positionRef.current.x, z: positionRef.current.z });
  });

  return <HoverRunner playerRef={playerRef} boosting={inputRef.current.boost} reducedMotion={reducedMotion} />;
}

export function ArenaWorld(props: ArenaWorldProps) {
  return (
    <>
      <color attach="background" args={["#050711"]} />
      <fog attach="fog" args={["#090b1c", 14, 32]} />
      <ambientLight intensity={0.72} color="#9d9eff" />
      <hemisphereLight args={["#819eff", "#170b33", 1.6]} />
      <directionalLight position={[5, 9, 4]} intensity={2.8} color="#d9e5ff" />
      <pointLight position={[0, 3, 0]} intensity={12} distance={12} color="#8d63ff" />
      <Stars radius={52} depth={24} count={props.reducedMotion ? 500 : 1500} factor={2.3} saturation={0.45} fade speed={props.reducedMotion ? 0 : 0.45} />
      <Sparkles count={props.reducedMotion ? 24 : 90} scale={[18, 7, 18]} size={1.7} speed={props.reducedMotion ? 0 : 0.32} color="#9efbff" />
      <EnergyFloor reducedMotion={props.reducedMotion} />
      <ArenaArchitecture />
      {CORE_POSITIONS.map((position, index) => (
        <Core key={index} index={index} position={position} collected={props.collectedIds.includes(index)} reducedMotion={props.reducedMotion} />
      ))}
      <PlayerController {...props} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={1.15} luminanceThreshold={0.35} luminanceSmoothing={0.65} mipmapBlur />
        <Vignette eskil={false} offset={0.12} darkness={0.78} />
      </EffectComposer>
    </>
  );
}
