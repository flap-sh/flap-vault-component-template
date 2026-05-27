import { ReactNode } from "react";
import { cn } from "./utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger";

const toneClass: Record<StatusTone, string> = {
  neutral: "border-[#5d6f86] bg-[#2d3b50] text-[#d8e2ef]",
  success: "border-[#35d39d]/45 bg-[#176755]/55 text-[#78f2bf]",
  warning: "border-[#f2c94c]/45 bg-[#59451f]/55 text-[#ffe08a]",
  danger: "border-[#ff6b6b]/45 bg-[#5f2027]/55 text-[#ffb2b2]",
};

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold leading-none", toneClass[tone])}>
      {children}
    </span>
  );
}
