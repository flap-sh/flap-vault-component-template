import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { STREET_MAP_STYLE, STREET_MAP_WORKER_SHA256, STREET_MAP_RARITY_COLORS, STREET_MAP_INACTIVE_COLOR, STREET_MAP_MAX_RADIUS_METERS, streetMapLocationData, streetMapPointData, streetMapPointState, streetMapPointLabel, streetMapCityData, streetMapRadiusData, streetMapDistanceMeters, streetMapRequest, streetMapZoom, validStreetMapCoordinate, validStreetMapPoints, validStreetMapRadius } from "./streetMapPolicy.ts";

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

test("GeoJSON carries only literal display fields and clearing location removes the dot", () => {
  const data = streetMapPointData([{ id: "a", lat: 31, lng: 121, title: "<script>bad</script>", amount: "100 CATCH", arbitrary: { secret: "never-copy" } }], { nowMs: 1000 });
  assert.deepEqual(data.features[0].properties, { id: "a", rarity: "common", color: "#22c55e", kind: "store", city: "", hasCity: false, label: "<script>bad</script>", coolingDown: false, expired: false, selected: false });
  assert.equal(JSON.stringify(data).includes("100 CATCH"), false);
  assert.equal(JSON.stringify(data).includes("never-copy"), false);
  assert.deepEqual(streetMapLocationData(null).features, []);
  assert.deepEqual(streetMapLocationData({ lat: 31, lng: 121 }).features[0].geometry.coordinates, [121, 31]);
});

test("enriched point fields are optional, bounded plain data", () => {
  const point = { id: "shop", lat: 31.23, lng: 121.47, title: "Legacy title", symbol: "CATCH", place: "Shop", city: "Shanghai", amount: "123456789012345678901234567890", expiresAt: 1000, respawnAt: 2000, kind: "event" };
  assert.equal(validStreetMapPoints([point]), true);
  assert.equal(validStreetMapPoints([{ ...point, amount: 0, expiresAt: 0, respawnAt: 0 }]), true);
  assert.equal(validStreetMapPoints([{ ...point, amount: Number.MAX_SAFE_INTEGER, expiresAt: 8_640_000_000_000_000 }]), true);
  for (const invalid of [
    { symbol: "a".repeat(33) }, { place: "a".repeat(161) }, { city: "a".repeat(81) },
    { symbol: "CATCH\u0000" }, { place: "shop\nother" }, { city: [] },
    { amount: "a".repeat(129) }, { amount: {} }, { amount: -1 }, { amount: Infinity }, { amount: NaN }, { amount: Number.MAX_SAFE_INTEGER + 1 },
    { expiresAt: null }, { expiresAt: "1000" }, { expiresAt: -1 }, { expiresAt: 0.5 }, { expiresAt: 8_640_000_000_000_001 },
    { respawnAt: NaN }, { respawnAt: Infinity }, { respawnAt: -1 }, { kind: "custom" },
  ]) assert.equal(validStreetMapPoints([{ ...point, ...invalid }]), false, JSON.stringify(invalid));
});

test("cooldown and expiry use epoch milliseconds and retain exact deadline transitions", () => {
  const point = { id: "shop", lat: 31, lng: 121, title: "Shop" };
  assert.deepEqual(streetMapPointState(point, 1000), { coolingDown: false, expired: false, cooldownRemainingMs: 0, eventRemainingMs: null });
  assert.deepEqual(streetMapPointState({ ...point, respawnAt: 1100, expiresAt: 1200 }, 1000), { coolingDown: true, expired: false, cooldownRemainingMs: 100, eventRemainingMs: 200 });
  assert.deepEqual(streetMapPointState({ ...point, respawnAt: 1000, expiresAt: 1000 }, 1000), { coolingDown: false, expired: true, cooldownRemainingMs: 0, eventRemainingMs: 0 });
  assert.deepEqual(streetMapPointState({ ...point, respawnAt: 2000, expiresAt: 0 }, 1000), { coolingDown: true, expired: true, cooldownRemainingMs: 1000, eventRemainingMs: 0 });
});

test("rarity, inactive and selected presentation are explicit feature data", () => {
  const points = Object.keys(STREET_MAP_RARITY_COLORS).map((rarity, index) => ({ id: rarity, lat: 31, lng: 121 + index / 100, title: rarity, rarity }));
  const data = streetMapPointData(points, { nowMs: 1000, selectedPointId: "epic" });
  for (const [index, rarity] of Object.keys(STREET_MAP_RARITY_COLORS).entries()) {
    assert.equal(data.features[index].properties.color, STREET_MAP_RARITY_COLORS[rarity]);
    assert.equal(data.features[index].properties.selected, rarity === "epic");
  }
  for (const state of [{ respawnAt: 2000 }, { expiresAt: 1000 }, { respawnAt: 2000, expiresAt: 0 }]) {
    assert.equal(streetMapPointData([{ ...points[3], ...state }], { nowMs: 1000 }).features[0].properties.color, STREET_MAP_INACTIVE_COLOR);
  }
  assert.equal(streetMapPointData(points, { selectedPointId: null }).features.some((feature) => feature.properties.selected), false);
});

