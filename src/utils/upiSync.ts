// Messages for the "Sync Gmail now" buttons (UPI Transactions page, and the empty UPI panel on the OCR page).

export function gmailSyncOk(data: { imported?: number; skipped?: number } | undefined): string {
  const imported = data?.imported ?? 0;
  const skipped = data?.skipped ?? 0;
  return `Gmail synced — ${imported} new, ${skipped} already imported`;
}

/** Why "Unlink" failed (the server's reason when it gave one); `stale`: the list on screen is out of date and should be reloaded. */
export function unlinkError(err: unknown): { message: string; stale: boolean } {
  const res = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const detail = res?.data?.detail;
  return {
    message: typeof detail === "string" && detail ? detail : "Could not unlink — please try again",
    stale: res?.status === 400 || res?.status === 404,
  };
}

export function gmailSyncError(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : "Gmail sync failed — is Gmail connected? (Settings → UPI Import)";
}
