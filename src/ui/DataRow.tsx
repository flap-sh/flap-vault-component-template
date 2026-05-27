import { ReactNode } from "react";
import { cn } from "./utils";

interface DataRowProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}

export function DataRow({ label, value, detail, className }: DataRowProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-white/8 py-3 last:border-0", className)}>
      <div className="min-w-0 text-sm text-white/54">{label}</div>
      <div className="min-w-0 text-right">
        <div className="break-words text-sm font-semibold text-white">{value}</div>
        {detail ? <div className="mt-1 text-xs text-white/42">{detail}</div> : null}
      </div>
    </div>
  );
}
