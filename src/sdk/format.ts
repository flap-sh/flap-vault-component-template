import Decimal from "decimal.js";
import { formatUnits, parseUnits } from "viem";

export function shortenAddress(raw?: string, start = 6, end = 4) {
  if (!raw) return "";
  if (raw.length <= start + end) return raw;
  return `${raw.slice(0, start)}...${raw.slice(-end)}`;
}

export function formatTokenAmount(value?: bigint | string | number | null, decimals = 18, precision = 4) {
  if (value === undefined || value === null) return "-";
  const raw = typeof value === "bigint" ? formatUnits(value, decimals) : String(value);
  return new Decimal(raw).toDecimalPlaces(precision, Decimal.ROUND_DOWN).toString();
}

export function parseTokenAmount(value: string, decimals = 18) {
  if (!/^\d*(\.\d*)?$/.test(value.trim())) {
    throw new Error("Invalid decimal amount.");
  }
  return parseUnits(value || "0", decimals);
}

export function formatPercentBps(value?: bigint | number | null, precision = 2) {
  if (value === undefined || value === null) return "-";
  return `${new Decimal(String(value)).div(100).toDecimalPlaces(precision).toString()}%`;
}

export function formatCountdown(targetTimeMs?: number) {
  if (!targetTimeMs) return "-";
  const diff = Math.max(0, targetTimeMs - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
