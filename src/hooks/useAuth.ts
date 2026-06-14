import { authApi } from "@/services/api";
import toast from "react-hot-toast";

// Auth state is tracked via a non-sensitive flag in sessionStorage.
// The actual JWT lives in an httpOnly cookie set by the server — JS cannot read it,
// which means XSS cannot steal it.
const AUTH_FLAG = "gg_fin_auth";   // just "1" or absent — NOT the token

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(AUTH_FLAG) === "1";
}

function setAuthFlag()   { sessionStorage.setItem(AUTH_FLAG, "1"); }
function clearAuthFlag() { sessionStorage.removeItem(AUTH_FLAG); }

// Module-level listeners for cross-component reactivity
import { useState, useEffect } from "react";
const listeners = new Set<() => void>();
function notify() { listeners.forEach((fn) => fn()); }

type AuthState = {
  authenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
};

export function useAuthStore<T>(selector: (state: AuthState) => T): T {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const fn = () => forceUpdate((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const state: AuthState = {
    authenticated: isAuthenticated(),

    login: async (username, password) => {
      try {
        await authApi.login(username, password);
        // Server has now set the httpOnly cookie. Mark session as active.
        setAuthFlag();
        notify();
        return true;
      } catch {
        toast.error("Invalid credentials");
        return false;
      }
    },

    logout: () => {
      authApi.logout().catch(() => {});  // clear server-side cookie
      clearAuthFlag();
      notify();
    },
  };

  return selector(state);
}

/** Kept for backward compat — returns null (token is no longer readable from JS). */
export function getToken(): string | null {
  return null;
}
