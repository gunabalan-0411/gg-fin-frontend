import { useEffect, useRef, useState, useCallback } from "react";
import { authApi } from "@/services/api";
import { isAuthenticated, useAuthStore } from "@/hooks/useAuth";

const WARN_AFTER_MS  = 55 * 60 * 1000; // show warning at 55 min of inactivity
const LOGOUT_AFTER_S = 60;              // seconds of countdown before auto-logout
const REFRESH_EVERY_MS = 30 * 60 * 1000; // silently refresh token every 30 min if active

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const [showInactive, setShowInactive]   = useState(false);
  const [showExpired,  setShowExpired]    = useState(false);
  const [countdown,    setCountdown]      = useState(LOGOUT_AFTER_S);

  const lastActivity  = useRef(Date.now());
  const lastRefresh   = useRef(Date.now());
  const warnShown     = useRef(false);
  const countdownTick = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = useAuthStore((s) => s.logout);

  // ── Activity tracker ──────────────────────────────────────────────────────
  const onActivity = useCallback(() => {
    lastActivity.current = Date.now();
    if (warnShown.current) {
      warnShown.current = false;
      setShowInactive(false);
      if (countdownTick.current) clearInterval(countdownTick.current);
    }
  }, []);

  useEffect(() => {
    const events = ["mousemove", "keydown", "mousedown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [onActivity]);

  // ── 401 listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handle = () => setShowExpired(true);
    window.addEventListener("gg_fin_401", handle);
    return () => window.removeEventListener("gg_fin_401", handle);
  }, []);

  // ── Inactivity check + auto-refresh ──────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      if (!isAuthenticated()) return;   // session flag — no token stored in JS

      const now      = Date.now();
      const inactive = now - lastActivity.current;
      const sinceRef = now - lastRefresh.current;

      if (sinceRef >= REFRESH_EVERY_MS && inactive < 5 * 60 * 1000) {
        authApi.refresh()
          .then(() => { lastRefresh.current = Date.now(); })
          .catch(() => {});
      }

      if (inactive >= WARN_AFTER_MS && !warnShown.current) {
        warnShown.current = true;
        setCountdown(LOGOUT_AFTER_S);
        setShowInactive(true);

        countdownTick.current = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              clearInterval(countdownTick.current!);
              warnShown.current = false;
              setShowInactive(false);
              logout();
              window.location.href = "/login";
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      }
    }, 60_000);

    return () => clearInterval(tick);
  }, [logout]);

  // ── Continue session ──────────────────────────────────────────────────────
  const handleContinue = async () => {
    try { await authApi.refresh(); lastRefresh.current = Date.now(); }
    catch { /* old cookie still valid for remaining window */ }
    lastActivity.current = Date.now();
    warnShown.current = false;
    setShowInactive(false);
    if (countdownTick.current) clearInterval(countdownTick.current);
  };

  const handleLogoutNow = () => {
    if (countdownTick.current) clearInterval(countdownTick.current);
    warnShown.current = false;
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
                <p className="text-xs text-muted-foreground">Session inactive for 55 minutes</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Your session will end in{" "}
              <span className="font-bold text-foreground tabular-nums">{countdown}s</span>{" "}
              to protect your data. Any unsaved changes will be lost.
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
