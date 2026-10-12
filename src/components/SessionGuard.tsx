import { useEffect, useRef, useState, useCallback } from "react";
import { authApi } from "@/services/api";
import { isAuthenticated, useAuthStore } from "@/hooks/useAuth";

const TOKEN_LIFE_MS    = 60 * 60 * 1000; // must match backend ACCESS_TOKEN_EXPIRE_MINUTES
const WARN_BEFORE_S    = 3 * 60;         // show countdown during the last 3 min of the session
const REFRESH_EVERY_MS = 30 * 60 * 1000; // silently refresh token every 30 min if active
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;  // "active" = input within the last 5 min
const TOKEN_AT_KEY     = "gg_fin_token_at";

function getTokenAt(): number {
  try {
    const v = Number(sessionStorage.getItem(TOKEN_AT_KEY));
    if (v > 0) return v;
  } catch { /* ignore */ }
  const now = Date.now();
  setTokenAt(now);
  return now;
}
function setTokenAt(t: number) {
  try { sessionStorage.setItem(TOKEN_AT_KEY, String(t)); } catch { /* ignore */ }
}

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const [showInactive, setShowInactive]   = useState(false);
  const [showExpired,  setShowExpired]    = useState(false);
  const [countdown,    setCountdown]      = useState(WARN_BEFORE_S);

  const lastActivity  = useRef(Date.now());
  const refreshing    = useRef(false);

  const logout = useAuthStore((s) => s.logout);

  const doRefresh = useCallback(async () => {
    if (refreshing.current) return false;
    refreshing.current = true;
    try {
      await authApi.refresh();
      setTokenAt(Date.now());
      return true;
    } catch {
      return false;
    } finally {
      refreshing.current = false;
    }
  }, []);

  // ── Activity tracker ──────────────────────────────────────────────────────
  const onActivity = useCallback(() => { lastActivity.current = Date.now(); }, []);

  useEffect(() => {
    const events = ["mousemove", "keydown", "mousedown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [onActivity]);

  // ── 401 listener (token already invalid) ─────────────────────────────────
  useEffect(() => {
    const handle = () => { setShowInactive(false); setShowExpired(true); };
    window.addEventListener("gg_fin_401", handle);
    return () => window.removeEventListener("gg_fin_401", handle);
  }, []);

  // ── Token age check: auto-refresh, 3-min warning countdown, then expiry ──
  useEffect(() => {
    const tick = setInterval(() => {
      if (!isAuthenticated()) return;   // session flag — no token stored in JS

      const now       = Date.now();
      const age       = now - getTokenAt();
      const remaining = Math.ceil((TOKEN_LIFE_MS - age) / 1000);
      const active    = now - lastActivity.current < ACTIVE_WINDOW_MS;

      if (remaining <= 0) {
        setShowInactive(false);
        setShowExpired(true);
        return;
      }

      // Active user: keep the session alive silently, no interruption.
      if (active && age >= REFRESH_EVERY_MS) {
        doRefresh().then((ok) => { if (ok) setShowInactive(false); });
        if (remaining > WARN_BEFORE_S) return;
      }

      if (remaining <= WARN_BEFORE_S) {
        setCountdown(remaining);
        setShowInactive(true);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [doRefresh]);

  // ── Continue session ──────────────────────────────────────────────────────
  const handleContinue = async () => {
    lastActivity.current = Date.now();
    if (await doRefresh()) setShowInactive(false);
    else { setShowInactive(false); setShowExpired(true); }
  };

  const handleLogoutNow = () => {
    setShowInactive(false);
    logout();
    window.location.href = "/login";
  };

  const handleExpiredRelogin = () => {
    setShowExpired(false);
    logout();
    window.location.href = "/login";
  };

  return (
    <>
      {children}

      {/* ── Inactivity warning ── */}
      {showInactive && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Still there?</h3>
                <p className="text-xs text-muted-foreground">Your session is about to expire</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Your session will expire in{" "}
              <span className="font-bold text-foreground tabular-nums">
                {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
              </span>
              . Click "Continue session" to stay signed in and keep your work.
            </p>
            <div className="flex gap-2">
              <button onClick={handleLogoutNow}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
                Log out
              </button>
              <button onClick={handleContinue}
                className="flex-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/85 transition-colors">
                Continue session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Session expired ── */}
      {showExpired && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Session expired</h3>
                <p className="text-xs text-muted-foreground">You've been signed out</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Your session has expired. Please log in again to continue. Your previously saved data is safe.
            </p>
            <button onClick={handleExpiredRelogin}
              className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/85 transition-colors">
              Log in again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
