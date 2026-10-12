import * as React from "react";
import { resolveIpfsImageUrls } from "@/src/sdk/ipfsImage";
import { cn } from "./utils";

export interface IpfsImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "alt" | "src" | "srcSet" | "children" | "dangerouslySetInnerHTML"> {
  alt: string;
  cid: string;
  /** Safe relative file path below the CID. */
  path?: string;
  /** Static representative path required only when cid is static and path is dynamic. */
  validationPath?: string;
}

export function IpfsImage({ alt, cid, path, validationPath, className, decoding = "async", loading = "lazy", onError, ...props }: IpfsImageProps) {
  void validationPath;
  const urls = React.useMemo(() => resolveIpfsImageUrls(cid, 56, path), [cid, path]);
  const resourceKey = urls.join("\n");
  const [fallbackState, setFallbackState] = React.useState({ key: resourceKey, index: 0 });
  const urlIndex = fallbackState.key === resourceKey ? fallbackState.index : 0;
  const src = urls[urlIndex];
  const { src: ignoredSrc, srcSet: ignoredSrcSet, dangerouslySetInnerHTML: ignoredHtml, ...safeProps } = props as React.ImgHTMLAttributes<HTMLImageElement>;
  void ignoredSrc;
  void ignoredSrcSet;
  void ignoredHtml;

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- IpfsImage owns CID-to-gateway fallback; next/image cannot represent this boundary.
    <img
      {...safeProps}
      key={resourceKey}
      alt={alt}
      className={cn("block max-w-full", className)}
      decoding={decoding}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={(event) => {
        if (urlIndex < urls.length - 1) {
          setFallbackState({ key: resourceKey, index: Math.min(urlIndex + 1, urls.length - 1) });
          return;
        }
        onError?.(event);
      }}
      src={src}
    />
  );
}
