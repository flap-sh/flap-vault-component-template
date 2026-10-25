import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runVaultCheck } from "./vault-check.mjs";
import { checkMapCapabilityManifest, collectMapCapabilityIssues } from "./map-capability-policy.mjs";

const manifest = { mapCapabilities: ["street-map-v1"] };
const scan = (source, declaration = manifest, options) => collectMapCapabilityIssues(source, "Component.tsx", declaration, options);
const blocked = (source, declaration = manifest, options) => scan(source, declaration, options).filter((issue) => issue.severity === "blocking");

test("old and empty declarations are compatible; only one fixed map profile is valid", () => {
  assert.deepEqual(checkMapCapabilityManifest({}), []);
  assert.deepEqual(checkMapCapabilityManifest({ mapCapabilities: [] }), []);
  assert.equal(checkMapCapabilityManifest(manifest)[0].ruleId, "manual-review/street-map");
  for (const value of [null, "street-map-v1", ["maplibre"], ["street-map-v1", "street-map-v1"], ["street-map-v1", "other"], [1], {}]) {
    assert.equal(checkMapCapabilityManifest({ mapCapabilities: value })[0].ruleId, "map-policy/invalid-capabilities");
  }
});

test("shared named, renamed, namespace and retained map references require declaration", () => {
  for (const source of [
    'import {FlapStreetMap} from "@/src/ui"; <FlapStreetMap/>;',
    'import {FlapStreetMap as Street} from "@/src/ui"; const Keep=Street; <Keep/>;',
    'import * as UI from "@/src/ui"; <UI.FlapStreetMap/>;',
    'import * as UI from "@/src/ui"; const Keep=UI["FlapStreetMap"]; <Keep/>;',
    'import * as UI from "@/src/ui"; const Retained=UI; const {FlapStreetMap:Street}=Retained; <Street/>;',
    'import * as UI from "@/src/ui"; let Keep; Keep=UI.FlapStreetMap; <Keep/>;',
  ]) {
    assert.deepEqual(blocked(source), [], source);
    assert(blocked(source, {}).some((item) => item.ruleId === "map-policy/undeclared-capability"), source);
    assert(blocked(source, manifest, { runtimeAvailable: false }).some((item) => item.ruleId === "runtime-policy/street-map-unavailable"), source);
  }
});

test("ordinary UI, type-only imports and unrelated business names keep legacy behavior", () => {
  for (const source of [
    'import {Card} from "@/src/ui"; <Card/>;',
    'import type {FlapStreetMapProps} from "@/src/ui"; const value:FlapStreetMapProps={};',
    'import {type FlapStreetMap} from "@/src/ui";',
    'const label="FlapStreetMap"; // FlapStreetMap is not in use',
    'const obj={FlapStreetMap(){}}; obj.FlapStreetMap();',
    'declare const {x}: {x:string};',
  ]) assert.deepEqual(blocked(source, {}, { runtimeAvailable: false }), [], source);
});

test("existing dynamic namespace UI use is preserved; Runtime owns the map declaration gate", () => {
  assert.deepEqual(blocked('import * as UI from "@/src/ui"; const Item=UI[name];', {}), []);
  assert.deepEqual(blocked('import * as UI from "@/src/ui"; const Retained=UI; Retained[name];', {}), []);
});

test("declaration alone blocks a receiving Runtime without the required shared export", () => {
  assert.deepEqual(blocked("const value=1;", {}, { runtimeAvailable: false }), []);
  assert.equal(blocked("const value=1;", manifest, { runtimeAvailable: false })[0].ruleId, "runtime-policy/street-map-unavailable");
});

test("JSON schemas and checker keep map permission separate from 3D and native APIs", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/manifest.schema.json", import.meta.url), "utf8"));
  const fragment = JSON.parse(await readFile(new URL("../schemas/manifest.map-capabilities.schema.json", import.meta.url), "utf8"));
  for (const key of ["type", "maxItems", "uniqueItems", "items", "description"]) assert.deepEqual(schema.properties.mapCapabilities[key], fragment[key]);
  assert.deepEqual(schema.properties.capabilities.items.enum, ["three-r3f-v1"]);
  const checker = await readFile(new URL("./vault-check.mjs", import.meta.url), "utf8");
  assert(checker.includes('"mapCapabilities", "surfaces"'));
  assert(checker.includes("checkMapCapabilityManifest(manifest)"));
  assert(checker.includes("collectMapCapabilityIssues(scanContent, rel, manifest)"));
  // Existing source import and worker guards are untouched by this capability.
  assert(checker.includes('"imports-and-dependencies/forbidden-import"'));
  assert(checker.includes('"forbidden-api/browser-worker"'));
});


test("full checker accepts declared shared maps without admitting direct libraries or workers", () => {
  const slug = `map-check-${randomBytes(5).toString("hex")}`;
  const dir = path.join(process.cwd(), "src/vaults", slug);
  mkdirSync(dir);
  const priorSkip = process.env.VAULT_CHECK_SKIP_REGISTRATION;
  process.env.VAULT_CHECK_SKIP_REGISTRATION = "1";
  try {
    const manifest = JSON.parse(readFileSync("src/vaults/example/manifest.json", "utf8"));
    manifest.artifactId = `vaultui_${slug}_01HZY7J4S9D0W5XJ8H2Q3K4M5N`;
    const writeManifest = () => writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    writeManifest();
    for (const name of ["i18n.json", "VaultABI.ts", "Component.tsx"]) writeFileSync(path.join(dir, name), readFileSync(`src/vaults/example/${name}`));
    const original = readFileSync(path.join(dir, "Component.tsx"), "utf8");
    const check = () => runVaultCheck(slug, { silent: true }).issues;
    assert.deepEqual(check().filter((item) => item.ruleId.startsWith("map-policy/")), []);
    writeFileSync(path.join(dir, "Component.tsx"), original + '\nimport {FlapStreetMap as StreetMap} from "@/src/ui"; function MapProbe(){return <StreetMap/>;}');
    assert(check().some((item) => item.ruleId === "map-policy/undeclared-capability"));
    manifest.mapCapabilities = ["street-map-v1"];
    writeManifest();
    const declared = check();
    assert(!declared.some((item) => item.severity === "blocking" && item.ruleId.startsWith("map-policy/")));
    assert(!declared.some((item) => item.ruleId === "manifest-schema/disallowed-field" && item.field === "mapCapabilities"));
    assert(declared.some((item) => item.ruleId === "manual-review/street-map"));
    writeFileSync(path.join(dir, "Component.tsx"), original + '\nimport maplibregl from "maplibre-gl"; new Worker("/custom-worker.js");');
    const raw = check();
    assert(raw.some((item) => item.ruleId === "imports-and-dependencies/unreviewed-import" && item.severity === "blocking"));
    assert(raw.some((item) => item.ruleId === "forbidden-api/browser-worker"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (priorSkip === undefined) delete process.env.VAULT_CHECK_SKIP_REGISTRATION;
    else process.env.VAULT_CHECK_SKIP_REGISTRATION = priorSkip;
  }
});
