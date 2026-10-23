import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";

test("full checker reviews dynamic CID sources and blocks hosts missing the runtime feature", () => {
  const slug = `ipfs-content-check-${randomBytes(6).toString("hex")}`;
  const dir = path.join(process.cwd(), "src/vaults", slug);
  mkdirSync(dir);
  try {
    const manifest = JSON.parse(readFileSync("src/vaults/example/manifest.json", "utf8"));
    manifest.artifactId = `vaultui_${slug}_01HZY7J4S9D0W5XJ8H2Q3K4M5N`;
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    for (const name of ["i18n.json", "VaultABI.ts"]) writeFileSync(path.join(dir, name), readFileSync(`src/vaults/example/${name}`));
    const component = readFileSync("src/vaults/example/Component.tsx", "utf8");
    writeFileSync(path.join(dir, "Component.tsx"), component + '\nimport { IpfsImage, IpfsText } from "@/src/ui";\nfunction PostContent({sdk, post}: any) { void sdk.readIpfsText(post.textCid); return <><IpfsText cid={post.textCid} /><IpfsImage cid={post.imageCid} alt="" /></>; }');
    const result = runVaultCheck(slug, { silent: true });
    const mediaBlockers = result.issues.filter((item) => item.severity === "blocking" && item.ruleId.startsWith("media-policy/"));
    assert.deepEqual(mediaBlockers, []);
    const warnings = result.issues.filter((item) => item.ruleId === "manual-review/ipfs-content");
    assert.equal(warnings.length, 3);
    assert(warnings.every((item) => /post\.(?:textCid|imageCid)/.test(item.message)));
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const available = pkg.name !== "flap-artifact-workbench" || JSON.parse(readFileSync("node_modules/@flapsdk/vault-runtime/runtime-contract.json", "utf8")).sdkFeatures?.ipfsContent === 1;
    assert.equal(result.issues.some((item) => item.ruleId === "runtime-policy/ipfs-content-unavailable"), !available);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("standalone v2 accepts dynamic IPFS and inventories it for review without a token binding", () => {
  const slug = `standalone-ipfs-${randomBytes(6).toString("hex")}`;
  const dir = path.join(process.cwd(), "src/vaults", slug);
  mkdirSync(dir);
  const skip = process.env.VAULT_CHECK_SKIP_REGISTRATION;
  process.env.VAULT_CHECK_SKIP_REGISTRATION="1";
  try {
    const manifest = {schemaVersion:2, mode:"mini-app", appModel:"standalone", slug, artifactId:`vaultui_${slug}_01HZY7J4S9D0W5XJ8H2Q3K4M5N`,name:"IPFS",displayTitle:{en:"IPFS",zh:"IPFS 内容"},match:{bindings:[]},i18n:["en","zh"]};
    writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(manifest));
    writeFileSync(path.join(dir,"i18n.json"),JSON.stringify({en:{alt:"Image"},zh:{alt:"图片"}}));
    writeFileSync(path.join(dir,"VaultABI.ts"),"export const vaultAbi=[] as const;");
    writeFileSync(path.join(dir,"Component.tsx"),'import {useFlapSdk} from "@/src/sdk"; import {IpfsImage,IpfsText} from "@/src/ui"; export default function Component(){ const sdk=useFlapSdk({chainId:56}); const post={textCid:"bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq",imageCid:"bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq"}; return <div className="min-h-screen"><button onClick={()=>sdk.readIpfsText(post.textCid)}>{sdk.i18n.t("alt")}</button><IpfsText cid={post.textCid}/><IpfsImage cid={post.imageCid} alt={sdk.i18n.t("alt")}/></div>;}');
    const result=runVaultCheck(slug,{silent:true});
    assert.deepEqual(result.issues.filter(x=>x.severity==="blocking"&&!x.ruleId.startsWith("runtime-policy/")),[]);
    assert.equal(result.issues.filter(x=>x.ruleId==="manual-review/ipfs-content").length,3);
  } finally { rmSync(dir,{recursive:true,force:true}); if(skip===undefined)delete process.env.VAULT_CHECK_SKIP_REGISTRATION;else process.env.VAULT_CHECK_SKIP_REGISTRATION=skip; }
});
