import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/utils";
import { useIsMobile } from "@/hooks/useBreakpoint";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const isMobile = useIsMobile();

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />

        {isMobile ? (
          /* Mobile: bottom sheet slides up from bottom */
          <Dialog.Content
            className="fixed bottom-0 left-0 right-0 z-50 w-full rounded-t-2xl border-t border-border bg-card shadow-2xl focus:outline-none"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-0.5">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-border">
              <Dialog.Title className="text-base font-semibold text-foreground">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Scrollable content */}
            <div className="px-5 py-4 overflow-y-auto overscroll-contain max-h-[78vh]">
              {children}
            </div>
          </Dialog.Content>
        ) : (
          /* Desktop: centered dialog */
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
              "w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl",
              "focus:outline-none",
              className
            )}
          >
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-base font-semibold text-foreground">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
