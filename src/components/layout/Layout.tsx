import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import MobileNav from "./MobileNav";
import ErrorBoundary from "./ErrorBoundary";
import OcrPage from "@/pages/OcrPage";
import VoicePage from "@/pages/VoicePage";
import { useIsMobile, useIsTablet } from "@/hooks/useBreakpoint";
import { cn } from "@/utils";

export default function Layout() {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isCompact = isMobile || isTablet;
  const isOcr = pathname === "/ocr";
  const isVoice = pathname === "/voice";

  return (
    /* 100dvh accounts for mobile browser chrome (address bar) shrinking the viewport */
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Desktop: persistent sidebar with collapse toggle */}
      {!isCompact && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />
      )}

      {/* Mobile/tablet: slide-in drawer */}
      {isCompact && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
              sidebarOpen
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            )}
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <div
            className={cn(
              "fixed top-0 left-0 z-50 h-full transition-transform duration-300 ease-out will-change-transform",
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header
          showMenuButton={isCompact}
          onMenuClick={() => setSidebarOpen((v) => !v)}
        />
        {/* OCR: always mounted so PDF session, image, and records survive tab switches */}
        <div className={cn("flex-1 overflow-hidden min-h-0", !isOcr && "hidden")}>
          <OcrPage />
        </div>

        {/* Voice: always mounted so recording state survives tab switches */}
        <div className={cn("flex-1 overflow-hidden min-h-0", !isVoice && "hidden")}>
          <VoicePage />
        </div>

        {/* All other routes — only rendered when not on /ocr or /voice */}
        {!isOcr && !isVoice && (
          <main
            className={cn(
              "flex-1 overflow-y-auto overscroll-contain",
              isMobile ? "p-4 pb-[86px]" : isTablet ? "p-5 pb-[86px]" : "p-6"
            )}
          >
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        )}
      </div>

      {/* Bottom navigation on mobile/tablet */}
      {isCompact && <MobileNav />}
    </div>
  );
}
