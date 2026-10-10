import assert from "node:assert/strict";
import test from "node:test";
import { checkNftAccountDeclarations, checkNftAccountSource, collectNftAccountReview } from "./nft-account-policy.mjs";

test("accepts only versioned review intent and preserves review evidence", () => {
  const binding = { chainId: 56, factoryAddress: "0x123" };
  const entry = { policyId: "reviewed-withdrawal", profile: "null-bag-withdraw-v1" };
  const issues = checkNftAccountDeclarations([entry], "binding.nftAccountWithdrawals", binding);
  assert.equal(issues[0].severity, "warning");
  assert.equal(collectNftAccountReview(issues)[0].policyId, entry.policyId);
  for (const value of [[], [entry, entry], [{ ...entry, recipient: "0x123" }], [{ ...entry, profile: "arbitrary-call" }], [{ ...entry, policyId: 4 }]]) {
    assert(checkNftAccountDeclarations(value, "field", binding).some((x) => x.severity === "blocking"));
  }
  assert.equal(checkNftAccountDeclarations([entry], "field", { chainId: 56 })[0].severity, "blocking");
});

test("artifacts cannot construct a provider with their own approvals", () => {
  for (const code of ['import { VaultRuntimeProvider as X } from "@/src/sdk"', 'export {VaultRuntimeProvider as X} from "@/src/sdk"']) {
    assert.equal(checkNftAccountSource(code, "Component.tsx")[0].severity, "blocking");
  }
  for (const code of ['import * as sdk from "@/src/sdk"', 'export * from "@/src/sdk"', 'import {useFlapSdk, type VaultComponentProps} from "@/src/sdk"']) assert.deepEqual(checkNftAccountSource(code, "Component.tsx"), []);
});
