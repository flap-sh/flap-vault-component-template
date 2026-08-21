import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension here.
// @ts-expect-error allowImportingTsExtensions is intentionally not global.
import { CONTRACT_EVENT_QUERY_CONCURRENCY, MAX_CONTRACT_EVENT_BLOCK_LOOKBACK, readContractEventsInBlockRanges, splitContractEventBlockRanges } from "./contractEvents.ts";

test("keeps a provider-supported event range in one request", () => {
  assert.deepEqual(splitContractEventBlockRanges(10_000n, 11_000n), [
    { fromBlock: 10_000n, toBlock: 11_000n },
  ]);
});

test("splits the maximum event lookback without gaps or overlaps", () => {
  const ranges = splitContractEventBlockRanges(100_000n, 100_000n + MAX_CONTRACT_EVENT_BLOCK_LOOKBACK);

  assert.equal(ranges.length, 20);
  assert.deepEqual(ranges[0], { fromBlock: 100_000n, toBlock: 101_000n });
  assert.deepEqual(ranges.at(-1), { fromBlock: 119_019n, toBlock: 120_000n });
  for (let index = 1; index < ranges.length; index += 1) {
    assert.equal(ranges[index].fromBlock, ranges[index - 1].toBlock + 1n);
  }
});

test("rejects unsafe event ranges and invalid limits", () => {
  assert.throws(() => splitContractEventBlockRanges(-1n, 1n), /must not be negative/);
  assert.throws(
    () => splitContractEventBlockRanges(0n, MAX_CONTRACT_EVENT_BLOCK_LOOKBACK + 1n),
    /must not exceed/,
  );
  assert.throws(() => splitContractEventBlockRanges(0n, 1n, 0n), /must be greater than zero/);
  assert.deepEqual(splitContractEventBlockRanges(2n, 1n), []);
});

test("reads event chunks with bounded concurrency and stable block order", async () => {
  let active = 0;
  let maximumActive = 0;
  const events = await readContractEventsInBlockRanges<string>({
    fromBlock: 0n,
    toBlock: 4_000n,
    concurrency: 2,
    readRange: async ({ fromBlock, toBlock }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return [`${fromBlock.toString()}-${toBlock.toString()}`];
    },
  });

  assert.equal(maximumActive, 2);
  assert.deepEqual(events, ["0-1000", "1001-2001", "2002-3002", "3003-4000"]);
  await assert.rejects(
    readContractEventsInBlockRanges({
      fromBlock: 0n,
      toBlock: 1n,
      concurrency: CONTRACT_EVENT_QUERY_CONCURRENCY + 1,
      readRange: async () => [],
    }),
    /query concurrency must be between/,
  );
});
