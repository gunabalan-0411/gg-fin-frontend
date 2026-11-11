import { useCallback, useEffect, useRef, useState } from "react";
import CustomerCard from "./CustomerCard";
import PaymentsPanel from "./PaymentsPanel";
import { Icon } from "./icons";
import { amt } from "./format";
import { listenOnce, setBackHandler } from "./bridge";
import { T } from "./text";
import { isUnauthorized, tvClient } from "./tvClient";
import type { TvCustomer, TvProduct, TvSearchHit } from "./types";

const DEBOUNCE_MS = 250;
const MAX_SHOWN = 3;         // names shown under the search box (the server returns 5); three always leave room for the CUSTOMER card
const CACHE_MS = 60_000;     // a customer opened again within a minute is not fetched again; after that the figures are re-read
const PRODUCT_KEY = "gg_tv_product";
const keyOf = (h: Pick<TvSearchHit, "product" | "customer_id">) => `${h.product}:${h.customer_id}`;

// The design's switch: EL | தவணை. EL is the interest-only loan (IOP), தவணை the instalment loan (EDI). The search only looks in the chosen one.
const PRODUCTS: { id: TvProduct; label: string; tamil: boolean }[] = [
  { id: "iop", label: T.el, tamil: false },
  { id: "edi", label: T.thavanai, tamil: true },
];
const loadProduct = (): TvProduct => {
  try { const v = localStorage.getItem(PRODUCT_KEY); if (v === "edi" || v === "iop") return v; } catch { /* ignore */ }
  return "iop";                                                          // the design opens on EL
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(id); }, []);
  return <div className="clock num">{now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}</div>;
}

interface Props {
  token: string;
  onUnpaired: () => void;   // the server no longer knows this TV
  onHome: () => void;
}

/**
 * Search + view, laid out as the design: left column = logo and time, the EL | தவணை switch, the search box (type, or press the mic and say
 * the name), the "did you mean" names, and the CUSTOMER card at the bottom; right column = the statement.
 * The remote: OK on the mic to speak; up = the EL | தவணை switch; down into the names (each one is previewed as you land on it);
 * Back clears the search, Back again returns to the first screen.
 */
