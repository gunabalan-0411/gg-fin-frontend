// The TickBook mark, as chosen in the launch film ("the ledger check", TB.logoSvg): a rounded deep-mint tile, two ledger lines and a
// ticked third row. Size it with the className (width / height); the tile rounds itself.
import { cn } from "@/utils";

export const BRAND_NAME = "TickBook";
export const BRAND_TAGLINE = "Every collection, ticked.";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div data-testid="brand-mark" className={cn("flex-shrink-0", className)}>
      <svg viewBox="12 12 96 96" className="block h-full w-full" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="12" y="12" width="96" height="96" rx="22" fill="#3d8a66" />
        <path d="M32 38 H88" stroke="#f1f5f0" strokeWidth="7" opacity="0.5" />
        <path d="M32 58 H88" stroke="#f1f5f0" strokeWidth="7" opacity="0.5" />
        <path d="M30 80 L40 90 L58 71" stroke="#f1f5f0" strokeWidth="8" />
        <path d="M68 81 H88" stroke="#f1f5f0" strokeWidth="7" opacity="0.5" />
      </svg>
    </div>
  );
}
