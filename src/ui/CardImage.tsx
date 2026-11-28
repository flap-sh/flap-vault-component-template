"use client";

import * as React from "react";
import { fetchCardImage } from "./fetchCardImage";
import { normalizeCardImageUrl } from "./cardImageUrl.mjs";
import { cn } from "./utils";

type CardImageSource = string | null | undefined;
const IMAGE_TIMEOUT_MS = 10_000;

function useCardImageResource<T>(
  src: CardImageSource,
  create: (blob: Blob) => T | Promise<T>,
  release: (value: T) => void,
): T | null {
  const url = normalizeCardImageUrl(src);
  const [loaded, setLoaded] = React.useState<{ url: string; value: T } | null>(null);

  React.useEffect(() => {
    setLoaded(null);
    if (!url) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    let owned: T | undefined;
    void fetchCardImage(url, controller.signal)
      .then((blob) => {
        controller.signal.throwIfAborted();
        return create(blob);
      })
      .then((value) => {
        if (controller.signal.aborted) {
          release(value);
          return;
        }
        owned = value;
        setLoaded({ url, value });
      })
      .catch(() => {
        // The caller's fallback stays visible if the request or decode fails.
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
      if (owned !== undefined) release(owned);
    };
  }, [url, create, release]);

  return loaded?.url === url ? loaded.value : null;
}

const createObjectUrl = (blob: Blob) => URL.createObjectURL(blob);
const revokeObjectUrl = (url: string) => URL.revokeObjectURL(url);
const createBitmap = (blob: Blob) => createImageBitmap(blob, { imageOrientation: "flipY" });
const closeBitmap = (bitmap: ImageBitmap) => bitmap.close();

export interface CardImageProps {
  src: CardImageSource;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export function CardImage({ src, alt, className, fallback = null }: CardImageProps) {
  const imageUrl = useCardImageResource(src, createObjectUrl, revokeObjectUrl);
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);

  if (!imageUrl || imageUrl === failedUrl) {
    return (
      <span className={cn("block", className)} role={alt ? "img" : undefined} aria-label={alt || undefined}>
        {fallback}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- the runtime owns the validated raster bytes and object URL.
    <img
      alt={alt}
      className={cn("block max-w-full", className)}
      decoding="async"
      onError={() => setFailedUrl(imageUrl)}
      src={imageUrl}
    />
  );
}

/** The runtime closes the bitmap when the input changes or the caller unmounts. */
export function useCardImageBitmap(src: CardImageSource): ImageBitmap | null {
  return useCardImageResource(src, createBitmap, closeBitmap);
}
