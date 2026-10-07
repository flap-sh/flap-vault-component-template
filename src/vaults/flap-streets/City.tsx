import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
import { CanvasTexture, DoubleSide, Object3D, SRGBColorSpace, Vector3, type Group, type InstancedMesh, type Mesh, type MeshBasicMaterial } from "three";
import { type Drive } from "./driving";
import { MAPS, isBlocked, type MapId } from "./world";
import { Traffic } from "./Traffic";
import { Scenery } from "./Scenery";
import { DistrictProps, Pedestrians } from "./StreetLife";

function Box({ position, size, color, glow = false }: { position: [number, number, number]; size: [number, number, number]; color: string; glow?: boolean }) {
  return <mesh position={position} castShadow={!glow} receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.68} metalness={0.12} emissive={glow ? color : "#000000"} emissiveIntensity={glow ? 1.2 : 0} /></mesh>;
}

function Car({ color = "#7850ff", taxi = false, police = false, reducedMotion = false, drive }: { color?: string; taxi?: boolean; police?: boolean; reducedMotion?: boolean; drive?: RefObject<Drive> }) {
  const lightbar = useRef<Group>(null);
  const body = useRef<Group>(null);
  const wheels = useRef<Group>(null);
  const brakeLights = useRef<Group>(null);
  const exhaust = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!drive) return;
    const s = drive.current;
    if (lightbar.current) lightbar.current.children.forEach((light, i) => { light.visible = reducedMotion || s.phase !== "playing" || Math.floor(s.elapsed * 3) % 2 === i; });
    if (police) return;
    if (body.current) {
      const smooth = 1 - Math.exp(-12 * delta);
      body.current.rotation.z += (-s.steer * s.speed * 0.0025 - body.current.rotation.z) * smooth;
      body.current.rotation.x += ((s.braking ? 0.045 : s.boosting ? -0.035 : 0) - body.current.rotation.x) * smooth;
    }
    wheels.current?.children.forEach((wheel, index) => {
      wheel.rotation.y = index % 2 === 0 ? s.steer * 0.4 : 0;
      wheel.children[0].rotation.x = -s.distance / 0.43;
    });
    if (brakeLights.current) brakeLights.current.visible = s.braking;
    if (exhaust.current) { exhaust.current.visible = s.boosting && s.phase === "playing"; exhaust.current.scale.z = 0.8 + Math.sin(s.elapsed * 45) * 0.2; }
  });
  return <group>
    <group ref={body}>
    <Box position={[0, 0.72, 0]} size={[1.9, 0.62, 3.8]} color={color} />
    <Box position={[0, 1.22, 0.15]} size={[1.62, 0.65, 1.85]} color="#182333" />
    <Box position={[0, 1.58, 0.2]} size={[1.68, 0.12, 1.82]} color={color} />
    <Box position={[0, 0.55, -1.96]} size={[1.72, 0.12, 0.09]} color="#253047" />
    {[-0.67, 0.67].map((x) => <group key={x}>
      <Box position={[x, 0.87, -1.92]} size={[0.42, 0.18, 0.08]} color="#ffe8b5" glow />
      <Box position={[x, 0.85, 1.92]} size={[0.5, 0.14, 0.08]} color="#e95659" glow />
    </group>)}
    <group ref={brakeLights} visible={false}>{[-0.67, 0.67].map((x) => <Box key={x} position={[x, 0.85, 1.97]} size={[0.55, 0.18, 0.04]} color="#ff2828" glow />)}</group>
    {police && <>
      <Box position={[0, 0.82, 0.35]} size={[1.97, 0.34, 1.6]} color="#e8edf1" />
      <Box position={[0, 1.72, 0.2]} size={[1.25, 0.12, 0.45]} color="#172332" />
      <group ref={lightbar}><Box position={[-0.35, 1.85, 0.2]} size={[0.55, 0.19, 0.42]} color="#ff455e" glow /><Box position={[0.35, 1.85, 0.2]} size={[0.55, 0.19, 0.42]} color="#3e9eff" glow /></group>
    </>}
    {taxi && <Box position={[0, 1.75, 0.2]} size={[0.7, 0.24, 0.3]} color="#ffe7ab" glow />}
    </group>
    <group ref={wheels}>{[-1, 1].flatMap((x) => [-1.18, 1.22].map((z) => <group key={`${x}-${z}`} position={[x * 0.92, 0.48, z]}>
      <group><mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.43, 0.43, 0.22, 12]} /><meshStandardMaterial color="#10131a" roughness={0.95} /></mesh>
        <Box position={[x * 0.13, 0, 0]} size={[0.03, 0.6, 0.12]} color="#a5afbc" />
      </group>
    </group>))}</group>
    <group ref={exhaust} visible={false}>{[-0.65, 0.65].map((x) => <mesh key={x} position={[x, 0.45, 2.3]} rotation={[-Math.PI / 2, 0, 0]}><coneGeometry args={[0.15, 0.85, 6]} /><meshBasicMaterial color="#c5a9ff" transparent opacity={0.8} /></mesh>)}</group>
  </group>;
}

