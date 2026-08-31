import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension here.
// @ts-expect-error allowImportingTsExtensions is intentionally not global.
import { normalizeOnchainPortalTokenVersion } from "./taxInfo.ts";

test("normalizes zero-based Portal token versions", () => {
  assert.equal(normalizeOnchainPortalTokenVersion(5), 6);
  assert.equal(normalizeOnchainPortalTokenVersion(6), 7);
});

test("does not alter invalid Portal token versions", () => {
  assert.equal(normalizeOnchainPortalTokenVersion(-1), -1);
  assert.equal(normalizeOnchainPortalTokenVersion(Number.NaN), Number.NaN);
});
