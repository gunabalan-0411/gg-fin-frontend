import { useEffect, useRef } from "react";
import { Icon } from "./icons";
import { setBackHandler } from "./bridge";
import { T } from "./text";

/**
 * The first screen: two circles. The search circle (customers) is focused; Left / Right move between it and the collections circle (வசூல்);
 * OK (or a click) opens the one you are on. Typing opens the search. Back here lets the Android app close.
 */
export default function TvHome({ onOpen, onCollect }: { onOpen: () => void; onCollect: () => void }) {
  const searchRef = useRef<HTMLButtonElement>(null);
  const collectRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { searchRef.current?.focus(); setBackHandler(null); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); collectRef.current?.focus(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey) onOpen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
  return (
    <div className="tv-full home" aria-label={T.home}>
      <div className="home-item">
        <button ref={searchRef} type="button" className="circle" aria-label={T.openCustomers} onClick={onOpen}>
          <Icon name="search" />
        </button>
        <div className="home-label ta">{T.customers}</div>
      </div>
      <div className="home-item">
        <button ref={collectRef} type="button" className="circle" aria-label={T.collect} onClick={onCollect}>
          <Icon name="collect" />
        </button>
        <div className="home-label ta">{T.collect}</div>
      </div>
    </div>
  );
}
