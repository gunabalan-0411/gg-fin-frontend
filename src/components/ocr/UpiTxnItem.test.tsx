import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpiTxnItem, type UpiItemTxn } from "./UpiTxnItem";

const txn = (over: Partial<UpiItemTxn> = {}): UpiItemTxn => ({
  id: 7, amount: "1500", sender_name: "SELVAM K", sender_vpa: "selvam@upi", transaction_date: "2026-10-17",
  mapped_customer_id: null, mapped_customer_type: null, mapped_customer_name: null, ...over,
});

function setup(props: Partial<React.ComponentProps<typeof UpiTxnItem>> = {}) {
  const handlers = { onPick: vi.fn(), onApply: vi.fn(), onUndo: vi.fn() };
  const utils = render(<UpiTxnItem txn={txn()} variant="desktop" {...handlers} {...props} />);
  return { ...handlers, ...utils, user: userEvent.setup() };
}

describe("UpiTxnItem — idle", () => {
  it("shows the sender and amount; an unmapped transaction says so; there are NO buttons at all (no strike-out icon) (UP-01)", () => {
    const { container } = setup();
    expect(screen.getByText("SELVAM K")).toBeInTheDocument();
    expect(screen.getByText("₹1,500")).toBeInTheDocument();
    expect(screen.getByText("Unmapped")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector(".lucide-strikethrough")).toBeNull();
    expect(screen.getByTestId("upi-item")).toHaveAttribute("data-state", "idle");
  });

  it("falls back to the UPI id when there is no sender name", () => {
    setup({ txn: txn({ sender_name: null }) });
    expect(screen.getByText("selvam@upi")).toBeInTheDocument();
  });

  it("a mapped transaction shows its customer and product, and Apply only when it can be applied", async () => {
    const mapped = txn({ mapped_customer_id: 1, mapped_customer_type: "edi", mapped_customer_name: "Selvam" });
    const { user, onApply, onPick, rerender } = setup({ txn: mapped, canApply: true });
    expect(screen.getByText("Selvam")).toBeInTheDocument();
    expect(screen.getByText("edi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Apply/ }));
    expect(onApply).toHaveBeenCalledWith(mapped);
    expect(onPick).not.toHaveBeenCalled();
    rerender(<UpiTxnItem txn={mapped} variant="desktop" canApply={false} onPick={onPick} onApply={onApply} onUndo={() => {}} />);
    expect(screen.queryByRole("button", { name: /Apply/ })).toBeNull();
  });
});

describe("UpiTxnItem — highlighted (UP-02, UP-03)", () => {
  it("has the rotating dotted outline, is a button, and shows the match tag", () => {
    setup({ highlighted: true, tag: "Name & amount match" });
    const item = screen.getByRole("button", { name: /Use the payment from SELVAM K, ₹1,500/ });
    expect(item).toHaveAttribute("data-state", "highlight");
    expect(screen.getByTestId("upi-ants")).toBeInTheDocument();
    expect(screen.getByTestId("upi-ants").querySelector("rect")).not.toBeNull();
    expect(screen.getByTestId("upi-match-tag")).toHaveTextContent("Name & amount match");
  });

  it("no tag is shown when nothing matches, and never while not highlighted", () => {
    const { rerender, onPick, onApply, onUndo } = setup({ highlighted: true, tag: null });
    expect(screen.queryByTestId("upi-match-tag")).toBeNull();
    rerender(<UpiTxnItem txn={txn()} variant="desktop" highlighted={false} tag="Amount matches" onPick={onPick} onApply={onApply} onUndo={onUndo} />);
    expect(screen.queryByTestId("upi-match-tag")).toBeNull();
    expect(screen.queryByTestId("upi-ants")).toBeNull();
  });

  it("a click, Enter or Space picks it", async () => {
    const { user, onPick } = setup({ highlighted: true });
    const item = screen.getByRole("button", { name: /Use the payment/ });
    await user.click(item);
    item.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onPick).toHaveBeenCalledTimes(3);
    expect(onPick).toHaveBeenCalledWith(txn());
  });

  it("Apply inside a highlighted item applies — it does not also pick", async () => {
    const mapped = txn({ mapped_customer_id: 1, mapped_customer_type: "edi", mapped_customer_name: "Selvam" });
    const { user, onPick, onApply } = setup({ txn: mapped, highlighted: true, canApply: true });
    await user.click(screen.getByRole("button", { name: /^Apply/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("UpiTxnItem — paired (UP-04)", () => {
  it("is struck through, shows the customer it went to and an Undo — and can no longer be picked", async () => {
    const { user, onUndo, onPick, container } = setup({ paired: { customerName: "Selvam" }, highlighted: true, tag: "Amount matches" });
    const item = screen.getByTestId("upi-item");
    expect(item).toHaveAttribute("data-state", "paired");
    expect(screen.getByText("SELVAM K")).toHaveClass("line-through");
    expect(screen.getByText("₹1,500")).toHaveClass("line-through");
    expect(screen.getByText("Selvam")).toBeInTheDocument();
    expect(screen.queryByTestId("upi-ants")).toBeNull();
    expect(screen.queryByTestId("upi-match-tag")).toBeNull();
    expect(item).not.toHaveAttribute("role", "button");
    await user.click(item);
    expect(onPick).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Undo/ }));
    expect(onUndo).toHaveBeenCalledWith(txn());
    expect(onPick).not.toHaveBeenCalled();
    expect(container.querySelector(".lucide-strikethrough")).toBeNull();
  });
});

describe("UpiTxnItem — Unlink (UL-01)", () => {
  const mapped = txn({ mapped_customer_id: 7, mapped_customer_type: "iop", mapped_customer_name: "sathiskumar" });

  it("a mapped transaction has an Unlink button naming the customer; clicking it unlinks and does nothing else", async () => {
    const onUnlink = vi.fn();
    const { user, onApply, onPick } = setup({ txn: mapped, canApply: true, onUnlink });
    const btn = screen.getByRole("button", { name: "Unlink sathiskumar from SELVAM K" });
    expect(btn).toHaveAttribute("title", "Unlink sathiskumar from this UPI id");
    await user.click(btn);
    expect(onUnlink).toHaveBeenCalledWith(mapped);
    expect(onApply).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Apply/ })).toBeInTheDocument();             // Apply is still there next to it
  });

  it("inside a highlighted item it unlinks — it does not also pick", async () => {
    const onUnlink = vi.fn();
    const { user, onPick } = setup({ txn: mapped, highlighted: true, onUnlink });
    await user.click(screen.getByTestId("upi-unlink"));
    expect(onUnlink).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("is absent for an unlinked transaction, a paired one, and when the page gives no handler", () => {
    const onUnlink = vi.fn();
    const { rerender, onPick, onApply, onUndo } = setup({ txn: txn(), onUnlink });
    expect(screen.queryByTestId("upi-unlink")).toBeNull();                                    // not linked
    rerender(<UpiTxnItem txn={mapped} variant="desktop" paired={{ customerName: "Selvam" }} onPick={onPick} onApply={onApply} onUndo={onUndo} onUnlink={onUnlink} />);
    expect(screen.queryByTestId("upi-unlink")).toBeNull();                                    // paired: Undo instead
    expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument();
    rerender(<UpiTxnItem txn={mapped} variant="desktop" onPick={onPick} onApply={onApply} onUndo={onUndo} />);
    expect(screen.queryByTestId("upi-unlink")).toBeNull();                                    // no handler
  });

  it("desktop shows a compact icon, mobile an icon with the word", () => {
    const onUnlink = vi.fn();
    const { rerender, onPick, onApply, onUndo } = setup({ txn: mapped, onUnlink });
    expect(screen.getByTestId("upi-unlink")).toHaveTextContent("");
    expect(screen.getByTestId("upi-unlink").querySelector("svg")).not.toBeNull();
    rerender(<UpiTxnItem txn={mapped} variant="mobile" onPick={onPick} onApply={onApply} onUndo={onUndo} onUnlink={onUnlink} />);
    expect(screen.getByTestId("upi-unlink")).toHaveTextContent("Unlink");
  });

  it("falls back to 'the customer' when the name is missing", () => {
    setup({ txn: txn({ mapped_customer_id: 7, mapped_customer_type: "iop", mapped_customer_name: null }), onUnlink: vi.fn() });
    expect(screen.getByRole("button", { name: "Unlink the customer from SELVAM K" })).toBeInTheDocument();
  });
});

describe("UpiTxnItem — mobile", () => {
  it("renders as a card and still has the highlight, tag and Undo", () => {
    setup({ variant: "mobile", highlighted: true, tag: "Name matches" });
    expect(screen.getByTestId("upi-item").className).toMatch(/rounded-xl/);
    expect(screen.getByTestId("upi-ants")).toBeInTheDocument();
    expect(screen.getByTestId("upi-match-tag")).toHaveTextContent("Name matches");
  });
});
