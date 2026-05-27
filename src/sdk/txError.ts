export type TxErrorKind = "userRejected" | "walletDisconnected" | "wrongNetwork" | "insufficientFunds" | "simulationFailed" | "reverted" | "unknown";

type TxErrorMessageMap = Partial<Record<TxErrorKind, string>>;

const defaultMessages: Record<TxErrorKind, string> = {
  userRejected: "You rejected the wallet request.",
  walletDisconnected: "Connect a wallet before sending this transaction.",
  wrongNetwork: "Switch the wallet to the required chain before sending this transaction.",
  insufficientFunds: "Insufficient wallet balance to complete this transaction.",
  simulationFailed: "The transaction could not pass simulation.",
  reverted: "The contract rejected this transaction.",
  unknown: "Transaction failed. Please check your wallet and try again.",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function collectMessages(error: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (depth > 4 || error == null || seen.has(error)) return [];
  seen.add(error);

  if (typeof error === "string") return [error];
  if (!isObject(error)) return [];

  const messages = [
    readString(error.shortMessage),
    readString(error.message),
    readString(error.details),
    readString(error.reason),
  ].filter(Boolean);

  return [...messages, ...collectMessages(error.cause, depth + 1, seen)];
}

function collectCodes(error: unknown, depth = 0, seen = new Set<unknown>()): Array<string | number> {
  if (depth > 4 || error == null || seen.has(error)) return [];
  seen.add(error);
  if (!isObject(error)) return [];

  const codes = [error.code, error.name].filter((value) => typeof value === "string" || typeof value === "number");
  return [...codes, ...collectCodes(error.cause, depth + 1, seen)];
}

export function getTxErrorKind(error: unknown): TxErrorKind {
  const message = collectMessages(error).join(" ").toLowerCase();
  const codes = collectCodes(error)
    .map((value: string | number) => String(value).toLowerCase())
    .join(" ");

  if (
    codes.includes("4001") ||
    codes.includes("action_rejected") ||
    codes.includes("userrejectedrequesterror") ||
    /user rejected|user denied|rejected the request|denied transaction|request rejected|cancelled/i.test(message)
  ) {
    return "userRejected";
  }

  if (/wallet is not connected|connector not connected|account not found|no wallet client/i.test(message)) {
    return "walletDisconnected";
  }

  if (/wrong network|switch wallet to|switch network to|required chain/i.test(message)) {
    return "wrongNetwork";
  }

  if (/insufficient funds|exceeds the balance|gas \* price \+ value/i.test(message)) {
    return "insufficientFunds";
  }

  if (/simulation failed|simulatecontract|execution reverted during simulation/i.test(message)) {
    return "simulationFailed";
  }

  if (/execution reverted|reverted with the following reason|contract function .* reverted|call exception/i.test(message)) {
    return "reverted";
  }

  return "unknown";
}

export function handleTxError(error: unknown, messages?: TxErrorMessageMap) {
  const kind = getTxErrorKind(error);
  return messages?.[kind] ?? defaultMessages[kind];
}