function RoadEffects({ drive, reducedMotion }: { drive: RefObject<Drive>; reducedMotion: boolean }) {
  const sparks = useRef<Group>(null);
  const smoke = useRef<Group>(null);
  const tracks = useRef<InstancedMesh>(null);
  const cursor = useRef(0);
  const lastMark = useRef(0);
  const lastElapsed = useRef(0);
  const marks = useRef<Array<{ x: number; z: number; yaw: number; time: number }>>([]);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const s = drive.current;
    if (s.elapsed < lastElapsed.current) { marks.current = []; cursor.current = 0; lastMark.current = 0; }
    lastElapsed.current = s.elapsed;
    if (sparks.current) {
      sparks.current.visible = s.impactAge < 0.55 && !reducedMotion;
      if (sparks.current.visible) sparks.current.children.forEach((child, i) => {
        const age = s.impactAge;
        const angle = i * 2.4;
        const speed = 2 + (i % 4) * s.impact * 2;
        child.position.set(s.hitX + (Math.cos(angle) + s.hitNormalX) * age * speed, Math.max(0.05, 0.65 + (1 + i % 3) * age - 5 * age * age), s.hitZ + (Math.sin(angle) + s.hitNormalZ) * age * speed);
        child.scale.setScalar(Math.max(0, 1 - age / 0.55));
      });
    }
    if (smoke.current) {
      smoke.current.visible = s.skid > 0.25 && s.phase === "playing" && !reducedMotion;
      if (smoke.current.visible) smoke.current.children.forEach((child, i) => {
        const age = (s.elapsed * 1.9 + i / 8) % 1;
        const side = i % 2 ? 0.95 : -0.95;
        child.position.set(s.x + Math.sin(s.yaw) * (1.4 + age * 3) + Math.cos(s.yaw) * side, 0.25 + age * 0.8, s.z + Math.cos(s.yaw) * (1.4 + age * 3) - Math.sin(s.yaw) * side);
        child.scale.setScalar(0.18 + age * 0.55);
        ((child as Mesh).material as MeshBasicMaterial).opacity = (1 - age) * s.skid * 0.18;
      });
    }
    if (s.phase === "playing" && s.skid > 0.3 && Math.abs(s.speed) > 5 && s.elapsed - lastMark.current > 0.045) {
      lastMark.current = s.elapsed;
      for (const side of [-0.86, 0.86]) {
        marks.current[cursor.current++ % 64] = { x: s.x + Math.cos(s.yaw) * side + Math.sin(s.yaw) * 1.2, z: s.z - Math.sin(s.yaw) * side + Math.cos(s.yaw) * 1.2, yaw: s.yaw, time: s.elapsed };
      }
    }
    if (tracks.current) {
      for (let i = 0; i < 64; i++) {
        const mark = marks.current[i];
        dummy.scale.setScalar(mark ? Math.max(0, 1 - (s.elapsed - mark.time) / 6) : 0);
        if (mark) { dummy.position.set(mark.x, 0.07, mark.z); dummy.rotation.set(0, mark.yaw, 0); }
        dummy.updateMatrix(); tracks.current.setMatrixAt(i, dummy.matrix);
      }
      tracks.current.instanceMatrix.needsUpdate = true;
    }
  });
  return <>
    <group ref={sparks} visible={false}>{Array.from({ length: 12 }, (_, i) => <mesh key={i}><boxGeometry args={[0.07, 0.07, 0.2]} /><meshBasicMaterial color={i % 2 ? "#ffd7a0" : "#ff9c54"} /></mesh>)}</group>
    <group ref={smoke} visible={false}>{Array.from({ length: 8 }, (_, i) => <mesh key={i}><icosahedronGeometry args={[1, 0]} /><meshBasicMaterial color="#c9c9ca" transparent opacity={0} depthWrite={false} /></mesh>)}</group>
    <instancedMesh ref={tracks} args={[undefined, undefined, 64]} frustumCulled={false}><boxGeometry args={[0.2, 0.016, 0.9]} /><meshBasicMaterial color="#171923" transparent opacity={0.48} depthWrite={false} /></instancedMesh>
  </>;
}

