/**
 * Re-loan: copying (Duplicate) a customer, in BOTH places that use the form — the Customers tab and the OCR "Customer" step.
 * CR-01 … CR-12.
 *  - an account that is still OPEN first asks "Close the old account?"; a CLOSED one opens the form straight away;
 *  - Yes: the form offers to inherit the old account's UPI ids, alias names and AI-misread names (all ON by default) and says the old account
 *    is closed on Save; No: a new account, nothing inherited, the old account stays open;
 *  - Save: create the new account -> close the old one -> move the UPI ids -> carry the names; Undo takes it back in reverse; Redo repeats it;
 *  - names are stored by name: with the same name the two name switches are locked ON (they follow by themselves).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    customersApi: {
      listEdi: vi.fn(), listIop: vi.fn(), ediSegments: ok([{ segment_id: 1, name: "North" }]), iopSegments: ok([]),
      nextEdiId: ok({ next_id: 7 }), nextIopId: ok({ next_id: 7 }), createEdi: ok(), createIop: ok(),
      updateEdi: ok(), updateIop: ok(), deleteEdi: ok(), deleteIop: ok(), transliterate: ok({ tamil: "" }),
    },
    upiApi: { listVpaMappings: vi.fn(), moveVpaMappings: vi.fn() },
    nameMappingsApi: { carryPreview: vi.fn(), carryForward: vi.fn(), undoCarryForward: vi.fn() },
  };
});

import toast from "react-hot-toast";
import { customersApi, nameMappingsApi, upiApi } from "@/services/api";
import CustomersPage from "@/pages/CustomersPage";
import { CustomerStepOverlay } from "@/components/CustomerStepOverlay";

const cust = customersApi as unknown as Record<"listEdi" | "nextEdiId" | "createEdi" | "updateEdi" | "deleteEdi", ReturnType<typeof vi.fn>>;
const upi = upiApi as unknown as Record<"listVpaMappings" | "moveVpaMappings", ReturnType<typeof vi.fn>>;
const names = nameMappingsApi as unknown as Record<"carryPreview" | "carryForward" | "undoCarryForward", ReturnType<typeof vi.fn>>;

const account = (over: Record<string, unknown> = {}) => ({
  customer_id: 5, customer_name: "Selvam", customer_name_ta: "செல்வம்", tamil_name: "செல்வம்", customer_segment_id: 1,
  loan_amount: 10000, disbursed_amount: 9000, interest: 1000, loan_start_date: "2026-01-05", month: "Jan 2026",
  outstanding_balance: 8000, is_closed: false, ...over,
});
const vpa = (id: number) => ({ id, upi_vpa: `p${id}@upi`, customer_id: 5, customer_type: "edi", customer_name: "Selvam" });
const ALIASES = ["Sel", "Selu"];
const MISMATCHES = ["Selwam", "Silvam", "Selvm"];
const COPIED = { same_name: false, alias: ALIASES, ai_mismatch: MISMATCHES, skipped: { alias: 0, ai_mismatch: 0 } };

const SCREENS: [string, () => React.ReactElement][] = [
  ["Customers tab", () => <CustomersPage />],
  ["OCR Customer step", () => <CustomerStepOverlay onDone={() => {}} onSkip={() => {}} onSkipAll={() => {}} />],
];
const isTab = (make: () => unknown) => make === SCREENS[0][1];

function renderScreen(make: () => React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{make()}</QueryClientProvider>);
}

const user0 = () => userEvent.setup();
type U = ReturnType<typeof userEvent.setup>;
const clickDuplicate = async (user: U) => { await screen.findByText("Selvam"); await user.click(screen.getByTitle("Duplicate customer")); };
const formReady = async () => {
  await screen.findByText(/Duplicate — Copy of #5/);
  await waitFor(() => expect(screen.getByDisplayValue("Selvam")).toBeInTheDocument());
  await waitFor(() => expect(cust.nextEdiId).toHaveBeenCalled());
};
/** Duplicate -> answer the question (an open account) -> the form. */
async function openCopy(user: U, answer: "yes" | "no" | null = "yes") {
  await clickDuplicate(user);
  if (answer) await user.click(await screen.findByTestId(`close-old-${answer}`));
  await formReady();
}
const saveButton = () => screen.getByRole("button", { name: "Save" });
const save = async (user: U) => { await waitFor(() => expect(saveButton()).toBeEnabled()); await user.click(saveButton()); };
const sw = (name: RegExp | string) => screen.getByRole("switch", { name });
const undo = () => screen.getByTitle(/^Undo/);
const redo = () => screen.getByTitle(/^Redo/);
const order = (...fns: ReturnType<typeof vi.fn>[]) => fns.map((f) => f.mock.invocationCallOrder[0]);
const delArgs = (make: () => unknown) => (isTab(make) ? [7, false] : [7]);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  cust.listEdi.mockResolvedValue({ data: { data: [account()], total: 1 } });
  (customersApi as any).listIop.mockResolvedValue({ data: { data: [], total: 0 } });
  upi.listVpaMappings.mockResolvedValue({ data: { data: [vpa(1), vpa(2)] } });
  upi.moveVpaMappings.mockResolvedValue({ data: { moved: 2 } });
  names.carryPreview.mockResolvedValue({ data: { customer: { id: 5, name: "Selvam", is_closed: false, finance_type: "EDI" }, aliases: ALIASES, mismatches: MISMATCHES } });
  names.carryForward.mockResolvedValue({ data: COPIED });
  names.undoCarryForward.mockResolvedValue({ data: { removed: { alias: 2, ai_mismatch: 3 } } });
});

