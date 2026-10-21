// Re-loan: a customer needs a new loan, so the old account is closed and a copy of it is created. What the new account inherits
// (saved UPI ids, alias names, AI-misread names) is carried over here. Shared by the Customers tab and the OCR "Customer" step,
// which use the same form.
//
// Order on Save: create the new account -> close the old one (when the user said so) -> move the UPI ids -> carry the names.
// Undo reverses it (names, UPI ids, reopen the old one, delete the new one); Redo runs it again.
import toast from "react-hot-toast";
import { customersApi, nameMappingsApi, upiApi } from "@/services/api";
import type { CarryForwardResult, FinanceType, ProductType } from "@/types";

/** What the form decided on Save. */
export interface CarryOptions {
  fromCustomerId: number;     // the old account
  closeOld: boolean;          // it was still open and the user chose to close it when the new account is saved
  upi: boolean;               // move its saved UPI ids to the new account
  aliases: boolean;           // carry its alias names
  mismatches: boolean;        // carry its AI-misread names
}

/** Options the customer form passes to its onSave. */
export interface CustomerSaveOptions {
  carry?: CarryOptions;
}

/** What actually happened — Undo takes back exactly this. Never throws away partial progress. */
export interface CarryResult {
  closedOld: boolean;
  upiMoved: number;
  names: CarryForwardResult | null;
}

/** One carry-forward kept in an Undo / Redo entry: the options, and the outcome of the latest run. */
export interface CarryRun {
  opts: CarryOptions;
  result: CarryResult | null;
}

export const newCarryRun = (opts: CarryOptions): CarryRun => ({ opts, result: null });

const financeType = (product: ProductType): FinanceType => (product === "edi" ? "EDI" : "IOP");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Move every saved UPI id of one account to another (the server only allows closed <-> open). Returns how many moved. */
export async function moveUpiIds(product: ProductType, fromCustomerId: number, toCustomerId: number): Promise<number> {
  const { data } = await upiApi.moveVpaMappings({
    customer_type: product, from_customer_id: fromCustomerId, to_customer_id: toCustomerId,
  });
  return data.moved;
}

const setClosed = (product: ProductType, id: number, is_closed: boolean) =>
  product === "edi" ? customersApi.updateEdi(id, { is_closed }) : customersApi.updateIop(id, { is_closed });

/** Number of names that were actually copied. */
export const namesCopied = (n: CarryForwardResult | null) => (n ? n.alias.length + n.ai_mismatch.length : 0);

/**
 * Run the carry-forward for a new account that now exists. Never throws: what succeeded is in the result (for Undo) and what failed
 * is told to the user. If the old account cannot be closed, nothing else is attempted — the server only moves between a closed
 * and an open account.
 */
export async function runCarry(product: ProductType, newCustomerId: number, run: CarryRun): Promise<CarryResult> {
  const { opts } = run;
  const result: CarryResult = { closedOld: false, upiMoved: 0, names: null };
  run.result = result;

  if (opts.closeOld) {
    try {
      await setClosed(product, opts.fromCustomerId, true);
      result.closedOld = true;
      toast.success("The old account was closed");
    } catch {
      toast.error("Account created, but the old account could not be closed — its UPI ids and names were not carried over");
      return result;
    }
  }

  if (opts.upi) {
    try {
      result.upiMoved = await moveUpiIds(product, opts.fromCustomerId, newCustomerId);
      if (result.upiMoved > 0) toast.success(`${plural(result.upiMoved, "UPI id", "UPI ids")} moved to the new account`);
    } catch {
      toast.error("Account created, but its UPI ids could not be moved");
    }
  }

  if (opts.aliases || opts.mismatches) {
    try {
      const { data } = await nameMappingsApi.carryForward({
        finance_type: financeType(product), from_customer_id: opts.fromCustomerId, to_customer_id: newCustomerId,
        aliases: opts.aliases, mismatches: opts.mismatches,
      });
      result.names = data;
      const n = namesCopied(data);
      if (n > 0) toast.success(`${plural(n, "name", "names")} carried over to the new account`);
    } catch {
      toast.error("Account created, but its alias / misread names could not be carried over");
    }
  }
  return result;
}

/**
 * Undo of a carry-forward + the creation it belongs to. Order: names, UPI ids, reopen the old account, then `deleteNew`.
 * Every step is repeatable, so after a failure ("Undo failed") pressing Undo again is safe. Throws on failure and never deletes
 * the new account before the others were taken back (the UPI ids would point at nothing).
 */
export async function undoCarry(
  product: ProductType, newCustomerId: number, run: CarryRun | undefined, deleteNew: () => Promise<unknown>,
): Promise<void> {
  const result = run?.result;
  if (run && result) {
    const names = result.names;
    if (names && (names.alias.length || names.ai_mismatch.length)) {
      await nameMappingsApi.undoCarryForward({
        finance_type: financeType(product), customer_id: newCustomerId, aliases: names.alias, mismatches: names.ai_mismatch,
      });
    }
    if (result.upiMoved > 0) await moveUpiIds(product, newCustomerId, run.opts.fromCustomerId);   // back to the closed account
    if (result.closedOld) await setClosed(product, run.opts.fromCustomerId, false);
  }
  await deleteNew();
}
