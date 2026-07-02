#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = process.env.PORT ? Number(process.env.PORT) : await findAvailablePort(3210);
const BASE_URL = `http://${HOST}:${PORT}`;
const TOKEN = "0x286184b2660a2822671a33f24c4517f593947777";
const FACTORY = "0xC3e4EE8f3c616D16297fAfcB9daab122D31eFA9E";

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
        else reject(new Error("Could not allocate a preview smoke port."));
      });
    });
    server.listen(0, HOST);
  });
}

async function waitForReady(url, timeoutMs = 30000) {
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
    await sleep(500);
  }
  throw lastError || new Error("Preview server did not become ready.");
}

async function assertOk(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function assertIncludes(content, expected, label) {
  if (!content.includes(expected)) {
    throw new Error(`${label} did not include expected marker: ${expected}`);
  }
}

function assertNotIncludes(content, unexpected, label) {
  if (content.includes(unexpected)) {
    throw new Error(`${label} included unexpected marker: ${unexpected}`);
  }
}

async function main() {
  const child = spawn("yarn", ["start", "-p", String(PORT), "-H", HOST], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  try {
    await waitForReady(`${BASE_URL}/example`);
    const previewUrl = `${BASE_URL}/example?chainId=56&tokenAddress=${TOKEN}&factoryAddress=${FACTORY}&marketPhase=internal-market`;
    const exampleHtml = await assertOk(previewUrl, "example preview route");
    assertIncludes(exampleHtml, "example?chainId=56", "example preview route");
    assertNotIncludes(exampleHtml, "NEXT_NOT_FOUND", "example preview route");
    const dexListedBareHtml = await assertOk(`${BASE_URL}/dex-listed-example`, "dex-listed example bare preview route");
    assertIncludes(dexListedBareHtml, "dex-listed-example", "dex-listed example bare preview route");
    const dexListedPreviewUrl = `${BASE_URL}/dex-listed-example?chainId=56&tokenAddress=${TOKEN}&factoryAddress=${FACTORY}&marketPhase=dex-listed`;
    const dexListedHtml = await assertOk(dexListedPreviewUrl, "dex-listed example preview route");
    assertIncludes(dexListedHtml, "dex-listed-example", "dex-listed example preview route");
    const actionGalleryBareHtml = await assertOk(`${BASE_URL}/action-gallery-example`, "action gallery example bare preview route");
    assertIncludes(actionGalleryBareHtml, "action-gallery-example", "action gallery example bare preview route");
    const actionGalleryPreviewUrl = `${BASE_URL}/action-gallery-example?chainId=56&tokenAddress=${TOKEN}&factoryAddress=${FACTORY}&marketPhase=internal-market`;
    const actionGalleryHtml = await assertOk(actionGalleryPreviewUrl, "action gallery example preview route");
    assertIncludes(actionGalleryHtml, "action-gallery-example", "action gallery example preview route");

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl: BASE_URL,
          checked: [
            "/example",
            "/dex-listed-example",
            "/dex-listed-example?marketPhase=dex-listed",
            "/action-gallery-example",
            "/action-gallery-example?marketPhase=internal-market",
          ],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          code: "preview-smoke/failed",
          error: error instanceof Error ? error.message : String(error),
          fixHint: "Run yarn build, then yarn preview:smoke locally. Check the preview routes and server logs.",
          agent: {
            verdict: "fix-blocking",
            nextActions: [
              {
                ruleId: "preview-smoke/failed",
                severity: "blocking",
                fixHint: "Fix the preview route, rebuild, and rerun yarn preview:smoke.",
              },
            ],
          },
          logs: logs.join("").split("\n").slice(-40),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    await sleep(500);
    if (!child.killed) child.kill("SIGKILL");
  }
}

await main();
