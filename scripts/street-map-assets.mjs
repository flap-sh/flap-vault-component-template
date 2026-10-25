import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export const STREET_MAP_ASSET_CONTRACT = Object.freeze({
  version: 1, engineVersion: "6.15.0", capability: "street-map-v1",
  workerPath: "/runtime-map/maplibre-6.15.0-worker.mjs",
  workerSha256: "1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa",
});

export async function verifyStreetMapWorker(file) {
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== STREET_MAP_ASSET_CONTRACT.workerSha256) throw new Error("Fixed MapLibre 6.15.0 worker integrity mismatch.");
}

/** Copy only the reviewed official static asset; never run a worker bundler. */
export async function copyStreetMapAssets(root, output) {
  const packageRoot = path.join(root, "node_modules/maplibre-gl");
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  if (manifest.version !== STREET_MAP_ASSET_CONTRACT.engineVersion) throw new Error("Fixed MapLibre engine version mismatch.");
  const worker = path.join(packageRoot, "dist/maplibre-gl-worker.mjs");
  await verifyStreetMapWorker(worker);
  await mkdir(path.join(output, "runtime-map"), { recursive: true });
  await copyFile(worker, path.join(output, STREET_MAP_ASSET_CONTRACT.workerPath));
  await copyFile(path.join(packageRoot, "LICENSE.txt"), path.join(output, "runtime-map/LICENSE.maplibre.txt"));
  return { ...STREET_MAP_ASSET_CONTRACT };
}
