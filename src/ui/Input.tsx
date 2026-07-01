import * as React from "react";
import { cn } from "./utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    data-flap-ui="input"
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-[6px] border border-[#303236] bg-black px-3 py-2 text-sm font-semibold text-white caret-[#D0FF00] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none duration-0 selection:bg-[#D0FF00]/35 selection:text-white placeholder:text-[#84888C] focus:border-[#D0FF00] focus:ring-2 focus:ring-[#D0FF00]/25 disabled:cursor-not-allowed disabled:bg-[#131516] disabled:text-[#84888C] disabled:opacity-80",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
