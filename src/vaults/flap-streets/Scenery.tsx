import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { Color, Object3D, type InstancedMesh, type Texture } from "three";
import { streetBatches, type StreetBatch } from "./streetGeometry";
import type { MapId } from "./world";

function Batch({ batch, signMap }: { batch: StreetBatch; signMap: Texture }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    batch.parts.forEach((part, i) => {
      dummy.position.set(...part.position); dummy.scale.set(...part.size); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.set(part.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch]);
  return <instancedMesh ref={ref} args={[undefined, undefined, batch.parts.length]} castShadow={batch.shape === "box" && !batch.glow} receiveShadow={batch.shape === "box"}>
    {batch.shape === "tree" ? <icosahedronGeometry args={[1, 1]} /> : batch.shape === "sign" ? <planeGeometry /> : <boxGeometry />}
    {batch.shape === "sign" ? <meshBasicMaterial map={signMap} /> : <meshStandardMaterial roughness={batch.shape === "tree" ? 1 : 0.68} metalness={batch.shape === "tree" ? 0 : 0.12} emissive={batch.glow ? batch.color : "#000000"} emissiveIntensity={batch.glow ? 1.2 : 0} />}
  </instancedMesh>;
}

export const Scenery = memo(function Scenery({ map, signMap }: { map: MapId; signMap: Texture }) {
  const batches = useMemo(() => streetBatches(map), [map]);
  return <group>{batches.map((batch) => <Batch key={batch.key} batch={batch} signMap={signMap} />)}</group>;
});
