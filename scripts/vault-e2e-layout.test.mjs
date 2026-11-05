import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { chromium } from "@playwright/test";

const source = fs.readFileSync(new URL("./vault-e2e.mjs", import.meta.url), "utf8");
const start = source.indexOf("function layoutCheckScript(");
const end = source.indexOf("\nasync function runOneCheck(", start);
assert.ok(start >= 0 && end > start);
const layoutCheck = source.slice(start, end);
const words = "Long token descriptions should remain readable. ".repeat(20);
const clamp = "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;";
let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function check(style, text = words, extra = "") {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    await page.setContent(`<style>body{margin:0}p{margin:0;font:16px/20px sans-serif;width:180px}</style>
      <main data-vault-e2e-scope="vault-preview" style="width:300px">
        <p id="fixture" style="${style}">${text}</p>${extra}
      </main>`);
    return await page.evaluate(`(${layoutCheck})(true)`);
  } finally {
    await page.close();
  }
}

function textOverflows(result) {
  return result.issues.filter((issue) => issue.ruleId === "layout/text-overflow");
}

test("explicit single-line ellipsis is accepted", async () => {
  assert.deepEqual(textOverflows(await check("overflow:hidden;white-space:nowrap;text-overflow:ellipsis;")), []);
});

test("plain horizontal clipping still blocks", async () => {
  assert.equal(textOverflows(await check("overflow:hidden;white-space:nowrap;text-overflow:clip;")).length, 1);
});

test("ellipsis does not exempt vertical clipping", async () => {
  assert.equal(textOverflows(await check("height:10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;")).length, 1);
});

test("an active two-line description clamp is accepted", async () => {
  assert.deepEqual(textOverflows(await check(clamp)), []);
});

test("two-line clamps account for padding and the existing layout tolerance", async () => {
  assert.deepEqual(textOverflows(await check(`${clamp}padding:8px 0;min-height:40px;`)), []);
});

test("ordinary fixed-height clipping still blocks", async () => {
  assert.equal(textOverflows(await check("height:40px;overflow:hidden;")).length, 1);
});

test("one-line and three-line clamps retain their existing blocking behavior", async () => {
  for (const lines of ["1", "3"]) {
    assert.equal(textOverflows(await check(clamp.replace("clamp:2", `clamp:${lines}`))).length, 1);
  }
});

test("two-line declarations on block layout or undersized boxes still block", async () => {
  assert.equal(textOverflows(await check(`${clamp}display:block;height:40px;`)).length, 1);
  assert.equal(textOverflows(await check(`${clamp}height:10px;`)).length, 1);
  assert.equal(textOverflows(await check(`${clamp}display:flow-root;height:10px;`)).length, 1);
});

test("horizontal box orientation retains clipping detection", async () => {
  assert.equal(textOverflows(await check(`${clamp}height:40px;-webkit-box-orient:horizontal;`)).length, 1);
});

test("two-line clamps do not exempt horizontal clipping", async () => {
  assert.equal(textOverflows(await check(clamp, "UnbrokenTokenName".repeat(30))).length, 1);
});

test("scrolling text retains its existing blocking behavior", async () => {
  assert.equal(textOverflows(await check("height:40px;overflow:auto;")).length, 1);
});

test("intentional text truncation does not exempt scope horizontal overflow", async () => {
  const result = await check(clamp, words, '<div style="width:900px;height:1px"></div>');
  assert.ok(result.issues.some((issue) => issue.ruleId === "layout/horizontal-overflow"));
});
