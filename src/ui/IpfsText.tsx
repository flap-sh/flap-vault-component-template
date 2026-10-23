"use client";

import * as React from "react";
import { useFlapIpfsTextReader } from "../sdk/runtimeStore";
import { cn } from "./utils";

export interface IpfsTextProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children" | "dangerouslySetInnerHTML"> {
  cid: string;
  path?: string;
  fallback?: React.ReactNode;
}

/** Displays escaped plain text. JSON parsing and business-specific field mapping stay with the caller. */
export function IpfsText({ cid, path, fallback = null, className, ...props }: IpfsTextProps) {
  const readIpfsText = useFlapIpfsTextReader();
  const key = JSON.stringify([typeof cid === "string" ? cid : null, typeof path === "string" ? path : null]);
  const [result, setResult] = React.useState<{ key: string; text?: string; state: "ready" | "error" }>();
  React.useEffect(() => {
    let cancelled = false;
    readIpfsText(cid, path).then(
      (text) => { if (!cancelled) setResult({ key, text, state: "ready" }); },
      () => { if (!cancelled) setResult({ key, state: "error" }); },
    );
    return () => { cancelled = true; };
  }, [readIpfsText, cid, path, key]);
  const current = result?.key === key ? result : undefined;
  // Do not forward HTML injection props, even if an untyped caller supplies them.
  const { dangerouslySetInnerHTML: ignoredHtml, children: ignoredChildren, ...safeProps } = props as React.HTMLAttributes<HTMLSpanElement>;
  void ignoredHtml;
  void ignoredChildren;
  return <span {...safeProps} className={cn("whitespace-pre-wrap break-words", className)} data-flap-ipfs-text-state={current?.state ?? "loading"}>{current?.state === "ready" ? current.text : fallback}</span>;
}
