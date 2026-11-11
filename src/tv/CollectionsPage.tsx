import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { setBackHandler } from "./bridge";
import { amt, fmtDate, fmtPhone, idNo } from "./format";
import { isUnauthorized, tvClient } from "./tvClient";
import { T } from "./text";
import type { TvCollectRow, TvCollections, TvEdiLongRow, TvElRow } from "./types";

const REFRESH_MS = 2 * 60 * 1000;     // the page re-reads the numbers while it is open
const ROW_MAX = 52, ROW_MIN = 30;     // design px: comfortable rows shrink to the smallest readable one, then the last people are left out with a note

/** Rows that always fit their card: height / count, never taller than ROW_MAX, never smaller than ROW_MIN (then the rest is left out with a note). */
export function fitRows(count: number, height: number): { rowH: number; shown: number } {
  if (count <= 0 || height <= 0) return { rowH: ROW_MAX, shown: count };
  const rowH = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor(height / count)));
  return { rowH, shown: Math.min(count, Math.floor(height / rowH)) };
}

const displayName = (r: TvCollectRow) => r.name_ta || r.name_en;
const sum = <R,>(rows: R[], pick: (r: R) => number) => rows.reduce((n, r) => n + pick(r), 0);

/** One white card: a title row, the column headings, the people, and a totals row. The people area takes the rest of the height, never scrolls. */
function Card<R extends TvCollectRow>({ testid, title, rows, kind, cells, heads, totals }: {
  testid: string; title: string; rows: R[]; kind: "el" | "edi";
  cells: (r: R) => ReactNode; heads: string[]; totals: ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ rowH: number; shown: number }>({ rowH: ROW_MAX, shown: rows.length });

  const measure = useCallback(() => {
    const h = areaRef.current?.clientHeight ?? 0;
    setFit(h ? fitRows(rows.length, h) : { rowH: ROW_MAX, shown: rows.length });
  }, [rows.length]);
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const el = areaRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(measure) : null;
    if (el) ro?.observe(el);
    window.addEventListener("resize", measure);
    (document as any).fonts?.ready?.then(measure);                       // web fonts change the heights: measure again when they arrive
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  const hidden = rows.length - fit.shown;
  const style = { "--rh": `${fit.rowH}px`, "--k": fit.rowH / ROW_MAX } as CSSProperties;
  return (
    <section className="ccard" data-testid={testid} style={{ flex: `${Math.max(rows.length, 1) + 3} 1 0` }}>
      <div className="chd"><div className="ct ta">{title}</div><span className="pill ta">{T.people(rows.length)}</span></div>
      <div className={`cgrid ${kind} cols ta`}>{heads.map((h, i) => <div key={i} className={i === 0 || (kind === "edi" && i === 1) ? "" : "r"}>{h}</div>)}</div>
      <div className="carea" ref={areaRef} style={style}>
        {rows.length === 0 && <div className="cnone ta">{T.noOne}</div>}
        {rows.slice(0, fit.shown).map((r) => (
          <div className={`cgrid ${kind} crow`} key={r.customer_id} data-testid={`${testid}-row`}>
            <div className="nm"><b className="ta">{displayName(r)}</b><i className="id num">{idNo(r.customer_id)}</i></div>
            {cells(r)}
          </div>
        ))}
        {hidden > 0 && <div className="cmore ta" data-testid={`${testid}-more`}>{T.moreRows(hidden)}</div>}
      </div>
      <div className={`cgrid ${kind} cfoot`}>{totals}</div>
    </section>
  );
}

/**
 * The collections page (வசூல்). Left = EL (IOP): above the people whose interest comes every 10 days, below the monthly-interest ones (30 days):
 * loan, interest due for one collection, interest paid this month, phone. Right = தவணை (EDI) loans 99 or more days after their start date:
 * start date, loan, balance, phone, number of days. Nothing scrolls: rows shrink (then the last ones are left out with a note).
 */
export default function CollectionsPage({ token, onUnpaired, onHome }: { token: string; onUnpaired: () => void; onHome: () => void }) {
  const [data, setData] = useState<TvCollections | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setBackHandler(() => { onHome(); return true; }); return () => setBackHandler(null); }, [onHome]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "GoBack" || e.key === "Backspace") { e.preventDefault(); onHome(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onHome]);

  useEffect(() => {
    let alive = true;
    const load = () => tvClient.collections(token)
      .then(({ data: d }) => { if (alive) { setData(d); setFailed(false); } })
      .catch((e) => { if (isUnauthorized(e)) onUnpaired(); else if (alive) setFailed(true); });
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, [token, onUnpaired]);

  const ten = data?.el_ten_days ?? [], monthly = data?.el_monthly ?? [], long = data?.edi_long ?? [];
  const elHeads = [T.colName, T.colLoan, T.colDue, T.colThisMonth, T.colPhone];
  const elCells = (r: TvElRow) => {
    const state = r.paid_month <= 0 ? "zero" : r.due > 0 && r.paid_month >= r.due ? "ok" : "part";     // green once the interest due is paid, grey while nothing is
    return (
      <>
        <div className="r num">{amt(r.loan_amount)}</div>
        <div className="r num due">{amt(r.due)}</div>
        <div className={`r num paid ${state}`}>{amt(r.paid_month)}</div>
        <div className="ph num">{fmtPhone(r.phone)}</div>
      </>
    );
  };
  const elTotals = (rows: TvElRow[]) => (
    <><div className="k ta">{T.total}</div><div className="r num">{amt(sum(rows, (r) => r.loan_amount))}</div><div className="r num">{amt(sum(rows, (r) => r.due))}</div><div className="r num">{amt(sum(rows, (r) => r.paid_month))}</div><div /></>
  );
  const ediCells = (r: TvEdiLongRow) => (
    <>
      <div className="num sd">{fmtDate(r.loan_start_date)}</div>
      <div className="r num">{amt(r.loan_amount)}</div>
      <div className="r num due">{amt(r.balance)}</div>
      <div className="ph num">{fmtPhone(r.phone)}</div>
      <div className="r num dd">{r.days}</div>
    </>
  );

  return (
    <div className="tv-full collect" data-testid="tv-collect" aria-label={T.collect}>
      <div className="cside">
        <div className="shead"><div className="l"><span className="stag">EL</span><span className="ssub ta">{T.elInterest}</span></div><span className="scnt ta">{T.people(ten.length + monthly.length)}</span></div>
        <Card testid="tv-el-ten" title="" rows={ten} kind="el" heads={elHeads} cells={elCells} totals={elTotals(ten)} />
        <Card testid="tv-el-month" title={T.monthlyInterest} rows={monthly} kind="el" heads={elHeads} cells={elCells} totals={elTotals(monthly)} />
      </div>
      <div className="cside">
        <div className="shead"><div className="l"><span className="stag ta">{T.thavanai}</span></div><span className="scnt ta">{T.people(long.length)}</span></div>
        <Card testid="tv-edi-long" title={T.longLoans} rows={long} kind="edi" heads={[T.colName, T.colStart, T.colLoan, T.colBalance, T.colPhone, T.colDays]} cells={ediCells}
          totals={<><div className="k ta">{T.total}</div><div /><div className="r num">{amt(sum(long, (r) => r.loan_amount))}</div><div className="r num">{amt(sum(long, (r) => r.balance))}</div><div /><div /></>} />
      </div>
      {failed && !data && <div className="cfail ta">{T.collectError}</div>}
    </div>
  );
}
