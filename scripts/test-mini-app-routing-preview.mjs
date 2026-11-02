import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Run against `yarn dev --port 3047`. The ordinary source-ZIP E2E gate remains
// unchanged; this is an explicit host integration check for the preview shell.
const baseUrl = process.argv[2] ?? "http://127.0.0.1:3047";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto(`${baseUrl}/routing-example/items/direct?lang=zh&appSession=connected`);
  assert.equal(response.status(), 200);
  await page.getByText("项目 direct", { exact: true }).waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: "本地计数：0", exact: true }).click();
  await page.getByRole("button", { name: "打开第一个项目", exact: true }).click();
  await page.getByText("项目 first", { exact: true }).waitFor();
  const assertFixture = async (count) => {
    assert.equal(await page.getByRole("button", { name: `本地计数：${count}`, exact: true }).count(), 1);
    assert.equal(await page.locator("[data-app-session]").getAttribute("data-app-session"), "connected");
    const url = new URL(page.url()); assert.equal(url.searchParams.get("lang"), "zh"); assert.equal(url.searchParams.get("appSession"), "connected");
  };
  await assertFixture(1);
  await page.getByRole("button", { name: "替换为第二个项目", exact: true }).click();
  await page.getByText("项目 second", { exact: true }).waitFor(); await assertFixture(1);
  await page.goBack(); await page.getByText("项目 direct", { exact: true }).waitFor(); await assertFixture(1);
  await page.goForward(); await page.getByText("项目 second", { exact: true }).waitFor(); await assertFixture(1);
  await page.reload(); await page.getByText("项目 second", { exact: true }).waitFor(); await assertFixture(0);
  await page.goto(`${baseUrl}/dex-listed-example/deep`);
  await page.getByText("This page could not be found.", { exact: true }).waitFor();
  assert.equal(await page.locator('[data-vault-e2e-scope="vault-preview"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ["Next deep link", "push/replace", "native back/forward", "persistent App state", "refresh", "connected fixture retained", "Chinese locale retained", "legacy deep route unavailable"] }));
} finally { await browser.close(); }
