import * as React from "react";
import { cn } from "@/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
