import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { STREET_MAP_STYLE, STREET_MAP_WORKER_SHA256, streetMapLocationData, streetMapPointData, streetMapRequest, streetMapZoom, validStreetMapCoordinate, validStreetMapPoints } from "./streetMapPolicy.ts";

test("only fixed OpenFreeMap resources get credential-free request parameters", () => {
  for (const url of [STREET_MAP_STYLE, "https://tiles.openfreemap.org/planet", "https://tiles.openfreemap.org/planet/20261018_080001_pt/12/3429/1776.pbf", "https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular,Noto%20Sans%20CJK%20SC%20Regular/0-255.pbf", "https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png", "https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json", "https://tiles.openfreemap.org/natural_earth/ne2sr/6/23/42.png"]) {
    assert.deepEqual(streetMapRequest(url), { url, credentials: "omit", referrerPolicy: "no-referrer" });
  }
  for (const url of ["https://evil.example/styles/dark", "http://tiles.openfreemap.org/styles/dark", "https://tiles.openfreemap.org:444/styles/dark", "https://x:y@tiles.openfreemap.org/styles/dark", `${STREET_MAP_STYLE}?secret=x`, `${STREET_MAP_STYLE}#x`, "https://tiles.openfreemap.org/anything", "https://tiles.openfreemap.org/fonts/evil%2fpath/0-255.pbf", "https://tiles.openfreemap.org/fonts/evil%00path/0-255.pbf", "data:application/json,{}", "blob:https://flap.sh/xx", "https://tiles.openfreemap.org/fonts/" + "a".repeat(1024) + "/0-255.pbf"]) assert.throws(() => streetMapRequest(url));
});

test("points, coordinates and zoom have finite, bounded inputs", () => {
  const point = { id: "shop", lat: 31.23, lng: 121.47, title: "<img src=x onerror=alert(1)>" };
  assert.equal(validStreetMapPoints([point]), true);
  assert.equal(validStreetMapPoints(Array.from({ length: 2000 }, (_, i) => ({ ...point, id: String(i) }))), true);
  for (const points of [[point, point], Array.from({ length: 2001 }, (_, i) => ({ ...point, id: String(i) })), [{ ...point, lat: NaN }], [{ ...point, lng: Infinity }], [{ ...point, title: "a".repeat(257) }], [{ ...point, id: "" }], [{ ...point, rarity: "custom" }], [null]]) assert.equal(validStreetMapPoints(points), false);
  for (const coordinate of [{ lat: 90, lng: 0 }, { lat: 0, lng: 181 }, { lat: "0", lng: 0 }, null]) assert.equal(validStreetMapCoordinate(coordinate), false);
  assert.equal(streetMapZoom(undefined), 12);
  assert.equal(streetMapZoom(-1), 3);
  assert.equal(streetMapZoom(30), 18);
  assert.equal(streetMapZoom(10.5), 10.5);
});

test("GeoJSON carries no title HTML and clearing location removes the dot", () => {
  const data = streetMapPointData([{ id: "a", lat: 31, lng: 121, title: "<script>bad</script>" }]);
  assert.deepEqual(data.features[0].properties, { id: "a", rarity: "common" });
  assert.equal(JSON.stringify(data).includes("<script>"), false);
  assert.deepEqual(streetMapLocationData(null).features, []);
  assert.deepEqual(streetMapLocationData({ lat: 31, lng: 121 }).features[0].geometry.coordinates, [121, 31]);
});

test("official MapLibre dependency and static Worker are locked to the reviewed build", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies["maplibre-gl"], "6.15.0");
  const worker = await readFile(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url));
  assert.equal(createHash("sha256").update(worker).digest("hex"), STREET_MAP_WORKER_SHA256);
  assert.equal(worker.length, 518806);
  const previewWorker = await readFile(new URL("../../public/runtime-map/maplibre-6.15.0-worker.mjs", import.meta.url));
  assert.equal(createHash("sha256").update(previewWorker).digest("hex"), STREET_MAP_WORKER_SHA256);
});
