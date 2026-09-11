"use client";

import * as React from "react";
import { normalizeBinanceImageUrl } from "./binanceImageUrl";
import { cn } from "./utils";

export interface BinanceImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "alt" | "decoding" | "loading" | "referrerPolicy" | "src" | "srcSet"> {
  alt: string;
  src: string | null | undefined;
  fallback?: React.ReactNode;
}

/** Render one image from the exact https://bin.bnbstatic.com host. */
export function BinanceImage({ alt, src, fallback = null, className, onError, ...props }: BinanceImageProps) {
  const safeSrc = React.useMemo(() => normalizeBinanceImageUrl(src), [src]);
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

  // Ignore source/security attributes even if an untyped caller supplies them.
  const {
    alt: _unsafeAlt,
    decoding: _unsafeDecoding,
    loading: _unsafeLoading,
    referrerPolicy: _unsafeReferrerPolicy,
    src: _unsafeSrc,
    srcSet: _unsafeSrcSet,
    ...imageProps
  } = props as React.ImgHTMLAttributes<HTMLImageElement>;
  void _unsafeAlt;
  void _unsafeDecoding;
  void _unsafeLoading;
  void _unsafeReferrerPolicy;
  void _unsafeSrc;
  void _unsafeSrcSet;

  if (!safeSrc || failedSrc === safeSrc) {
    return (
      <span className={cn("block", className)} data-flap-binance-image-state={safeSrc ? "error" : "invalid"}>
        {fallback}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- BinanceImage owns the exact-host runtime boundary and browser loading policy.
    <img
      {...imageProps}
      alt={alt}
      className={cn("block max-w-full", className)}
      data-flap-binance-image-state="ready"
      decoding="async"
      loading="lazy"
      onError={(event) => {
        setFailedSrc(safeSrc);
        onError?.(event);
      }}
      referrerPolicy="no-referrer"
      src={safeSrc}
    />
  );
}
