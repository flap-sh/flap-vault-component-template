import * as React from "react";
import { cn } from "./utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-md border border-[#aebdd0] bg-[#101827] px-3 py-2 text-sm font-semibold text-white caret-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition-colors selection:bg-[#4a90ff]/45 selection:text-white placeholder:text-[#7f8ca0] focus:border-[#64a7ff] focus:bg-[#132033] focus:ring-2 focus:ring-[#4a90ff]/30 disabled:cursor-not-allowed disabled:border-[#40536c] disabled:bg-[#1d2938] disabled:text-[#8d9caf] disabled:opacity-80",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
