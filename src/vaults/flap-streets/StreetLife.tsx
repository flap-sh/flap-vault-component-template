import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Color, DynamicDrawUsage, Object3D, type InstancedMesh } from "three";
import { pedestrianAt, PEDESTRIAN_COUNT, type MapId } from "./world";
import type { Drive } from "./driving";

const SHIRTS = ["#fdba74", "#a7d6cd", "#baa2ee", "#e9e6dc", "#da8196", "#7b9cbf"];
const SKIN = ["#deb18d", "#aa795e", "#f1ceac"];
const BODY_PARTS = [
  { x: 0, y: 1.19, z: 0, w: 0.52, h: 0.66, d: 0.32, swing: 0 },
  { x: -0.16, y: 0.49, z: 0, w: 0.19, h: 0.78, d: 0.21, swing: 1 },
  { x: 0.16, y: 0.49, z: 0, w: 0.19, h: 0.78, d: 0.21, swing: -1 },
  { x: -0.36, y: 1.14, z: 0, w: 0.15, h: 0.64, d: 0.17, swing: -1 },
  { x: 0.36, y: 1.14, z: 0, w: 0.15, h: 0.64, d: 0.17, swing: 1 },
  { x: 0, y: 1.86, z: 0.035, w: 0.39, h: 0.16, d: 0.36, swing: 0 },
  { x: 0, y: 1.2, z: 0.25, w: 0.35, h: 0.45, d: 0.18, swing: 0 },
];

