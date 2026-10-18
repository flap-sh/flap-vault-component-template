import * as React from "react";
import { resolveIpfsImageUrls } from "@/src/sdk/ipfsImage";
import { IpfsImageOptimizationContext } from "../sdk/imageOptimization";
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
  const optimize = React.useContext(IpfsImageOptimizationContext);
  const urls = React.useMemo(() => resolveIpfsImageUrls(cid, 56, path), [cid, path]);
  const resourceKey = urls.join("\n");
  const [fallbackState, setFallbackState] = React.useState({ key: resourceKey, index: 0, direct: false });
  const urlIndex = fallbackState.key === resourceKey ? fallbackState.index : 0;
  const src = urls[urlIndex];
  const direct = fallbackState.key === resourceKey && fallbackState.direct;
  let image: { src: string; srcSet?: string; sizes?: string } | undefined;
  if (src && optimize && !direct) {
    try {
      image = optimize({ src, width: props.width, sizes: props.sizes });
    } catch {
      // A host adapter must never prevent the existing direct-gateway path.
    }
  }
  const optimized = Boolean(image && image.src !== src);
  const { src: ignoredSrc, srcSet: ignoredSrcSet, dangerouslySetInnerHTML: ignoredHtml, ...safeProps } = props as React.ImgHTMLAttributes<HTMLImageElement>;
  void ignoredSrc;
  void ignoredSrcSet;
  void ignoredHtml;

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Host supplies Next getImageProps URLs without changing legacy img layout.
    <img
      {...safeProps}
      key={resourceKey}
      alt={alt}
      className={cn("block max-w-full", className)}
      decoding={decoding}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={(event) => {
        if (optimized) {
          setFallbackState({ key: resourceKey, index: urlIndex, direct: true });
          return;
        }
        if (urlIndex < urls.length - 1) {
          setFallbackState({ key: resourceKey, index: Math.min(urlIndex + 1, urls.length - 1), direct: false });
          return;
        }
        onError?.(event);
      }}
      src={image?.src ?? src}
      srcSet={image?.srcSet}
      sizes={image?.sizes ?? safeProps.sizes}
    />
  );
}
