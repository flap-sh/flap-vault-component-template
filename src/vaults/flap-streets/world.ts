export type MapId = "downtown" | "night" | "coast";
export type Point = { x: number; z: number };
export type Building = Point & { width: number; depth: number; height: number; tone: number };
export const MAP_IDS: MapId[] = ["downtown", "night", "coast"];
export const ROADS = [-100, -50, 0, 50, 100];
export const PEDESTRIAN_COUNT = 32;
const originalStops = [{ x: 4, z: -46 }, { x: 54, z: -46 }, { x: 54, z: 54 }, { x: 4, z: 54 }];
const makeBuildings = (id: MapId): Building[] => Array.from({ length: 64 }, (_, i) => {
  const row = Math.floor(i / 16); const col = Math.floor(i / 4) % 4; const corner = i % 4;
  return { x: -75 + col * 50 + (corner % 2 ? 8 : -8), z: -75 + row * 50 + (corner > 1 ? 8 : -8), width: 10 + i % 3, depth: 10 + i % 3, height: id === "night" ? 6 + i * 7 % 14 : id === "coast" ? 5 + i * 3 % 10 : 12 + i * 17 % 25, tone: i % 5 };
}).filter((b, i) => id === "coast" ? b.x < 60 : id === "night" ? !(Math.abs(b.x) < 40 && Math.abs(b.z) < 40 && i % 2 === 0) : true);
export const MAPS = {
  downtown: { buildings: makeBuildings("downtown"), checkpoints: originalStops, start: { x: 4, z: 32, yaw: 0 }, sky: "#ad9ba4", ground: "#374e49", palette: ["#697887", "#8f9493", "#8c7887", "#4f6d7a", "#c1aea0"] },
  night: { buildings: makeBuildings("night"), checkpoints: [{ x: -46, z: 4 }, { x: -46, z: -46 }, { x: 54, z: -46 }, { x: 54, z: 54 }], start: { x: 4, z: 32, yaw: 0 }, sky: "#11182f", ground: "#1f3040", palette: ["#344056", "#494864", "#59455e", "#25485a", "#526075"] },
  coast: { buildings: makeBuildings("coast"), checkpoints: [{ x: 104, z: -46 }, { x: 54, z: -96 }, { x: 4, z: -46 }, { x: 4, z: 54 }], start: { x: 104, z: 32, yaw: 0 }, sky: "#8fc5d9", ground: "#b9bea0", palette: ["#e2c8b1", "#dfdfcc", "#80b2ae", "#dbaba1", "#aabaca"] },
};
export function isBlocked(x: number, z: number, map: MapId = "downtown") {
  if (Math.abs(x) > 108 || Math.abs(z) > 108) return true;
  return MAPS[map].buildings.some((b) => Math.abs(x - b.x) < b.width / 2 + 1.15 && Math.abs(z - b.z) < b.depth / 2 + 1.15);
}
export function trafficAt(time: number, index: number, map: MapId = "downtown") {
  const along = ((time * (index % 2 ? 7 : 9) + index * 31) % 194) - 97;
  if (index < 4) return { x: map === "coast" ? 96 : -4, z: along, yaw: Math.PI };
  if (index < 8) return { x: 46, z: -along, yaw: 0 };
  return { x: along, z: -54, yaw: -Math.PI / 2 };
}
// Walkers remain on a sidewalk segment, turn around before intersections, and
// lean away from a nearby car. Contact never produces injury or ragdoll effects.
export function pedestrianAt(time: number, index: number, map: MapId = "downtown", car?: Point) {
  const segment = index % 4;
  const lane = Math.floor(index / 4) % 4;
  const horizontal = index >= 16;
  const base = -100 + segment * 50;
  const cycle = (time * (0.85 + index % 3 * 0.15) + index * 7) % 44;
  const along = base + 14 + (cycle < 22 ? cycle : 44 - cycle);
  const side = index % 2 ? 1 : -1;
  const road = map === "coast" && lane === 3 ? 100 : ROADS[lane + 1];
  let x = horizontal ? along : road + side * 9.3;
  let z = horizontal ? road + side * 9.3 : along;
  const nearby = Boolean(car && Math.hypot(car.x - x, car.z - z) < 5);
  if (nearby) { if (horizontal) z += side * 0.65; else x += side * 0.65; }
  return { x, z, yaw: horizontal ? (cycle < 22 ? -Math.PI / 2 : Math.PI / 2) : (cycle < 22 ? Math.PI : 0), alert: nearby };
}

export function clearPath(a: Point, b: Point, map: MapId) {
  const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z)));
  for (let i = 0; i <= steps; i++) if (isBlocked(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, map)) return false;
  return true;
}
// Bounded, deterministic navigation over a 43 × 43 grid. Every edge is checked
// against the same collision geometry as the player; no wall-crossing shortcuts.
const N = 43;
const nodes = Array.from({ length: N * N }, (_, i) => ({ x: i % N * 5 - 105, z: Math.floor(i / N) * 5 - 105 }));
const graphs = MAP_IDS.map((map) => nodes.map((p, i) => isBlocked(p.x, p.z, map) ? [] : [i % N > 0 ? i - 1 : -1, i % N < N - 1 ? i + 1 : -1, i - N, i + N].filter((j) => j >= 0 && j < nodes.length && clearPath(p, nodes[j], map))));
export function pursuitRoute(from: Point, to: Point, map: MapId): Point[] {
  if (clearPath(from, to, map)) return [{ x: to.x, z: to.z }];
  const graph = graphs[MAP_IDS.indexOf(map)];
  const nearest = (p: Point) => nodes.map((n, i) => ({ i, d: Math.hypot(p.x - n.x, p.z - n.z) })).filter((n) => graph[n.i].length > 0).sort((a, b) => a.d - b.d).find((n) => clearPath(p, nodes[n.i], map))?.i;
  const start = nearest(from); const end = nearest(to);
  if (start === undefined || end === undefined) return [];
  const parent = new Int32Array(nodes.length).fill(-1); parent[start] = start;
  const queue = [start];
  for (let i = 0; i < queue.length && parent[end] === -1; i++) for (const next of graph[queue[i]]) if (parent[next] === -1) { parent[next] = queue[i]; queue.push(next); }
  if (parent[end] === -1) return [];
  const route: Point[] = [{ x: to.x, z: to.z }];
  for (let i = end; i !== start; i = parent[i]) route.push(nodes[i]);
  route.push(nodes[start]); return route.reverse();
}
