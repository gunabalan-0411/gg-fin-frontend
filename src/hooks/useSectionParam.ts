// The chosen section of a page lives in the URL (`?section=…`), so the left menu, the back button and bookmarks all agree.
// An unknown or missing value means the first (default) section.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { SECTION_PARAM, selectedSection } from "@/components/layout/navConfig";

export function useSectionParam<T extends string>(sections: readonly { id: T }[]): [T, (id: T) => void] {
  const [params, setParams] = useSearchParams();
  const section = selectedSection(sections, params.toString());
  const setSection = useCallback(
    (id: T) => setParams((prev) => { const next = new URLSearchParams(prev); next.set(SECTION_PARAM, id); return next; }),
    [setParams],
  );
  return [section, setSection];
}
