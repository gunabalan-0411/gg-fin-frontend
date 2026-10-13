import * as React from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils";
import type { MappingKind } from "@/types";
import { KIND_BADGE } from "@/utils/nameMapping";

/**
 * Which table a match came from. Built on the shared Badge so it follows the theme in light and dark:
 *   AI mismatch -> the app's mint tint (Badge default variant)
 *   2nd alias   -> neutral muted surface
 */
export function SourceBadge({
  source, className, ...rest
}: { source: MappingKind } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <Badge
      className={cn(
        "rounded px-1 py-px text-[9px] font-bold tracking-wide",
        source === "alias" && "bg-muted text-muted-foreground border border-border",
        className,
      )}
      {...rest}
    >
      {KIND_BADGE[source]}
    </Badge>
  );
}
