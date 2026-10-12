"use client";

import * as React from "react";
import { Check, Copy, Loader2, AlertCircle } from "lucide-react";
import { useFlapI18n, useFlapNotify } from "../sdk/runtimeStore";
import { Button } from "./Button";
import { cn } from "./utils";
import { getCopyButtonMessages } from "./copyButtonMessages";
import { isCopyableText, writeCopyText } from "./copyText";

export interface CopyButtonProps {
  /** Plain text copied exactly as provided, at most 4096 characters. */
  value: string;
  /** Optional localized visible label. Omit for an icon-only button. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

type CopyStatus = "idle" | "copying" | "copied" | "failed";

/** Shared host-owned copy action for Vault UI and Mini App v2; no wallet/chain required. */
export function CopyButton({ value, label, disabled = false, className }: CopyButtonProps) {
  const i18n = useFlapI18n();
  const notify = useFlapNotify();
  const defaults = getCopyButtonMessages(i18n.locale);
  const text = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, i18n.t(`flap.copy.${key}`, fallback)])) as Record<keyof typeof defaults, string>;
  const [result, setResult] = React.useState<{ value: string; status: CopyStatus }>({ value, status: "idle" });
  const pending = React.useRef(false);
  const mounted = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const status = result.value === value ? result.status : "idle";
  const accessibleLabel = status === "idle" ? label || text.copy : text[status === "failed" ? "failed" : status];

  async function copy(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    // No refs, custom handlers or imperative copy exports: a real user click is required.
    if (!(event.nativeEvent instanceof MouseEvent) || !event.nativeEvent.isTrusted || disabled || pending.current || !isCopyableText(value)) return;
    pending.current = true;
    clearTimeout(timer.current);
    setResult({ value, status: "copying" });
    let copied = false;
    try { copied = await writeCopyText(value); } catch { /* Show a failure without reporting success. */ }
    pending.current = false;
    if (!mounted.current) return;
    setResult({ value, status: copied ? "copied" : "failed" });
    try { if (copied) notify.success(text.copied); else notify.error(text.failed); } catch { /* Host notifications must not change the clipboard result. */ }
    timer.current = setTimeout(() => { if (mounted.current) setResult({ value, status: "idle" }); }, 2000);
  }

  const Icon = status === "copying" ? Loader2 : status === "copied" ? Check : status === "failed" ? AlertCircle : Copy;
  return <Button
    type="button"
    variant="ghost"
    size={label ? "sm" : "icon"}
    className={cn(!label && "h-8 w-8", className)}
    disabled={disabled || !isCopyableText(value)}
    aria-disabled={disabled || pending.current || !isCopyableText(value)}
    aria-label={accessibleLabel}
    aria-busy={status === "copying"}
    title={accessibleLabel}
    onClick={copy}
    data-flap-ui="copy-button"
    data-flap-copy-state={status}
  >
    <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", status === "copying" && "animate-spin")} />
    {label ? <span>{status === "copied" ? text.copied : label}</span> : null}
    <span className="sr-only" role="status" aria-live="polite">{status === "idle" ? "" : accessibleLabel}</span>
  </Button>;
}
