import { ReactNode } from "react";
import { cn } from "./utils";

type DetailTileTone = "default" | "primary" | "success" | "warning" | "muted";

const toneClass: Record<DetailTileTone, string> = {
  default: "border-[#40536c] bg-[#304057]",
  primary: "border-[#3b82f6]/60 bg-[#17325a]",
  success: "border-[#35d39d]/40 bg-[#173c39]",
  warning: "border-[#f2c94c]/40 bg-[#42381f]",
  muted: "border-[#33445b] bg-[#172131]",
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
    <div data-flap-ui="detail-tile" className={cn("min-w-0 rounded-md border p-3", toneClass[tone], className)}>
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#a9b6c8]">
        {icon ? <span className="shrink-0 text-[#8fb7ff]">{icon}</span> : null}
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className={cn("mt-2 min-w-0 break-words text-base font-semibold leading-snug text-white", valueClassName)}>
        {value}
      </div>
      {detail ? <div className="mt-1 min-w-0 break-words text-xs leading-5 text-[#8d9caf]">{detail}</div> : null}
    </div>
  );
}
