import { ReactNode } from "react";
import { cn } from "./utils";

type DetailTileTone = "default" | "primary" | "success" | "warning" | "muted";

const toneClass: Record<DetailTileTone, string> = {
  default: "border-[#303236] bg-[#0B0D0E]",
  primary: "border-[#D0FF00]/70 bg-[#101400]",
  success: "border-[#2EDEDB]/45 bg-[#061615]",
  warning: "border-[#FFD166]/45 bg-[#1A1305]",
  muted: "border-[#303236] bg-black",
};

interface DetailTileProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: DetailTileTone;
  className?: string;
  valueClassName?: string;
}

export function DetailTile({ label, value, detail, icon, tone = "default", className, valueClassName }: DetailTileProps) {
  return (
    <div data-flap-ui="detail-tile" className={cn("min-w-0 rounded-[6px] border p-3", toneClass[tone], className)}>
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase leading-[1.4] text-[#84888C]">
        {icon ? <span className="shrink-0 text-[#D0FF00]">{icon}</span> : null}
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className={cn("mt-2 min-w-0 break-words text-base font-semibold leading-snug text-white", valueClassName)}>
        {value}
      </div>
      {detail ? <div className="mt-1 min-w-0 break-words text-xs leading-5 text-[#84888C]">{detail}</div> : null}
    </div>
  );
}