function Skyline() {
  return <group position={[82, 0, -83]}>
    <Box position={[0, 4, 0]} size={[17, 8, 17]} color="#42545b" />
    {Array.from({ length: 8 }, (_, i) => <group key={i} position={[0, 10 + i * 6, 0]}>
      <mesh rotation={[0, Math.PI / 4, 0]}><cylinderGeometry args={[8.5 - i * 0.36, 6.7 - i * 0.34, 5.8, 4]} /><meshStandardMaterial color="#537b80" metalness={0.45} roughness={0.25} /></mesh>
      <Box position={[0, 2.9, 0]} size={[12.5 - i * 0.51, 0.35, 12.5 - i * 0.51]} color="#ffe8b5" glow />
      {[0, 1, 2].map((row) => <Box key={row} position={[0, -1.8 + row * 1.5, 5.1 - i * 0.25]} size={[9.5 - i * 0.4, 0.13, 0.05]} color="#b2e2df" glow />)}
    </group>)}
    <Box position={[0, 63, 0]} size={[3.8, 10, 3.8]} color="#62858a" />
    <Box position={[0, 73, 0]} size={[0.4, 13, 0.4]} color="#efc38b" glow />
  </group>;
}

const Streets = memo(function Streets({ labels, map }: { labels: string[]; map: MapId }) {
  const signMap = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#171f2c"; ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = "#eee8df"; ctx.font = "bold 64px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(labels[0] ?? "", 512, 100);
      ctx.fillStyle = "#c1abea"; ctx.font = "32px sans-serif"; ctx.fillText(labels[1] ?? "", 512, 185);
    }
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    return texture;
  }, [labels]);
  useEffect(() => () => signMap.dispose(), [signMap]);
  return <group>
    <Scenery map={map} signMap={signMap} />
    {map === "downtown" && <Skyline />}
    <DistrictProps map={map} />
  </group>;
});

