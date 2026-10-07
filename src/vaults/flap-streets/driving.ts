import { MAPS, PEDESTRIAN_COUNT, isBlocked, pedestrianAt, pursuitRoute, trafficAt, type MapId, type Point } from "./world";
export { isBlocked, trafficAt, ROADS } from "./world";
export const BUILDINGS = MAPS.downtown.buildings;
export const CHECKPOINTS = MAPS.downtown.checkpoints;
export type Phase = "briefing" | "playing" | "paused" | "complete" | "timeout" | "busted";
export type Input = { lookBack: boolean; forward: boolean; reverse: boolean; left: boolean; right: boolean; brake: boolean; boost: boolean };
export type Police = Point & { yaw: number; active: boolean; age: number; escape: number; caught: number; replan: number; route: Point[] };
export type Drive = { lookBack: boolean; map: MapId; police: Police; escaped: number; pedestrianHits: number; lastPedestrian: number; x: number; z: number; yaw: number; speed: number; elapsed: number; checkpoint: number; bumps: number; cooldown: number; distance: number; phase: Phase; steer: number; skid: number; braking: boolean; boosting: boolean; impact: number; impactAge: number; hitX: number; hitZ: number; hitNormalX: number; hitNormalZ: number };
export const DURATION = 180;
export const emptyInput = (): Input => ({ lookBack: false, forward: false, reverse: false, left: false, right: false, brake: false, boost: false });
export const newDrive = (map: MapId = "downtown"): Drive => ({ lookBack: false, ...MAPS[map].start, map, police: { x: 0, z: 0, yaw: 0, active: false, age: 0, escape: 0, caught: 0, replan: 0, route: [] }, escaped: 0, pedestrianHits: 0, lastPedestrian: -1, speed: 0, elapsed: 0, checkpoint: 0, bumps: 0, cooldown: 0, distance: 0, phase: "briefing", steer: 0, skid: 0, braking: false, boosting: false, impact: 0, impactAge: 10, hitX: 4, hitZ: 32, hitNormalX: 0, hitNormalZ: 1 });

export function alertPolice(s: Drive) {
  const p = s.police;
  p.escape = 0;
  if (p.active) return;
  // Prefer behind the vehicle, rotating only when a building or boundary blocks it.
  for (const distance of [24, 18, 12]) for (const offset of [0, 0.45, -0.45, 0.9, -0.9, Math.PI]) {
    const x = s.x + Math.sin(s.yaw + offset) * distance;
    const z = s.z + Math.cos(s.yaw + offset) * distance;
    if (!isBlocked(x, z, s.map)) { Object.assign(p, { x, z, yaw: s.yaw, active: true, age: 0, escape: 0, caught: 0, replan: 0, route: [] }); return; }
  }
}

function stepPolice(s: Drive, dt: number) {
  const p = s.police;
  if (!p.active) return;
  p.age += dt; p.replan -= dt;
  if (p.replan <= 0) { p.route = pursuitRoute(p, s, s.map); p.replan = 0.8; }
  const target = p.route[0];
  if (target) {
    const distance = Math.hypot(target.x - p.x, target.z - p.z);
    const stopping = p.route.length === 1 && Math.abs(s.speed) < 7 ? 2.7 : 0;
    const travel = Math.min(Math.max(0, distance - stopping), (p.age < 1 ? 9 : 21) * dt);
    if (distance > 0.001) {
      const x = p.x + (target.x - p.x) / distance * travel;
      const z = p.z + (target.z - p.z) / distance * travel;
      if (!isBlocked(x, z, s.map)) {
        const heading = Math.atan2(-(target.x - p.x), -(target.z - p.z));
        p.yaw += Math.atan2(Math.sin(heading - p.yaw), Math.cos(heading - p.yaw)) * (1 - Math.exp(-10 * dt));
        p.x = x; p.z = z;
      } else p.replan = 0;
    }
    if (distance <= travel + 0.05) p.route.shift();
  }
  const distance = Math.hypot(p.x - s.x, p.z - s.z);
  p.escape = distance > 42 ? Math.min(5, p.escape + dt) : Math.max(0, p.escape - dt * 2);
  p.caught = p.age > 2 && distance < 4 && Math.abs(s.speed) < 7 ? Math.min(2.5, p.caught + dt) : Math.max(0, p.caught - dt * 2);
  if (p.escape >= 5) { p.active = false; s.escaped++; }
  else if (p.caught >= 2.5) { s.phase = "busted"; s.speed = 0; }
}

