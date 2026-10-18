import { getImageProps } from "next/image";

/** Generate only URLs: keep the legacy img element, dimensions and CSS untouched. */
export function optimizeIpfsImage({ src, width, sizes }: { src: string; width?: number | string; sizes?: string }) {
  const pixels = Number(width);
  const { props } = getImageProps({
    src,
    alt: "",
    fill: true,
    sizes: sizes || (Number.isFinite(pixels) && pixels > 0 ? `${pixels}px` : "100vw"),
  });
  // A width-descriptor srcset changes intrinsic sizing when legacy callers have
  // neither width nor sizes. Keep a single optimized URL in that case.
  if (!sizes && !(Number.isFinite(pixels) && pixels > 0)) return { src: props.src };
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}
