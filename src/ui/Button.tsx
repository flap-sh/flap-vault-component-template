import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold uppercase leading-[1.4] tracking-normal duration-0 hover:transition-colors hover:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D0FF00]/45 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "ui20-connect-chamfer text-[#070808] [--ui20-chamfer-bg:#D0FF00] [--ui20-chamfer-border:#D0FF00] hover:[--ui20-chamfer-bg:#BDE800] hover:[--ui20-chamfer-border:#BDE800]",
        secondary:
          "ui20-connect-chamfer text-white [--ui20-chamfer-bg:#262626] [--ui20-chamfer-border:#262626] hover:text-[#D0FF00] hover:[--ui20-chamfer-bg:#303030] hover:[--ui20-chamfer-border:#303030]",
        outline:
          "ui20-connect-chamfer text-[#D4D4D4] [--ui20-chamfer-bg:#000000] [--ui20-chamfer-border:#303236] hover:text-[#D0FF00] hover:[--ui20-chamfer-border:#D0FF00]",
        ghost: "rounded-[6px] text-[#D4D4D4] hover:bg-[#131516] hover:text-[#D0FF00]",
        destructive:
          "ui20-connect-chamfer text-[#FF4A55] [--ui20-chamfer-bg:#000000] [--ui20-chamfer-border:#FF4A55] hover:text-black hover:[--ui20-chamfer-bg:#FF4A55]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-5",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp data-flap-ui="button" className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        data-flap-ui="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="relative z-10 h-4 w-4 animate-spin" /> : null}
        <span className="relative z-10 inline-flex min-w-0 items-center justify-center gap-2">{children}</span>
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
