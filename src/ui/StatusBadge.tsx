import { ReactNode } from "react";
import { cn } from "./utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger";

const toneClass: Record<StatusTone, string> = {
  neutral: "border-[#303236] bg-black text-[#D4D4D4]",
  success: "border-[#D0FF00]/65 bg-[#101400] text-[#D0FF00]",
  warning: "border-[#FFD166]/55 bg-[#1A1305] text-[#FFD166]",
  danger: "border-[#FF4A55]/65 bg-[#1D0709] text-[#FF8A91]",
};

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return (
    <span data-flap-ui="status-badge" className={cn("inline-flex items-center rounded-[6px] border px-2.5 py-1 text-xs font-semibold uppercase leading-none", toneClass[tone])}>
      {children}
    </span>
  );
}
