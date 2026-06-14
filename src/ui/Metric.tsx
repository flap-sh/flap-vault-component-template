import { ReactNode } from "react";
import { cn } from "./utils";

type MetricTone = "default" | "primary" | "success" | "warning" | "muted";

const toneClass: Record<MetricTone, string> = {
  default: "border-[#40536c] bg-[#304057]",
  primary: "border-[#3b82f6]/55 bg-[#17325a]",
  success: "border-[#35d39d]/40 bg-[#173c39]",
  warning: "border-[#f2c94c]/40 bg-[#42381f]",
  muted: "border-[#33445b] bg-[#172131]",
};

const valueToneClass: Record<MetricTone, string> = {
  default: "text-white",
  primary: "text-[#8fb7ff]",
  success: "text-[#6ff0bc]",
  warning: "text-[#ffe08a]",
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
    <div data-flap-ui="metric" className={cn("rounded-md border p-3", toneClass[tone], className)}>
      <div className="text-xs font-medium text-[#a9b6c8]">{label}</div>
      <div className={cn("mt-2 break-words text-xl font-semibold tracking-normal", valueToneClass[tone])}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-[#d8e2ef]">{hint}</div> : null}
    </div>
  );
}
