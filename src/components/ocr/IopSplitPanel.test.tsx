import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IopSplitPanel, SplitToggle } from "./IopSplitPanel";
import type { SplitRow } from "@/utils/iopSplit";
import type { IopSplitCheck } from "@/types";

const base: SplitRow = { product_type: "IOP", is_paid: true, amount: 10000, principal: 0, customer_id: 4 };

function Harness({ initial = base, check = null }: { initial?: SplitRow; check?: IopSplitCheck | null }) {
  const [row, setRow] = useState<SplitRow>(initial);
  return <IopSplitPanel row={row} check={check} onChange={(p) => setRow((r) => ({ ...r, ...p }))} />;
}
const principal = () => screen.getByRole("spinbutton", { name: "Principal" }) as HTMLInputElement;
const interest = () => screen.getByRole("spinbutton", { name: "Interest" }) as HTMLInputElement;

describe("IopSplitPanel", () => {
  it("starts with everything as interest and the total shown (SP-01)", () => {
    render(<Harness />);
    expect(principal()).toHaveValue(null);
    expect(interest()).toHaveValue(10000);
    expect(screen.getByTestId("split-total")).toHaveTextContent("₹10,000");
  });

  it("typing the principal fills the interest, and the other way round; the total never changes (SP-02)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(principal(), "9500");
    expect(interest()).toHaveValue(500);
    expect(screen.getByTestId("split-hint")).toHaveTextContent("₹500 interest is saved as the transaction · ₹9,500 principal is added to the customer's principal paid.");
    await user.clear(interest());
    await user.type(interest(), "200");
    expect(principal()).toHaveValue(9800);
    expect(screen.getByTestId("split-total")).toHaveTextContent("₹10,000");
    await user.clear(principal());
    expect(interest()).toHaveValue(10000);
  });

  it("shows the customer's balance before and after, from the server's check (SP-03)", () => {
    render(<Harness initial={{ ...base, principal: 9500 }} check={{ index: 0, principal: 9500, interest: 500, balance_before: 17000, balance_after: 7500, error: null }} />);
    expect(screen.getByTestId("split-balance")).toHaveTextContent("Balance ₹17,000 → ₹7,500");
    expect(screen.queryByTestId("split-error")).toBeNull();
  });

  it("no balance line while there is no principal (SP-03)", () => {
    render(<Harness check={{ index: 0, principal: 0, interest: 10000, balance_before: 17000, balance_after: 17000, error: null }} />);
    expect(screen.queryByTestId("split-balance")).toBeNull();
  });

  it("shows the server's refusal, and the page's own problem first (SP-04)", () => {
    const { rerender } = render(<IopSplitPanel row={{ ...base, principal: 9500 }} onChange={() => {}}
      check={{ index: 0, principal: 9500, interest: 500, balance_before: 5000, balance_after: -4500, error: "The principal ₹9,500 is more than the balance ₹5,000 of Ravi" }} />);
    expect(screen.getByTestId("split-error")).toHaveTextContent("more than the balance ₹5,000 of Ravi");
    expect(screen.getByTestId("split-balance")).toHaveTextContent("₹-4,500");
    rerender(<IopSplitPanel row={{ ...base, principal: 12000 }} onChange={() => {}} check={null} />);
    expect(screen.getByTestId("split-error")).toHaveTextContent("more than the amount collected ₹10,000");
  });

  it("an unpaid row and a row without an amount cannot be split, and say why (SP-05)", () => {
    const { rerender } = render(<IopSplitPanel row={{ ...base, is_paid: false }} onChange={() => {}} />);
    expect(principal()).toBeDisabled();
    expect(screen.getByText("An unpaid row has no principal.")).toBeInTheDocument();
    rerender(<IopSplitPanel row={{ ...base, amount: 0 }} onChange={() => {}} />);
    expect(interest()).toBeDisabled();
    expect(screen.getByText("Enter the amount collected first.")).toBeInTheDocument();
  });
});

describe("SplitToggle", () => {
  it("is a toggle button that reports its state, and shows a dot when a split is entered (SP-06)", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<SplitToggle row={base} open={false} onToggle={onToggle} />);
    const btn = screen.getByRole("button", { name: "Split into principal and interest" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("split-dot")).toBeNull();
    await user.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<SplitToggle row={{ ...base, principal: 9500 }} open onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Hide principal and interest" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("split-dot")).toBeInTheDocument();
    expect(screen.getByTestId("split-toggle")).toHaveAttribute("title", "Principal ₹9,500 + interest ₹500");
  });
});
