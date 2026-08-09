"use client";

import * as React from "react";
import { useFlapSdk } from "../sdk/runtimeStore";
import type { NftMetadataSnapshot } from "../sdk/types";
import { cn } from "./utils";

export interface NftMetadataImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "alt" | "src" | "srcSet"> {
  alt: string;
  tokenId: bigint;
  fallback?: React.ReactNode;
}

export function NftMetadataImage({ alt, tokenId, fallback = null, className, decoding = "async", loading = "lazy", onError, ...props }: NftMetadataImageProps) {
  const sdk = useFlapSdk();
  const [metadata, setMetadata] = React.useState<NftMetadataSnapshot | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");

  React.useEffect(() => {
    let cancelled = false;
    setState("loading");
    setMetadata(null);
    sdk
      .readNftMetadata({ tokenId })
      .then((nextMetadata) => {
        if (cancelled) return;
        setMetadata(nextMetadata);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [sdk, sdk.refetchNonce, tokenId]);

  if (state !== "ready" || !metadata) {
    return <span data-flap-nft-media-state={state} className={cn("block", className)}>{fallback}</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- shared runtime resolves tokenURI metadata to a validated, size-limited data image.
    <img
      {...props}
      alt={alt}
      className={cn("block max-w-full", className)}
      data-flap-nft-media-source={metadata.source}
      data-flap-nft-media-state={state}
      decoding={decoding}
      loading={loading}
      onError={(event) => {
        setState("error");
        onError?.(event);
      }}
      src={metadata.imageDataUrl}
    />
  );
}