export const City = memo(function City({ drive, map, reducedMotion, labels, onReady }: { drive: RefObject<Drive>; map: MapId; reducedMotion: boolean; labels: string[]; onReady: () => void }) {
  const police = useRef<Group>(null);
  const district = MAPS[map];
  const player = useRef<Group>(null);
  const beacon = useRef<Group>(null);
  const firstFrame = useRef(true);
  const lastPhase = useRef(drive.current.phase);
  const { scene } = useThree();
  const measurement = useRef({ seconds: 0, frames: 0, renderMs: 0, rendered: 0, samples: [] as number[] });
  useEffect(() => {
    const before = scene.onBeforeRender; const after = scene.onAfterRender;
    let began = 0;
    scene.onBeforeRender = function (...args) { before.apply(this, args); began = performance.now(); };
    scene.onAfterRender = function (...args) {
      const sample = measurement.current;
      sample.renderMs += performance.now() - began; sample.rendered++;
      after.apply(this, args);
    };
    return () => { scene.onBeforeRender = before; scene.onAfterRender = after; };
  }, [scene]);
  const cameraTarget = useMemo(() => new Vector3(), []);
  const lookTarget = useMemo(() => new Vector3(), []);
  useFrame(({ camera, gl }, delta) => {
    const s = drive.current;
    // A lightweight, DOM-readable performance sample; no React updates or
    // profiler is required to inspect actual rendered frames on Safari.
    const sample = measurement.current;
    if (s.phase === "playing" && lastPhase.current === "playing") {
      sample.seconds += delta; sample.frames++;
      if (sample.seconds >= 1) {
        const fps = sample.frames / sample.seconds;
        sample.samples.push(fps); if (sample.samples.length > 8) sample.samples.shift();
        const sorted = [...sample.samples].sort((a, b) => a - b);
        gl.domElement.dataset.flapRenderFps = fps.toFixed(1);
        gl.domElement.dataset.flapMedianFps = sorted[Math.floor(sorted.length / 2)].toFixed(1);
        gl.domElement.dataset.flapRenderMs = (sample.renderMs / Math.max(1, sample.rendered)).toFixed(2);
        gl.domElement.dataset.flapDrawCalls = String(gl.info.render.calls);
        gl.domElement.dataset.flapRenderFrame = String(gl.info.render.frame);
        sample.seconds = 0; sample.frames = 0; sample.renderMs = 0; sample.rendered = 0;
      }
    } else { sample.seconds = 0; sample.frames = 0; sample.renderMs = 0; sample.rendered = 0; }
    if (player.current) { player.current.position.set(s.x, 0, s.z); player.current.rotation.y = s.yaw; }
    if (police.current) { police.current.visible = s.police.active; police.current.position.set(s.police.x, 0, s.police.z); police.current.rotation.y = s.police.yaw; }
    const checkpoint = MAPS[s.map].checkpoints[s.checkpoint];
    if (beacon.current) {
      beacon.current.visible = Boolean(checkpoint);
      if (checkpoint) beacon.current.position.set(checkpoint.x, 0.2, checkpoint.z);
      beacon.current.rotation.y = reducedMotion ? 0 : s.elapsed * 0.45;
    }
    if (s.phase === "briefing") {
      cameraTarget.set(100, 92, 115);
      lookTarget.set(15, 10, -25);
    } else {
      let follow = 11 + Math.abs(s.speed) * 0.06;
      while (follow > 2 && isBlocked(s.x + Math.sin(s.yaw) * follow, s.z + Math.cos(s.yaw) * follow, s.map)) follow -= 1;
      if (s.lookBack) follow *= -1;
      cameraTarget.set(s.x + Math.sin(s.yaw) * follow, reducedMotion ? 8 : 6.2, s.z + Math.cos(s.yaw) * follow);
      lookTarget.set(s.x - Math.sin(s.yaw) * (s.lookBack ? -8 : 8), 1.2, s.z - Math.cos(s.yaw) * (s.lookBack ? -8 : 8));
      if (!reducedMotion && s.phase === "playing" && s.impactAge < 0.3) {
        const shake = s.impact * (1 - s.impactAge / 0.3) * 0.6;
        cameraTarget.x += Math.sin(s.impactAge * 90) * shake;
        cameraTarget.y += Math.cos(s.impactAge * 70) * shake * 0.5;
      }
    }
    camera.position.lerp(cameraTarget, firstFrame.current || lastPhase.current === "briefing" && s.phase === "playing" ? 1 : 1 - Math.exp(-5 * delta));
    lastPhase.current = s.phase;
    camera.lookAt(lookTarget);
    if (firstFrame.current) { firstFrame.current = false; onReady(); }
  });
  return <>
    <color attach="background" args={[district.sky]} />
    <fog attach="fog" args={[district.sky, 130, 360]} />
    <hemisphereLight args={[map === "night" ? "#afb9ec" : "#eee3ef", "#4f5e67", map === "night" ? 1.7 : 2.3]} />
    <directionalLight position={[-40, 75, -40]} intensity={map === "night" ? 1.2 : 3.2} color={map === "coast" ? "#fff6df" : "#ffdab2"} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-100} shadow-camera-right={100} shadow-camera-top={100} shadow-camera-bottom={-100} shadow-normalBias={0.08} />
    <Streets labels={labels} map={map} />
    <Pedestrians drive={drive} reducedMotion={reducedMotion} />
    <group ref={police} visible={false}><Car color="#213047" police drive={drive} reducedMotion={reducedMotion} /></group>
    <group ref={player}><Car drive={drive} /></group>
    <RoadEffects drive={drive} reducedMotion={reducedMotion} />
    <Traffic drive={drive} />
    <group ref={beacon}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[5.4, 6.3, 48]} /><meshBasicMaterial color="#ad8dff" side={DoubleSide} transparent opacity={0.9} /></mesh>
      <mesh position={[0, 4, 0]}><octahedronGeometry args={[1.3, 0]} /><meshStandardMaterial color="#c1a6ff" emissive="#7b50ff" emissiveIntensity={2} /></mesh>
      <mesh position={[0, 7, 0]}><cylinderGeometry args={[0.5, 5.5, 14, 32, 1, true]} /><meshBasicMaterial color="#aa7eff" transparent opacity={0.07} depthWrite={false} side={DoubleSide} /></mesh>
    </group>
  </>;
});