describe.each(SCREENS)("Close the old account? — %s", (_name, make) => {
  it("an account that is already closed opens the form straight away, with no question (CR-01)", async () => {
    cust.listEdi.mockResolvedValue({ data: { data: [account({ is_closed: true })], total: 1 } });
    const user = user0();
    renderScreen(make);
    await openCopy(user, null);
    expect(screen.queryByTestId("close-old-text")).toBeNull();
    expect(screen.queryByTestId("carry-close-note")).toBeNull();
    expect(screen.queryByTestId("carry-keep-note")).toBeNull();
  });

  it("an account that is still open asks first — naming it — and the form is not open yet (CR-02)", async () => {
    const user = user0();
    renderScreen(make);
    await clickDuplicate(user);
    const text = await screen.findByTestId("close-old-text");
    expect(text).toHaveTextContent(/#5\s*Selvam\s*is still open/);
    expect(screen.queryByText(/Duplicate — Copy of/)).toBeNull();
    expect(cust.nextEdiId).not.toHaveBeenCalled();
    expect(upi.listVpaMappings).not.toHaveBeenCalled();
  });

  it("Cancel / Escape on the question does nothing at all (CR-02)", async () => {
    const user = user0();
    renderScreen(make);
    await clickDuplicate(user);
    await user.click(await screen.findByTestId("close-old-cancel"));
    expect(screen.queryByTestId("close-old-text")).toBeNull();
    expect(screen.queryByText(/Duplicate — Copy of/)).toBeNull();

    await clickDuplicate(user);
    await screen.findByTestId("close-old-text");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("close-old-text")).toBeNull());
    expect(screen.queryByText(/Duplicate — Copy of/)).toBeNull();
    expect(cust.updateEdi).not.toHaveBeenCalled();
    expect(cust.createEdi).not.toHaveBeenCalled();
  });

  it("Yes opens the form, says the old account is closed on Save, and offers the three switches — all ON, with counts (CR-03)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    expect(screen.getByTestId("carry-close-note")).toHaveTextContent(/closes the old account #5/);
    expect(cust.updateEdi).not.toHaveBeenCalled();                            // nothing is closed until Save
    await screen.findByTestId("carry-forward");
    for (const label of ["Use existing UPI ids", "Use existing alias names", "Use existing AI-misread names"]) {
      expect(sw(label)).toHaveAttribute("aria-checked", "true");
    }
    expect(screen.getByTestId("reuse-upi-hint")).toHaveTextContent("2 saved UPI ids of the old account will follow this account");
    expect(upi.listVpaMappings).toHaveBeenCalledWith({ customer_id: 5, customer_type: "edi" });
    expect(names.carryPreview).toHaveBeenCalledWith("EDI", 5);
  });

  it("No opens the form with NO switches and a note; nothing is looked up (CR-04)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "no");
    expect(screen.getByTestId("carry-keep-note")).toHaveTextContent(/old account stays open/);
    expect(screen.queryByTestId("carry-forward")).toBeNull();
    expect(screen.queryByTestId("carry-close-note")).toBeNull();
    expect(upi.listVpaMappings).not.toHaveBeenCalled();
    expect(names.carryPreview).not.toHaveBeenCalled();
  });

  it("No: Save only creates the new account — the old one is not closed, nothing moves or is copied — and Undo only deletes it (CR-04)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "no");
    await save(user);
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 40));
    expect(cust.updateEdi).not.toHaveBeenCalled();
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(names.carryForward).not.toHaveBeenCalled();

    await user.click(undo());
    await waitFor(() => expect(cust.deleteEdi).toHaveBeenCalledWith(...delArgs(make)));
    expect(cust.updateEdi).not.toHaveBeenCalled();
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(names.undoCarryForward).not.toHaveBeenCalled();
  });

  it("the answer is forgotten: a later copy of another open account asks again, and Cancel on the form closes nothing (CR-02)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cust.updateEdi).not.toHaveBeenCalled();                            // cancelled: the old account is untouched
    await clickDuplicate(user);
    expect(await screen.findByTestId("close-old-text")).toBeInTheDocument();
  });
});

