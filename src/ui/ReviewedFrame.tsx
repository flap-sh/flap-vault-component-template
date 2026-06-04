import * as React from "react";
import { cn } from "./utils";

export type ReviewedFrameProvider = "tradingview" | "dexscreener" | "coingecko-terminal";

export interface ReviewedFrameProps
  extends Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, "allow" | "referrerPolicy" | "sandbox" | "src" | "srcDoc" | "title"> {
  frameId: string;
  provider: ReviewedFrameProvider;
  src: string;
  title: string;
}

export function ReviewedFrame({ className, frameId, provider, src, title, ...props }: ReviewedFrameProps) {
  const {
    allow: _allow,
    referrerPolicy: _referrerPolicy,
    sandbox: _sandbox,
    src: _src,
    srcDoc: _srcDoc,
    title: _title,
    ...safeProps
  } = props as React.IframeHTMLAttributes<HTMLIFrameElement>;

  return (
    <iframe
      {...safeProps}
      data-frame-id={frameId}
      data-frame-provider={provider}
      src={src}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin"
      className={cn("min-h-[360px] w-full rounded-lg border border-[#3a4d66] bg-[#0b111a]", className)}
    />
  );
}
