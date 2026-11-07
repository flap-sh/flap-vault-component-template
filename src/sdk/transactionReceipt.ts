import type { Hash, TransactionReceipt } from "viem";

export interface TransactionReceiptPollingClient {
  getTransactionReceipt(request: { hash: Hash }): Promise<unknown>;
}

export interface TransactionReceiptPollingOptions {
  timeout?: number;
  pollingInterval?: number;
  requestTimeout?: number;
}

/** The transaction may still be pending or mined. A timeout never authorizes resubmission. */
export class TransactionReceiptPollingTimeoutError extends Error {
  readonly hash: Hash;
  readonly lastError: unknown;
  constructor(hash: Hash, lastError?: unknown) {
    super(`Transaction ${hash} could not be confirmed before the deadline. Its result is unknown; check this hash before sending another transaction.`);
    this.name = "TransactionReceiptPollingTimeoutError";
    this.hash = hash;
    this.lastError = lastError;
  }
}

export class InvalidTransactionReceiptError extends Error {
  readonly hash: Hash;
  constructor(hash: Hash) {
    super("The public RPC returned an invalid or mismatched transaction receipt.");
    this.name = "InvalidTransactionReceiptError";
    this.hash = hash;
  }
}

class TransactionReceiptRequestTimeoutError extends Error {
  constructor() {
    super("The public RPC receipt request exceeded its deadline.");
    this.name = "TransactionReceiptRequestTimeoutError";
  }
}

function assertTimer(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new Error(`${name} must be a positive timer duration in milliseconds.`);
  }
}

function isPermanentRpcError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  // Viem wraps JSON-RPC errors in a cause chain. Inspect codes, never error messages or URLs.
  for (let depth = 0; depth < 8 && current && typeof current === "object" && !seen.has(current); depth += 1) {
    seen.add(current);
    const item = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (item.code === -32600 || item.code === -32601 || item.code === -32602
      || item.name === "InvalidParamsRpcError" || item.name === "InvalidRequestRpcError"
      || item.name === "MethodNotFoundRpcError") return true;
    current = item.cause;
  }
  return false;
}

function validateReceipt(receipt: unknown, hash: Hash): TransactionReceipt {
  if (!receipt || typeof receipt !== "object") throw new InvalidTransactionReceiptError(hash);
  const item = receipt as Partial<TransactionReceipt>;
  if (typeof item.transactionHash !== "string" || !/^0x[\da-f]{64}$/i.test(item.transactionHash)
    || item.transactionHash.toLowerCase() !== hash.toLowerCase()
    || (item.status !== "success" && item.status !== "reverted")
    || typeof item.blockNumber !== "bigint" || item.blockNumber < 0n
    || !Array.isArray(item.logs)) throw new InvalidTransactionReceiptError(hash);
  return receipt as TransactionReceipt;
}

/** Poll the original hash on a fixed public client; never submits or follows replacement transactions. */
export function pollTransactionReceipt(
  client: TransactionReceiptPollingClient,
  hash: Hash,
  options: TransactionReceiptPollingOptions = {},
): Promise<TransactionReceipt> {
  const { timeout = 180_000, pollingInterval = 2_000, requestTimeout = 8_000 } = options;
  if (typeof hash !== "string" || !/^0x[\da-f]{64}$/i.test(hash)) return Promise.reject(new Error("A valid 32-byte transaction hash is required."));
  if (!client || typeof client.getTransactionReceipt !== "function") return Promise.reject(new Error("A public client with getTransactionReceipt is required."));
  try {
    assertTimer(timeout, "timeout");
    assertTimer(pollingInterval, "pollingInterval");
    assertTimer(requestTimeout, "requestTimeout");
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    let active = true;
    let lastError: unknown;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      active = false;
      clearTimeout(deadlineTimer);
      clearTimeout(pollTimer);
      clearTimeout(requestTimer);
    };
    const fail = (error: unknown) => {
      if (!active) return;
      cleanup();
      reject(error);
    };
    // Independent of RPC settlement: an unresponsive public provider cannot disable this bound.
    const deadlineTimer = setTimeout(() => fail(new TransactionReceiptPollingTimeoutError(hash, lastError)), timeout);
    const schedule = () => {
      if (active) pollTimer = setTimeout(attempt, pollingInterval);
    };
    const attempt = () => {
      if (!active) return;
      let settled = false;
      const finishRequest = () => {
        if (!active || settled) return false;
        settled = true;
        clearTimeout(requestTimer);
        requestTimer = undefined;
        return true;
      };
      const onError = (error: unknown) => {
        if (!finishRequest()) return;
        lastError = error;
        if (isPermanentRpcError(error)) fail(error);
        else schedule();
      };
      requestTimer = setTimeout(() => onError(new TransactionReceiptRequestTimeoutError()), requestTimeout);
      // Both handlers stay attached after timeout, consuming late results/rejections without restarting polling.
      try {
        Promise.resolve(client.getTransactionReceipt({ hash })).then((receipt) => {
          if (!finishRequest()) return;
          if (receipt === null) {
            schedule();
            return;
          }
          try {
            const valid = validateReceipt(receipt, hash);
            cleanup();
            resolve(valid);
          } catch (error) {
            fail(error);
          }
        }, onError);
      } catch (error) {
        onError(error);
      }
    };
    attempt();
  });
}
