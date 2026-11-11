import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "./icons";
import { accountNo, amt, fmtDate, fmtDateShort } from "./format";
import { layoutPayments, ROW_MAX, type PaymentsLayout } from "./layout";
import { T } from "./text";
import type { TvCustomer } from "./types";

/**
 * Right side: the statement of the design. Header (title, STATEMENT · NAME, account number, start date), the payments - date, a GG tag when
 * it was paid by Google Pay (or the "principal" tag), the amount, a hollow ring at the end of a row marked GG whose money did not arrive
 * (amount struck through) - then the total paid, a progress bar, and what is still to pay. The list never scrolls: layout.ts makes it fit.
 */
export default function PaymentsPanel({ customer: c }: { customer: TvCustomer | null }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [lay, setLay] = useState<PaymentsLayout | null>(null);
  const payments = c?.payments ?? [];
  const maxChars = Math.max(1, ...payments.map((p) => amt(p.amount).length));

  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const height = box.clientHeight, width = box.clientWidth;          // layout pixels of the 1920-wide canvas (the page scales it to the screen)
    if (!height || !width) { setLay(null); return; }                    // not laid out (yet): draw every row as is
    setLay(layoutPayments({ count: payments.length, height, width, maxChars }));
  }, [payments.length, maxChars]);

  useLayoutEffect(measure, [measure, c?.customer_id, c?.product]);
  useEffect(() => {
    const box = boxRef.current;
    const ro = typeof ResizeObserver !== "undefined" && box ? new ResizeObserver(measure) : null;
    if (box) ro?.observe(box);
    window.addEventListener("resize", measure);
    (document as any).fonts?.ready?.then(measure);                      // the web fonts change text widths: measure again when they arrive
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  if (!c) {
    return (
      <div className="ledger-col">
        <section className="ledger" data-testid="tv-payments"><div className="idle ta"><Icon name="coin" /><span>{T.paymentsHere}</span></div></section>
      </div>
    );
  }

  const shown = lay ? payments.slice(0, Math.max(0, payments.length - lay.hidden)) : payments;
  const anyMissed = payments.some((p) => p.gg && !p.paid);
  const paid = c.total_paid, balance = c.outstanding;
  const share = Math.min(100, Math.round((paid / Math.max(1, paid + balance)) * 100));
  const style: CSSProperties | undefined = lay
    ? ({ "--cols": lay.cols, "--per": lay.perCol, "--rh": `${lay.rowH}px`, "--f": `${lay.fontPx}px`, "--dw": `${lay.dateEm}em`, "--pw": `${lay.pillEm}em`, "--gap": `${lay.gapEm}em` } as CSSProperties)
    : ({ "--rh": `${ROW_MAX}px` } as CSSProperties);
  const oneColumn = !lay || lay.cols === 1;

  return (
    <div className="ledger-col">
      <section className="ledger" data-testid="tv-payments">
        <div className="lhead">
          <div className="lt">
            <div className="ltitle ta">{T.paid}</div>
            <div className="lsub">{T.statement} · {c.name_en.toUpperCase()}</div>
          </div>
          <div className="lmeta num"><div>{accountNo(c.customer_id)}</div><div>{c.loan_start_date ? `${fmtDate(c.loan_start_date)} →` : ""}</div></div>
        </div>

        <div className="ltable">
          {oneColumn && <div className="thead ta"><div>{T.colDate}</div><div>{T.colKind}</div><div className="r">{T.colAmount}</div><div /></div>}
          <div className="rows" ref={boxRef} style={style} data-testid="tv-rows" data-cols={lay?.cols ?? 1}>
            {shown.map((p, i) => {
              const noMoney = !p.paid;
              const missed = noMoney && p.gg;                          // marked Google Pay, nothing arrived
              return (
                <div className={`pr${missed ? " unpaid" : noMoney ? " skipped" : ""}`} key={`${p.date}-${i}`} data-testid="tv-payment">
                  <span className="d num">{lay?.shortYear ? fmtDateShort(p.date) : fmtDate(p.date)}</span>
                  <span className="k">{p.principal > 0 ? <span className="tag pri ta">{T.principal}</span> : p.gg ? <span className="tag gg">GG</span> : null}</span>
                  <span className="a num">{amt(p.amount)}</span>
                  <span className="m">{missed && <span className="miss" data-testid="tv-x" aria-label={T.notReceived} />}</span>
                </div>
              );
            })}
          </div>
          <div className="more ta" data-testid="tv-more">{lay && lay.hidden > 0 ? T.more(lay.hidden) : ""}</div>
          {anyMissed && <div className="legend ta" data-testid="tv-legend"><span className="miss" />{T.notReceived}</div>}
        </div>

        <div className="totals">
          <div className="trow"><div className="ta">{T.totalPaid}</div><div className="num" data-testid="tv-total-paid">{amt(paid)}</div></div>
          <div className="bar"><i style={{ width: `${share}%` }} /></div>
          <div className="bal">
            <div className="ta">{balance === 0 ? T.loanDone : T.balance}</div>
            <div className="num" data-testid="tv-balance">{amt(balance)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
