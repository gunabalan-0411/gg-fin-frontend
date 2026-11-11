/** 2026-11-09 -> 09/11/2026 (Indian day / month / year). */
export function fmtDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** 2026-11-09 -> 09/11/26 - the same order with a short year, used only when a long history has to fit. */
export function fmtDateShort(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : "";
}

/** 125000 -> 1,25,000 (Indian digit grouping, whole rupees, no currency sign - the TV design shows plain figures). */
export function amt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

/** The account number shown on the statement: customer 412 -> #GG-0412. */
export function accountNo(customerId: number): string {
  return `#GG-${String(customerId).padStart(4, "0")}`;
}
