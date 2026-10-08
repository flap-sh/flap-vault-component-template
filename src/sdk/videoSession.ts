import { getTaxVaultHostChainConfig } from "./hostRuntimeConfig";
import { isIpfsImageCid } from "./ipfsImage";
import { isValidAddress, ZERO_ADDRESS } from "./taxInfo";
import type { Address, FlapVaultSdk } from "./types";

// Provider views only. The consumer is a lookup key, never a contract-call target.
const videoProviderAbi = [
  { type: "function", name: "getVideoSessionLength", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getVideoSessionSlice", stateMutability: "view", inputs: [{ name: "user", type: "address" }, { name: "start", type: "uint256" }, { name: "count", type: "uint256" }], outputs: [{ name: "clips", type: "tuple[]", components: [
    { name: "requestId", type: "uint256" }, { name: "videoCid", type: "string" }, { name: "lastFrameCid", type: "string" },
    { name: "durationMs", type: "uint32" }, { name: "startPtsMs", type: "uint64" }, { name: "createdAt", type: "uint64" }, { name: "referenceType", type: "uint8" },
  ] }] },
] as const;

export interface ConsumerVideoClip {
  index: number;
  requestId: bigint;
  videoCid: string;
  lastFrameCid: string;
  durationMs: number;
  startPtsMs: bigint;
  createdAt: bigint;
  referenceType: number;
}

export interface ConsumerVideoSessionReader {
  readLength(): Promise<number>;
  readSlice(start: number, count: number): Promise<readonly ConsumerVideoClip[]>;
}

export class VideoSessionReadError extends Error {
  constructor(public readonly code: "unsupported" | "invalid" | "error", message: string) {
    super(message);
    this.name = "VideoSessionReadError";
  }
}

type VideoSdk = { context: Pick<FlapVaultSdk["context"], "chainId">; readContract: FlapVaultSdk["readContract"] };
const MAX_SLICE = 50;

function providerTarget(sdk: VideoSdk, consumer: Address) {
  if (!isValidAddress(consumer) || consumer.toLowerCase() === ZERO_ADDRESS) {
    throw new VideoSessionReadError("invalid", "Invalid video consumer address.");
  }
  const provider = getTaxVaultHostChainConfig(sdk.context.chainId)?.aiProvider;
  if (!provider) throw new VideoSessionReadError("unsupported", "Video sessions are not configured for this chain.");
  return provider;
}

export async function readVideoSessionLength(sdk: VideoSdk, consumer: Address): Promise<number> {
  const value = await sdk.readContract<bigint>({ address: providerTarget(sdk, consumer), abi: videoProviderAbi, functionName: "getVideoSessionLength", args: [consumer] });
  if (typeof value !== "bigint" || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new VideoSessionReadError("invalid", "Invalid video session length.");
  }
  return Number(value);
}

export async function readVideoSessionSlice(sdk: VideoSdk, consumer: Address, start: number, count: number): Promise<readonly ConsumerVideoClip[]> {
  const address = providerTarget(sdk, consumer);
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 1 || count > MAX_SLICE || !Number.isSafeInteger(start + count)) {
    throw new VideoSessionReadError("invalid", "Video slice must contain 1 to 50 clips at a valid index.");
  }
  const value = await sdk.readContract<unknown>({ address, abi: videoProviderAbi, functionName: "getVideoSessionSlice", args: [consumer, BigInt(start), BigInt(count)] });
  if (!Array.isArray(value) || value.length > count) throw new VideoSessionReadError("invalid", "Invalid video session slice.");
  return value.map((item: unknown, offset: number) => {
    if (!item || typeof item !== "object") throw new VideoSessionReadError("invalid", "Invalid video clip.");
    const clip = item as Omit<ConsumerVideoClip, "index">;
    if (typeof clip.videoCid !== "string" || !isIpfsImageCid(clip.videoCid) || !Number.isSafeInteger(clip.durationMs) || clip.durationMs <= 0 || clip.durationMs > 0xffffffff ||
        typeof clip.startPtsMs !== "bigint" || clip.startPtsMs < 0n || clip.startPtsMs > 0xffffffffffffffffn ||
        typeof clip.requestId !== "bigint" || clip.requestId < 0n || typeof clip.createdAt !== "bigint" || clip.createdAt < 0n ||
        typeof clip.lastFrameCid !== "string" || clip.lastFrameCid.length > 128 || !Number.isInteger(clip.referenceType) || clip.referenceType < 0 || clip.referenceType > 255) {
      throw new VideoSessionReadError("invalid", "Invalid video clip metadata.");
    }
    return { index: start + offset, requestId: clip.requestId, videoCid: clip.videoCid, lastFrameCid: clip.lastFrameCid, durationMs: clip.durationMs, startPtsMs: clip.startPtsMs, createdAt: clip.createdAt, referenceType: clip.referenceType };
  });
}

/** Uses the host's shared chain client; callers cannot supply a provider or RPC. */
export function createConsumerVideoSessionReader(sdk: VideoSdk, consumer: Address): ConsumerVideoSessionReader {
  return { readLength: () => readVideoSessionLength(sdk, consumer), readSlice: (start, count) => readVideoSessionSlice(sdk, consumer, start, count) };
}
