import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PickCombobox, type PickOption } from "./PickCombobox";

const OPTIONS: PickOption[] = [
  { id: 1, label: "Groceries" }, { id: 2, label: "Medical" }, { id: 3, label: "Gold & Jewellery" }, { id: 4, label: "Eating Out" },
];

function Harness({ onCreate, initial = null, allowClear = false, disabled = false }: {
  onCreate?: (t: string) => Promise<number | null>; initial?: number | null; allowClear?: boolean; disabled?: boolean;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <PickCombobox ariaLabel="Category" options={OPTIONS} value={value} onChange={setValue} onCreate={onCreate} allowClear={allowClear} disabled={disabled} placeholder="Category" />
      <p data-testid="picked">{String(value)}</p>
    </>
  );
}
const box = () => screen.getByRole("combobox", { name: "Category" });
const optionNames = () => screen.queryAllByRole("option").map((o) => o.textContent);

describe("PickCombobox", () => {
  it("opens on focus listing everything, shows the picked label, and a click picks (CB-01)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box());
    expect(optionNames()).toEqual(["Groceries", "Medical", "Gold & Jewellery", "Eating Out"]);
    await user.click(screen.getByRole("option", { name: "Medical" }));
    expect(screen.getByTestId("picked")).toHaveTextContent("2");
    expect(box()).toHaveValue("Medical");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("typing narrows the list (contains, case-insensitive, starts-with first) (CB-02)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box());
    await user.type(box(), "G");
    expect(optionNames()).toEqual(["Groceries", "Gold & Jewellery", "Eating Out"]);          // 'Eating Out' has a g inside
    await user.type(box(), "old");
    expect(optionNames()).toEqual(["Gold & Jewellery"]);
    await user.clear(box());
    await user.type(box(), "zzz");
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
  });

  it("the keyboard works: arrows, Enter to pick, Escape to close without picking (CB-03)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box());
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByTestId("picked")).toHaveTextContent("3");
    await user.click(box());
    await user.type(box(), "med");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box()).toHaveValue("Gold & Jewellery");                                              // typing was abandoned
  });

  it("clicking away without picking keeps the old value (CB-03)", async () => {
    const user = userEvent.setup();
    render(<><Harness initial={1} /><button>elsewhere</button></>);
    await user.click(box());
    await user.type(box(), "xx");
    await user.click(screen.getByText("elsewhere"));
    expect(box()).toHaveValue("Groceries");
    expect(screen.getByTestId("picked")).toHaveTextContent("1");
  });

  it("offers + Create for text that is not in the list, creates it and picks it (CB-04)", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(9);
    render(<Harness onCreate={onCreate} />);
    await user.click(box());
    await user.type(box(), "  Education ");
    const create = screen.getByTestId("pick-create");
    expect(create).toHaveTextContent("+ Create “Education”");
    await user.click(create);
    expect(onCreate).toHaveBeenCalledWith("Education");
    await waitFor(() => expect(screen.getByTestId("picked")).toHaveTextContent("9"));
  });

  it("no + Create when the text matches an entry exactly, when there is no text, or when creating is not allowed (CB-04)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness onCreate={vi.fn()} />);
    await user.click(box());
    expect(screen.queryByTestId("pick-create")).toBeNull();
    await user.type(box(), "medical");
    expect(screen.queryByTestId("pick-create")).toBeNull();                                       // exact match, any case
    unmount();
    render(<Harness />);
    await user.click(box());
    await user.type(box(), "Education");
    expect(screen.queryByTestId("pick-create")).toBeNull();
  });

  it("a creation that fails (null) picks nothing and keeps the text so it can be corrected (CB-04)", async () => {
    const user = userEvent.setup();
    render(<Harness onCreate={vi.fn().mockResolvedValue(null)} />);
    await user.click(box());
    await user.type(box(), "Bad");
    await user.click(screen.getByTestId("pick-create"));
    await waitFor(() => expect(screen.getByTestId("picked")).toHaveTextContent("null"));
    expect(box()).toHaveValue("Bad");
  });

  it("Enter on the create row creates (CB-04)", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(5);
    render(<Harness onCreate={onCreate} />);
    await user.click(box());
    await user.type(box(), "Fuel{Enter}");
    expect(onCreate).toHaveBeenCalledWith("Fuel");
    await waitFor(() => expect(screen.getByTestId("picked")).toHaveTextContent("5"));
  });

  it("can be cleared when allowed, and is inert when disabled (CB-05)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness initial={2} allowClear />);
    await user.click(screen.getByRole("button", { name: "Clear Category" }));
    expect(screen.getByTestId("picked")).toHaveTextContent("null");
    expect(box()).toHaveValue("");
    unmount();
    render(<Harness disabled />);
    expect(box()).toBeDisabled();
  });

  it("marks itself invalid for assistive tech (CB-05)", () => {
    render(<PickCombobox ariaLabel="For whom" options={[]} value={null} onChange={() => {}} invalid />);
    expect(screen.getByRole("combobox", { name: "For whom" })).toHaveAttribute("aria-invalid", "true");
  });
});
