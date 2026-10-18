// "Use existing UPI ids": when a CLOSED account is copied into a new (re-opened) one, the closed account's saved UPI ids
// can move to the new customer id. Shared by the Customers tab and the OCR "Customer" step (both use the same form).
import { upiApi } from "@/services/api";
import type { ProductType } from "@/types";

/** Options the customer form passes to its onSave when the user kept "Use existing UPI ids" ON. */
export interface CustomerSaveOptions {
  reuseUpiIdsFrom?: number;          // the closed account whose UPI ids should follow the new one
}

/** Move every saved UPI id of one account to another (the server only allows closed <-> open). Returns how many moved. */
export async function moveUpiIds(product: ProductType, fromCustomerId: number, toCustomerId: number): Promise<number> {
  const { data } = await upiApi.moveVpaMappings({
    customer_type: product, from_customer_id: fromCustomerId, to_customer_id: toCustomerId,
  });
  return data.moved;
}
