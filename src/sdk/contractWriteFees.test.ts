import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension here.
// @ts-expect-error allowImportingTsExtensions is intentionally not global.
import { MAX_CONTRACT_WRITE_GAS, MAX_GAS_PRICE_MULTIPLIER, resolveSafeContractWriteFeeOverrides } from "./contractWriteFees.ts";

test("returns safe gas overrides and accepts the exact gas-price ceiling", async () => {
  const networkGasPrice = 50_000_000n;
  const overrides = await resolveSafeContractWriteFeeOverrides(
    {
      gas: 1_200_000n,
      gasPrice: networkGasPrice * MAX_GAS_PRICE_MULTIPLIER,
    },
    async () => networkGasPrice,
  );

  assert.deepEqual(overrides, {
    gas: 1_200_000n,
    gasPrice: 100_000_000n,
  });
});

test("does not fetch the network gas price when no gasPrice override is requested", async () => {
  let calls = 0;
  const overrides = await resolveSafeContractWriteFeeOverrides({ gas: 500_000n }, async () => {
    calls += 1;
    return 50_000_000n;
  });

  assert.deepEqual(overrides, { gas: 500_000n });
  assert.equal(calls, 0);
});

test("rejects invalid or excessive gas limits", async () => {
  await assert.rejects(
    resolveSafeContractWriteFeeOverrides({ gas: 0n }, async () => 50_000_000n),
    /gas must be greater than zero/,
  );
  await assert.rejects(
    resolveSafeContractWriteFeeOverrides({ gas: MAX_CONTRACT_WRITE_GAS + 1n }, async () => 50_000_000n),
    /gas must not exceed/,
  );
});

test("rejects invalid or excessive gas prices", async () => {
  const networkGasPrice = 50_000_000n;
  await assert.rejects(
    resolveSafeContractWriteFeeOverrides({ gasPrice: 0n }, async () => networkGasPrice),
    /gasPrice must be greater than zero/,
  );
  await assert.rejects(
    resolveSafeContractWriteFeeOverrides(
      { gasPrice: networkGasPrice * MAX_GAS_PRICE_MULTIPLIER + 1n },
      async () => networkGasPrice,
    ),
    /exceeds the runtime safety limit/,
  );
  await assert.rejects(
    resolveSafeContractWriteFeeOverrides({ gasPrice: 1n }, async () => 0n),
    /invalid network gas price/,
  );
});
