// Messages for the "Sync Gmail now" buttons (UPI Transactions page, and the empty UPI panel on the OCR page).

export function gmailSyncOk(data: { imported?: number; skipped?: number } | undefined): string {
  const imported = data?.imported ?? 0;
  const skipped = data?.skipped ?? 0;
  return `Gmail synced — ${imported} new, ${skipped} already imported`;
}

export function gmailSyncError(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : "Gmail sync failed — is Gmail connected? (Settings → UPI Import)";
}
