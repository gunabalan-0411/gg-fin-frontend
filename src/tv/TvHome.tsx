import { useEffect, useRef } from "react";
import { Icon } from "./icons";
import { setBackHandler } from "./bridge";
import { T } from "./text";

/** The first screen: one circle. OK on it (or a click, or typing) opens the search. Back here lets the Android app close. */
export default function TvHome({ onOpen }: { onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); setBackHandler(null); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey) onOpen(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
  return (
    <div className="tv-full" aria-label={T.home}>
      <button ref={ref} type="button" className="circle" aria-label={T.openCustomers} onClick={onOpen}>
        <Icon name="search" />
      </button>
      <div className="home-label ta">{T.customers}</div>
    </div>
  );
}
