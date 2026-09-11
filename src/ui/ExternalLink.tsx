import * as React from "react";
import { createPortal } from "react-dom";
import { ExternalLink as ExternalLinkIcon, X as CloseIcon } from "lucide-react";
import { cn } from "./utils";

type ExternalLinkLocale = "en" | "zh";

interface ExternalLinkCopy {
  title: string;
  heading: string;
  description: string;
  destinationLabel: string;
  invalidDestination: string;
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
    invalidDestination: "Unsupported destination",
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
    invalidDestination: "不支持的目标地址",
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

function normalizeExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function WarningIcon({ className }: { className?: string }) {
  // Pixel-art warning triangle, exported from Figma (node 1196:9849). Color via currentColor.
  return (
    <svg viewBox="0 0 80 80" fill="currentColor" aria-hidden="true" shapeRendering="crispEdges" className={className}>
      <rect x="32.4395" y="11.7969" width="2.62997" height="6.57492" />
      <rect width="2.62997" height="6.57492" transform="matrix(-1 0 0 1 47.5605 11.7969)" />
      <rect x="35.0693" y="9.16699" width="2.62997" height="5.25994" />
      <rect x="37.6982" y="9.16699" width="4.60245" height="2.62997" />
      <rect x="38.333" y="6.66699" width="3.33333" height="2.5" />
      <rect width="2.62997" height="5.25994" transform="matrix(-1 0 0 1 44.9307 9.16699)" />
      <rect x="29.8086" y="16.3989" width="2.62997" height="6.57492" />
      <rect width="2.62997" height="6.57492" transform="matrix(-1 0 0 1 50.1914 16.3989)" />
      <rect x="27.1787" y="21.6592" width="2.62997" height="5.91743" />
      <rect width="2.62997" height="5.91743" transform="matrix(-1 0 0 1 52.8213 21.6592)" />
      <rect x="24.5488" y="24.2891" width="2.62997" height="7.23242" />
      <rect width="2.62997" height="7.23242" transform="matrix(-1 0 0 1 55.4512 24.2891)" />
      <rect x="21.9189" y="29.5488" width="2.62997" height="7.23242" />
      <rect width="2.62997" height="7.23242" transform="matrix(-1 0 0 1 58.0811 29.5488)" />
      <rect x="19.2891" y="34.8086" width="2.62997" height="7.23242" />
      <rect width="2.62997" height="7.23242" transform="matrix(-1 0 0 1 60.7109 34.8086)" />
      <rect x="16.6592" y="40.0693" width="2.62997" height="5.91743" />
      <rect width="2.62997" height="5.91743" transform="matrix(-1 0 0 1 63.3408 40.0693)" />
      <rect x="14.0293" y="44.6709" width="2.62997" height="5.91743" />
      <rect width="2.62997" height="5.91743" transform="matrix(-1 0 0 1 65.9707 44.6709)" />
      <rect x="11.3984" y="48.6165" width="2.62997" height="5.91743" />
      <rect width="2.62997" height="5.91743" transform="matrix(-1 0 0 1 68.6016 48.6165)" />
      <rect x="8.76855" y="53.8762" width="2.62997" height="5.91743" />
      <rect width="2.62997" height="5.91743" transform="matrix(-1 0 0 1 71.2314 53.8762)" />
      <rect x="6.13965" y="58.4783" width="2.62997" height="5.91743" />
      <rect width="2.62997" height="5.91743" transform="matrix(-1 0 0 1 73.8604 58.4783)" />
      <rect x="4.16699" y="62.4236" width="2.62997" height="5.91743" />
      <rect width="2.62997" height="5.91743" transform="matrix(-1 0 0 1 75.833 62.4236)" />
      <rect x="6.79688" y="68.3406" width="2.62997" height="2.62997" />
      <rect x="70.5742" y="68.3406" width="2.62997" height="2.62997" />
      <rect x="9.42578" y="70.9709" width="61.1468" height="2.62997" />
      <rect x="38.333" y="30.833" width="4.16667" height="22.5" />
      <rect x="38.333" y="57.5" width="4.16667" height="4.16667" />
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
  const safeUrl = React.useMemo(() => normalizeExternalUrl(url), [url]);
  const canProceed = acknowledged && Boolean(safeUrl);

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
    if (!canProceed || !safeUrl) return;
    window.open(safeUrl, "_blank", "noopener,noreferrer");
    close();
  };

  return (
    <>
      <button
        type="button"
        data-flap-ui="external-link"
        onClick={() => setOpen(true)}
        className={cn("inline-flex min-w-0 items-center gap-1 text-[#d0ff00] hover:underline", className)}
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
            style={{
              width: "min(540px, 100%)",
              maxHeight: "calc(100vh - 2rem)",
              fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
              backgroundColor: "#070808",
              border: "1px solid #414141",
            }}
            className="flex w-[min(540px,100%)] max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[4px] text-white shadow-panel"
          >
            <div
              className="flex items-center justify-between border-b border-[#484b51] px-6 py-[14px]"
              style={{ boxSizing: "border-box", height: "49px", lineHeight: 1 }}
            >
              <span
                className="truncate text-[18px] font-medium uppercase leading-none tracking-[-0.4px]"
                style={{ lineHeight: 1 }}
              >
                <span className="text-[#d0ff00]">{"//"}</span>
                {text.title}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label={text.cancel}
                className="flex size-5 shrink-0 items-center justify-center border border-[#484b51] text-white/80 hover:text-white"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-6 overflow-y-auto p-6">
              <div className="flex flex-col items-center gap-5">
                <WarningIcon className="h-20 w-20 text-[#f68f15]" />
                <h2 className="text-center text-[18px] font-medium uppercase leading-[1.4] tracking-[-0.4px]">{text.heading}</h2>
              </div>

              <p className="text-[14px] leading-[1.4] tracking-[-0.4px] text-[#a0a3a7]">{text.description}</p>

              <div className="min-w-0 border border-[#262626] bg-[#0a0a0a] px-3 py-2 text-[13px]">
                <div className="mb-1 uppercase tracking-[-0.4px] text-[#6b7280]">{text.destinationLabel}</div>
                <div className="truncate text-[#d4d4d4]" title={safeUrl ?? url}>
                  {safeUrl ? new URL(safeUrl).host : text.invalidDestination}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-[14px] leading-[1.4] tracking-[-0.4px] text-white">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center border",
                    acknowledged ? "border-[#d0ff00] bg-[#d0ff00] text-[#070808]" : "border-[#a0a3a7] bg-transparent",
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

              <div className="flex gap-6">
                <button
                  type="button"
                  onClick={close}
                  className="flex flex-1 items-center justify-center rounded-[2px] border border-[#84888c] bg-transparent py-3 text-[14px] font-bold uppercase tracking-[-0.4px] text-white transition-colors hover:border-white"
                >
                  {text.cancel}
                </button>
                <button
                  type="button"
                  onClick={proceed}
                  disabled={!canProceed}
                  style={{ backgroundColor: canProceed ? "#d0ff00" : "#536600", color: "#070808" }}
                  className="flex flex-1 items-center justify-center rounded-[2px] py-3 text-[14px] font-bold uppercase tracking-[-0.4px] transition-colors"
                >
                  {text.proceed}
                </button>
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
