import * as React from "react";
import { resolveIpfsImageUrls } from "@/src/sdk/ipfsImage";
import { cn } from "./utils";

export interface IpfsImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "alt" | "src" | "srcSet"> {
  alt: string;
  cid: string;
}

export function IpfsImage({ alt, cid, className, decoding = "async", loading = "lazy", onError, ...props }: IpfsImageProps) {
  const urls = React.useMemo(() => resolveIpfsImageUrls(cid), [cid]);
  const [urlIndex, setUrlIndex] = React.useState(0);
  const src = urls[urlIndex];

  React.useEffect(() => {
    setUrlIndex(0);
  }, [cid]);

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- IpfsImage owns CID-to-gateway fallback; next/image cannot represent this boundary.
    <img
      {...props}
      alt={alt}
      className={cn("block max-w-full", className)}
      decoding={decoding}
      loading={loading}
      onError={(event) => {
        if (urlIndex < urls.length - 1) {
          setUrlIndex((index) => Math.min(index + 1, urls.length - 1));
          return;
        }
        onError?.(event);
      }}
      src={src}
    />
  );
}
