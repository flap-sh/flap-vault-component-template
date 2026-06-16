#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import {
  collectSourceHashes,
  E2E_DIST_DIR,
  E2E_REPORT_KIND,
  E2E_REPORT_TOOL,
  E2E_REPORT_VERSION,
  MANIFEST_SCHEMA_PATH,
  REQUIRED_PHASES,
  selectE2EBinding,
  sourceSha256FromFileHashes,
} from "./e2e-report-utils.mjs";
import { failAgent } from "./agent-error.mjs";

const ROOT = process.cwd();
const HOST = "127.0.0.1";
const YARN_COMMAND = process.platform === "win32" ? "yarn.cmd" : "yarn";
const DEFAULT_WALLET_ADDRESS = "0x0000000000000000000000000000000000000EaE";
const DEFAULT_WRONG_CHAIN_ID = 1;
const folderName = process.argv[2];

const VIEWPORTS = [
  { id: "pc", width: 1440, height: 900 },
  { id: "ipad", width: 834, height: 1194 },
  { id: "h5", width: 390, height: 844 },
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
    args[key] = value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(3));

function failE2E(code, message, fixHint, extra = {}) {
  failAgent({
    code,
    message,
    fixHint,
    extra: {
      folderName,
      ...extra,
    },
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asChainId(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function asAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) ? value : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function findAvailablePort(preferredPort) {
  if (await canListen(preferredPort)) return preferredPort;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a preview E2E port."));
      });
    });
    server.listen(0, HOST);
  });
}

async function waitForReady(url, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(700);
  }
  throw lastError || new Error("Preview server did not become ready.");
}

function waitForPreviewProcessReady(child, url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      child.off("error", onError);
      child.off("exit", onExit);
      fn(value);
    };
    const onError = (error) => finish(reject, error);
    const onExit = (code, signal) => {
      finish(reject, new Error(`Preview server exited before it was ready (${signal || `code ${code ?? "unknown"}`}).`));
    };
    child.once("error", onError);
    child.once("exit", onExit);
    waitForReady(url).then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

function isMissingPlaywrightBrowser(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|Looks like Playwright was just installed or updated|Please run.*playwright install|playwright install chromium/i.test(message);
}

