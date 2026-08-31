import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension here.
// @ts-expect-error allowImportingTsExtensions is intentionally not global.
import { normalizeBinanceImageUrl } from "./binanceImageUrl.ts";

test("accepts Binance static images without a pathname restriction", () => {
  assert.equal(normalizeBinanceImageUrl("https://bin.bnbstatic.com/images/web3-data/public/token/logos/gmeb.png"), "https://bin.bnbstatic.com/images/web3-data/public/token/logos/gmeb.png");
  assert.equal(normalizeBinanceImageUrl("https://bin.bnbstatic.com/another/catalog/logo.webp?size=96#preview"), "https://bin.bnbstatic.com/another/catalog/logo.webp?size=96#preview");
  assert.equal(normalizeBinanceImageUrl("https://BIN.BNBSTATIC.COM/root-image.png"), "https://bin.bnbstatic.com/root-image.png");
});

test("rejects non-HTTPS, credentialed, alternate-port, and lookalike hosts", () => {
  for (const value of [
    "http://bin.bnbstatic.com/logo.png",
    "//bin.bnbstatic.com/logo.png",
    "https://user:pass@bin.bnbstatic.com/logo.png",
    "https://bin.bnbstatic.com:8443/logo.png",
    "https://cdn.bin.bnbstatic.com/logo.png",
    "https://bin.bnbstatic.com.evil.example/logo.png",
    "https://bnbstatic.com/logo.png",
  ]) {
    assert.equal(normalizeBinanceImageUrl(value), null, value);
  }
});

test("rejects malformed, padded, and control-character URLs", () => {
  assert.equal(normalizeBinanceImageUrl("not a url"), null);
  assert.equal(normalizeBinanceImageUrl(" https://bin.bnbstatic.com/logo.png"), null);
  assert.equal(normalizeBinanceImageUrl("https://bin.bnbstatic.com/logo.png\n"), null);
  assert.equal(normalizeBinanceImageUrl(undefined), null);
  assert.equal(normalizeBinanceImageUrl(null), null);
});
