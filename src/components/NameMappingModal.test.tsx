import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MappingItem, MappingPopupData } from "@/types";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  nameMappingsApi: { get: vi.fn(), check: vi.fn(), save: vi.fn(), remember: vi.fn(), suggest: vi.fn(), resync: vi.fn() },
}));

import toast from "react-hot-toast";
import { nameMappingsApi } from "@/services/api";
import { NameMappingModal } from "./NameMappingModal";

const api = nameMappingsApi as unknown as Record<"get" | "check" | "save", ReturnType<typeof vi.fn>>;

const item = (id: number, word: string, over: Partial<MappingItem> = {}): MappingItem => ({
  id, word, use_count: 0, last_used_at: null, created_at: "2026-10-01T00:00:00Z", stale: false, ...over,
});
const data = (aliases: MappingItem[] = [], mismatches: MappingItem[] = []): MappingPopupData => ({
  customer: { id: 5, name: "Kannan", finance_type: "EDI" }, aliases, mismatches, limits: { alias: 3, ai_mismatch: 10 },
});

function setup(props: Partial<React.ComponentProps<typeof NameMappingModal>> = {}) {
  const onClose = vi.fn(); const onSaved = vi.fn();
  render(<NameMappingModal open financeType="EDI" customerId={5} extractedName="Kanan" onClose={onClose} onSaved={onSaved} {...props} />);
  return { onClose, onSaved, user: userEvent.setup() };
}

const section = (kind: "alias" | "ai_mismatch") => within(screen.getByTestId(`section-${kind}`));
const addTo = async (user: ReturnType<typeof userEvent.setup>, kind: "alias" | "ai_mismatch", word: string) => {
  await user.type(section(kind).getByRole("textbox", { name: /^Add / }), word);
  await user.click(section(kind).getByRole("button", { name: /^Add to/ }));
};
const loaded = async () => { await screen.findByText("Kannan"); };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: data() });
  api.check.mockResolvedValue({ data: { conflicts: [] } });
  api.save.mockResolvedValue({ data: data() });
});

describe("loading and layout", () => {
  it("asks for the row's customer and shows header, counters and both sections", async () => {
    setup();
    await loaded();
    expect(api.get).toHaveBeenCalledWith("EDI", 5);
    expect(screen.getByText("EDI")).toBeInTheDocument();
    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByTestId("count-alias")).toHaveTextContent("0/3");
    expect(screen.getByTestId("count-ai_mismatch")).toHaveTextContent("0/10");
    expect(screen.getByText(/Extracted text:/)).toHaveTextContent("“Kanan”");
  });

  it("does nothing without a customer", () => {
    setup({ customerId: null });
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows a load error instead of an empty editor", async () => {
    api.get.mockRejectedValue({ response: { data: { detail: { code: "customer_closed", message: "This customer's account is closed" } } } });
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("account is closed");
  });

  it("shows the notice (why the popup opened)", async () => {
    setup({ notice: "This customer already has 10 AI-mismatch names." });
    await loaded();
    expect(screen.getByRole("status")).toHaveTextContent("already has 10");
  });

  it("lists existing words with usage counts and marks stale ones as good to replace", async () => {
    api.get.mockResolvedValue({ data: data([item(1, "Kan", { use_count: 4 })], [item(2, "Kanan", { stale: true, last_used_at: "2026-01-02T00:00:00Z" })]) });
    setup();
    await loaded();
    expect(section("alias").getByText("Kan")).toBeInTheDocument();
    expect(section("alias").getByText("×4")).toBeInTheDocument();
    expect(section("ai_mismatch").getByTestId("stale-badge")).toHaveTextContent("not used recently");
    expect(section("alias").queryByTestId("stale-badge")).toBeNull();
  });
});

