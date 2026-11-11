import axios from "axios";
import type { PollResult, TvCollections, TvCustomer, TvProduct, TvSearchHit } from "./types";

// The paired TV's own HTTP client: it sends the device token in X-TV-Token and has nothing to do with the app's login
// (no cookie, no global 401 handler that would throw the TV at a login page).
const TOKEN_KEY = "gg_tv_token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function saveToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage blocked: the TV simply pairs again next time */ }
}
export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

const http = axios.create({ baseURL: "/api/tv" });
const auth = (token: string) => ({ headers: { "X-TV-Token": token } });

export const tvClient = {
  pairStart: () => http.post<{ code: string; poll_id: string; expires_in: number }>("/pair/start"),
  pairPoll: (poll_id: string) => http.post<PollResult>("/pair/poll", { poll_id }),
  me: (token: string) => http.get<{ name: string }>("/me", auth(token)),
  search: (token: string, q: string, product?: TvProduct) =>
    http.get<{ results: TvSearchHit[] }>("/search", { ...auth(token), params: product ? { q, product } : { q } }),
  collections: (token: string) => http.get<TvCollections>("/collections", auth(token)),
  customer: (token: string, product: TvProduct, id: number) => http.get<TvCustomer>(`/customers/${product}/${id}`, auth(token)),
};

export const isUnauthorized = (err: unknown): boolean => (err as { response?: { status?: number } })?.response?.status === 401;
