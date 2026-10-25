import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import archiver from "archiver";
import {
  E2E_REPORT_KIND, E2E_REPORT_PACKAGE_PATH, E2E_REPORT_TOOL,
  MINI_APP_CAPABILITY_CONFIG_PATH, readPackageFileBuffer,
  sourceSha256FromFileHashes, summarizeE2EReportForMarker,
} from "./e2e-report-utils.mjs";

const ROOT = process.cwd();
const FOLDER = "map-package-probe";
const BASE = `src/vaults/${FOLDER}`;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const packagerSource = fs.readFileSync(path.join(ROOT, "scripts/vault-package.mjs"), "utf8");
const objectStart = packagerSource.indexOf("const packageMarker = {");
const objectEnd = packagerSource.indexOf("archive.append(JSON.stringify(packageMarker", objectStart);
assert.ok(objectStart >= 0 && objectEnd > objectStart, "Locate the actual package marker and metadata constructors");

function fixture(mapCapabilities) {
  const manifest = {
    schemaVersion: 2, mode: "mini-app", appModel: "standalone", slug: FOLDER,
    artifactId: "app_map_package_probe", name: "Map package probe",
    displayTitle: { en: "Map probe", zh: "地图测试" }, match: { bindings: [] }, i18n: ["en"],
    ...(mapCapabilities === undefined ? {} : { mapCapabilities }),
  };
  const entries = {
    [`${BASE}/Component.tsx`]: Buffer.from("export default function Component(){ return <div />; }\n"),
    [`${BASE}/manifest.json`]: json(manifest),
    [`${BASE}/VaultABI.ts`]: Buffer.from("export const vaultAbi = [] as const;\n"),
    [`${BASE}/i18n.json`]: json({ en: { title: "Map probe" } }),
    "schemas/manifest.schema.json": readPackageFileBuffer(path.join(ROOT, "schemas/manifest.schema.json")),
    [MINI_APP_CAPABILITY_CONFIG_PATH]: readPackageFileBuffer(path.join(ROOT, MINI_APP_CAPABILITY_CONFIG_PATH)),
  };
  const sourceFileHashes = Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, sha256(bytes)]));
  const report = {
    kind: E2E_REPORT_KIND, schemaVersion: 3, generatedBy: E2E_REPORT_TOOL,
    folderName: FOLDER, artifactId: manifest.artifactId, sourcePackage: BASE,
    sourceSha256: sourceSha256FromFileHashes(sourceFileHashes), fileSha256: sourceFileHashes,
    previewSource: { verified: true, componentSha256: sourceFileHashes[`${BASE}/Component.tsx`] },
    manifestSha256: sourceFileHashes[`${BASE}/manifest.json`],
    binding: { appModel: "standalone", slug: FOLDER },
    viewports: ["pc", "ipad", "h5"].map((id) => ({ id })), phases: ["guest", "connected"],
    checks: ["pc", "ipad", "h5"].flatMap((viewport) => ["guest", "connected"].map((phase) => ({
      viewport, phase, session: phase, wrongNetwork: false, passed: true, issues: [],
    }))),
    passed: true, summary: { blocking: 0 }, layoutCheckSummary: {},
  };
  const reportBytes = json(report);
  // Execute the real writer's object constructors, rather than duplicating
  // their optional-field logic. Freshness and live E2E have separate suites;
  // these synthetic archives exercise only serialization and integrity checks.
  const objects = vm.runInNewContext(`${packagerSource.slice(objectStart, objectEnd)}\n({packageMarker, metadata});`, {
    PACKAGE_KIND: "flap-vault-ui-source-package", PACKAGE_FORMAT_VERSION: 7,
    PACKAGE_TOOL: "yarn vault:package", PACKAGE_MARKER_FILE: "flap-vault-package.json",
    TEMPLATE_NAME: "flap-vault-ui-template", RUNTIME_PACKAGE_NAME: "@flapsdk/vault-runtime",
    RUNTIME_CONTRACT_VERSION: 1, templateVersion: "0.1.40-next.2", runtimePackageVersion: "0.1.40-next.2",
    runtimePackageGitHead: "a".repeat(40), manifest, folderName: FOLDER,
    packagedAt: new Date().toISOString(), checkSummary: { blocking: 0, warning: 0, info: 0 },
    e2eSummary: summarizeE2EReportForMarker(report),
    sourceFiles: Object.keys(entries).filter((name) => name.startsWith(`${BASE}/`)),
    sourceFileHashes, E2E_REPORT_PACKAGE_PATH, e2eReportSha256: sha256(reportBytes),
    bindingKeysForEntry() { return []; },
  });
  const { packageMarker: marker, metadata } = JSON.parse(JSON.stringify(objects));
  return { entries: { ...entries, [E2E_REPORT_PACKAGE_PATH]: reportBytes }, marker, metadata };
}

