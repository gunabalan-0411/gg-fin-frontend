// How the payment list fits on the screen WITHOUT a scroll bar (a 55 inch TV: the whole history is shown).
// All sizes are in the DESIGN's pixels (the page is drawn on a 1920-wide canvas and scaled to the screen, so these are the numbers of the design).
// Few payments = the design's 44px rows in one column. A longer history shrinks the rows, then flows into 2 and 3 columns (3 columns use a
// short year). Only if it still cannot fit at the smallest readable size are the OLDEST payments left out - and the screen says how many.

export interface PaymentsLayout {
  cols: 1 | 2 | 3;
  perCol: number;      // rows per column
  rowH: number;        // px
  fontPx: number;      // the date's font; the amount is 1.09 x this, the GG tag 0.64 x this
  dateEm: number;      // width of the date cell, in em of the row font
  pillEm: number;      // width of the GG / principal tag cell
  gapEm: number;       // gap between the cells
  shortYear: boolean;
  hidden: number;      // oldest payments that do not fit (0 normally)
}

export const ROW_MAX = 44;     // the design's row
const ROW_GOOD = 30;           // fewer columns are preferred while rows stay at least this tall
const ROW_MIN = 20;            // the smallest row we are willing to draw
const FONT_MAX = 22;           // the design's date font
const COL_GAP = 32;            // between columns

export function layoutPayments(o: { count: number; height: number; width: number; maxChars: number }): PaymentsLayout {
  const { count, height, width, maxChars } = o;
  let pick = { cols: 1 as 1 | 2 | 3, perCol: Math.max(1, count), rowH: ROW_MAX };
  for (const cols of [1, 2, 3] as const) {
    const perCol = Math.max(1, Math.ceil(count / cols));
    const rowH = Math.min(ROW_MAX, height / perCol);
    pick = { cols, perCol, rowH };
    if (rowH >= ROW_GOOD) break;
  }
  let hidden = 0;
  if (pick.rowH < ROW_MIN) {
    pick.rowH = ROW_MIN;
    pick.perCol = Math.max(1, Math.floor(height / ROW_MIN));
    hidden = Math.max(0, count - pick.perCol * pick.cols);
  }
  const shortYear = pick.cols === 3;
  const dateEm = pick.cols === 1 ? 9.09 : pick.cols === 2 ? 6.6 : 4.8;      // 9.09em = the design's 200px date column
  const pillEm = pick.cols === 1 ? 4 : pick.cols === 2 ? 3 : 2;
  const gapEm = pick.cols === 1 ? 0.727 : 0.35;                              // 0.727em = the design's 16px gap
  // the text size is limited by the row height AND by the column width, so a date, the GG tag, the amount and the marker never touch
  const colW = (width - COL_GAP * (pick.cols - 1)) / pick.cols;
  const needEm = dateEm + pillEm + 1.1 + 3 * gapEm + 0.66 * Math.max(1, maxChars);
  const fontPx = Math.min(FONT_MAX, pick.rowH * 0.7, colW / needEm);
  return { ...pick, fontPx, dateEm, pillEm, gapEm, shortYear, hidden };
}