// Original low-poly models, assembled locally. Instancing keeps all 32 walkers
// to two draw calls while allowing individual clothing, gait and avoidance.
export function Pedestrians({ drive, reducedMotion }: { drive: RefObject<Drive>; reducedMotion: boolean }) {
  const bodies = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const lastPose = useRef(-Infinity);
  useLayoutEffect(() => {
    const color = new Color();
    for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
      BODY_PARTS.forEach((_, j) => {
        const shade = j === 1 || j === 2 ? "#26384d" : j === 5 ? i % 3 ? "#3c302d" : "#d0b288" : j === 6 ? "#42516a" : SHIRTS[i % SHIRTS.length];
        bodies.current?.setColorAt(i * BODY_PARTS.length + j, color.set(shade));
      });
      heads.current?.setColorAt(i, color.set(SKIN[i % SKIN.length]));
    }
    for (const mesh of [bodies.current, heads.current]) if (mesh) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, []);
  useFrame(() => {
    const s = drive.current;
    if (s.elapsed >= lastPose.current && s.elapsed - lastPose.current < 1 / 30) return;
    lastPose.current = s.elapsed;
    for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
      const p = pedestrianAt(s.elapsed, i, s.map, s);
      const stride = reducedMotion ? 0 : Math.sin(s.elapsed * 5 + i) * (p.alert ? 0.45 : 0.3);
      const crouch = i === s.lastPedestrian && s.impactAge < 0.8 ? 0.35 : 0;
      const cos = Math.cos(p.yaw); const sin = Math.sin(p.yaw);
      BODY_PARTS.forEach((part, j) => {
        dummy.position.set(p.x + part.x * cos + part.z * sin, part.y - crouch + 0.12, p.z - part.x * sin + part.z * cos);
        dummy.rotation.set(part.swing * stride, p.yaw, p.alert ? 0.1 : 0); dummy.scale.set(part.w, part.h, part.d); dummy.updateMatrix();
        bodies.current?.setMatrixAt(i * BODY_PARTS.length + j, dummy.matrix);
      });
      dummy.position.set(p.x, 1.79 - crouch, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.scale.set(0.22, 0.26, 0.22); dummy.updateMatrix();
      heads.current?.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of [bodies.current, heads.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  });
  return <>
    <instancedMesh ref={bodies} args={[undefined, undefined, PEDESTRIAN_COUNT * 7]} frustumCulled={false} castShadow><boxGeometry /><meshStandardMaterial roughness={0.9} /></instancedMesh>
    <instancedMesh ref={heads} args={[undefined, undefined, PEDESTRIAN_COUNT]} frustumCulled={false} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={0.85} /></instancedMesh>
  </>;
}

function Part({ at, size, color, glow = false }: { at: [number, number, number]; size: [number, number, number]; color: string; glow?: boolean }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.75} emissive={glow ? color : "#000"} emissiveIntensity={glow ? 1.5 : 0} /></mesh>;
}
function Palm() {
  return <group><mesh position={[0, 2.5, 0]} rotation={[0, 0, -0.08]} castShadow><cylinderGeometry args={[0.18, 0.3, 5, 7]} /><meshStandardMaterial color="#9b8264" /></mesh>
    {Array.from({ length: 7 }, (_, i) => <group key={i} rotation={[0, i * Math.PI * 2 / 7, 0]} position={[0.2, 5, 0]}><mesh position={[0, -0.35, 1.35]} rotation={[0.25, 0, 0]} scale={[0.6, 0.2, 2.1]} castShadow><octahedronGeometry args={[1, 0]} /><meshStandardMaterial color={i % 2 ? "#478c77" : "#67a38a"} /></mesh></group>)}
  </group>;
}
function Stall({ color }: { color: string }) {
  return <group>
    <Part at={[0, 0.65, 0]} size={[3.4, 1.25, 1.7]} color="#70575e" />
    {[-1.5, 1.5].map((x) => <Part key={x} at={[x, 1.9, 0.55]} size={[0.12, 2.7, 0.12]} color="#d2b79b" />)}
    <mesh position={[0, 3.35, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.5, 1, 1]} castShadow><coneGeometry args={[1.9, 0.8, 4]} /><meshStandardMaterial color={color} /></mesh>
    {[-1, 0, 1].map((x) => <group key={x}><Part at={[x, 1.36, 0]} size={[0.65, 0.25, 0.7]} color="#d4ad74" /><mesh position={[x, 2.8, -0.7]}><sphereGeometry args={[0.18, 8, 6]} /><meshStandardMaterial color="#ffce89" emissive="#ffab50" emissiveIntensity={1.5} /></mesh></group>)}
  </group>;
}
export function DistrictProps({ map }: { map: MapId }) {
  const night = map === "night";
  return <group>
    {[-75, -25, 25, 75].flatMap((z) => [-50, 0, 50].map((x) => <group key={`${x}-${z}`} position={[x + 10.8, 0, z]}>
      <Part at={[0, 3.4, 0]} size={[0.15, 6.8, 0.15]} color="#435064" />
      <Part at={[-0.65, 6.7, 0]} size={[1.5, 0.16, 0.5]} color="#d1c9ae" glow />
      {night && <mesh position={[-0.9, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[3.8, 16]} /><meshBasicMaterial color="#e8be81" transparent opacity={0.07} depthWrite={false} /></mesh>}
    </group>))}
    {map === "night" && [-75, -25, 25, 75].flatMap((z, i) => [-32, 32].map((x) => <group key={`${x}-${z}`} position={[x, 0, z]}><Stall color={i % 2 ? "#ad5c8f" : "#447f94"} />
      <Part at={[0, 4.7, 0]} size={[4, 0.06, 0.06]} color="#434156" />
      {[-1.5, 0, 1.5].map((n) => <mesh key={n} position={[n, 4.3, 0]}><sphereGeometry args={[0.3, 8, 6]} /><meshStandardMaterial color="#ff8d7b" emissive="#f34968" emissiveIntensity={1.1} /></mesh>)}
    </group>))}
    {map === "coast" && <>
      <Part at={[150, -0.4, 0]} size={[75, 0.25, 300]} color="#388aa7" />
      <Part at={[111, -0.1, 0]} size={[5, 0.3, 223]} color="#e9d4ad" />
      {Array.from({ length: 10 }, (_, i) => <group key={i} position={[88, 0, -91 + i * 20]}><Palm /><Part at={[-5, 0.7, 0]} size={[2.7, 0.18, 0.8]} color="#b29479" /><Part at={[-5, 1.15, 0.4]} size={[2.7, 0.75, 0.12]} color="#b29479" /></group>)}
      {[-65, -15, 35, 85].map((z, i) => <group key={z} position={[74, 0, z]}><Stall color={i % 2 ? "#e0a382" : "#97c6c0"} /></group>)}
      {Array.from({ length: 14 }, (_, i) => <Part key={i} at={[127 + i % 3 * 15, -0.25, -130 + i * 20]} size={[12, 0.06, 0.3]} color="#a7d5da" />)}
    </>}
    {map === "downtown" && [-75, -25, 25, 75].map((z) => <group key={z} position={[-25, 0, z]}>
      <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[3, 3.2, 0.6, 16]} /><meshStandardMaterial color="#9a9a98" /></mesh>
      <mesh position={[0, 0.73, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2.7, 24]} /><meshStandardMaterial color="#79b7c0" metalness={0.5} roughness={0.15} /></mesh>
      <mesh position={[0, 2.3, 0]}><octahedronGeometry args={[1.25, 0]} /><meshStandardMaterial color="#bca6ec" metalness={0.65} roughness={0.25} /></mesh>
    </group>)}
  </group>;
}
