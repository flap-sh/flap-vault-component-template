export interface ContractEventBlockRange {
  fromBlock: bigint;
  toBlock: bigint;
}

export const MAX_CONTRACT_EVENT_BLOCK_SPAN = 1_000n;
export const MAX_CONTRACT_EVENT_BLOCK_LOOKBACK = 20_000n;
export const CONTRACT_EVENT_QUERY_CONCURRENCY = 4;

export function splitContractEventBlockRanges(
  fromBlock: bigint,
  toBlock: bigint,
  maxBlockSpan = MAX_CONTRACT_EVENT_BLOCK_SPAN,
  maxLookback = MAX_CONTRACT_EVENT_BLOCK_LOOKBACK,
): ContractEventBlockRange[] {
  if (fromBlock < 0n || toBlock < 0n) {
    throw new RangeError("Contract event block numbers must not be negative.");
  }
  if (maxBlockSpan <= 0n) {
    throw new RangeError("Contract event block span must be greater than zero.");
  }
  if (maxLookback < 0n) {
    throw new RangeError("Contract event block lookback must not be negative.");
  }
  if (toBlock < fromBlock) return [];
  if (toBlock - fromBlock > maxLookback) {
    throw new RangeError(`Contract event block range must not exceed ${maxLookback.toString()} blocks.`);
  }

  const ranges: ContractEventBlockRange[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const candidateEnd = cursor + maxBlockSpan;
    const chunkEnd = candidateEnd < toBlock ? candidateEnd : toBlock;
    ranges.push({ fromBlock: cursor, toBlock: chunkEnd });
    cursor = chunkEnd + 1n;
  }
  return ranges;
}

export async function readContractEventsInBlockRanges<T>(input: {
  fromBlock: bigint;
  toBlock: bigint;
  readRange: (range: ContractEventBlockRange) => Promise<T[]>;
  concurrency?: number;
}): Promise<T[]> {
  const concurrency = input.concurrency ?? CONTRACT_EVENT_QUERY_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > CONTRACT_EVENT_QUERY_CONCURRENCY) {
    throw new RangeError(`Contract event query concurrency must be between 1 and ${CONTRACT_EVENT_QUERY_CONCURRENCY}.`);
  }

  const ranges = splitContractEventBlockRanges(input.fromBlock, input.toBlock);
  const events: T[] = [];
  for (let index = 0; index < ranges.length; index += concurrency) {
    const batch = ranges.slice(index, index + concurrency);
    const batchEvents = await Promise.all(batch.map((range) => input.readRange(range)));
    for (const items of batchEvents) events.push(...items);
  }
  return events;
}
