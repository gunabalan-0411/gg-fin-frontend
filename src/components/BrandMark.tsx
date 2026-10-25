// The TickBook mark: an open book whose two pages are the strokes of a tick. Sits in a dark tile; the strokes take the page colour.
import { cn } from "@/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div data-testid="brand-mark" className={cn("flex flex-shrink-0 items-center justify-center bg-foreground", className)}>
      <svg viewBox="0 0 32 32" className="h-[72%] w-[72%] text-background" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5.5 16.2 L12.2 22.9" strokeWidth="4.6" />
        <path d="M15.6 22.6 L27 8.6" strokeWidth="4.6" />
        <path d="M4.5 28 Q16 25.2 27.5 28" strokeWidth="1.7" opacity="0.55" />
      </svg>
    </div>
  );
}

export const BRAND_NAME = "TickBook";