describe.each(SCREENS)("the switches — %s", (_name, make) => {
  it("a kind with nothing saved has no switch; with nothing to inherit at all there is no section (CR-05)", async () => {
    upi.listVpaMappings.mockResolvedValue({ data: { data: [] } });
    names.carryPreview.mockResolvedValue({ data: { customer: { id: 5, name: "Selvam", is_closed: false, finance_type: "EDI" }, aliases: ALIASES, mismatches: [] } });
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("reuse-alias");
    expect(screen.queryByTestId("reuse-upi")).toBeNull();
    expect(screen.queryByTestId("reuse-mismatch")).toBeNull();
    expect(screen.getByTestId("carry-close-note")).toBeInTheDocument();        // still told that the old account closes

    names.carryPreview.mockResolvedValue({ data: { customer: { id: 5, name: "Selvam", is_closed: false, finance_type: "EDI" }, aliases: [], mismatches: [] } });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openCopy(user, "yes");
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(screen.queryByTestId("carry-forward")).toBeNull();
  });

  it("with the SAME name the two name switches are locked ON and say they follow by themselves; another name unlocks them (CR-06)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("reuse-alias");
    expect(sw("Use existing alias names")).toBeDisabled();
    expect(sw("Use existing alias names")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("reuse-alias-hint")).toHaveTextContent("Same name — the 2 alias names follow this account automatically");
    expect(screen.getByTestId("reuse-mismatch-hint")).toHaveTextContent("Same name — the 3 AI-misread names follow this account automatically");
    expect(sw("Use existing UPI ids")).not.toBeDisabled();                    // UPI ids are not stored by name

    const name = screen.getByDisplayValue("Selvam");
    await user.clear(name);
    await user.type(name, "Selvam Fast Food");
    await waitFor(() => expect(sw("Use existing alias names")).not.toBeDisabled());
    expect(screen.getByTestId("reuse-alias-hint")).toHaveTextContent("2 alias names of the old account will be copied to this account");
    expect(screen.getByTestId("reuse-mismatch-hint")).toHaveTextContent("3 AI-misread names of the old account will be copied to this account");

    await user.click(sw("Use existing alias names"));
    expect(sw("Use existing alias names")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("reuse-alias-hint")).toHaveTextContent("This account starts with no alias names");

    await user.clear(name);
    await user.type(name, "Selvam");                                          // typed back: locked ON again
    await waitFor(() => expect(sw("Use existing alias names")).toBeDisabled());
    expect(sw("Use existing alias names")).toHaveAttribute("aria-checked", "true");
  });

  it("one name of a kind reads in the singular (CR-06)", async () => {
    names.carryPreview.mockResolvedValue({ data: { customer: { id: 5, name: "Selvam", is_closed: false, finance_type: "EDI" }, aliases: ["Sel"], mismatches: ["Selwam"] } });
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("reuse-alias");
    expect(screen.getByTestId("reuse-alias-hint")).toHaveTextContent("Same name — the 1 alias name follows this account automatically");
    expect(screen.getByTestId("reuse-mismatch-hint")).toHaveTextContent("Same name — the 1 AI-misread name follows this account automatically");
  });

  it("the switches go when the new account is saved as CLOSED, and come back when it is open again (CR-07)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("carry-forward");
    await user.click(screen.getByRole("switch", { name: /Account Closed/ }));
    expect(screen.queryByTestId("carry-forward")).toBeNull();
    await user.click(screen.getByRole("switch", { name: /Account Closed/ }));
    expect(await screen.findByTestId("carry-forward")).toBeInTheDocument();
  });

  it("Save waits until the counts are known, so a switch cannot be missed (CR-05)", async () => {
    let finish!: (v: unknown) => void;
    names.carryPreview.mockReturnValue(new Promise((r) => { finish = r; }));
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    expect(saveButton()).toBeDisabled();
    finish({ data: { customer: { id: 5, name: "Selvam", is_closed: false, finance_type: "EDI" }, aliases: ALIASES, mismatches: MISMATCHES } });
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it("every switch is back ON each time the form opens (CR-03)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("carry-forward");
    await user.click(sw("Use existing UPI ids"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openCopy(user, "yes");
    expect(await screen.findByRole("switch", { name: "Use existing UPI ids" })).toHaveAttribute("aria-checked", "true");
  });
});

describe.each(SCREENS)("Save, Undo and Redo — %s", (_name, make) => {
  async function saveWithYes(user: U) {
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("carry-forward");
    await save(user);
    await waitFor(() => expect(names.carryForward).toHaveBeenCalledTimes(1));
  }

  it("creates the new account, THEN closes the old one, THEN moves the UPI ids, THEN carries the names (CR-08)", async () => {
    await saveWithYes(user0());
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ customer_id: 7, customer_name: "Selvam", is_closed: false });
    expect(cust.updateEdi).toHaveBeenCalledTimes(1);
    expect(cust.updateEdi).toHaveBeenCalledWith(5, { is_closed: true });
    expect(upi.moveVpaMappings).toHaveBeenCalledWith({ customer_type: "edi", from_customer_id: 5, to_customer_id: 7 });
    expect(names.carryForward).toHaveBeenCalledWith({ finance_type: "EDI", from_customer_id: 5, to_customer_id: 7, aliases: true, mismatches: true });
    const [create, close, move, carry] = order(cust.createEdi, cust.updateEdi, upi.moveVpaMappings, names.carryForward);
    expect(create).toBeLessThan(close);
    expect(close).toBeLessThan(move);
    expect(move).toBeLessThan(carry);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("5 names carried over to the new account"));
    expect(toast.success).toHaveBeenCalledWith("2 UPI ids moved to the new account");
    expect(toast.success).toHaveBeenCalledWith("The old account was closed");
  });

  it("switches that are OFF are not sent: UPI ids stay, the chosen kind only (CR-09)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("carry-forward");
    const name = screen.getByDisplayValue("Selvam");
    await user.clear(name);
    await user.type(name, "Selvam Fast Food");
    await waitFor(() => expect(sw("Use existing alias names")).not.toBeDisabled());
    await user.click(sw("Use existing UPI ids"));
    await user.click(sw("Use existing alias names"));
    await save(user);
    await waitFor(() => expect(names.carryForward).toHaveBeenCalledTimes(1));
    expect(names.carryForward).toHaveBeenCalledWith({ finance_type: "EDI", from_customer_id: 5, to_customer_id: 7, aliases: false, mismatches: true });
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(cust.updateEdi).toHaveBeenCalledWith(5, { is_closed: true });
  });

  it("all switches OFF: the old account is still closed (the user said Yes) and nothing else happens (CR-09)", async () => {
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("carry-forward");
    const name = screen.getByDisplayValue("Selvam");
    await user.clear(name);
    await user.type(name, "Selvam Fast Food");
    await waitFor(() => expect(sw("Use existing alias names")).not.toBeDisabled());
    for (const l of ["Use existing UPI ids", "Use existing alias names", "Use existing AI-misread names"]) await user.click(sw(l));
    await save(user);
    await waitFor(() => expect(cust.updateEdi).toHaveBeenCalledWith(5, { is_closed: true }));
    await new Promise((r) => setTimeout(r, 40));
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(names.carryForward).not.toHaveBeenCalled();
  });

  it("if the old account cannot be closed, the user is told and nothing is moved or copied (CR-10)", async () => {
    cust.updateEdi.mockRejectedValueOnce(new Error("500"));
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("carry-forward");
    await save(user);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("the old account could not be closed")));
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
    expect(names.carryForward).not.toHaveBeenCalled();
    expect(cust.createEdi).toHaveBeenCalledTimes(1);
  });

  it("a failed UPI move does not stop the names, and each failure is told (CR-10)", async () => {
    upi.moveVpaMappings.mockRejectedValue(new Error("500"));
    await saveWithYes(user0());
    expect(toast.error).toHaveBeenCalledWith("Account created, but its UPI ids could not be moved");
    expect(names.carryForward).toHaveBeenCalledTimes(1);
  });

  it("failed names are told, the UPI ids still moved (CR-10)", async () => {
    names.carryForward.mockRejectedValue(new Error("500"));
    const user = user0();
    renderScreen(make);
    await openCopy(user, "yes");
    await screen.findByTestId("carry-forward");
    await save(user);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Account created, but its alias / misread names could not be carried over"));
    expect(upi.moveVpaMappings).toHaveBeenCalledTimes(1);
  });

  it("the same name: the server answers 'same name', nothing was copied, and Undo does not try to remove names (CR-06)", async () => {
    names.carryForward.mockResolvedValue({ data: { same_name: true, alias: [], ai_mismatch: [], skipped: { alias: 0, ai_mismatch: 0 } } });
    const user = user0();
    await saveWithYes(user);
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining("names carried over"));
    await user.click(undo());
    await waitFor(() => expect(cust.deleteEdi).toHaveBeenCalledTimes(1));
    expect(names.undoCarryForward).not.toHaveBeenCalled();
  });

  it("Undo takes everything back in reverse: names, UPI ids, the old account reopened, and only then the new account deleted (CR-11)", async () => {
    const user = user0();
    await saveWithYes(user);
    await user.click(undo());
    await waitFor(() => expect(cust.deleteEdi).toHaveBeenCalledTimes(1));
    expect(names.undoCarryForward).toHaveBeenCalledWith({ finance_type: "EDI", customer_id: 7, aliases: ALIASES, mismatches: MISMATCHES });
    expect(upi.moveVpaMappings).toHaveBeenLastCalledWith({ customer_type: "edi", from_customer_id: 7, to_customer_id: 5 });
    expect(cust.updateEdi).toHaveBeenLastCalledWith(5, { is_closed: false });
    expect(cust.deleteEdi).toHaveBeenCalledWith(...delArgs(make));
    const undoNames = names.undoCarryForward.mock.invocationCallOrder[0];
    const moveBack = upi.moveVpaMappings.mock.invocationCallOrder[1];
    const reopen = cust.updateEdi.mock.invocationCallOrder[1];
    const del = cust.deleteEdi.mock.invocationCallOrder[0];
    expect(undoNames).toBeLessThan(moveBack);
    expect(moveBack).toBeLessThan(reopen);
    expect(reopen).toBeLessThan(del);
  });

  it("Redo creates the new account again and repeats close -> UPI ids -> names (CR-11)", async () => {
    const user = user0();
    await saveWithYes(user);
    await user.click(undo());
    await waitFor(() => expect(cust.deleteEdi).toHaveBeenCalledTimes(1));
    await user.click(redo());
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(names.carryForward).toHaveBeenCalledTimes(2));
    expect(cust.updateEdi).toHaveBeenNthCalledWith(3, 5, { is_closed: true });                 // close, reopen (undo), close again
    expect(upi.moveVpaMappings).toHaveBeenLastCalledWith({ customer_type: "edi", from_customer_id: 5, to_customer_id: 7 });
    const [create2, close2] = [cust.createEdi.mock.invocationCallOrder[1], cust.updateEdi.mock.invocationCallOrder[2]];
    expect(create2).toBeLessThan(close2);
  });

  it("if the UPI ids cannot be moved back, the old account is NOT reopened and the new one is NOT deleted (CR-12)", async () => {
    const user = user0();
    await saveWithYes(user);
    upi.moveVpaMappings.mockRejectedValueOnce(new Error("500"));
    await user.click(undo());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Undo failed"));
    expect(cust.deleteEdi).not.toHaveBeenCalled();
    expect(cust.updateEdi).toHaveBeenCalledTimes(1);                                          // only the original close
  });

  it("if the names cannot be taken back, nothing else is undone (CR-12)", async () => {
    const user = user0();
    await saveWithYes(user);
    names.undoCarryForward.mockRejectedValueOnce(new Error("500"));
    await user.click(undo());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Undo failed"));
    expect(upi.moveVpaMappings).toHaveBeenCalledTimes(1);
    expect(cust.deleteEdi).not.toHaveBeenCalled();
  });
});

describe("the list shows the old account as closed after the copy (CR-13)", () => {
  it("the Customers tab reloads its list once the carry-over is done", async () => {
    const user = user0();
    renderScreen(SCREENS[0][1]);
    await openCopy(user, "yes");
    await screen.findByTestId("carry-forward");
    const before = cust.listEdi.mock.calls.length;
    await save(user);
    await waitFor(() => expect(names.carryForward).toHaveBeenCalled());
    await waitFor(() => expect(cust.listEdi.mock.calls.length).toBeGreaterThan(before));
    within(document.body);                                                                      // (the list is re-read from the server)
  });
});
