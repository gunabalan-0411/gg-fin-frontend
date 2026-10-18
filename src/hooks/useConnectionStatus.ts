// Whether Google Drive / Gmail are connected. Used by the "Save data for training" toggle and the Settings dot in the menu.
// Fetched at most once a minute and shared, so several components asking at once cause one request. `connected` stays
// null while unknown (loading or the request failed) — callers must only warn when it is explicitly false.
import { useEffect, useState } from "react";
import { driveApi, upiApi } from "@/services/api";

export type ConnectionKind = "drive" | "gmail";
export interface ConnectionState {
  connected: boolean | null;
  email: string | null;
}

const TTL_MS = 60_000;
const UNKNOWN: ConnectionState = { connected: null, email: null };
const cache: Record<ConnectionKind, { at: number; value: ConnectionState; inflight: Promise<void> | null }> = {
  drive: { at: 0, value: UNKNOWN, inflight: null },
  gmail: { at: 0, value: UNKNOWN, inflight: null },
};
const listeners = new Set<() => void>();

function fetchStatus(kind: ConnectionKind) {
  return kind === "drive" ? driveApi.status() : upiApi.gmailStatus();
}

function load(kind: ConnectionKind): Promise<void> {
  const entry = cache[kind];
  if (entry.inflight) return entry.inflight;
  if (entry.at && Date.now() - entry.at < TTL_MS) return Promise.resolve();
  entry.inflight = Promise.resolve()
    .then(() => fetchStatus(kind))
    .then(({ data }) => { entry.value = { connected: Boolean(data.connected), email: data.email ?? null }; })
    .catch(() => { entry.value = UNKNOWN; })
    .finally(() => {
      entry.at = Date.now();
      entry.inflight = null;
      listeners.forEach((l) => l());
    });
  return entry.inflight;
}

/** Forget what we know (after connecting / disconnecting, and between tests). */
export function resetConnectionStatus() {
  for (const kind of ["drive", "gmail"] as ConnectionKind[]) cache[kind] = { at: 0, value: UNKNOWN, inflight: null };
  listeners.forEach((l) => l());
}

export function useConnection(kind: ConnectionKind): ConnectionState {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    void load(kind);
    return () => { listeners.delete(listener); };
  }, [kind]);
  return cache[kind].value;
}
