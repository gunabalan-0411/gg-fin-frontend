import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  customersApi: { updateEdi: vi.fn(), updateIop: vi.fn() },
  upiApi: { moveVpaMappings: vi.fn() },
  nameMappingsApi: { carryForward: vi.fn(), undoCarryForward: vi.fn() },
}));

import toast from "react-hot-toast";
import { customersApi, nameMappingsApi, upiApi } from "@/services/api";
import { namesCopied, newCarryRun, runCarry, undoCarry, type CarryOptions } from "./customerCarry";

const c = customersApi as unknown as Record<"updateEdi" | "updateIop", ReturnType<typeof vi.fn>>;
const upi = upiApi as unknown as Record<"moveVpaMappings", ReturnType<typeof vi.fn>>;
const names = nameMappingsApi as unknown as Record<"carryForward" | "undoCarryForward", ReturnType<typeof vi.fn>>;

const ALL: CarryOptions = { fromCustomerId: 5, closeOld: true, upi: true, aliases: true, mismatches: true };
const COPIED = { same_name: false, alias: ["a1"], ai_mismatch: ["m1", "m2"], skipped: { alias: 0, ai_mismatch: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  c.updateEdi.mockResolvedValue({});
  c.updateIop.mockResolvedValue({});
  upi.moveVpaMappings.mockResolvedValue({ data: { moved: 2 } });
  names.carryForward.mockResolvedValue({ data: COPIED });
  names.undoCarryForward.mockResolvedValue({ data: { removed: { alias: 1, ai_mismatch: 2 } } });
});

describe("runCarry", () => {
  it("EDI: close the old account, move the UPI ids, carry the names — and remembers what happened", async () => {
    const run = newCarryRun(ALL);
    const r = await runCarry("edi", 7, run);
    expect(c.updateEdi).toHaveBeenCalledWith(5, { is_closed: true });
    expect(upi.moveVpaMappings).toHaveBeenCalledWith({ customer_type: "edi", from_customer_id: 5, to_customer_id: 7 });
    expect(names.carryForward).toHaveBeenCalledWith({ finance_type: "EDI", from_customer_id: 5, to_customer_id: 7, aliases: true, mismatches: true });
    expect(r).toEqual({ closedOld: true, upiMoved: 2, names: COPIED });
    expect(run.result).toBe(r);
  });

  it("IOP uses the IOP endpoints and finance type", async () => {
    await runCarry("iop", 7, newCarryRun(ALL));
    expect(c.updateIop).toHaveBeenCalledWith(5, { is_closed: true });
    expect(c.updateEdi).not.toHaveBeenCalled();
    expect(upi.moveVpaMappings).toHaveBeenCalledWith({ customer_type: "iop", from_customer_id: 5, to_customer_id: 7 });
    expect(names.carryForward).toHaveBeenCalledWith(expect.objectContaining({ finance_type: "IOP" }));
  });

  it("only what was chosen runs", async () => {
    const r = await runCarry("edi", 7, newCarryRun({ fromCustomerId: 5, closeOld: false, upi: false, aliases: true, mismatches: false }));
    expect(c.updateEdi).not.toHaveBeenCalled();
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(names.carryForward).toHaveBeenCalledWith(expect.objectContaining({ aliases: true, mismatches: false }));
    expect(r.closedOld).toBe(false);
    const none = await runCarry("edi", 7, newCarryRun({ fromCustomerId: 5, closeOld: false, upi: false, aliases: false, mismatches: false }));
    expect(none).toEqual({ closedOld: false, upiMoved: 0, names: null });
    expect(names.carryForward).toHaveBeenCalledTimes(1);
  });

  it("a failed close stops everything and is told; it never throws", async () => {
    c.updateEdi.mockRejectedValue(new Error("500"));
    const r = await runCarry("edi", 7, newCarryRun(ALL));
    expect(r).toEqual({ closedOld: false, upiMoved: 0, names: null });
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(names.carryForward).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("could not be closed"));
  });

  it("progress made before a later failure is kept in the result (so Undo can take it back)", async () => {
    names.carryForward.mockRejectedValue(new Error("500"));
    const run = newCarryRun(ALL);
    const r = await runCarry("edi", 7, run);
    expect(r).toEqual({ closedOld: true, upiMoved: 2, names: null });
    expect(run.result).toEqual(r);
  });

  it("singular / plural wording", async () => {
    upi.moveVpaMappings.mockResolvedValue({ data: { moved: 1 } });
    names.carryForward.mockResolvedValue({ data: { ...COPIED, alias: ["a"], ai_mismatch: [] } });
    await runCarry("edi", 7, newCarryRun(ALL));
    expect(toast.success).toHaveBeenCalledWith("1 UPI id moved to the new account");
    expect(toast.success).toHaveBeenCalledWith("1 name carried over to the new account");
  });

  it("namesCopied counts both kinds, and nothing for no result", () => {
    expect(namesCopied(COPIED)).toBe(3);
    expect(namesCopied(null)).toBe(0);
  });
});

describe("undoCarry", () => {
  it("without a carry it just deletes the new account", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    await undoCarry("edi", 7, undefined, del);
    expect(del).toHaveBeenCalledTimes(1);
    expect(c.updateEdi).not.toHaveBeenCalled();
    const unrun = newCarryRun(ALL);                                          // never ran (result still null)
    await undoCarry("edi", 7, unrun, del);
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(names.undoCarryForward).not.toHaveBeenCalled();
  });

  it("takes back exactly what happened, in order, and deletes last", async () => {
    const calls: string[] = [];
    names.undoCarryForward.mockImplementation(async () => { calls.push("names"); return {}; });
    upi.moveVpaMappings.mockImplementation(async () => { calls.push("upi"); return { data: { moved: 2 } }; });
    c.updateEdi.mockImplementation(async () => { calls.push("reopen"); return {}; });
    const run = newCarryRun(ALL);
    run.result = { closedOld: true, upiMoved: 2, names: COPIED };
    await undoCarry("edi", 7, run, async () => { calls.push("delete"); });
    expect(calls).toEqual(["names", "upi", "reopen", "delete"]);
    expect(names.undoCarryForward).toHaveBeenCalledWith({ finance_type: "EDI", customer_id: 7, aliases: ["a1"], mismatches: ["m1", "m2"] });
    expect(upi.moveVpaMappings).toHaveBeenCalledWith({ customer_type: "edi", from_customer_id: 7, to_customer_id: 5 });
    expect(c.updateEdi).toHaveBeenCalledWith(5, { is_closed: false });
  });

  it("only undoes what was done: same-name carry, nothing moved, old account was already closed", async () => {
    const run = newCarryRun({ ...ALL, closeOld: false });
    run.result = { closedOld: false, upiMoved: 0, names: { same_name: true, alias: [], ai_mismatch: [], skipped: { alias: 0, ai_mismatch: 0 } } };
    const del = vi.fn().mockResolvedValue(undefined);
    await undoCarry("edi", 7, run, del);
    expect(names.undoCarryForward).not.toHaveBeenCalled();
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(c.updateEdi).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("a failing step throws and the new account is not deleted", async () => {
    upi.moveVpaMappings.mockRejectedValue(new Error("500"));
    const run = newCarryRun(ALL);
    run.result = { closedOld: true, upiMoved: 2, names: null };
    const del = vi.fn();
    await expect(undoCarry("edi", 7, run, del)).rejects.toThrow();
    expect(del).not.toHaveBeenCalled();
    expect(c.updateEdi).not.toHaveBeenCalled();                                // the old account stays closed until its UPI ids are back
  });
});