async function launchChromium() {
  try {
    return await chromium.launch({ headless: args.headed !== "1" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingPlaywrightBrowser(error)) {
      failE2E(
        "vault-e2e/playwright-browser-missing",
        `Playwright Chromium is not installed: ${message}`,
        "Run yarn playwright install chromium, then rerun yarn vault:e2e <folder-name>. In Linux CI, install with npx playwright install --with-deps chromium.",
      );
    }
    failE2E(
      "vault-e2e/browser-launch-failed",
      `Could not launch Playwright Chromium: ${message}`,
      "Fix the local Playwright/Chromium installation, then rerun yarn vault:e2e <folder-name>.",
    );
  }
}

async function startPreviewServer() {
  if (args["base-url"] || process.env.VAULT_E2E_BASE_URL) {
    const baseUrl = String(args["base-url"] || process.env.VAULT_E2E_BASE_URL).replace(/\/$/, "");
    await waitForReady(`${baseUrl}/${folderName}`);
    return { baseUrl, stop: async () => {} };
  }

  const port = args.port ? Number(args.port) : await findAvailablePort(3230);
  const baseUrl = `http://${HOST}:${port}`;
  const child = spawn(YARN_COMMAND, ["dev", "-p", String(port), "-H", HOST], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  try {
    await waitForPreviewProcessReady(child, `${baseUrl}/${folderName}`);
    return {
      baseUrl,
      stop: async () => {
        child.kill("SIGTERM");
        await sleep(500);
        if (!child.killed) child.kill("SIGKILL");
      },
      logs,
    };
  } catch (error) {
    child.kill("SIGTERM");
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      failE2E(
        "vault-e2e/dev-server-command-missing",
        `Could not start the preview server because ${YARN_COMMAND} was not found.`,
        "Install Yarn and ensure it is on PATH, then rerun yarn vault:e2e <folder-name>.",
        { command: YARN_COMMAND },
      );
    }
    failE2E(
      "vault-e2e/server-not-ready",
      `Preview server did not become ready: ${error instanceof Error ? error.message : String(error)}`,
      "Fix preview startup, then rerun yarn vault:e2e <folder-name>.",
      { command: YARN_COMMAND, logs: logs.join("").split("\n").slice(-60) },
    );
  }
}

function buildPreviewUrl(baseUrl, binding, phase, wrongNetwork = false) {
  const url = new URL(`/${folderName}`, baseUrl);
  const resolvedPhase = phase === "dex-listed" ? "dex-listed" : "internal-market";
  const tokenStatusCode = resolvedPhase === "dex-listed" ? "2" : "1";
  url.searchParams.set("chainId", String(binding.chainId));
  url.searchParams.set("tokenAddress", binding.tokenAddress);
  if (binding.vaultAddress) url.searchParams.set("vaultAddress", binding.vaultAddress);
  if (binding.factoryAddress) url.searchParams.set("factoryAddress", binding.factoryAddress);
  url.searchParams.set("taxInfo", "1");
  url.searchParams.set("taxRate", "100");
  url.searchParams.set("status", tokenStatusCode);
  url.searchParams.set("isListed", resolvedPhase === "dex-listed" ? "1" : "0");
  url.searchParams.set("renderSurface", "vault-taxinfo");
  url.searchParams.set("riskLevel", "0");
  url.searchParams.set("tokenImageUrl", "/logo.png");
  if (phase !== "default") url.searchParams.set("marketPhase", phase);
  if (wrongNetwork) {
    url.searchParams.set("previewWallet", "wrong-network");
    url.searchParams.set("previewWalletAddress", DEFAULT_WALLET_ADDRESS);
    url.searchParams.set("previewWalletChainId", String(DEFAULT_WRONG_CHAIN_ID));
  }
  return url.toString();
}

async function waitForMeaningfulRender(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await page.locator("body").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(() => document.body.innerText.trim().length > 80, undefined, { timeout: 20_000 });
}

function layoutCheckScript() {
  const tolerance = 4;
  const scope = document.querySelector("[data-vault-e2e-scope='vault-preview']") || document.body;
  const issues = [];
  const viewport = {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };

  const addIssue = (ruleId, message, extra = {}) => issues.push({ ruleId, message, ...extra });
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 1 && rect.height > 1;
  };
  const selectorFor = (element) => {
    if (element.id) return `#${element.id}`;
    const dataUi = element.getAttribute("data-flap-ui");
    if (dataUi) return `[data-flap-ui="${dataUi}"]`;
    return element.tagName.toLowerCase();
  };
  const rectInfo = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });

  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + tolerance) {
    addIssue("layout/horizontal-overflow", "Document has horizontal overflow.", {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    });
  }

  const scopeRect = scope.getBoundingClientRect();
  if (scopeRect.left < -tolerance || scopeRect.right > viewport.width + tolerance) {
    addIssue("layout/scope-out-of-viewport", "Vault preview scope extends outside the viewport.", {
      rect: rectInfo(scopeRect),
      viewport,
    });
  }

  const textElements = Array.from(scope.querySelectorAll("button, a, label, p, span, h1, h2, h3, h4, h5, h6, [data-flap-ui]"))
    .filter((element) => isVisible(element))
    .filter((element) => (element.textContent || "").trim().length > 0);
  for (const element of textElements) {
    const style = window.getComputedStyle(element);
    const clipsX = element.scrollWidth > element.clientWidth + tolerance && style.overflowX !== "visible";
    const clipsY = element.scrollHeight > element.clientHeight + tolerance && style.overflowY !== "visible";
    if (clipsX || clipsY) {
      addIssue("layout/text-overflow", "Visible text appears clipped or overflowing its container.", {
        selector: selectorFor(element),
        text: (element.textContent || "").trim().slice(0, 120),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
    }
  }

  const controls = Array.from(scope.querySelectorAll("button, input, textarea, select, a[href], [role='button']"))
    .filter((element) => isVisible(element))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter((item) => item.rect.width > 6 && item.rect.height > 6);
  for (const { element, rect } of controls) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (centerX < 0 || centerX > viewport.width || centerY < 0 || centerY > viewport.height) continue;
    const topElement = document.elementFromPoint(centerX, centerY);
    if (topElement && topElement !== element && !element.contains(topElement) && !topElement.contains(element)) {
      addIssue("layout/control-covered", "A visible control is covered by another element at its center point.", {
        selector: selectorFor(element),
        coveringSelector: selectorFor(topElement),
        rect: rectInfo(rect),
      });
    }
  }

  for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
      const left = controls[leftIndex];
      const right = controls[rightIndex];
      if (left.element.contains(right.element) || right.element.contains(left.element)) continue;
      const overlapX = Math.max(0, Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left));
      const overlapY = Math.max(0, Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top));
      const overlapArea = overlapX * overlapY;
      if (overlapArea > 24) {
        addIssue("layout/control-overlap", "Two visible controls overlap.", {
          left: selectorFor(left.element),
          right: selectorFor(right.element),
          overlapArea: Math.round(overlapArea),
        });
      }
    }
  }

  const riskRegex = /risk|风险|unverified|未验证|missing|缺失|低风险|高风险|中风险/i;
  const riskElement = textElements.find((element) => riskRegex.test((element.textContent || "").trim()));
  if (!riskElement) {
    addIssue("layout/risk-status-not-visible", "No visible risk status text was found in the Vault business UI.");
  } else {
    const riskRect = riskElement.getBoundingClientRect();
    if (riskRect.top - scopeRect.top > 420) {
      addIssue("layout/risk-status-too-low", "Risk status is visible but too low in the Vault business UI.", {
        riskTopWithinScope: Math.round(riskRect.top - scopeRect.top),
      });
    }
  }

  return {
    issues,
    metrics: {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      controlCount: controls.length,
      textNodeCount: textElements.length,
      riskVisible: Boolean(riskElement),
    },
  };
}