export function stepDrive(state: Drive, input: Input, seconds: number) {
  if (state.phase !== "playing") return;
  // Bound background-tab gaps and use substeps so walls cannot be tunnelled through.
  const total = Math.min(0.1, Math.max(0, seconds));
  const steps = Math.max(1, Math.ceil(total / 0.016));
  const dt = total / steps;
  for (let i = 0; i < steps; i++) {
    if (state.phase !== "playing") break;
    state.elapsed = Math.min(DURATION, state.elapsed + dt);
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.impactAge += dt;
    state.lookBack = input.lookBack;
    const throttle = Number(input.forward) - Number(input.reverse);
    state.braking = input.brake || (throttle !== 0 && throttle * state.speed < -1);
    state.boosting = input.boost && input.forward && !state.braking;
    const top = state.boosting ? 32 : 22;
    state.speed += throttle * (state.boosting ? 23 : 17) * dt;
    state.speed *= Math.exp(-(input.brake ? 5 : throttle ? 0.4 : 1.3) * dt);
    state.speed = Math.max(-9, Math.min(top, state.speed));
    if (Math.abs(state.speed) < 0.025) state.speed = 0;
    state.steer += (Number(input.left) - Number(input.right) - state.steer) * (1 - Math.exp(-9 * dt));
    state.skid = Math.min(1, Math.max(state.braking ? Math.abs(state.speed) / 18 : 0, Math.abs(state.steer) * Math.max(0, Math.abs(state.speed) - 12) / 18));
    state.yaw += state.steer * 1.7 * Math.min(1, Math.abs(state.speed) / 6) * Math.sign(state.speed) * dt;
    const x = state.x - Math.sin(state.yaw) * state.speed * dt;
    const z = state.z - Math.cos(state.yaw) * state.speed * dt;
    const trafficHit = Array.from({ length: 10 }, (_, index) => trafficAt(state.elapsed, index, state.map))
      .find((car) => Math.hypot(car.x - x, car.z - z) < 2.3);
    const walker = Array.from({ length: PEDESTRIAN_COUNT }, (_, index) => ({ ...pedestrianAt(state.elapsed, index, state.map, state), index })).find((p) => Math.hypot(p.x - x, p.z - z) < 1.45);
    const contact = trafficHit ?? walker;
    if (isBlocked(x, z, state.map) || contact) {
      let nx = 0; let nz = 0;
      if (contact) {
        const length = Math.max(0.001, Math.hypot(x - contact.x, z - contact.z));
        nx = (x - contact.x) / length; nz = (z - contact.z) / length;
      } else if (isBlocked(x, state.z, state.map)) nx = Math.sign(state.x - x);
      else nz = Math.sign(state.z - z);
      if (state.cooldown === 0 && Math.abs(state.speed) > 3) {
        state.bumps++;
        if (walker && !trafficHit) { state.pedestrianHits++; state.lastPedestrian = walker.index; }
        alertPolice(state);
        state.cooldown = 0.65;
        state.impact = Math.min(1, Math.abs(state.speed) / 25);
        state.impactAge = 0;
        state.hitNormalX = nx; state.hitNormalZ = nz;
        state.hitX = state.x - nx * 1.6; state.hitZ = state.z - nz * 1.6;
      }
      // Slide along a wall where possible; rebound and separate on a direct impact.
      const slideX = nx === 0 ? x : state.x;
      const slideZ = nz === 0 ? z : state.z;
      if (!contact && !isBlocked(slideX, slideZ, state.map)) { state.x = slideX; state.z = slideZ; }
      const reboundX = state.x + nx * 0.18; const reboundZ = state.z + nz * 0.18;
      if (!isBlocked(reboundX, reboundZ, state.map)) { state.x = reboundX; state.z = reboundZ; }
      state.speed *= -0.3;
    } else {
      state.distance += Math.hypot(x - state.x, z - state.z);
      state.x = x;
      state.z = z;
    }
    stepPolice(state, dt);
    const checkpoint = MAPS[state.map].checkpoints[state.checkpoint];
    if (state.phase === "playing" && checkpoint && Math.hypot(state.x - checkpoint.x, state.z - checkpoint.z) < 7) {
      state.checkpoint++;
      if (state.checkpoint === CHECKPOINTS.length) state.phase = "complete";
    }
    if (state.elapsed >= DURATION && state.phase === "playing") state.phase = "timeout";
  }
}

export function scoreDrive(state: Drive) {
  return Math.max(0, state.checkpoint * 250 + (state.phase === "complete" ? Math.round((DURATION - state.elapsed) * 10) : 0) - state.bumps * 25);
}
