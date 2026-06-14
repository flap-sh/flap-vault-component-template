import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "./utils";

type AlertTone = "info" | "success" | "warning" | "danger";

const toneClass: Record<AlertTone, string> = {
  info: "border-[#3f5f8f] bg-[#17243a] text-[#d8e2ef]",
  success: "border-[#35d39d]/35 bg-[#173c39] text-[#8ff4c8]",
  warning: "border-[#f2c94c]/35 bg-[#42381f] text-[#fff0b8]",
  danger: "border-[#ff6b6b]/35 bg-[#4a1f27] text-[#ffc4c4]",
};

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

export function Alert({ children, tone = "info", className }: { children: ReactNode; tone?: AlertTone; className?: string }) {
  const Icon = iconMap[tone];
  return (
    <div data-flap-ui="alert" className={cn("flex gap-3 rounded-md border p-3 text-sm font-medium leading-6", toneClass[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-90" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