test("point labels prefer token and place text and preserve legacy fallback", () => {
  const point = { id: "a", lat: 31, lng: 121, title: "Legacy" };
  assert.equal(streetMapPointLabel(point), "Legacy");
  assert.equal(streetMapPointLabel({ ...point, symbol: " CATCH ", place: " 店铺 " }), "CATCH · 店铺");
  assert.equal(streetMapPointLabel({ ...point, place: "Shop" }), "Shop");
  assert.equal(streetMapPointLabel({ ...point, symbol: "CATCH" }), "CATCH");
  assert.equal(streetMapPointLabel({ ...point, symbol: " ", place: " " }), "Legacy");
});

test("city aggregation counts stores by city and keeps independent events separate", () => {
  const point = { id: "a", lat: 30, lng: 120, title: "Shop" };
  const data = streetMapCityData([
    { ...point, city: " Shanghai " }, { ...point, id: "b", city: "Shanghai", lat: 32, lng: 122 },
    { ...point, id: "event", city: "Shanghai", kind: "event" },
    { ...point, id: "no-city" }, { ...point, id: "empty-city", city: " " },
    { ...point, id: "prototype", city: "__proto__" },
  ]);
  assert.equal(data.features.length, 2);
  assert.deepEqual(data.features[0].properties, { city: "Shanghai", count: 2 });
  assert.ok(Math.abs(data.features[0].geometry.coordinates[0] - 121) < 1e-10);
  assert.equal(data.features[0].geometry.coordinates[1], 31);
  assert.deepEqual(data.features[1].properties, { city: "__proto__", count: 1 });
  const dateline = streetMapCityData([{ ...point, city: "Edge", lng: 179 }, { ...point, city: "Edge", id: "b", lng: -179 }]);
  assert.ok(Math.abs(Math.abs(dateline.features[0].geometry.coordinates[0]) - 180) < 1e-10);
  assert.equal(streetMapPointData([{ ...point, city: " " }]).features[0].properties.hasCity, false);
});

test("meter range inputs are finite and bounded, with absent or zero ranges hidden", () => {
  assert.equal(validStreetMapRadius(0), true);
  assert.equal(validStreetMapRadius(STREET_MAP_MAX_RADIUS_METERS), true);
  for (const value of [undefined, null, "100", -1, NaN, Infinity, STREET_MAP_MAX_RADIUS_METERS + 1]) assert.equal(validStreetMapRadius(value), false);
  const center = { lat: 31, lng: 121 };
  for (const value of [undefined, 0, -1, Infinity, STREET_MAP_MAX_RADIUS_METERS + 1]) assert.deepEqual(streetMapRadiusData(center, value).features, []);
  assert.deepEqual(streetMapRadiusData(null, 100).features, []);
  assert.deepEqual(streetMapRadiusData({ lat: 90, lng: 0 }, 100).features, []);
});

test("range is a closed 64-segment geodesic ring with meter distances", () => {
  const center = { lat: 31.23, lng: 121.47 };
  const data = streetMapRadiusData(center, 1000);
  assert.equal(data.features.length, 1);
  assert.equal(data.features[0].properties.radiusMeters, 1000);
  assert.equal(data.features[0].geometry.type, "Polygon");
  const ring = data.features[0].geometry.coordinates[0];
  assert.equal(ring.length, 65);
  assert.deepEqual(ring[0], ring[64]);
  for (const [lng, lat] of ring) assert.ok(Math.abs(streetMapDistanceMeters(center, { lat, lng }) - 1000) < 0.001);
  const area = ring.slice(0, -1).reduce((sum, point, index) => {
    const next = ring[index + 1];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  assert.ok(area > 0, "GeoJSON exterior rings use counterclockwise winding");
});

test("range geometry splits at the antimeridian instead of drawing across the world", () => {
  for (const lng of [179.999, -179.999]) {
    const geometry = streetMapRadiusData({ lat: 31, lng }, 1000).features[0].geometry;
    assert.equal(geometry.type, "MultiPolygon");
    assert.equal(geometry.coordinates.length, 2);
    for (const [ring] of geometry.coordinates) {
      assert.deepEqual(ring[0], ring[ring.length - 1]);
      const longitudes = ring.map((position) => position[0]);
      assert.ok(Math.max(...longitudes) - Math.min(...longitudes) < 1);
      for (const [x, y] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 85.051129);
    }
  }
  const polar = streetMapRadiusData({ lat: 85.051129, lng: 0 }, 100_000).features[0].geometry;
  assert.equal(polar.type, "Polygon");
  assert.ok(polar.coordinates[0].every(([, lat]) => Math.abs(lat) <= 85.051129));
});

test("display distances handle zero, antipodal and date-line locations without granting eligibility", () => {
  assert.equal(streetMapDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  assert.ok(Math.abs(streetMapDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111_195.080) < 0.01);
  assert.ok(streetMapDistanceMeters({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 }) < 23_000);
  assert.ok(Number.isFinite(streetMapDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })));
  assert.equal(streetMapDistanceMeters({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 }), null);
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