export default function TvSearch({ token, onUnpaired, onHome }: Props) {
  const [product, setProduct] = useState<TvProduct>(loadProduct);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TvSearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TvCustomer | null>(null);
  const [listening, setListening] = useState(false);
  const [micMsg, setMicMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const suggRef = useRef<HTMLDivElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, { at: number; data: TvCustomer }>());

  useEffect(() => { micRef.current?.focus(); }, []);          // one press of OK and you can speak

  const chooseProduct = (p: TvProduct) => {
    setProduct(p);
    try { localStorage.setItem(PRODUCT_KEY, p); } catch { /* ignore */ }
  };

  // ── search as the words arrive (in the chosen product) ──
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); setSearched(false); setSelKey(null); cache.current.clear(); return; }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const { data } = await tvClient.search(token, q, product);
        if (!alive) return;
        setHits(data.results);
        setSearched(true);
        setSelKey((prev) => (data.results.some((h) => keyOf(h) === prev) ? prev : data.results[0] ? keyOf(data.results[0]) : null));
      } catch (e) {
        if (isUnauthorized(e)) onUnpaired();
        else if (alive) { setHits([]); setSearched(true); setSelKey(null); }
      }
    }, DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(id); };
  }, [query, product, token, onUnpaired]);

  // ── the customer being looked at ──
  useEffect(() => {
    if (!selKey) { setDetail(null); return; }
    const hit = cache.current.get(selKey);
    if (hit && Date.now() - hit.at < CACHE_MS) { setDetail(hit.data); return; }
    let alive = true;
    const [prod, id] = selKey.split(":");
    tvClient.customer(token, prod as TvProduct, Number(id))
      .then(({ data }) => { cache.current.set(selKey, { at: Date.now(), data }); if (alive) setDetail(data); })
      .catch((e) => { if (isUnauthorized(e)) onUnpaired(); else if (alive) setDetail(null); });
    return () => { alive = false; };
  }, [selKey, token, onUnpaired]);

  // ── mic ──
  const startListening = async () => {
    if (listening) return;
    setListening(true);
    setMicMsg("");
    setQuery("");
    const heard = await listenOnce();
    setListening(false);
    if (heard.unsupported) { setMicMsg(T.noMic); inputRef.current?.focus(); return; }
    if (heard.text) setQuery(heard.text);
  };

  // ── Back ──
  const goBack = useCallback((): boolean => {
    if (!query.trim()) { onHome(); return true; }
    setQuery("");
    setMicMsg("");
    micRef.current?.focus();
    return true;
  }, [query, onHome]);
  useEffect(() => { setBackHandler(goBack); return () => setBackHandler(null); }, [goBack]);

  // ── remote / keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = document.activeElement, k = e.key;
      const input = inputRef.current, mic = micRef.current;
      const inInput = a === input;
      const toggles = Array.from(switchRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const onToggle = toggles.includes(a as HTMLButtonElement);
      if (k.length === 1 && k !== " " && !e.ctrlKey && !e.metaKey && !inInput) { input?.focus(); return; }   // typing from anywhere goes to the search box
      if (k === "Escape" || k === "GoBack" || (k === "Backspace" && !inInput)) { e.preventDefault(); goBack(); return; }
      const sugs = Array.from(suggRef.current?.querySelectorAll<HTMLButtonElement>(".sg") ?? []);
      if (k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        const down = k === "ArrowDown";
        if (onToggle) { if (down) mic?.focus(); return; }
        if (a === input || a === mic) {
          if (down) sugs[0]?.focus();
          else (toggles.find((b) => b.getAttribute("aria-pressed") === "true") ?? toggles[0])?.focus();      // up = the EL | தவணை switch
          return;
        }
        const i = sugs.indexOf(a as HTMLButtonElement), next = sugs[i + (down ? 1 : -1)];
        if (next) next.focus(); else if (!down) mic?.focus();
        return;
      }
      if (onToggle && (k === "ArrowLeft" || k === "ArrowRight")) {
        e.preventDefault();
        const i = toggles.indexOf(a as HTMLButtonElement), next = toggles[i + (k === "ArrowRight" ? 1 : -1)];
        if (next) next.focus();
        return;
      }
      if (k === "ArrowRight" && inInput && input && input.selectionStart === input.value.length) { e.preventDefault(); mic?.focus(); }
      if (k === "ArrowLeft" && a === mic) { e.preventDefault(); input?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack]);

  const hasText = query.trim().length > 0;

  let list: React.ReactNode;
  if (!hasText) {
    list = listening
      ? <div className="hint listen"><span className="mic on"><Icon name="mic" /></span><span className="ta">{T.listeningHint}</span></div>
      : micMsg
        ? <div className="hint none ta"><span>{micMsg}</span></div>
        : <div className="hint"><span className="ta">{T.micHint}</span></div>;
  } else if (searched && hits.length === 0) {
    list = <div className="hint none ta"><span>{T.notFound}</span></div>;
  } else {
    list = hits.slice(0, MAX_SHOWN).map((h) => {
      const on = keyOf(h) === selKey;
      return (
        <button
          key={keyOf(h)} type="button" className="sg" role="option" data-testid="tv-suggestion"
          aria-selected={on}
          onFocus={() => setSelKey(keyOf(h))} onClick={() => setSelKey(keyOf(h))}
        >
          <span className="sn ta">{h.name_ta || h.name_en}</span>
          {h.name_ta && <span className="se">{h.name_en}</span>}
          <span className="grow" />
          <span className="sa num">{amt(h.outstanding)}</span>
          <span className="tick"><Icon name="check" /></span>
        </button>
      );
    });
  }

  return (
    <>
      <div className="tv-left">
        <div className="topbar">
          <div className="brandrow"><div className="logo">GG</div><div className="brandname ta">{T.brand}</div></div>
          <Clock />
        </div>

        <div className="switch" ref={switchRef} role="group" aria-label={T.productSwitch}>
          {PRODUCTS.map((p) => (
            <button
              key={p.id} type="button" data-testid={`tv-product-${p.id}`} aria-pressed={product === p.id}
              className={`${p.tamil ? "ta " : ""}${product === p.id ? "on" : ""}`}
              onClick={() => chooseProduct(p.id)}
            >{p.label}</button>
          ))}
        </div>

        <div className="sbox">
          <Icon name="search" />
          <input
            ref={inputRef} id="tv-q" type="text" value={query} autoComplete="off" spellCheck={false}
            placeholder={listening ? T.listening : T.placeholder} aria-label={T.search}
            onChange={(e) => { setQuery(e.target.value); setMicMsg(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) { e.preventDefault(); setSelKey(keyOf(hits[0])); requestAnimationFrame(() => suggRef.current?.querySelector<HTMLButtonElement>(".sg")?.focus()); }
            }}
          />
          <button ref={micRef} id="tv-mic" type="button" className={`mic${listening ? " on" : ""}`} aria-label={T.speak} aria-pressed={listening} onClick={startListening}>
            <Icon name="mic" />
          </button>
        </div>

        <div className="sugg" ref={suggRef} role="listbox" aria-label={T.didYouMean}>{list}</div>

        <div className="grow" />
        <CustomerCard customer={detail} />
      </div>
      <PaymentsPanel customer={detail} />
    </>
  );
}
