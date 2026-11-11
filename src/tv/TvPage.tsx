import { useCallback, useEffect, useState } from "react";
import PairingScreen from "./PairingScreen";
import TvHome from "./TvHome";
import TvSearch from "./TvSearch";
import CollectionsPage from "./CollectionsPage";
import { clearToken, getToken, isUnauthorized, saveToken, tvClient } from "./tvClient";
import { T } from "./text";
import "./tv.css";

const DESIGN_W = 1920, DESIGN_H = 1000;
function fit() {
  const w = typeof window === "undefined" ? DESIGN_W : window.innerWidth || DESIGN_W, h = typeof window === "undefined" ? DESIGN_H : window.innerHeight || DESIGN_H;
  const scale = Math.min(w / DESIGN_W, h / DESIGN_H);
  return { scale, width: w / scale, height: h / scale };
}

/**
 * The home-TV page (/tv). It sits OUTSIDE the app's login: a TV is paired once with a short code (PairingScreen) and from then on carries a
 * read-only device token. Unpaired -> code screen; paired -> the circle (home) -> search + view.
 */
export default function TvPage() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [screen, setScreen] = useState<"home" | "search" | "collect">("home");

  // The page is drawn on the design's canvas (1920 x 1000 design pixels) and scaled to the screen, so every size is exactly the design's.
  // A wider or taller screen just gives the flexible parts (the left column, the gaps) more room.
  const [view, setView] = useState(fit);
  useEffect(() => {
    const onResize = () => setView(fit());
    window.addEventListener("resize", onResize);
    const title = document.title;
    document.title = T.brand;
    return () => { window.removeEventListener("resize", onResize); document.title = title; };
  }, []);

  const unpair = useCallback(() => { clearToken(); setToken(null); setScreen("home"); }, []);
  const goHome = useCallback(() => setScreen("home"), []);
  const open = useCallback(() => setScreen("search"), []);
  const openCollect = useCallback(() => setScreen("collect"), []);

  // a token the server has since revoked / forgotten sends the TV back to the code screen
  useEffect(() => {
    if (!token) return;
    tvClient.me(token).catch((e) => { if (isUnauthorized(e)) unpair(); });
  }, [token, unpair]);

  return (
    <div className="tv-root" style={{ width: view.width, height: view.height, transform: `scale(${view.scale})` }}>
      {!token ? (
        <PairingScreen onPaired={(t) => { saveToken(t); setToken(t); }} />
      ) : screen === "home" ? (
        <TvHome onOpen={open} onCollect={openCollect} />
      ) : screen === "collect" ? (
        <CollectionsPage token={token} onUnpaired={unpair} onHome={goHome} />
      ) : (
        <TvSearch token={token} onUnpaired={unpair} onHome={goHome} />
      )}
    </div>
  );
}
