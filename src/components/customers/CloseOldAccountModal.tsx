// Asked when an account that is still OPEN is copied (Duplicate): a re-loan means the old account is closed and a new one created.
//  - "Yes, close it"      : the old account is closed when the new account is SAVED (Cancel on the form changes nothing); the form then
//                           offers to carry over its UPI ids, alias names and AI-misread names.
//  - "No, keep it open"   : a new account is created and nothing is carried over (two open accounts cannot share a UPI id or names).
// Shared by the Customers tab and the OCR "Customer" step.
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { EdiCustomer, IopCustomer } from "@/types";

export function CloseOldAccountModal({ customer, onYes, onNo, onCancel }: {
  customer: EdiCustomer | IopCustomer | null;
  onYes: () => void;
  onNo: () => void;
  onCancel: () => void;
}) {
  if (!customer) return null;
  return (
    <Modal open onClose={onCancel} title="Close the old account?">
      <p data-testid="close-old-text" className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">#{customer.customer_id} {customer.customer_name}</span> is still open.
        For a new loan the old account is closed and a new one is created.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <li><span className="font-medium text-foreground">Yes</span> — the old account is closed when you save the new one, and you can carry over its UPI ids, alias names and AI-misread names.</li>
        <li><span className="font-medium text-foreground">No</span> — the old account stays open and the new one starts without them (two open accounts cannot share them).</li>
      </ul>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" data-testid="close-old-cancel" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="outline" data-testid="close-old-no" onClick={onNo}>No, keep it open</Button>
        <Button type="button" data-testid="close-old-yes" onClick={onYes}>Yes, close it</Button>
      </div>
    </Modal>
  );
}
