import { useFrame } from "@react-three/fiber";
import { memo, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Color, DynamicDrawUsage, Object3D, type InstancedMesh } from "three";
import { trafficAt } from "./world";
import type { Drive } from "./driving";

type Part = { car: number; at: [number, number, number]; size: [number, number, number]; color: string };
type Kind = "body" | "wheel" | "headlight" | "taillight" | "taxi";
const TRAFFIC_COLORS = ["#e1b966", "#bfc4cb", "#7c97ac", "#9c6865"];

function partsFor(kind: Kind): Part[] {
  const parts: Part[] = [];
  for (let car = 0; car < 10; car++) {
    const add = (at: Part["at"], size: Part["size"], color: string) => parts.push({ car, at, size, color });
    if (kind === "body") {
      add([0, 0.72, 0], [1.9, 0.62, 3.8], TRAFFIC_COLORS[car % 4]);
      add([0, 1.22, 0.15], [1.62, 0.65, 1.85], "#182333");
      add([0, 1.58, 0.2], [1.68, 0.12, 1.82], TRAFFIC_COLORS[car % 4]);
      add([0, 0.55, -1.96], [1.72, 0.12, 0.09], "#253047");
      for (const x of [-1, 1]) for (const z of [-1.18, 1.22]) add([x * 1.05, 0.48, z], [0.03, 0.6, 0.12], "#a5afbc");
    } else if (kind === "wheel") {
      for (const x of [-0.92, 0.92]) for (const z of [-1.18, 1.22]) add([x, 0.48, z], [1, 1, 1], "#10131a");
    } else if (kind === "taxi") {
      if (car % 3 === 0) add([0, 1.75, 0.2], [0.7, 0.24, 0.3], "#ffe7ab");
    } else {
      for (const x of [-0.67, 0.67]) {
        if (kind === "headlight") add([x, 0.87, -1.92], [0.42, 0.18, 0.08], "#ffe8b5");
        else add([x, 0.85, 1.92], [0.5, 0.14, 0.08], "#e95659");
      }
    }
  }
  return parts;
}

function TrafficBatch({ kind, drive }: { kind: Kind; drive: RefObject<Drive> }) {
  const ref = useRef<InstancedMesh>(null);
  const parts = useMemo(() => partsFor(kind), [kind]);
  const dummy = useMemo(() => new Object3D(), []);
  const previous = useRef(-Infinity);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new Color();
    parts.forEach((part, i) => mesh.setColorAt(i, color.set(part.color)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  }, [parts]);
  useFrame(() => {
    const s = drive.current;
    const mesh = ref.current;
    if (!mesh || s.elapsed === previous.current) return;
    previous.current = s.elapsed;
    let car = -1;
    let x = 0; let z = 0; let yaw = 0; let cos = 1; let sin = 0;
    parts.forEach((part, i) => {
      if (car !== part.car) {
        car = part.car;
        const p = trafficAt(s.elapsed, car, s.map);
        x = p.x; z = p.z; yaw = p.yaw; cos = Math.cos(yaw); sin = Math.sin(yaw);
      }
      dummy.position.set(x + part.at[0] * cos + part.at[2] * sin, part.at[1], z - part.at[0] * sin + part.at[2] * cos);
      dummy.rotation.set(0, yaw, kind === "wheel" ? Math.PI / 2 : 0);
      dummy.scale.set(...part.size); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  const glow = kind !== "body" && kind !== "wheel";
  // Ten moving cars in five submissions. Drawing this bounded, small fleet
  // avoids rebuilding dynamic per-car bounds and hundreds of mesh traversals.
  return <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} frustumCulled={false} castShadow={!glow} receiveShadow={kind !== "wheel"}>
    {kind === "wheel" ? <cylinderGeometry args={[0.43, 0.43, 0.22, 12]} /> : <boxGeometry />}
    <meshStandardMaterial roughness={kind === "wheel" ? 0.95 : 0.68} metalness={kind === "wheel" ? 0 : 0.12} emissive={glow ? parts[0].color : "#000000"} emissiveIntensity={glow ? 1.2 : 0} />
  </instancedMesh>;
}

export const Traffic = memo(function Traffic({ drive }: { drive: RefObject<Drive> }) {
  return <>{(["body", "wheel", "headlight", "taillight", "taxi"] as const).map((kind) => <TrafficBatch key={kind} kind={kind} drive={drive} />)}</>;
});