describe("saving happens only on Save (R-14)", () => {
  it("adds, edits and deletes locally; the server is untouched until Save, then receives the final lists", async () => {
    api.get.mockResolvedValue({ data: data([item(1, "Kan")], [item(2, "Kanan")]) });
    const { user, onClose, onSaved } = setup({ extractedName: null });
    await loaded();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();            // nothing changed yet

    await addTo(user, "alias", "Kannan K");                                          // add
    await user.click(section("ai_mismatch").getByRole("button", { name: "Edit Kanan" }));   // edit
    const edit = section("ai_mismatch").getByRole("textbox", { name: "Edit Kanan" });
    await user.clear(edit); await user.type(edit, "Kannam{Enter}");
    await user.click(section("alias").getByRole("button", { name: "Delete Kan" }));  // delete

    expect(api.save).not.toHaveBeenCalled();                                         // still local
    expect(screen.getByTestId("count-alias")).toHaveTextContent("1/3");
    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save).toHaveBeenCalledWith({
      finance_type: "EDI", customer_id: 5, aliases: ["Kannan K"], mismatches: ["Kannam"], resolutions: [], confirmed_similar: [],
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("Cancel discards everything", async () => {
    const { user, onClose } = setup();
    await loaded();
    await addTo(user, "alias", "Temp");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("Enter in the add box adds the word", async () => {
    const { user } = setup();
    await loaded();
    await user.type(section("ai_mismatch").getByRole("textbox", { name: /^Add / }), "Kanaan{Enter}");
    expect(section("ai_mismatch").getByText("Kanaan")).toBeInTheDocument();
  });

  it("Escape while editing a word cancels only that edit — the dialog and the rest of the draft stay", async () => {
    api.get.mockResolvedValue({ data: data([item(1, "Kan")]) });
    const { user, onClose } = setup();
    await loaded();
    await addTo(user, "alias", "Draft Word");                                         // unsaved draft that must survive
    await user.click(section("alias").getByRole("button", { name: "Edit Kan" }));
    const edit = section("alias").getByRole("textbox", { name: "Edit Kan" });
    await user.type(edit, "xyz{Escape}");
    expect(onClose).not.toHaveBeenCalled();                                            // the dialog was NOT closed
    expect(section("alias").queryByRole("textbox", { name: "Edit Kan" })).toBeNull();  // the inline edit was cancelled
    expect(section("alias").getByText("Kan")).toBeInTheDocument();                     // original word unchanged
    expect(section("alias").getByText("Draft Word")).toBeInTheDocument();              // draft kept
    await user.keyboard("{Escape}");                                                   // nothing being edited: Escape closes as usual
    expect(onClose).toHaveBeenCalled();
  });
});

describe("limits (R-15)", () => {
  it("at 3 aliases the add box is disabled; edit and delete still work and free a slot", async () => {
    api.get.mockResolvedValue({ data: data([item(1, "a1"), item(2, "a2"), item(3, "a3")]) });
    const { user } = setup();
    await loaded();
    expect(screen.getByTestId("count-alias")).toHaveTextContent("3/3");
    expect(section("alias").getByRole("textbox", { name: /^Add / })).toBeDisabled();
    expect(section("alias").getByRole("button", { name: /^Add to/ })).toBeDisabled();
    expect(section("alias").getByText(/Limit reached/)).toBeInTheDocument();

    await user.click(section("alias").getByRole("button", { name: "Edit a3" }));     // edit at the limit is fine
    const edit = section("alias").getByRole("textbox", { name: "Edit a3" });
    await user.clear(edit); await user.type(edit, "a3b{Enter}");
    expect(section("alias").getByText("a3b")).toBeInTheDocument();
    expect(screen.getByTestId("count-alias")).toHaveTextContent("3/3");

    await user.click(section("alias").getByRole("button", { name: "Delete a1" }));   // delete frees a slot
    expect(screen.getByTestId("count-alias")).toHaveTextContent("2/3");
    expect(section("alias").getByRole("textbox", { name: /^Add / })).toBeEnabled();
  });

  it("at 10 AI-mismatch names the add box is disabled", async () => {
    api.get.mockResolvedValue({ data: data([], Array.from({ length: 10 }, (_, i) => item(i + 1, `m${i}`))) });
    setup();
    await loaded();
    expect(screen.getByTestId("count-ai_mismatch")).toHaveTextContent("10/10");
    expect(section("ai_mismatch").getByRole("textbox", { name: /^Add / })).toBeDisabled();
  });

  it("suggests replacing a stale word when full", async () => {
    api.get.mockResolvedValue({ data: data([item(1, "a1", { stale: true }), item(2, "a2"), item(3, "a3")]) });
    setup();
    await loaded();
    expect(section("alias").getByText(/try one marked/)).toBeInTheDocument();
  });

  it("rejects a duplicate word and keeps counters right", async () => {
    api.get.mockResolvedValue({ data: data([item(1, "Kan")]) });
    const { user } = setup();
    await loaded();
    await addTo(user, "alias", "Kan");
    expect(section("alias").getByRole("alert")).toHaveTextContent("Already in the list");
    expect(screen.getByTestId("count-alias")).toHaveTextContent("1/3");
  });

  it("a server-side limit error is shown on the right section", async () => {
    api.save.mockRejectedValue({ response: { data: { detail: { code: "limit_exceeded", kind: "alias", limit: 3, message: "At most 3 alias names per customer" } } } });
    const { user } = setup();
    await loaded();
    await addTo(user, "alias", "x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await section("alias").findByRole("alert")).toHaveTextContent("At most 3");
    expect(toast.error).toHaveBeenCalled();
  });

  it("Save is blocked while a merged group is over its limit", async () => {
    api.get.mockResolvedValue({ data: data([], Array.from({ length: 12 }, (_, i) => item(i + 1, `w${i}`))) });
    const { user } = setup();
    await loaded();
    expect(screen.getByTestId("count-ai_mismatch")).toHaveTextContent("12/10");
    await addTo(user, "alias", "ok");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(section("ai_mismatch").getByRole("button", { name: "Delete w0" }));
    await user.click(section("ai_mismatch").getByRole("button", { name: "Delete w1" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("a word already mapped to someone else (R-17)", () => {
  const conflict = { kind: "ai_mismatch" as const, word: "Zed", customers: [{ mapping_id: 8, customer_id: 9, customer_name: "Beta" }] };

  it("names the other customer and offers Keep both / Move / Cancel; default is Keep both", async () => {
    api.check.mockResolvedValue({ data: { conflicts: [conflict] } });
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Zed");
    const box = await screen.findByTestId("conflict");
    expect(box).toHaveTextContent("Already mapped to Beta");
    expect(api.check).toHaveBeenCalledWith({ finance_type: "EDI", customer_id: 5, items: [{ kind: "ai_mismatch", word: "Zed" }] });
    expect(within(box).getByRole("radio", { name: "Keep both" })).toHaveAttribute("aria-checked", "true");
    expect(within(box).getByRole("radio", { name: /Move to this customer/ })).toHaveAttribute("aria-checked", "false");
    expect(within(box).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("Save sends the chosen resolution", async () => {
    api.check.mockResolvedValue({ data: { conflicts: [conflict] } });
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Zed");
    const box = await screen.findByTestId("conflict");
    await user.click(within(box).getByRole("radio", { name: /Move to this customer/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][0].resolutions).toEqual([{ kind: "ai_mismatch", word: "Zed", action: "move" }]);
    expect(api.save.mock.calls[0][0].mismatches).toEqual(["Zed"]);
  });

  it("Keep both is what is sent when the user does not choose", async () => {
    api.check.mockResolvedValue({ data: { conflicts: [conflict] } });
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Zed");
    await screen.findByTestId("conflict");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][0].resolutions).toEqual([{ kind: "ai_mismatch", word: "Zed", action: "keep_both" }]);
  });

  it("Cancel removes the word from the draft (nothing to save)", async () => {
    api.check.mockResolvedValue({ data: { conflicts: [conflict] } });
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Zed");
    const box = await screen.findByTestId("conflict");
    await user.click(within(box).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Zed")).toBeNull();
    expect(screen.queryByTestId("conflict")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("an unchanged existing word is never re-checked", async () => {
    api.get.mockResolvedValue({ data: data([], [item(1, "Zed")]) });
    const { user } = setup();
    await loaded();
    await addTo(user, "alias", "New One");
    expect(api.check).toHaveBeenLastCalledWith({ finance_type: "EDI", customer_id: 5, items: [{ kind: "alias", word: "New One" }] });
  });

  it("a conflict discovered by the server on Save (409) is shown for a decision", async () => {
    api.save.mockRejectedValue({ response: { data: { detail: { code: "conflict", message: "x", conflicts: [conflict] } } } });
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Zed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("conflict")).toHaveTextContent("Beta");
    expect(toast.error).toHaveBeenCalled();
  });

  it("opens with the word already added and the conflict shown when launched from 'Remember this'", async () => {
    api.check.mockResolvedValue({ data: { conflicts: [conflict] } });
    setup({ prefill: { kind: "ai_mismatch", word: "Zed" }, notice: "“Zed” is already mapped to another customer." });
    expect(await screen.findByTestId("conflict")).toHaveTextContent("Beta");
    expect(section("ai_mismatch").getByText("Zed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("one-click add of the extracted text (R-18 helper)", () => {
  it("offers the OCR text as an AI-mismatch name and adds it", async () => {
    const { user } = setup({ extractedName: "Kanaan" });
    await loaded();
    await user.click(screen.getByTestId("quick-add"));
    expect(section("ai_mismatch").getByText("Kanaan")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-add")).toBeNull();                              // already in the list now
  });

  it("is not offered when the text equals the customer name, is a placeholder, or is already listed", async () => {
    api.get.mockResolvedValue({ data: data([item(1, "Kanaan")]) });
    const { rerender } = render(<NameMappingModal open financeType="EDI" customerId={5} extractedName="Kanaan" onClose={() => {}} />);
    await loaded();
    expect(screen.queryByTestId("quick-add")).toBeNull();                              // already an alias
    rerender(<NameMappingModal open financeType="EDI" customerId={5} extractedName="kannan " onClose={() => {}} />);
    expect(screen.queryByTestId("quick-add")).toBeNull();                              // same as the customer (scorer-equal)
    rerender(<NameMappingModal open financeType="EDI" customerId={5} extractedName="[UNCLEAR]" onClose={() => {}} />);
    expect(screen.queryByTestId("quick-add")).toBeNull();
  });

  it("is disabled when the AI-mismatch list is full", async () => {
    api.get.mockResolvedValue({ data: data([], Array.from({ length: 10 }, (_, i) => item(i + 1, `m${i}`))) });
    setup({ extractedName: "Kanaan" });
    await loaded();
    expect(screen.getByTestId("quick-add")).toBeDisabled();
  });
});

describe("a word that looks like an existing customer name (SN-02, SN-06, SN-07)", () => {
  const look = (word: string, over: Record<string, unknown> = {}) => ({
    kind: "ai_mismatch" as const, word,
    matches: [{ customer_id: 9, customer_name: "Selvam Kumar", score: 93.3, own: false, ...over }],
  });
  const checkWith = (similar: unknown[]) => api.check.mockResolvedValue({ data: { conflicts: [], similar } });

  it("warns under the word, naming the customer and the match, with Add anyway and Cancel", async () => {
    checkWith([look("Selvam Kumaar")]);
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Selvam Kumaar");
    const box = await screen.findByTestId("similar");
    expect(box).toHaveTextContent("Looks like an existing customer: Selvam Kumar (93.3% match)");
    expect(within(box).getByRole("button", { name: "Add anyway" })).toHaveAttribute("aria-pressed", "false");
    expect(within(box).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("Save waits for a choice: disabled with a hint until Add anyway is pressed, then the word is sent as confirmed", async () => {
    checkWith([look("Selvam Kumaar")]);
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Selvam Kumaar");
    await screen.findByTestId("similar");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByTestId("similar-hint")).toHaveTextContent("Choose “Add anyway” or “Cancel” for the highlighted name");

    await user.click(within(screen.getByTestId("similar")).getByRole("button", { name: "Add anyway" }));
    expect(screen.getByRole("button", { name: /Will be added anyway/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("similar-hint")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][0].confirmed_similar).toEqual([{ kind: "ai_mismatch", word: "Selvam Kumaar" }]);
    expect(api.save.mock.calls[0][0].mismatches).toEqual(["Selvam Kumaar"]);
  });

  it("pressing Add anyway twice takes the choice back", async () => {
    checkWith([look("Selvam Kumaar")]);
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Selvam Kumaar");
    const box = await screen.findByTestId("similar");
    await user.click(within(box).getByRole("button", { name: "Add anyway" }));
    await user.click(within(box).getByRole("button", { name: /Will be added anyway/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Cancel removes the word, the panel and the hint; nothing is left to save", async () => {
    checkWith([look("Selvam Kumaar")]);
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Selvam Kumaar");
    await user.click(within(await screen.findByTestId("similar")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Selvam Kumaar")).toBeNull();
    expect(screen.queryByTestId("similar")).toBeNull();
    expect(screen.queryByTestId("similar-hint")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();            // nothing changed
  });

  it("two look-alikes need two choices", async () => {
    checkWith([look("Selvam Kumaar"), look("Selvam Kumar K")]);
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Selvam Kumaar");
    await addTo(user, "ai_mismatch", "Selvam Kumar K");
    await waitFor(() => expect(screen.getAllByTestId("similar")).toHaveLength(2));
    expect(screen.getByTestId("similar-hint")).toHaveTextContent("the 2 highlighted names");
    await user.click(within(screen.getAllByTestId("similar")[0]).getByRole("button", { name: "Add anyway" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(within(screen.getAllByTestId("similar")[1]).getByRole("button", { name: "Add anyway" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("a word close to the customer's OWN name is only a note: no panel, no choice, Save stays available", async () => {
    checkWith([look("Kanan", { customer_id: 5, customer_name: "Kannan", score: 90.9, own: true })]);
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Kanan");
    expect(await screen.findByTestId("similar-own")).toHaveTextContent("Very close to this customer’s own name (90.9%)");
    expect(screen.queryByTestId("similar")).toBeNull();
    expect(screen.queryByTestId("similar-hint")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][0].confirmed_similar).toEqual([]);
  });

  it("close to both another customer and its own name: warns, and says so", async () => {
    api.check.mockResolvedValue({ data: { conflicts: [], similar: [{
      kind: "ai_mismatch", word: "Kannan K",
      matches: [{ customer_id: 9, customer_name: "Kannan Kumar", score: 91, own: false }, { customer_id: 5, customer_name: "Kannan", score: 92, own: true }],
    }] } });
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Kannan K");
    const box = await screen.findByTestId("similar");
    expect(box).toHaveTextContent("Kannan Kumar (91% match)");
    expect(box).toHaveTextContent("also close to this customer’s own name");
  });

  it("editing a flagged word drops its warning and its Add anyway, then checks the new text", async () => {
    checkWith([look("Selvam Kumaar")]);
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Selvam Kumaar");
    await user.click(within(await screen.findByTestId("similar")).getByRole("button", { name: "Add anyway" }));

    checkWith([]);                                                                   // the edited text is fine
    await user.click(section("ai_mismatch").getByRole("button", { name: "Edit Selvam Kumaar" }));
    const edit = section("ai_mismatch").getByRole("textbox", { name: "Edit Selvam Kumaar" });
    await user.clear(edit); await user.type(edit, "Selvm{Enter}");
    await waitFor(() => expect(screen.queryByTestId("similar")).toBeNull());
    expect(api.check).toHaveBeenLastCalledWith({ finance_type: "EDI", customer_id: 5, items: [{ kind: "ai_mismatch", word: "Selvm" }] });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][0].confirmed_similar).toEqual([]);                 // the old confirmation did not carry over
  });

  it("removing a confirmed word and adding it again asks again (the old Add anyway is forgotten)", async () => {
    checkWith([look("Selvam Kumaar")]);
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Selvam Kumaar");
    await user.click(within(await screen.findByTestId("similar")).getByRole("button", { name: "Add anyway" }));
    await user.click(section("ai_mismatch").getByRole("button", { name: "Delete Selvam Kumaar" }));
    await addTo(user, "ai_mismatch", "Selvam Kumaar");
    expect(await screen.findByRole("button", { name: "Add anyway" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("a look-alike the server finds on Save (409 similar) is shown for a decision", async () => {
    api.save.mockRejectedValue({ response: { data: { detail: { code: "similar", message: "x", conflicts: [], similar: [look("Zed")] } } } });
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Zed");                                         // the pre-check found nothing
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("similar")).toHaveTextContent("Selvam Kumar");
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("look like an existing customer"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("opens with the word already added and the warning shown when launched from 'Remember this'", async () => {
    checkWith([look("Selvam Kumaar")]);
    setup({ prefill: { kind: "ai_mismatch", word: "Selvam Kumaar" }, notice: "“Selvam Kumaar” looks like the existing customer Selvam Kumar." });
    expect(await screen.findByTestId("similar")).toHaveTextContent("Selvam Kumar");
    expect(section("ai_mismatch").getByText("Selvam Kumaar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("an exact conflict and a look-alike on the same word both show", async () => {
    api.check.mockResolvedValue({ data: {
      conflicts: [{ kind: "ai_mismatch", word: "Zed", customers: [{ mapping_id: 8, customer_id: 9, customer_name: "Beta" }] }],
      similar: [look("Zed")],
    } });
    const { user } = setup();
    await loaded();
    await addTo(user, "ai_mismatch", "Zed");
    expect(await screen.findByTestId("conflict")).toHaveTextContent("Beta");
    expect(screen.getByTestId("similar")).toBeInTheDocument();
  });

  it("an older server that sends no `similar` list changes nothing", async () => {
    api.check.mockResolvedValue({ data: { conflicts: [] } });
    const { user } = setup();
    await loaded();
    await addTo(user, "alias", "Plain");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.queryByTestId("similar")).toBeNull();
  });
});
