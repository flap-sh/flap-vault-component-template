import { useEffect, useMemo, useState } from "react";

function formatMs(ms: number) {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function Countdown({ targetTimeMs, fallback = "-" }: { targetTimeMs?: number; fallback?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const text = useMemo(() => {
    if (!targetTimeMs) return fallback;
    return formatMs(targetTimeMs - now);
  }, [fallback, now, targetTimeMs]);

  return <span>{text}</span>;
}
