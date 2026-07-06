import * as React from "react";
import { createPortal } from "react-dom";
import { ExternalLink as ExternalLinkIcon, X as CloseIcon } from "lucide-react";
import { Button } from "./Button";
import { cn } from "./utils";

type ExternalLinkLocale = "en" | "zh";

interface ExternalLinkCopy {
  title: string;
  heading: string;
  description: string;
  destinationLabel: string;
  acknowledge: string;
  cancel: string;
  proceed: string;
}

const COPY: Record<ExternalLinkLocale, ExternalLinkCopy> = {
  en: {
    title: "THIRD-PARTY WARNING",
    heading: "YOU ARE LEAVING FLAP",
    description:
      "You are about to visit a third-party page maintained by an external developer. This site is not operated by FLAP and may contain unknown security or privacy risks.",
    destinationLabel: "Destination",
    acknowledge: "I understand the risks and want to proceed",
    cancel: "CLOSE",
    proceed: "CONTINUE",
  },
  zh: {
    title: "第三方风险提示",
    heading: "您即将离开 FLAP",
    description:
      "您即将访问由外部开发者维护的第三方页面。该站点不由 FLAP 运营，可能存在未知的安全或隐私风险。",
    destinationLabel: "目标地址",
    acknowledge: "我已了解风险并希望继续",
    cancel: "关闭",
    proceed: "继续",
  },
};

export interface ExternalLinkProps {
  /** Absolute HTTPS destination. Shown to the user and opened only after explicit consent. */
  url: string;
  /** Trigger content (the visible link text or element). */
  children: React.ReactNode;
  /** Active locale for the built-in warning copy. Defaults to "en". */
  locale?: string;
  /** Class applied to the inline trigger button. */
  className?: string;
  /** Optional per-field copy overrides for the warning dialog. */
  copy?: Partial<ExternalLinkCopy>;
}

function resolveLocale(locale?: string): ExternalLinkLocale {
  return locale && locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function WarningIcon({ className }: { className?: string }) {
  // Chunky, crisp-edged warning triangle matching the Flap terminal aesthetic.
  return (
    <svg
      viewBox="0 0 48 44"
      role="img"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="#FF7A1A"
      strokeWidth={3}
      strokeLinejoin="miter"
      strokeLinecap="square"
      shapeRendering="crispEdges"
    >
      <path d="M24 4 L46 42 L2 42 Z" />
      <rect x="22" y="17" width="4" height="12" fill="#FF7A1A" stroke="none" />
      <rect x="22" y="33" width="4" height="4" fill="#FF7A1A" stroke="none" />
    </svg>
  );
}

/**
 * ExternalLink is the sanctioned way to send a user to a non-allowlisted external
 * site. It intercepts navigation, shows a third-party risk warning, and only opens
 * the destination (in a new tab, with noopener/noreferrer) after the user checks the
 * risk-acknowledgement box and confirms.
 */
export function ExternalLink({ url, children, locale, className, copy }: ExternalLinkProps) {
  const [open, setOpen] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const text = { ...COPY[resolveLocale(locale)], ...copy };

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const close = React.useCallback(() => {
    setOpen(false);
    setAcknowledged(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const proceed = () => {
    if (!acknowledged) return;
    window.open(url, "_blank", "noopener,noreferrer");
    close();
  };

  return (
    <>
      <button
        type="button"
        data-flap-ui="external-link"
        onClick={() => setOpen(true)}
        className={cn("inline-flex min-w-0 items-center gap-1 text-primary hover:underline", className)}
      >
        <span className="truncate">{children}</span>
        <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>

      {open && mounted ? (
        createPortal(
          <div
            className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            style={{ zIndex: 2147483647 }}
            onClick={close}
          >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={text.title}
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(520px, 100%)", maxHeight: "calc(100vh - 2rem)" }}
            className="flex w-[min(520px,100%)] max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-sm border border-primary bg-black font-mono text-white shadow-panel"
          >
            <div className="flex items-center justify-between border-b border-primary/60 px-4 py-3 sm:px-5">
              <span className="truncate text-sm font-semibold uppercase tracking-wider sm:text-base">
                <span className="text-[#D0FF00]">{"//"}</span>
                {text.title}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label={text.cancel}
                className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#303236] text-[#D4D4D4] hover:border-primary hover:text-primary"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8">
              <WarningIcon className="mx-auto h-16 w-16 sm:h-20 sm:w-20" />
              <h2 className="text-center text-lg font-semibold uppercase tracking-wide sm:text-xl">{text.heading}</h2>
              <p className="text-xs leading-6 text-[#A3A3A3] sm:text-sm">{text.description}</p>

              <div className="min-w-0 border border-[#262626] bg-[#0A0A0A] px-3 py-2 text-[11px] sm:text-xs">
                <div className="mb-1 uppercase tracking-wider text-[#6B7280]">{text.destinationLabel}</div>
                <div className="truncate text-[#D4D4D4]" title={url}>
                  {safeHost(url)}
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 text-xs text-[#D4D4D4] sm:text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border",
                    acknowledged ? "border-[#D0FF00] bg-[#D0FF00] text-black" : "border-[#4B5563] bg-transparent",
                  )}
                >
                  {acknowledged ? (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2 6.5 L5 9 L10 3" strokeLinecap="square" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0">{text.acknowledge}</span>
              </label>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <Button variant="outline" size="lg" className="w-full sm:flex-1" onClick={close}>
                  {text.cancel}
                </Button>
                <Button variant="default" size="lg" className="w-full sm:flex-1" disabled={!acknowledged} onClick={proceed}>
                  {text.proceed}
                </Button>
              </div>
            </div>
          </div>
          </div>,
          document.body,
        )
      ) : null}
    </>
  );
}
