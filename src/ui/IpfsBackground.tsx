import * as React from "react";
import { IpfsImage } from "./IpfsImage";
import { cn } from "./utils";

export interface IpfsBackgroundProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  cid: string;
  imageClassName?: string;
  overlayClassName?: string;
}

export function IpfsBackground({ cid, className, imageClassName, overlayClassName, ...props }: IpfsBackgroundProps) {
  return (
    <div {...props} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <IpfsImage alt="" cid={cid} className={cn("h-full w-full object-cover", imageClassName)} loading="eager" />
      {overlayClassName ? <div className={cn("absolute inset-0", overlayClassName)} /> : null}
    </div>
  );
}
