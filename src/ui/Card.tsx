import * as React from "react";
import { cn } from "./utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    data-flap-ui="card"
    ref={ref}
    className={cn(
      "rounded-[8px] border border-[#303236] bg-[#070808] text-white shadow-[0_18px_60px_-42px_rgba(208,255,0,0.45)]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div data-flap-ui="card-header" ref={ref} className={cn("flex flex-col gap-1.5 p-4 sm:p-5", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 data-flap-ui="card-title" ref={ref} className={cn("text-base font-semibold uppercase leading-tight tracking-normal text-white sm:text-lg", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p data-flap-ui="card-description" ref={ref} className={cn("text-sm leading-6 text-[#84888C]", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div data-flap-ui="card-content" ref={ref} className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