async function runOneCheck({ browser, outDir, baseUrl, binding, viewport, phase, wrongNetwork = false }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const traceName = `${viewport.id}-${wrongNetwork ? "wrong-network" : phase}`;
  const screenshotPath = path.join(outDir, "screenshots", `${traceName}.png`);
  const tracePath = path.join(outDir, "traces", `${traceName}.zip`);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text().slice(0, 500) });
    }
  });
  const url = buildPreviewUrl(baseUrl, binding, phase, wrongNetwork);
  const issues = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForMeaningfulRender(page);
    const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
    const previewScope = page.locator("[data-vault-e2e-scope='vault-preview']");
    const previewText = await previewScope.innerText({ timeout: 10_000 });
    const tokenUnavailableFallbackCount = await previewScope.locator("[data-vault-token-unavailable='true']").count();
    if (/NEXT_NOT_FOUND|Application error|Unhandled Runtime Error|Build Error/i.test(bodyText)) {
      issues.push({ ruleId: "render/framework-error", message: "Preview rendered a framework or application error." });
    }
    if (tokenUnavailableFallbackCount > 0 || /manifest-binding-mismatch|Token unavailable|代币不可用/i.test(previewText)) {
      issues.push({ ruleId: "render/token-unavailable", message: "Preview marked the runtime token as unavailable." });
    }
    const layout = await page.evaluate(layoutCheckScript);
    issues.push(...layout.issues);
    if (wrongNetwork && !/wrong network|switch wallet|switch.*chain|切换|网络/i.test(bodyText)) {
      issues.push({ ruleId: "wallet/wrong-network-state-missing", message: "Wrong-network preview did not render a visible switch-network state." });
    }
    if (consoleMessages.some((message) => message.type === "error")) {
      issues.push({ ruleId: "render/console-error", message: "Browser console emitted errors.", consoleMessages });
    }
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.tracing.stop({ path: tracePath });
    await context.close();
    return {
      id: traceName,
      viewport: viewport.id,
      phase,
      wrongNetwork,
      url,
      passed: issues.length === 0,
      issues,
      screenshot: path.relative(ROOT, screenshotPath),
      trace: path.relative(ROOT, tracePath),
      consoleMessages,
    };
  } catch (error) {
    issues.push({ ruleId: "render/check-failed", message: error instanceof Error ? error.message : String(error) });
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    await context.tracing.stop({ path: tracePath }).catch(() => undefined);
    await context.close().catch(() => undefined);
    return {
      id: traceName,
      viewport: viewport.id,
      phase,
      wrongNetwork,
      url,
      passed: false,
      issues,
      screenshot: fs.existsSync(screenshotPath) ? path.relative(ROOT, screenshotPath) : undefined,
      trace: fs.existsSync(tracePath) ? path.relative(ROOT, tracePath) : undefined,
      consoleMessages,
    };
  }
}

if (!folderName) {
  failE2E("vault-e2e/missing-folder", "Usage: yarn vault:e2e <folder-name>", "Pass the Vault folder name to test.");
}

const vaultDir = path.join(ROOT, "src", "vaults", folderName);
const manifestPath = path.join(vaultDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  failE2E("vault-e2e/missing-vault", `Vault folder not found: ${folderName}`, "Run yarn vault:scaffold <folder-name> or pass an existing Vault folder name.");
}

