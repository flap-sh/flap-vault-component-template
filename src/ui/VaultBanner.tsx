import { ShieldCheck } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "./utils";

interface VaultBannerProps {
  title: ReactNode;
  description: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function VaultBanner({ title, description, badges, meta, action, icon, className }: VaultBannerProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[#3b82f6] bg-[#172a5a] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#8fc8ff]">
              {icon ?? <ShieldCheck className="h-4 w-4" />}
            </span>
            <h3 className="min-w-0 text-base font-semibold leading-tight text-white">{title}</h3>
            {badges}
          </div>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-[#d8e2ef]">{description}</p>
          {meta ? <div className="mt-2 text-xs font-medium leading-5 text-[#92a4bd]">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}
