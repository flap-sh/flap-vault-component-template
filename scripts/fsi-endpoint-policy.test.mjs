import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";

const PREFIX = "https://bsc-debug.butterfly.army/fsi/v1";
test("FSI query exception passes both gates and preserves endpoint review evidence", () => {
  const folder = `fsi-query-test-${process.pid}`;
  const dir = path.resolve("src/vaults", folder);
  mkdirSync(dir);
  const manifest = {
    artifactId: `vaultui_${folder}_01K9V9Z0P0AAAAAAAAAAAAAAAA`, name: "FSI policy test", i18n: ["en"],
    match: { bindings: [{ chainId: 56, factoryAddress: "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e", tokenAddresses: ["0x286184b2660a2822671a33f24c4517f593947777"] }] },
  };
  const check = (body, endpoints = PREFIX) => {
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, ...(endpoints === undefined ? {} : { endpoints }) }));
    writeFileSync(path.join(dir, "Component.tsx"), `"use client";
import { useFlapSdk } from "@/src/sdk";
export default function Component() {
  const sdk = useFlapSdk();
  const context = sdk.context;
  ${body}
  return <div>{sdk.i18n.t("title")}</div>;
}`);
    return runVaultCheck(folder, { silent: true });
  };
  const network = (result) => result.issues.filter((x) => x.severity === "blocking" && (x.ruleId.startsWith("endpoint-policy/") || x.ruleId.startsWith("forbidden-api/")));
  try {
    writeFileSync(path.join(dir, "VaultABI.ts"), "export const vaultAbi = [] as const;");
    writeFileSync(path.join(dir, "i18n.json"), JSON.stringify({ en: { title: "FSI" } }));
    const sdkResult = check('void sdk.readFsi(`${context.vaultAddress}/G/claim`, { actor: sdk.wallet.address ?? "", limit: "100", cursor: "a/b+c==" });');
    assert.deepEqual(network(sdkResult), []);
    const sdkReview = sdkResult.review.externalEndpoints.find((x) => x.source === "sdk.readFsi");
    assert.equal(sdkReview.url, PREFIX);
    assert.equal(sdkReview.dynamicQuery, true);
    assert.match(sdkReview.pathExpression, /context.vaultAddress/);
    assert.match(sdkReview.paramsExpression, /cursor/);
    const noDeclaration = check('void sdk.readFsi("by-key/account", { templateId: "G" });', null);
    assert(network(noDeclaration).some((x) => x.ruleId === "endpoint-policy/fsi-declaration-required"));
    const direct = 'void fetch(`' + PREFIX + '/by-key/account?templateId=G&actor=${sdk.wallet.address}&limit=${100}`);';
    const directResult = check(direct);
    assert.deepEqual(network(directResult), []);
    const directReview = directResult.review.externalEndpoints.find((x) => x.source === "fetch");
    assert.equal(directReview.dynamicQuery, true);
    assert.match(directReview.targetExpression, /sdk.wallet.address/);
    assert.deepEqual(network(check('void fetch("' + PREFIX + '/by-key/account?templateId=G&limit=100");')), []);
    for (const bad of [
      direct.replace("/fsi/v1/", "/fsi/v10/"), direct.replace("/fsi/v1/", "/other/"),
      direct.replace("https:", "http:"), direct.replace("butterfly.army", "butterfly.army.evil.test"),
      direct.replace("https://", "https://user:pass@"), direct.replace("butterfly.army/", "butterfly.army:444/"),
      direct.replace("/by-key/account?", "/${context.vaultAddress}/G?"),
      'const url = "' + PREFIX + '/by-key/account"; void fetch(url);',
      'void fetch(`https://other.test/path?limit=${100}`);',
    ]) assert(network(check(bad, [PREFIX, "https://other.test"])).length > 0, bad);
    assert(network(check(direct, "https://other.test")).length > 0);
    assert(network(check('const url = "' + PREFIX + '/by-key/account"; return <img src={url} />;')).length > 0, "FSI declarations never authorize non-fetch media");
    assert(network(check('const fetch = () => null; ' + direct)).length > 0, "shadowed fetch remains blocked");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