const manifest = readJson(manifestPath);
let binding;
try {
  binding = selectE2EBinding(manifest, {
    chainId: asChainId(args.chain || process.env.VAULT_E2E_CHAIN_ID),
    tokenAddress: asAddress(args.token || process.env.VAULT_E2E_TOKEN_ADDRESS),
    vaultAddress: asAddress(args.vault || process.env.VAULT_E2E_VAULT_ADDRESS),
    factoryAddress: asAddress(args.factory || process.env.VAULT_E2E_FACTORY_ADDRESS),
  });
} catch (error) {
  failE2E("vault-e2e/missing-test-token", error instanceof Error ? error.message : String(error), "Add a real non-placeholder token address under manifest match.bindings[].tokenAddresses, or pass --token only for local self-test.");
}

const outDir = path.join(ROOT, E2E_DIST_DIR, folderName);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "screenshots"), { recursive: true });
fs.mkdirSync(path.join(outDir, "traces"), { recursive: true });

const sourceFileSha256 = collectSourceHashes(ROOT, folderName);
const sourceSha256 = sourceSha256FromFileHashes(sourceFileSha256);
let browser;
let server;
const checks = [];
try {
  browser = await launchChromium();
  server = await startPreviewServer();
  for (const viewport of VIEWPORTS) {
    for (const phase of REQUIRED_PHASES) {
      checks.push(await runOneCheck({ browser, outDir, baseUrl: server.baseUrl, binding, viewport, phase }));
    }
    checks.push(await runOneCheck({ browser, outDir, baseUrl: server.baseUrl, binding, viewport, phase: "internal-market", wrongNetwork: true }));
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.stop();
}

const allIssues = checks.flatMap((check) => check.issues.map((issue) => ({ ...issue, checkId: check.id, viewport: check.viewport, phase: check.phase })));
const issueCounts = allIssues.reduce(
  (acc, issue) => {
    acc[issue.ruleId] = (acc[issue.ruleId] ?? 0) + 1;
    return acc;
  },
  {},
);
const blocking = allIssues.length;
const report = {
  kind: E2E_REPORT_KIND,
  schemaVersion: E2E_REPORT_VERSION,
  generatedBy: E2E_REPORT_TOOL,
  generatedAt: new Date().toISOString(),
  folderName,
  artifactId: manifest.artifactId,
  sourcePackage: `src/vaults/${folderName}`,
  sourceSha256,
  fileSha256: sourceFileSha256,
  manifestSha256: sourceFileSha256[`src/vaults/${folderName}/manifest.json`],
  schemaSha256: sourceFileSha256[MANIFEST_SCHEMA_PATH],
  binding: {
    chainId: binding.chainId,
    tokenAddress: binding.tokenAddress,
    vaultAddress: binding.vaultAddress,
    factoryAddress: binding.factoryAddress,
    tokenPolicy: binding.tokenPolicy,
  },
  viewports: VIEWPORTS,
  phases: REQUIRED_PHASES,
  passed: blocking === 0,
  summary: {
    blocking,
    warning: 0,
    info: checks.length,
  },
  layoutCheckSummary: {
    horizontalOverflow: issueCounts["layout/horizontal-overflow"] ?? 0,
    scopeOutOfViewport: issueCounts["layout/scope-out-of-viewport"] ?? 0,
    textOverflow: issueCounts["layout/text-overflow"] ?? 0,
    controlCovered: issueCounts["layout/control-covered"] ?? 0,
    controlOverlap: issueCounts["layout/control-overlap"] ?? 0,
    riskStatus: (issueCounts["layout/risk-status-not-visible"] ?? 0) + (issueCounts["layout/risk-status-too-low"] ?? 0),
    wrongNetworkState: issueCounts["wallet/wrong-network-state-missing"] ?? 0,
    renderErrors: (issueCounts["render/framework-error"] ?? 0) + (issueCounts["render/token-unavailable"] ?? 0) + (issueCounts["render/console-error"] ?? 0),
  },
  checks,
};

const reportPath = path.join(outDir, "qa-report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.passed) {
  failE2E(
    "vault-e2e/checks-failed",
    `${folderName} E2E failed with ${blocking} blocking issue(s).`,
    `Open ${path.relative(ROOT, reportPath)}, inspect screenshots/traces, fix the layout/state issue, then rerun yarn vault:e2e ${folderName}.`,
    {
      reportPath: path.relative(ROOT, reportPath),
      summary: report.summary,
      layoutCheckSummary: report.layoutCheckSummary,
      issues: allIssues.slice(0, 20),
    },
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      folderName,
      reportPath: path.relative(ROOT, reportPath),
      summary: report.summary,
      binding: report.binding,
      screenshots: checks.map((check) => check.screenshot).filter(Boolean),
      traces: checks.map((check) => check.trace).filter(Boolean),
    },
    null,
    2,
  ),
);
