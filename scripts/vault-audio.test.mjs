import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";
import { collectAudioAssetPaths, collectSourceHashes, sourceSha256FromFileHashes } from "./e2e-report-utils.mjs";

const ROOT = process.cwd();
const TOKENS = { tax: "0x286184b2660a2822671a33f24c4517f593947777", zeroTax: "0x9adc2f9dbc4578808f0cdb30d51b5199ff4b8888" };
const EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac"];
let sequence = 0;
function fixture(t, { miniApp = false, threeD = false, token = TOKENS.tax } = {}) {
  const folder = `audio-check-${process.pid}-${sequence++}`;
  const dir = path.join(ROOT, "src/vaults", folder);
  fs.mkdirSync(dir);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manifest = {
    artifactId: `vaultui_${folder}_01K9V9Z0P0${"A".repeat(16)}`, name: "Audio test", i18n: ["en", "zh"],
    match: { bindings: [{ chainId: 56, tokenAddresses: [token] }] },
    ...(miniApp ? { mode: "mini-app", displayTitle: { en: "Audio test", zh: "音频测试" } } : {}),
    ...(threeD ? { capabilities: ["three-r3f-v1"] } : {}),
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, "VaultABI.ts"), "export const VaultABI = [] as const;");
  fs.writeFileSync(path.join(dir, "i18n.json"), JSON.stringify({ en: { play: "Play sound", risk: "Risk status unavailable" }, zh: { play: "播放音效", risk: "风险状态不可用" } }));
  const bytes = Buffer.from([0, 255, 13, 10, 128]);
  for (const extension of EXTENSIONS) fs.writeFileSync(path.join(dir, `shot.${extension}`), bytes);
  const source = `import { useRef } from "react";
import { useFlapSdk, readTaxVaultHostContext } from "@/src/sdk";
import { StatusBadge, Alert } from "@/src/ui";
${EXTENSIONS.map((ext, i) => `import sound${i} from "./shot.${ext}";`).join("\n")}
export default function AudioTest() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel ?? null;
  return <div className="min-h-screen" ${threeD ? 'data-flap-3d-state="fallback" data-flap-3d-renderer="2d"' : ""}>
    <StatusBadge>{riskLevel ?? i18n.t("risk")}</StatusBadge>
    {riskLevel === null ? <Alert>{i18n.t("risk")}</Alert> : null}
    ${EXTENSIONS.map((_, i) => `<audio ${i === 0 ? "ref={audioRef}" : ""} src={sound${i}} controls preload="metadata" />`).join("\n")}
    <button onClick={() => { const audio = audioRef.current; if (audio) { audio.currentTime = 0; void audio.play().catch(() => {}); } }}>{i18n.t("play")}</button>
  </div>;
}`;
  fs.writeFileSync(path.join(dir, "Component.tsx"), source);
  const check = () => runVaultCheck(folder, { silent: true });
  return { folder, dir, source, bytes, check };
}
function blocking(result) {
  return result.issues.filter((issue) => issue.severity === "blocking" && issue.ruleId !== "preview-registration/missing-vault-module");
}
for (const threeD of [false, true]) {
  for (const [name, options] of [["ordinary Vault", {}], ["7777 Mini App", { miniApp: true }], ["8888 Mini App", { miniApp: true, token: TOKENS.zeroTax }]]) {
    test(`${name} ${threeD ? "3D" : "2D"} accepts playback, packages and hashes all audio formats`, (t) => {
      const f = fixture(t, { ...options, threeD });
      const result = f.check();
      assert.deepEqual(blocking(result), []);
      assert.equal(result.review.audioAssets.length, EXTENSIONS.length);
      assert.deepEqual(result.review.audioAssets, result.review.miniAppAudioAssets, "legacy consumers retain all review items");
      const hashes = collectSourceHashes(ROOT, f.folder);
      for (const ext of EXTENSIONS) assert.equal(hashes[`src/vaults/${f.folder}/shot.${ext}`], createHash("sha256").update(f.bytes).digest("hex"));
      assert.equal(collectAudioAssetPaths(ROOT, f.folder).length, EXTENSIONS.length);
      const previous = sourceSha256FromFileHashes(hashes);
      fs.writeFileSync(path.join(f.dir, "shot.mp3"), Buffer.from([1, 255, 13, 10, 128]));
      assert.notEqual(sourceSha256FromFileHashes(collectSourceHashes(ROOT, f.folder)), previous, "replacing audio invalidates the source proof");
    });
  }
}
test("ordinary audio does not waive host risk status", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dir, "Component.tsx"), f.source.replace(/  const host =.*\n  const riskLevel =.*\n/, "").replace(/    <StatusBadge>.*<\/StatusBadge>\n/, ""));
  assert.ok(blocking(f.check()).some(x => x.ruleId === "risk-status/missing-host-risk-state"));
});
for (const miniApp of [false, true]) {
  test(`${miniApp ? "Mini App" : "ordinary Vault"} retains audio size and path restrictions`, (t) => {
    const f = fixture(t, { miniApp, threeD: true });
    for (const size of [0, 5 * 1024 * 1024 + 1]) {
      fs.writeFileSync(path.join(f.dir, "shot.mp3"), Buffer.alloc(size));
      assert.ok(blocking(f.check()).some(x => x.ruleId === "media/mini-app-audio-too-large"));
    }
    for (const ext of EXTENSIONS) fs.writeFileSync(path.join(f.dir, `shot.${ext}`), Buffer.alloc(3 * 1024 * 1024));
    assert.ok(blocking(f.check()).some(x => x.ruleId === "media/mini-app-audio-too-large" && x.bytes === 15 * 1024 * 1024));
    for (const ext of EXTENSIONS) fs.writeFileSync(path.join(f.dir, `shot.${ext}`), f.bytes);
    fs.mkdirSync(path.join(f.dir, "nested"));
    fs.writeFileSync(path.join(f.dir, "nested/bad.mp3"), f.bytes);
    fs.writeFileSync(path.join(f.dir, "Bad.MP3"), f.bytes);
    fs.symlinkSync(path.join(f.dir, "shot.mp3"), path.join(f.dir, "linked.mp3"));
    const issues = blocking(f.check());
    assert.ok(issues.some(x => x.ruleId === "media/invalid-mini-app-audio-asset" && x.file.endsWith("nested/bad.mp3")));
    assert.ok(issues.some(x => x.ruleId === "media/invalid-mini-app-audio-asset" && x.file.endsWith("Bad.MP3")));
    assert.ok(issues.some(x => x.ruleId === "forbidden-files/symlink"));
  });
}
test("ordinary 3D Vault requires audio to be reachable from its static import graph", (t) => {
  const f = fixture(t, { threeD: true });
  fs.writeFileSync(path.join(f.dir, "unused.mp3"), f.bytes);
  assert.ok(blocking(f.check()).some(x => x.ruleId === "capability-assets/unreferenced-file" && x.file.endsWith("unused.mp3")));
});
