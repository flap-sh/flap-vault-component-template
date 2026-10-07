import { MAPS, ROADS, type MapId } from "./world";

type Triple = [number, number, number];
export type StreetPart = { position: Triple; size: Triple; color: string; shape: "box" | "sign" | "tree"; glow: boolean };
export type StreetBatch = { key: string; shape: StreetPart["shape"]; glow: boolean; color: string; parts: StreetPart[] };

// Keep the original street dimensions (and therefore collision alignment), but
// submit repeated geometry in spatial batches instead of one mesh per window.
export function streetParts(map: MapId): StreetPart[] {
  const district = MAPS[map];
  const parts: StreetPart[] = [];
  const add = (position: Triple, size: Triple, color: string, glow = false, shape: StreetPart["shape"] = "box") => parts.push({ position, size, color, glow, shape });
  add([0, -0.45, 0], [230, 0.6, 230], district.ground);
  for (const x of [-75, -25, 25, 75]) for (const z of [-75, -25, 25, 75]) add([x, -0.02, z], [35, 0.28, 35], map === "night" ? "#394356" : "#a2a7a3");
  for (const road of ROADS) {
    add([road, -0.07, 0], [15, 0.15, 218], "#323a46");
    add([0, -0.065, road], [218, 0.15, 15], "#323a46");
    for (let i = 0; i < 24; i++) {
      const d = -104 + i * 9;
      if (ROADS.every((r) => Math.abs(d - r) > 10)) {
        add([road, 0.025, d], [0.16, 0.035, 3.8], "#e9cb8a");
        add([d, 0.028, road], [3.8, 0.035, 0.16], "#e9cb8a");
      }
    }
  }
  for (const x of [-50, 0, 50]) for (const z of [-50, 0, 50]) {
    for (let i = 0; i < 7; i++) {
      add([x - 5.4 + i * 1.8, 0.05, z - 9.5], [0.9, 0.02, 2.8], "#b8bec5");
      add([x + 9.5, 0.05, z - 5.4 + i * 1.8], [2.8, 0.02, 0.9], "#b8bec5");
    }
    add([x - 9, 3.5, z - 9], [0.18, 7, 0.18], "#344551");
    add([x - 6.5, 7, z - 9], [5, 0.16, 0.18], "#344551");
    add([x - 4.5, 6.65, z - 9], [0.55, 1, 0.45], "#12191f");
    add([x - 4.5, 6.75, z - 8.75], [0.18, 0.2, 0.05], "#9ac4ad", true);
  }
  district.buildings.forEach((b, i) => {
    const box = (position: Triple, size: Triple, color: string, glow = false, shape: StreetPart["shape"] = "box") => add([b.x + position[0], position[1], b.z + position[2]], size, color, glow, shape);
    box([0, 0.12, 0], [b.width + 2.4, 0.35, b.depth + 2.4], "#7e8689");
    box([0, b.height / 2, 0], [b.width, b.height, b.depth], district.palette[b.tone]);
    box([0, b.height + 0.5, 0], [b.width + 0.5, 0.8, b.depth + 0.5], "#485363");
    box([2, b.height + 1.5, 1], [3, 1.3, 2.8], "#a3aaac");
    for (let row = 0; row < Math.floor(b.height / 3.8); row++) {
      box([0, 3 + row * 3.8, b.depth / 2 + 0.03], [b.width - 2.5, 1.45, 0.04], row % 3 ? "#d2b58e" : "#283e4e", row % 3 !== 0);
      box([b.width / 2 + 0.03, 3 + row * 3.8, 0], [0.04, 1.45, b.depth - 2.5], "#344d5a");
    }
    if (i % 3 === 0) {
      box([0, 3.1, b.depth / 2 + 0.8], [b.width - 1, 0.18, 2.1], i % 2 ? "#8069aa" : "#ad7062");
      box([0, 4.25, b.depth / 2 + 0.09], [b.width - 1, 2.5, 1], "#ffffff", false, "sign");
    }
  });
  for (let i = 0; i < 18; i++) {
    add([-11, 1.3, -95 + i * 11], [0.28, 2.6, 0.28], "#665747");
    add([-11, 3.1, -95 + i * 11], [1.4, 1.4, 1.4], "#496e64", false, "tree");
  }
  return parts;
}

export function streetBatches(map: MapId): StreetBatch[] {
  const batches = new Map<string, StreetBatch>();
  for (const part of streetParts(map)) {
    // Separate large ground/road surfaces so they don't expand every tile's
    // bounds. Tile bounds are computed by Three, retaining frustum culling.
    const tile = Math.max(...part.size) > 100 ? "ground" : `${Math.floor(part.position[0] / 50)},${Math.floor(part.position[2] / 50)}`;
    const key = `${tile}:${part.shape}:${part.glow ? part.color : "solid"}`;
    let batch = batches.get(key);
    if (!batch) { batch = { key, shape: part.shape, glow: part.glow, color: part.color, parts: [] }; batches.set(key, batch); }
    batch.parts.push(part);
  }
  return [...batches.values()];
}
