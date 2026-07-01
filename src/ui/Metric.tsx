import { ReactNode } from "react";
import { cn } from "./utils";

type MetricTone = "default" | "primary" | "success" | "warning" | "muted";

const toneClass: Record<MetricTone, string> = {
  default: "border-[#303236] bg-[#0B0D0E]",
  primary: "border-[#D0FF00]/70 bg-[#101400]",
  success: "border-[#2EDEDB]/45 bg-[#061615]",
  warning: "border-[#FFD166]/45 bg-[#1A1305]",
  muted: "border-[#303236] bg-black",
};

const valueToneClass: Record<MetricTone, string> = {
  default: "text-white",
  primary: "text-[#D0FF00]",
  success: "text-[#2EDEDB]",
  warning: "text-[#FFD166]",
  muted: "text-white",
};

interface MetricProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricTone;
  className?: string;
}

export function Metric({ label, value, hint, tone = "default", className }: MetricProps) {
  return (
    <div data-flap-ui="metric" className={cn("rounded-[6px] border p-3", toneClass[tone], className)}>
      <div className="truncate text-xs font-medium uppercase leading-[1.4] text-[#84888C]">{label}</div>
      <div className={cn("mt-2 break-words text-xl font-semibold tracking-normal", valueToneClass[tone])}>{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-[#D4D4D4]">{hint}</div> : null}
    </div>
  );
}