async function verifyFixture(dir, name, input) {
  const file = path.join(dir, `${name}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(file);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve); output.on("error", reject); archive.on("error", reject);
    archive.pipe(output);
    for (const [entry, bytes] of Object.entries({
      ...input.entries, "flap-vault-package.json": json(input.marker), "package-metadata.json": json(input.metadata),
    })) archive.append(bytes, { name: entry });
    archive.finalize();
  });
  // Historical inspection still runs real file/hash/E2E/metadata validation.
  // This mode is never used to submit the fixture or bypass source provenance.
  return spawnSync(process.execPath, [path.join(ROOT, "scripts/vault-verify-package.mjs"), file, "--self-contained"], {
    cwd: ROOT, encoding: "utf8",
  });
}

test("source ZIP writer and verifier preserve the optional street-map declaration", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flap-map-package-test-"));
  try {
    for (const [name, capabilities] of [["legacy-without-map", undefined], ["explicit-empty-map", []], ["street-map", ["street-map-v1"]]]) {
      await t.test(name, async () => {
        const input = fixture(capabilities);
        assert.deepEqual(input.marker.mapCapabilities, capabilities);
        assert.deepEqual(input.metadata.mapCapabilities, capabilities);
        const result = await verifyFixture(dir, name, input);
        assert.equal(result.status, 0, result.stderr || result.stdout);
      });
    }
    for (const [name, mutate] of [
      ["missing-both-map-records", (input) => { delete input.marker.mapCapabilities; delete input.metadata.mapCapabilities; }],
      ["missing-map-metadata", (input) => { delete input.metadata.mapCapabilities; }],
      ["different-marker-map", (input) => { input.marker.mapCapabilities = []; }],
      ["different-metadata-map", (input) => { input.metadata.mapCapabilities = []; }],
    ]) {
      await t.test(name, async () => {
        const input = fixture(["street-map-v1"]); mutate(input);
        const result = await verifyFixture(dir, name, input);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /package-verify\/metadata-mismatch/);
      });
    }
    await t.test("forged-map-not-declared-in-manifest", async () => {
      const input = fixture();
      input.marker.mapCapabilities = input.metadata.mapCapabilities = ["street-map-v1"];
      const result = await verifyFixture(dir, "forged", input);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /package-verify\/metadata-mismatch/);
    });
    for (const [name, value] of [["null", null], ["unknown", ["custom-map"]], ["duplicate", ["street-map-v1", "street-map-v1"]]]) {
      await t.test(`invalid-map-${name}`, async () => {
        const input = fixture(value);
        input.marker.mapCapabilities = input.metadata.mapCapabilities = value;
        const result = await verifyFixture(dir, `invalid-${name}`, input);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /mapCapabilities must contain only the unique street-map-v1 entry/);
      });
    }
    await t.test("null-metadata-cannot-pretend-to-be-an-omitted-declaration", async () => {
      const input = fixture(); input.metadata.mapCapabilities = null;
      const result = await verifyFixture(dir, "null-metadata", input);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /mapCapabilities must contain only the unique street-map-v1 entry/);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
