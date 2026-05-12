import { authApi } from "@/services/api";
import toast from "react-hot-toast";

// Simple Zustand store for auth state
// (We use zustand via a light implementation pattern)
type AuthState = {
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
};

// Minimal zustand-like store using localStorage + event-driven re-render
// (avoids adding zustand as a dep; use react state + context pattern instead)
import { useState, useEffect, useCallback } from "react";

const TOKEN_KEY = "gg_fin_token";

// Module-level listeners for cross-component reactivity
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function useAuthStore<T>(selector: (state: AuthState) => T): T {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const fn = () => forceUpdate((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const state: AuthState = {
    token: getToken(),
    login: async (username, password) => {
      try {
        const res = await authApi.login(username, password);
        localStorage.setItem(TOKEN_KEY, res.data.access_token);
        notify();
        return true;
      } catch {
        toast.error("Invalid credentials");
        return false;
      }
    },
    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      notify();
    },
  };

  return selector(state);
}
