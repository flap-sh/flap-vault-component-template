import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "./utils";

type AlertTone = "info" | "success" | "warning" | "danger";

const toneClass: Record<AlertTone, string> = {
  info: "border-[#303236] bg-black text-[#D4D4D4]",
  success: "border-[#D0FF00]/45 bg-[#101400] text-[#D0FF00]",
  warning: "border-[#FFD166]/45 bg-[#1A1305] text-[#FFD166]",
  danger: "border-[#FF4A55]/55 bg-[#1D0709] text-[#FF8A91]",
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
    <div data-flap-ui="alert" className={cn("flex gap-3 rounded-[6px] border p-3 text-sm font-medium leading-6", toneClass[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-90" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
