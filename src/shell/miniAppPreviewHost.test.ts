import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension here.
// @ts-expect-error allowImportingTsExtensions is intentionally not global.
import { buildMiniAppPreviewHostContext } from "./miniAppPreviewHost.ts";
import type { Address, TokenRuntimeSnapshot } from "../sdk/types";

const TAX_TOKEN = "0x94093dd77bb1cfd851083678b61e2a7bf8807777" as Address;
const ZERO_TAX_TOKEN = "0x2865d202f0378df0f23c855a0b09b61721918888" as Address;
const MARKETING_WALLET = "0xB464919dc2e7E2b2AB9dB5a5C17B73Fd623F3a48" as Address;

function createTaxSnapshot(): TokenRuntimeSnapshot {
  const tokenInfo = {
    exists: true,
    isTaxToken: true,
    taxRate: 100,
    taxRateRaw: 100n,
    status: 1,
    tokenVersion: 6,
  };
  const taxInfo = {
    marketBps: 10000,
    deflationBps: 0,
    lpBps: 0,
    dividendBps: 0,
    feeRate: 100,
    buyTaxRate: 100,
    sellTaxRate: 100,
    marketingWallet: MARKETING_WALLET,
  };
  return {
    tokenInfo,
    taxInfo,
    host: {
      tokenInfo,
      taxInfo,
      feeMode: "creator",
      renderSurface: "standard-taxinfo",
      copyScope: "tax",
      marketPhase: "internal-market",
      isListed: false,
    },
    copyScope: "tax",
    hasTaxVaults: false,
    hostReadSupported: true,
    hostReadFromChain: true,
  };
}

test("preserves live 7777 tax data while applying preview market overrides", () => {
  const host = buildMiniAppPreviewHostContext({
    runtimeSnapshot: createTaxSnapshot(),
    tokenAddress: TAX_TOKEN,
    marketPhase: "dex-listed",
    listed: true,
  });

  assert.equal(host.tokenInfo?.tokenVersion, 6);
  assert.equal(host.tokenInfo?.isTaxToken, true);
  assert.equal(host.tokenInfo?.taxRate, 100);
  assert.equal(host.taxInfo?.buyTaxRate, 100);
  assert.equal(host.taxInfo?.sellTaxRate, 100);
  assert.equal(host.taxInfo?.marketBps, 10000);
  assert.equal(host.taxInfo?.marketingWallet, MARKETING_WALLET);
  assert.equal(host.feeMode, "creator");
  assert.equal(host.copyScope, "tax");
  assert.equal(host.marketPhase, "dex-listed");
  assert.equal(host.isListed, true);
});

test("keeps 8888 Mini Apps on the zero-tax fee surface", () => {
  const host = buildMiniAppPreviewHostContext({
    tokenAddress: ZERO_TAX_TOKEN,
    tokenVersion: 7,
    taxRate: 100,
  });

  assert.equal(host.tokenInfo?.tokenVersion, 7);
  assert.equal(host.tokenInfo?.isTaxToken, false);
  assert.equal(host.tokenInfo?.taxRate, 0);
  assert.equal(host.taxInfo, null);
  assert.equal(host.feeMode, "unknown");
  assert.equal(host.renderSurface, "feeinfo");
  assert.equal(host.copyScope, "fee");
});
