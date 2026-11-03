// Small helpers shared by the Monthly budget page: money as the bank shows it, and "YYYY-MM" month keys.

export const num = (v: number | string | null | undefined) => Number(v) || 0;

/** ₹12,550 (paise only when there are some, so a balance can be matched to the bank's to the paisa); a minus sign for a negative. */
export function rupees(n: number): string {
  const paise = Math.abs(n - Math.round(n)) >= 0.005;
  const body = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 && Math.abs(n) >= 0.005 ? "−" : ""}₹${body}`;
}

/** +₹5,000 / −₹100: an amount that moves a balance up or down. */
export const signed = (n: number) => (n > 0 ? "+" : "") + rupees(n);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const shiftMonth = (key: string, by: number) => keyOf(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + by, 1));
/** "Nov 2026" */
export const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayIso = () => iso(new Date());
export const firstOfMonthIso = (key: string) => `${key}-01`;
export const lastOfMonthIso = (key: string) => iso(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0));

/** "03 Nov 2026" */
export function dmy(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
}

/** The server's refusal ("You already have an expense account with that name") when there is one, else a plain fallback. */
export function errorText(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return String(detail[0].msg).replace(/^Value error, /, "");
  return fallback;
}

/** Number boxes without the browser's spinner arrows: amounts are typed, never nudged. */
export const AMOUNT_BOX = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
