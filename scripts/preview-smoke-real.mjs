#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = process.env.PORT ? Number(process.env.PORT) : await findAvailablePort(3220);
const BASE_URL = `http://${HOST}:${PORT}`;
const COMMUNITY_TOKEN = "0x091652ebc0a0238d7151a868f22d7cfd2a267777";
const FLAPIXEL_TOKEN = "0x6BcC641D1eF33c4d7A2C9536a3E0356F77Ff7777";

async function readOptionalJson(url, label) {
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  return payload?.data ? payload : null;
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
        else reject(new Error("Could not allocate a real preview smoke port."));
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
  throw lastError || new Error("Real preview smoke server did not become ready.");
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

function assertTruthy(value, label) {
  if (!value) {
    throw new Error(`${label} was empty.`);
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
    await waitForReady(`${BASE_URL}/community-buyback-example`);
    const communityHtml = await assertOk(`${BASE_URL}/community-buyback-example`, "community buyback real example");
    assertIncludes(communityHtml, "community-buyback-example", "community buyback real example");
    assertNotIncludes(communityHtml, "NEXT_NOT_FOUND", "community buyback real example");
    const communityPresentation = await readOptionalJson(
      `${BASE_URL}/api/runtime/token-presentation?chainId=56&tokenAddress=${COMMUNITY_TOKEN}`,
      "community buyback host presentation",
    );
    if (communityPresentation) {
      assertTruthy(communityPresentation?.data?.tokenDetailHref, "community buyback tokenDetailHref");
      assertTruthy(communityPresentation?.data?.chainHref, "community buyback chainHref");
      assertTruthy(
        communityPresentation?.data?.tokenName || communityPresentation?.data?.tokenSymbol || communityPresentation?.data?.tokenImageUrl,
        "community buyback host presentation metadata",
      );
    }

    const flapixelHtml = await assertOk(`${BASE_URL}/flapixel-example`, "flapixel real example");
    assertIncludes(flapixelHtml, "flapixel-example", "flapixel real example");
    assertNotIncludes(flapixelHtml, "NEXT_NOT_FOUND", "flapixel real example");
    const flapixelPresentation = await readOptionalJson(
      `${BASE_URL}/api/runtime/token-presentation?chainId=56&tokenAddress=${FLAPIXEL_TOKEN}`,
      "flapixel host presentation",
    );
    if (flapixelPresentation) {
      if (flapixelPresentation?.data?.tokenSymbol !== "FOMN") {
        throw new Error(`flapixel host presentation returned unexpected tokenSymbol: ${flapixelPresentation?.data?.tokenSymbol}`);
      }
      if (flapixelPresentation?.data?.tokenName !== "Freedom Of Money NFT") {
        throw new Error(`flapixel host presentation returned unexpected tokenName: ${flapixelPresentation?.data?.tokenName}`);
      }
      assertTruthy(flapixelPresentation?.data?.tokenDetailHref, "flapixel tokenDetailHref");
      assertTruthy(flapixelPresentation?.data?.chainHref, "flapixel chainHref");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl: BASE_URL,
          hostPresentation: {
            communityBuyback: communityPresentation ? "available" : "missing",
            flapixel: flapixelPresentation ? "available" : "missing",
          },
          checked: [
            "/community-buyback-example",
            "/flapixel-example",
            `/api/runtime/token-presentation?chainId=56&tokenAddress=${COMMUNITY_TOKEN}`,
            `/api/runtime/token-presentation?chainId=56&tokenAddress=${FLAPIXEL_TOKEN}`,
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
          code: "preview-smoke-real/failed",
          error: error instanceof Error ? error.message : String(error),
          fixHint: "Run yarn build, then yarn preview:smoke:real locally. Check the live example routes and server logs.",
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
