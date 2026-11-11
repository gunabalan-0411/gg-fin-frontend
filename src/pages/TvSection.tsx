import { useCallback, useEffect, useRef, useState } from "react";
import { Tv, Trash2 } from "lucide-react";
import { tvAdminApi } from "@/services/api";
import type { TvDevice } from "@/tv/types";

type Toast = (msg: string, type?: "success" | "error") => void;

const label = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 4 } as const;
const input = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontFamily: "inherit",
  border: "1px solid hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))", outline: "none",
} as const;

function when(iso: string | null, never: string): string {
  if (!iso) return never;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return never;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Settings > TV: pair a home TV by typing the code it shows, and see / remove the TVs that are paired. */
export default function TvSection({ showToast }: { showToast: Toast }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("Living room TV");
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<TvDevice[] | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);   // the TV waiting for "Remove?" -> Yes / No

  const load = useCallback(async () => {
    try { setDevices((await tvAdminApi.devices()).data); } catch { setDevices([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // A TV only appears in the list once it has collected its token (it asks every 3 seconds), so look again a little after pairing
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const lookAgainSoon = () => { timers.current.push(setTimeout(load, 4000), setTimeout(load, 9000)); };

  const digits = code.replace(/\D/g, "");
  const canPair = digits.length === 6 && !busy;

  const pair = async () => {
    if (!canPair) return;
    setBusy(true);
    try {
      const { data } = await tvAdminApi.approve(digits, name.trim() || undefined);
      showToast(`${data.name} is paired. It opens by itself in a few seconds.`, "success");
      setCode("");
      await load();
      lookAgainSoon();
    } catch (err: any) {
      showToast(err?.response?.data?.detail ?? "Could not pair this TV", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await tvAdminApi.revoke(id);
      showToast("TV removed. It can no longer open anything.", "success");
      setRemoving(null);
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.detail ?? "Could not remove this TV", "error");
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "hsl(var(--foreground))", margin: 0 }}>TV</h2>
        <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 4, maxWidth: 520 }}>
          Pair your home TV once. It then opens straight to customer search (customer, loan and payments, read-only) with no password to type.
        </p>
      </div>

      <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: 24, maxWidth: 400 }}>
        <p style={{ fontSize: 13, margin: "0 0 14px", color: "hsl(var(--foreground))" }}>Open the app on the TV. It shows a 6-digit code: type it here.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label htmlFor="tv-code" style={label}>Code on the TV</label>
            <input
              id="tv-code" value={code} inputMode="numeric" autoComplete="off" maxLength={7} placeholder="123 456"
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") pair(); }}
              style={{ ...input, fontSize: 18, letterSpacing: ".18em", fontFamily: '"Geist Mono", ui-monospace, monospace' }}
            />
          </div>
          <div>
            <label htmlFor="tv-name" style={label}>Name this TV</label>
            <input id="tv-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={input} />
          </div>
          <button
            onClick={pair} disabled={!canPair}
            style={{
              padding: "9px 0", borderRadius: 8, border: "none", cursor: canPair ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600,
              background: "hsl(var(--foreground))", color: "hsl(var(--background))", opacity: canPair ? 1 : 0.45,
            }}
          >
            {busy ? "Pairing…" : "Pair this TV"}
          </button>
        </div>
      </div>

      <div style={{ margin: "26px 0 10px", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "hsl(var(--muted-foreground))" }}>Paired TVs</div>
      {devices === null ? (
        <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Loading…</p>
      ) : devices.length === 0 ? (
        <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }} data-testid="tv-none">No TV is paired yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 }}>
          {devices.map((d) => (
            <li key={d.id} data-testid="tv-device" style={{ display: "flex", alignItems: "center", gap: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 16px" }}>
              <Tv size={20} style={{ color: "hsl(var(--pos))", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--foreground))" }}>{d.name}</div>
                <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                  Paired {when(d.created_at, "just now")} · Last used {when(d.last_seen_at, "never")}
                </div>
              </div>
              {removing === d.id ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  Remove this TV?
                  <button onClick={() => remove(d.id)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "hsl(var(--neg) / 0.15)", color: "hsl(var(--neg))", fontWeight: 600, cursor: "pointer" }}>Yes</button>
                  <button onClick={() => setRemoving(null)} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid hsl(var(--border))", background: "transparent", color: "hsl(var(--foreground))", cursor: "pointer" }}>No</button>
                </span>
              ) : (
                <button onClick={() => setRemoving(d.id)} aria-label={`Remove ${d.name}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, border: "1px solid hsl(var(--border))", background: "transparent", color: "hsl(var(--muted-foreground))", fontSize: 12.5, cursor: "pointer" }}>
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
