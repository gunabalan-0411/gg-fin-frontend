import { Icon } from "./icons";
import { amt, fmtDate } from "./format";
import { T } from "./text";
import type { TvCustomer } from "./types";

/** Bottom-left: the CUSTOMER card of the design - name, "active" pill, phone / start date / address strip, three loan figures. */
export default function CustomerCard({ customer: c }: { customer: TvCustomer | null }) {
  if (!c) {
    return <section className="cust cust-idle" data-testid="tv-customer"><div className="idle ta"><Icon name="user" /><span>{T.noneSelected}</span></div></section>;
  }
  const tiles: [string, number][] = c.product === "edi"
    ? [[T.loan, c.loan_amount], [T.given, c.disbursed_amount ?? 0], [T.interest, c.interest]]
    : [[T.loan, c.loan_amount], [T.principalPaid, c.principal_paid ?? 0], [T.interestPerMonth, c.interest]];
  const main = c.name_ta || c.name_en;
  const sub = c.name_ta ? c.name_en : "";
  return (
    <section className="cust" data-testid="tv-customer">
      <div className="chead">
        <div className="cname">
          <div className="clabel">{T.customerLabel}</div>
          <h1 className="ta">{main}</h1>
          {sub && <div className="cen">{sub}</div>}
        </div>
        <div className="active ta"><i />{T.active}</div>
      </div>
      <div className="cinfo">
        {c.phone && <div className="cell num"><Icon name="phone" />{c.phone}</div>}
        {c.loan_start_date && <div className="cell num"><Icon name="cal" />{fmtDate(c.loan_start_date)}</div>}
        {c.address && <div className="cell addr ta"><Icon name="pin" /><span>{c.address}</span></div>}
      </div>
      <div className="cloan">
        {tiles.map(([label, value]) => (
          <div className="box" key={label}><div className="bl ta">{label}</div><div className="bv num">{amt(value)}</div></div>
        ))}
      </div>
    </section>
  );
}
