import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        default:     "bg-foreground text-background hover:bg-foreground/85 border border-foreground/10",
        primary:     "bg-primary text-primary-foreground hover:bg-primary/85 border border-primary/20",
        secondary:   "bg-muted text-foreground hover:bg-muted/80 border border-border",
        destructive: "bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/20",
        ghost:       "hover:bg-muted hover:text-foreground text-muted-foreground",
        outline:     "border border-border bg-transparent hover:bg-muted text-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-7 px-3 text-xs",
        lg:      "h-11 px-6 text-[15px]",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
