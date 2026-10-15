import assert from "node:assert/strict";
import test from "node:test";
import { collectIpfsContentIssues } from "./ipfs-content-policy.mjs";
const cid = "bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq";
const scan = (source) => collectIpfsContentIssues(source, "Component.tsx");
const blocking = (source) => scan(source).filter((item) => item.severity === "blocking");

test("allows dynamic image/text CIDs and retains their expressions for human review", () => {
  for (const source of ['<IpfsImage cid={post.imageCid} alt="post" />', '<IpfsText cid={post.textCid} />', 'sdk.readIpfsText(post.textCid, post.path)']) {
    assert.deepEqual(blocking(source), []);
    const warning = scan(source).find((item) => item.ruleId === "manual-review/ipfs-content");
    assert(warning);
    assert.match(warning.message, /post\.(?:imageCid|textCid)/);
    assert.equal(warning.file, "Component.tsx");
  }
});

test("checks named aliases and namespace component imports", () => {
  assert(scan('import { IpfsImage as Photo } from "@/src/ui"; const x=<Photo cid={cid} alt="post" />').some((item) => item.severity === "warning"));
  assert(scan('import * as UI from "@/src/ui"; const x=<UI.IpfsText cid={cid} />').some((item) => item.severity === "warning"));
});

test("requires the feature on hosts and inventories retained/destructured readers", () => {
  for (const source of ['const read = sdk.readIpfsText; read(cid)', 'const { readIpfsText: read } = sdk; read(cid)', '<IpfsImage cid={post.cid} />']) {
    assert(collectIpfsContentIssues(source, "Component.tsx", { runtimeAvailable: false }).some((item) => item.ruleId === "runtime-policy/ipfs-content-unavailable"));
    assert(!collectIpfsContentIssues(source, "Component.tsx", { runtimeAvailable: true }).some((item) => item.severity === "blocking"));
  }
});

test("keeps static image/dynamic path sample requirements and CID-only backgrounds", () => {
  assert.deepEqual(blocking(`<IpfsImage cid="${cid}" path={path} validationPath="1.png" alt="post" />`), []);
  assert(blocking(`<IpfsImage cid="${cid}" path={path} alt="post" />`).length);
  assert.deepEqual(blocking('<IpfsImage cid={cid} path={path} alt="post" />'), []);
  assert(blocking('<IpfsBackground cid={cid} />').length);
  assert(blocking(`<IpfsBackground cid="${cid}" path="1.png" />`).length);
});

test("rejects missing/invalid CIDs, raw URLs, unsafe paths and prop overrides", () => {
  for (const source of ['<IpfsText />', '<IpfsImage cid="https://evil.example/x" />', '<IpfsText cid="ipfs://bad" />', `<IpfsText cid="${cid}" path="../post" />`, '<IpfsImage cid={cid} srcSet={urls} />', '<IpfsText cid={cid} dangerouslySetInnerHTML={html} />', '<IpfsImage {...props} cid={cid} />', '<IpfsImage cid={cid} cid={other} />', 'sdk.readIpfsText("https://evil.example/post")', `sdk.readIpfsText("${cid}", "a/%2e%2e/b")`]) assert(blocking(source).length, source);
});
