import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyStreetMapAssets, STREET_MAP_ASSET_CONTRACT, verifyStreetMapWorker } from "./street-map-assets.mjs";

test("Runtime copies byte-identical official Worker and license; corruption fails verification", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "flap-street-map-assets-"));
  try {
    const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
    const contract = await copyStreetMapAssets(root, temporary);
    assert.deepEqual(contract, STREET_MAP_ASSET_CONTRACT);
    const worker = path.join(temporary, contract.workerPath);
    assert.equal((await readFile(worker)).length, 518806);
    assert.match(await readFile(path.join(temporary, "runtime-map/LICENSE.maplibre.txt"), "utf8"), /Redistribution and use/);
    await verifyStreetMapWorker(worker);
    await writeFile(worker, "// wrong version");
    await assert.rejects(verifyStreetMapWorker(worker), /integrity mismatch/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
