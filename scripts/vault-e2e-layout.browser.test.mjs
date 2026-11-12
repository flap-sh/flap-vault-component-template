import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "@playwright/test";
import { layoutCheckScript } from "./vault-e2e-layout.mjs";

let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function withPreview(html, run, viewport = { width: 800, height: 600 }) {
  const page = await browser.newPage({ viewport });
  try {
    await page.setContent(`
      <style>
        body { margin: 0; }
        button { box-sizing: border-box; }
      </style>
      <main data-vault-e2e-scope="vault-preview">${html}</main>`);
    await run(page);
  } finally {
    await page.close();
  }
}

async function layoutIssues(page, ruleId) {
  const { issues } = await page.evaluate(layoutCheckScript, true);
  return issues.filter((issue) => issue.ruleId === ruleId);
}

test("Next's development indicator does not hide real coverage in the same shadow root", async () => {
  await withPreview(`
    <button id="indicator-target" style="position:fixed;left:20px;bottom:20px;width:60px;height:30px">One</button>
    <button id="shadow-target" style="position:fixed;left:100px;bottom:20px;width:60px;height:30px">Two</button>
    <button id="app-target" style="position:fixed;left:180px;bottom:20px;width:60px;height:30px">Three</button>
    <div id="app-overlay" style="position:fixed;left:180px;bottom:20px;width:60px;height:30px;z-index:2"></div>
  `, async (page) => {
    await page.evaluate(() => {
      const portal = document.createElement("nextjs-portal");
      const shadow = portal.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <style>
          button, div { position: fixed; bottom: 20px; width: 60px; height: 30px; z-index: 2; }
          button { left: 20px; box-sizing: border-box; }
          div { left: 100px; }
        </style>
        <button data-nextjs-dev-tools-button><span>Next</span></button>
        <div id="real-shadow-overlay"></div>`;
      document.body.append(portal);
    });
    const issues = await layoutIssues(page, "layout/control-covered");
    assert.deepEqual(issues.map(({ selector }) => selector), ["#shadow-target", "#app-target"]);
    assert.equal(issues[1].coveringSelector, "#app-overlay");
  });
});

test("closed details exclude hidden menu controls but still check the summary", async () => {
  await withPreview(`
    <details id="menu">
      <summary id="summary" role="button" style="position:absolute;left:10px;top:10px;width:90px;height:24px">Menu</summary>
      <button id="menu-action" style="position:absolute;left:10px;top:40px;width:90px;height:24px;z-index:1">Action</button>
    </details>
    <div id="summary-cover" style="position:absolute;left:10px;top:10px;width:90px;height:24px"></div>
    <button id="under-menu" style="position:absolute;left:10px;top:40px;width:90px;height:24px">Underlying</button>
  `, async (page) => {
    let result = await page.evaluate(layoutCheckScript, true);
    assert.equal(result.metrics.controlCount, 2);
    assert.deepEqual(result.issues.map(({ ruleId, selector }) => [ruleId, selector]), [
      ["layout/control-covered", "#summary"],
    ]);

    await page.locator("#menu").evaluate((element) => { element.open = true; });
    result = await page.evaluate(layoutCheckScript, true);
    assert.equal(result.metrics.controlCount, 3);
    assert.ok(result.issues.some(({ ruleId, selector, coveringSelector }) =>
      ruleId === "layout/control-covered" && selector === "#under-menu" && coveringSelector === "#menu-action"));
    assert.ok(result.issues.some(({ ruleId, left, right }) =>
      ruleId === "layout/control-overlap" && left === "#menu-action" && right === "#under-menu"));
  });
});

test("horizontal ellipsis is intentional while ordinary or vertical clipping still blocks", async () => {
  await withPreview(`
    <style>
      .search-label { display: block; width: 77px; overflow: hidden; white-space: nowrap; font: 16px/20px sans-serif; }
    </style>
    <span id="ellipsis" class="search-label" style="text-overflow:ellipsis">Search name, symbol or address</span>
    <span id="clip" class="search-label">Search name, symbol or address</span>
    <span id="vertical" class="search-label" style="height:9px;text-overflow:ellipsis">Search name, symbol or address</span>
  `, async (page) => {
    const issues = await layoutIssues(page, "layout/text-overflow");
    assert.deepEqual(issues.map(({ selector }) => selector), ["#clip", "#vertical"]);
  });
});

test("H5 overlap and coverage use visible bounds while controls escaping overflow still count", async () => {
  await withPreview(`
    <style>
      #clip { position:absolute; inset:0 0 62px; overflow:auto; }
      #copy { position:absolute; left:197px; top:773px; width:24px; height:24px; }
      #neighbor { position:absolute; left:150px; top:783px; width:100px; height:58px; }
    </style>
    <div id="clip"><button id="copy" aria-label="Copy"></button></div>
    <button id="neighbor">Open project</button>
  `, async (page) => {
    async function controlIssues() {
      const { issues } = await page.evaluate(layoutCheckScript, true);
      return issues.filter(({ ruleId }) => ["layout/control-covered", "layout/control-overlap"].includes(ruleId));
    }

    assert.deepEqual(await controlIssues(), []);
    await page.locator("#clip").evaluate((element) => { element.style.overflow = "visible"; });
    const expected = [
      ["layout/control-covered", "#copy", "#neighbor"],
      ["layout/control-overlap", "#copy", "#neighbor", 336],
    ];
    const issueDetails = (issues) => issues.map(({ ruleId, selector, coveringSelector, left, right, overlapArea }) =>
      ruleId === "layout/control-covered"
        ? [ruleId, selector, coveringSelector]
        : [ruleId, left, right, overlapArea]);
    assert.deepEqual(issueDetails(await controlIssues()), expected);

    await page.evaluate(() => {
      document.querySelector("#clip").style.overflow = "auto";
      document.querySelector("#copy").style.position = "fixed";
    });
    assert.deepEqual(issueDetails(await controlIssues()), expected);
  }, { width: 390, height: 844 });
});
