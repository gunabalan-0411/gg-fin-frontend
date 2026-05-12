import * as React from "react";
import { cn } from "@/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "destructive";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        {
          "bg-primary/20 text-primary": variant === "default",
          "bg-green-500/20 text-green-400": variant === "success",
          "bg-yellow-500/20 text-yellow-400": variant === "warning",
          "bg-red-500/20 text-red-400": variant === "destructive",
        },
        className
      )}
      {...props}
    />
  );
}
