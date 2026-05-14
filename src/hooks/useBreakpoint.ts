import { useState, useEffect } from "react";

function useMediaQuery(query: string, initial: boolean): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : initial
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)", false);
}

export function useIsTablet() {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)", false);
}

export function useBreakpoint() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  return { isMobile, isTablet, isDesktop: !isMobile && !isTablet };
}
