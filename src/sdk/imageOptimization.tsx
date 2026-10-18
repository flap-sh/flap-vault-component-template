"use client";

import { createContext } from "react";

/** Host-only adapter: receives a runtime-validated gateway URL, never a raw artifact URL. */
export type IpfsImageOptimizer = (image: { src: string; width?: number | string; sizes?: string }) => {
  src: string;
  srcSet?: string;
  sizes?: string;
};

export const IpfsImageOptimizationContext = createContext<IpfsImageOptimizer | undefined>(undefined);
