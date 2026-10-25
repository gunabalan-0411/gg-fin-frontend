import axios from "axios";
import type {
  CarryForwardResult, CarryPreview, IopSplitCheck, PersonalDashboard, PersonalRecordKind, Expense, ExpenseCategory, ExpenseFilters, ExpensePerson, ExpenseSummary, FinanceType, LegacyExpenseGroup, MappingCandidate, MappingConflict, MappingKind, MappingPopupData, MappingResolution, MappingSimilar, NotePage, NotePageSummary, PageInk, RememberResult,
} from "@/types";

export interface UpiPairing {
  txn_id: number;
  customer_id: number;
  customer_type: "edi" | "iop";
  customer_name?: string;
  replace?: boolean;
}

// withCredentials sends the httpOnly auth cookie on every request automatically.
// The Authorization header fallback is kept for dev/API-client use only.
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error.config?.url ?? "";
    const isAuthEndpoint = url.includes("/auth/login") || url.includes("/auth/refresh");
    const isStatusPoll = url.includes("/import/status/");
    if (error.response?.status === 401 && !isStatusPoll && !isAuthEndpoint) {
      window.dispatchEvent(new CustomEvent("gg_fin_401"));
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) => {
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    // Server sets httpOnly cookie in the response; token in body kept for compat.
    return api.post<{ access_token: string }>("/auth/login", form);
  },
  logout: () => api.post<{ ok: boolean }>("/auth/logout"),
  refresh: () => api.post<{ access_token: string }>("/auth/refresh"),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ ok: boolean }>("/auth/change-password", { current_password, new_password }),
};

// ── Customers ─────────────────────────────────────────────────────────────
export const customersApi = {
  listEdi: (params?: object) => api.get("/customers/edi", { params }),
  getEdi: (id: number) => api.get(`/customers/edi/${id}`),
  nextEdiId: () => api.get("/customers/edi/next-id"),
  createEdi: (data: object) => api.post("/customers/edi", data),
  updateEdi: (id: number, data: object) => api.patch(`/customers/edi/${id}`, data),
  deleteEdi: (id: number, resequence?: boolean) =>
    api.delete(`/customers/edi/${id}`, { params: { resequence: resequence ?? false } }),

  listIop: (params?: object) => api.get("/customers/iop", { params }),
  getIop: (id: number) => api.get(`/customers/iop/${id}`),
  nextIopId: () => api.get("/customers/iop/next-id"),
  createIop: (data: object) => api.post("/customers/iop", data),
  updateIop: (id: number, data: object) => api.patch(`/customers/iop/${id}`, data),
  deleteIop: (id: number, resequence?: boolean) =>
    api.delete(`/customers/iop/${id}`, { params: { resequence: resequence ?? false } }),

  ediTransactions: (id: number) => api.get(`/customers/edi/${id}/transactions`),
  iopTransactions: (id: number) => api.get(`/customers/iop/${id}/transactions`),

  ediSegments: () => api.get("/customers/edi/segments"),
  iopSegments: () => api.get("/customers/iop/segments"),

  transliterate: (text: string) =>
    api.post<{ tamil: string }>("/customers/transliterate", { text }),
};

// ── Transactions ──────────────────────────────────────────────────────────
export const transactionsApi = {
  listEdi: (collection_date: string) => api.get("/transactions/edi", { params: { collection_date } }),
  createEdi: (data: object) => api.post("/transactions/edi", data),
  updateEdi: (id: number, data: object) => api.patch(`/transactions/edi/${id}`, data),
  deleteEdi: (id: number) => api.delete(`/transactions/edi/${id}`),

  listIop: (collection_date: string) => api.get("/transactions/iop", { params: { collection_date } }),
  createIop: (data: object) => api.post("/transactions/iop", data),
  updateIop: (id: number, data: object) => api.patch(`/transactions/iop/${id}`, data),
  deleteIop: (id: number) => api.delete(`/transactions/iop/${id}`),
};

// ── Expenses ──────────────────────────────────────────────────────────────
export const expensesApi = {
  list: (params?: object) => api.get("/expenses", { params }),
  create: (data: object) => api.post("/expenses", data),
  /** Several expense lines at once (the OCR Expense step): all are saved or none. */
  createBulk: (items: ExpenseNew[]) => api.post<Expense[]>("/expenses/bulk", { items }),
  summary: (params?: ExpenseFilters) => api.get<ExpenseSummary>("/expenses/summary", { params }),
  /** CSV (rows or category totals) with a Total line at the end. */
  exportCsv: (kind: "rows" | "summary", params?: ExpenseFilters) =>
    api.get<Blob>("/expenses/export", { params: { kind, ...params }, responseType: "blob" }),
  /** Old, ungrouped expenses - one line per distinct notes text - with the suggested category / person. */
  legacyGroups: () => api.get<{ groups: LegacyExpenseGroup[]; count: number; total: number | string }>("/expenses/legacy-groups"),
  applyLegacy: (items: { notes: string | null; category_id: number; person_id: number | null }[]) =>
    api.post<{ updated: number }>("/expenses/legacy-groups/apply", { items }),
  update: (id: number, data: object) => api.patch(`/expenses/${id}`, data),
  delete: (id: number) => api.delete(`/expenses/${id}`),
};

// ── Personal Finance: the logged-in person's OWN expenses (same shape as expensesApi, never shared) ──
export const personalApi = {
  list: (params?: object) => api.get("/personal/expenses", { params }),
  create: (data: object) => api.post("/personal/expenses", data),
  update: (id: number, data: object) => api.patch(`/personal/expenses/${id}`, data),
  delete: (id: number) => api.delete(`/personal/expenses/${id}`),
  summary: (params?: ExpenseFilters) => api.get<ExpenseSummary>("/personal/expenses/summary", { params }),
  exportCsv: (kind: "rows" | "summary", params?: ExpenseFilters) =>
    api.get<Blob>("/personal/expenses/export", { params: { kind, ...params }, responseType: "blob" }),
  /** The Personal view of the main dashboard. */
  dashboard: () => api.get<PersonalDashboard>("/personal/dashboard"),
  /** Savings accounts / friendly lends / gifts received (the logged-in person's own). */
  records: <T = unknown>(kind: PersonalRecordKind) => api.get<T[]>(`/personal/${kind}`),
  createRecord: (kind: PersonalRecordKind, data: object) => api.post(`/personal/${kind}`, data),
  updateRecord: (kind: PersonalRecordKind, id: number, data: object) => api.patch(`/personal/${kind}/${id}`, data),
  deleteRecord: (kind: PersonalRecordKind, id: number) => api.delete(`/personal/${kind}/${id}`),
};

// ── Expense categories (two levels) and "for whom" ─────────────────────────
export const expenseGroupsApi = {
  categories: () => api.get<ExpenseCategory[]>("/expense-groups/categories"),
  createCategory: (name: string, parent_id: number | null) => api.post<ExpenseCategory>("/expense-groups/categories", { name, parent_id }),
  renameCategory: (id: number, name: string) => api.patch(`/expense-groups/categories/${id}`, { name }),
  deleteCategory: (id: number) => api.delete<{ deleted: number; moved: number }>(`/expense-groups/categories/${id}`),
  persons: () => api.get<ExpensePerson[]>("/expense-groups/persons"),
  createPerson: (name: string) => api.post<ExpensePerson>("/expense-groups/persons", { name }),
  renamePerson: (id: number, name: string) => api.patch(`/expense-groups/persons/${id}`, { name }),
  deletePerson: (id: number) => api.delete<{ deleted: number; unspecified: number }>(`/expense-groups/persons/${id}`),
};

/** One new expense line. "For whom" is required; the category defaults to Miscellaneous on the server. */
export interface ExpenseNew {
  amount: number;
  date: string;
  notes?: string | null;
  category_id?: number | null;
  person_id: number;
}

// ── Debts ─────────────────────────────────────────────────────────────────
export const debtsApi = {
  list: () => api.get("/debts"),
  create: (data: object) => api.post("/debts", data),
  update: (id: number, data: object) => api.patch(`/debts/${id}`, data),
  delete: (id: number) => api.delete(`/debts/${id}`),
  listRepayments: (debtId: number) => api.get(`/debts/${debtId}/repayments`),
  createRepayment: (debtId: number, data: object) => api.post(`/debts/${debtId}/repayments`, data),
  updateRepayment: (debtId: number, repaymentId: number, data: object) =>
    api.patch(`/debts/${debtId}/repayments/${repaymentId}`, data),
  deleteRepayment: (debtId: number, repaymentId: number) =>
    api.delete(`/debts/${debtId}/repayments/${repaymentId}`),
};

// ── Investors ─────────────────────────────────────────────────────────────
export const investorsApi = {
  list: () => api.get("/investors"),
  create: (data: object) => api.post("/investors", data),
  update: (id: number, data: object) => api.patch(`/investors/${id}`, data),
  delete: (id: number) => api.delete(`/investors/${id}`),
};

// ── Unclaimed Balances ────────────────────────────────────────────────────
export const unclaimedBalancesApi = {
  list: () => api.get("/unclaimed-balances"),
  lookupName: (customer_id: number, product: string) =>
    api.get<{ customer_name: string }>("/unclaimed-balances/lookup-name", { params: { customer_id, product } }),
  create: (data: object) => api.post("/unclaimed-balances", data),
  delete: (id: number) => api.delete(`/unclaimed-balances/${id}`),
};

// ── Defaulted Balances ────────────────────────────────────────────────────
export const defaultedBalancesApi = {
  list: () => api.get("/defaulted-balances"),
  lookupName: (customer_id: number, product: string) =>
    api.get<{ customer_name: string }>("/defaulted-balances/lookup-name", { params: { customer_id, product } }),
  create: (data: object) => api.post("/defaulted-balances", data),
  delete: (id: number) => api.delete(`/defaulted-balances/${id}`),
};

// ── Dashboard ─────────────────────────────────────────────────────────────
export const dashboardApi = {
  summary: () => api.get("/dashboard/summary"),
  dailyActivity: (days?: number) => api.get("/dashboard/daily-activity", { params: { days } }),
  loanSummary: () => api.get("/dashboard/loan-summary"),
  iopReminders: () => api.get("/dashboard/iop-reminders"),
  iopCalendar: (year: number, month: number) => api.get("/dashboard/iop-calendar", { params: { year, month } }),
  ediInactive: () => api.get("/dashboard/edi-inactive"),
  ediDefaulters: () => api.get("/dashboard/edi-defaulters"),
  iopMonthlyDues: () => api.get("/dashboard/iop-monthly-dues"),
};

// ── Voice ─────────────────────────────────────────────────────────────────
const TRANSCRIBE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes for long audio

export const voiceApi = {
  modelStatus: () => api.get<{ loaded: boolean; on_disk: boolean; downloading: boolean; download_progress: number; idle_seconds: number; seconds_until_unload: number }>("/voice/model-status"),
  modelLoad: () => api.post<{ loaded: boolean; on_disk: boolean; downloading: boolean; download_progress: number; idle_seconds: number; seconds_until_unload: number }>("/voice/model-load"),
  modelUnload: () => api.post<{ loaded: boolean; on_disk: boolean; downloading: boolean; download_progress: number; idle_seconds: number; seconds_until_unload: number }>("/voice/model-unload"),
  modelReset: () => api.post<{ deleted_from_drive: number; loaded: boolean; on_disk: boolean; downloading: boolean; download_progress: number; idle_seconds: number; seconds_until_unload: number }>("/voice/model-reset"),
  deviceInfo: () => api.get<{ device: string; device_name: string; gpu_available: boolean }>("/voice/device-info"),
  setDevice: (device: "cpu" | "cuda") => api.post<{ device: string; device_name: string; gpu_available: boolean }>("/voice/set-device", { device }),
  transcribe: (audioBlob: Blob, product: string, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("audio", audioBlob, "recording.webm");
    form.append("product", product);
    return api.post("/voice/transcribe", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: TRANSCRIBE_TIMEOUT_MS,
      signal,
    });
  },
  transcribeOnline: (audioBlob: Blob, product: string, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("audio", audioBlob, "recording.webm");
    form.append("product", product);
    return api.post("/voice/transcribe-online", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: TRANSCRIBE_TIMEOUT_MS,
      signal,
    });
  },
  submit: (entries: object[], collection_date: string, product: string) =>
    api.post<{ submitted: number; principal_added?: number }>("/voice/submit", entries, { params: { collection_date, product } }),
  /** Live check of the IOP rows split into principal + interest (same rules as the OCR page). Saves nothing. */
  splitCheck: (records: any[]) => api.post<{ rows: IopSplitCheck[] }>("/ocr/iop-split-check", { records }),
  detectOnline: (transcription: string, product: string) =>
    api.post<{ customer_ids: number[] }>("/voice/detect-online", { transcription, product }),
};

// ── Name Map ──────────────────────────────────────────────────────────────
export const namemapApi = {
  listEdi: (params?: object) => api.get("/namemap/edi", { params }),
  listIop: (params?: object) => api.get("/namemap/iop", { params }),
  upsertEdi: (customer_id: number, data: object) => api.put(`/namemap/edi/${customer_id}`, data),
  upsertIop: (customer_id: number, data: object) => api.put(`/namemap/iop/${customer_id}`, data),
  deleteEdi: (customer_id: number) => api.delete(`/namemap/edi/${customer_id}`),
  deleteIop: (customer_id: number) => api.delete(`/namemap/iop/${customer_id}`),

  listEdiSegments: (params?: object) => api.get("/namemap/edi/segments", { params }),
  listIopSegments: (params?: object) => api.get("/namemap/iop/segments", { params }),
  upsertEdiSegment: (segment_id: number, data: object) => api.put(`/namemap/edi/segments/${segment_id}`, data),
  upsertIopSegment: (segment_id: number, data: object) => api.put(`/namemap/iop/segments/${segment_id}`, data),
  deleteEdiSegment: (segment_id: number) => api.delete(`/namemap/edi/segments/${segment_id}`),
  deleteIopSegment: (segment_id: number) => api.delete(`/namemap/iop/segments/${segment_id}`),
};

// ── Backup ────────────────────────────────────────────────────────────────
export const backupApi = {
  export: () => api.get("/backup/export", { responseType: "blob" }),
  importDb: (file: File) =>
    api.post<{ job_id: string }>("/backup/import", (() => {
      const form = new FormData();
      form.append("file", file);
      return form;
    })()),
  importStatus: (jobId: string) =>
    api.get<{ progress: number; status: string; message: string }>(
      `/backup/import/status/${jobId}`
    ),
};

// ── Training data → Google Drive (OCR page + table, Voice recordings + table) ──
// The server only relays these to Drive; it never stores them.
export const trainingDataApi = {
  saveOcr: (form: FormData) =>
    api.post<{ saved: number; folder: string; files: string[] }>("/training-data/ocr", form),
  saveVoice: (form: FormData) =>
    api.post<{ saved: number; folder: string; files: string[] }>("/training-data/voice", form),
};

// ── UPI ───────────────────────────────────────────────────────────────────
export const upiApi = {
  gmailAuthUrl: () => api.get<{ url: string }>("/upi/gmail/auth-url"),
  gmailStatus: () => api.get<{ connected: boolean; email: string | null }>("/upi/gmail/status"),
  gmailSync: () => api.post<{ imported: number; skipped: number; total_found: number }>("/upi/gmail/sync"),
  gmailDisconnect: () => api.delete("/upi/gmail/disconnect"),
  importCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ imported: number; skipped: number; errors: number }>("/upi/import-csv", form);
  },
  list: (params?: object) => api.get<{ data: any[]; total: number }>("/upi/transactions", { params }),
  mapCustomer: (id: number, data: { customer_id: number | null; customer_type: string | null }) =>
    api.patch(`/upi/transactions/${id}/map`, null, { params: data }),
  deleteTransaction: (id: number) => api.delete(`/upi/transactions/${id}`),
  listVpaMappings: (params?: { customer_id?: number; customer_type?: string }) =>
    api.get<{ data: any[] }>("/upi/vpa-mappings", { params }),
  // Pairings made on the OCR page, saved when the page is submitted (UPI id → customer, for future auto-mapping)
  applyPairings: (pairings: UpiPairing[]) =>
    api.post<{ paired: number; created: number; replaced: number; unchanged: number; stamped: number; skipped: { txn_id: number; reason: string }[] }>(
      "/upi/vpa-mappings/apply-pairings", { pairings }),
  // "Unlink" on a mapped transaction: its UPI id stops pointing at the customer (saved mapping deleted, links cleared)
  unlinkVpa: (txnId: number) =>
    api.post<{ removed_mappings: number; cleared: number; upi_vpa: string | null }>("/upi/vpa-mappings/unlink", { txn_id: txnId }),
  // "Use existing UPI ids": move a closed account's UPI ids to its re-opened copy (and back, for undo)
  moveVpaMappings: (body: { customer_type: string; from_customer_id: number; to_customer_id: number }) =>
    api.post<{ moved: number }>("/upi/vpa-mappings/move", body),
  createVpaMapping: (params: { upi_vpa: string; customer_id: number; customer_type: string; customer_name?: string }) =>
    api.post("/upi/vpa-mappings", null, { params }),
  deleteVpaMapping: (id: number) => api.delete(`/upi/vpa-mappings/${id}`),
  uniqueVpas: () => api.get<{ data: any[] }>("/upi/unique-vpas"),
  customersWithBalance: () => api.get<{ data: any[] }>("/upi/customers-with-balance"),
  fuzzySuggest: (query: string) => api.post<{ data: any[] }>("/upi/fuzzy-suggest", null, { params: { query } }),
};

// ── OCR ───────────────────────────────────────────────────────────────────
export const ocrApi = {
  upload: (form: FormData, onProgress?: (pct: number) => void) =>
    api.post<{ session_id: string; total_pages: number }>("/ocr/upload", form, {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    }),
  getPage: (sessionId: string, pageIndex: number) =>
    api.get<{ page_image_b64: string }>(`/ocr/page/${sessionId}/${pageIndex}`),
  /** Where the ink is on a page (OpenCV on the server): the ink mask and one box per character, for the scan animation. */
  pageInk: (sessionId: string, pageIndex: number) =>
    api.get<PageInk>(`/ocr/page/${sessionId}/${pageIndex}/ink`),
  extract: (body: { session_id: string; page_index: number; model?: string }) =>
    api.post<{ page_image_b64: string; records: any[]; mapping_warning?: string }>("/ocr/extract", body),
  submit: (body: { records: any[] }) =>
    api.post<{ submitted: number; mapping_usage?: number; principal_added?: number }>("/ocr/submit", body),
  /** Live check of the IOP rows split into principal + interest: interest, balance before / after, and why it would be refused. Saves nothing. */
  splitCheck: (records: any[]) => api.post<{ rows: IopSplitCheck[] }>("/ocr/iop-split-check", { records }),
};

// ── Alias / AI-mismatch name mappings ─────────────────────────────────────
export const nameMappingsApi = {
  /** Popup contents for the customer a row is assigned to. */
  get: (finance_type: FinanceType, customer_id: number) =>
    api.get<MappingPopupData>("/name-mappings", { params: { finance_type, customer_id } }),
  /** Which of these words already belong to ANOTHER active customer, and which look (90%+) like a customer name? */
  check: (body: { finance_type: FinanceType; customer_id: number; items: { kind: MappingKind; word: string }[] }) =>
    api.post<{ conflicts: MappingConflict[]; similar: MappingSimilar[] }>("/name-mappings/check", body),
  /** The popup's Save: replaces the customer's alias / AI-mismatch lists. */
  save: (body: {
    finance_type: FinanceType;
    customer_id: number;
    aliases: string[];
    mismatches: string[];
    resolutions: MappingResolution[];
    confirmed_similar: { kind: MappingKind; word: string }[];     // look-alike words the user chose to "Add anyway"
  }) => api.put<MappingPopupData>("/name-mappings/customer", body),
  /** One-click "Remember this" (AI-mismatch only). */
  remember: (body: { finance_type: FinanceType; customer_id: number; word: string }) =>
    api.post<RememberResult>("/name-mappings/remember", body),
  /** Dropdown column 2 for text being typed. */
  suggest: (finance_type: FinanceType, query: string) =>
    api.post<{ candidates: MappingCandidate[] }>("/name-mappings/suggest", { finance_type, query }),
  resync: () => api.post<{ repointed: number; alias_rows: number; mismatch_rows: number }>("/name-mappings/resync"),
  /** Re-loan: the alias / AI-mismatch names stored under a customer's name — open or closed (the popup refuses closed ones). */
  carryPreview: (finance_type: FinanceType, customer_id: number) =>
    api.get<CarryPreview>("/name-mappings/carry-forward", { params: { finance_type, customer_id } }),
  /** Re-loan: carry a closed account's names to the open account that replaces it (copies under the new name when it differs). */
  carryForward: (body: { finance_type: FinanceType; from_customer_id: number; to_customer_id: number; aliases: boolean; mismatches: boolean }) =>
    api.post<CarryForwardResult>("/name-mappings/carry-forward", body),
  /** Undo of the above: remove exactly the words it added. */
  undoCarryForward: (body: { finance_type: FinanceType; customer_id: number; aliases: string[]; mismatches: string[] }) =>
    api.post<{ removed: { alias: number; ai_mismatch: number } }>("/name-mappings/carry-forward/undo", body),
};

// ── Note Pad (Markdown pages) ──────────────────────────────────────────────
export const notesApi = {
  list: () => api.get<NotePageSummary[]>("/notes"),
  get: (id: number) => api.get<NotePage>(`/notes/${id}`),
  create: (body: { title?: string; content?: string }) => api.post<NotePage>("/notes", body),
  /** `version` = the version the editor was based on; the server answers 409 `stale` when someone saved in between. */
  update: (id: number, body: { version: number; title?: string; content?: string }) => api.patch<NotePage>(`/notes/${id}`, body),
  remove: (id: number) => api.delete(`/notes/${id}`),
};

// ── Setup (no auth required) ───────────────────────────────────────────────
export const setupApi = {
  status: () => api.get<{ is_fresh: boolean }>("/setup/status"),
  driveAuthUrl: () => api.get<{ url: string }>("/setup/drive-auth-url"),
  driveStatus: () => api.get<{ connected: boolean; email: string | null }>("/setup/drive-status"),
  restoreLatest: () => api.post<{ job_id: string; file_name: string }>("/setup/restore-latest"),
  restoreStatus: (jobId: string) => api.get<{ progress: number; status: string; message: string }>(`/setup/restore-status/${jobId}`),
};

export const driveApi = {
  authUrl: () => api.get<{ url: string }>("/drive/auth-url"),
  status: () => api.get<{ connected: boolean; email: string | null }>("/drive/status"),
  disconnect: () => api.delete("/drive/disconnect"),
  export: () => api.post<{ file_id: string; file_name: string; web_view_link: string | null }>("/drive/export"),
  files: () => api.get<{ data: { id: string; name: string; size: string; modifiedTime: string }[] }>("/drive/files"),
  import: (fileId: string) => api.post<{ job_id: string }>(`/drive/import/${fileId}`),
  importStatus: (jobId: string) => api.get<{ progress: number; status: string; message: string }>(`/drive/import/status/${jobId}`),
  refreshToken: () => api.get<{ refresh_token: string }>("/drive/refresh-token"),
  refresh: () => api.post<{ refreshed: boolean; expiry: string | null }>("/drive/refresh"),
};

// ── SQL Console ───────────────────────────────────────────────────────────
export const sqlApi = {
  query: (sql: string) =>
    api.post<{ columns: string[]; rows: (string | null)[][]; row_count: number; elapsed_ms: number; affected: number | null }>("/sql/query", { sql }),
  tables: () =>
    api.get<{ tables: Record<string, { name: string; type: string }[]> }>("/sql/tables"),
};

// ── Daily Print ───────────────────────────────────────────────────────────
export interface PrintParams {
  cols?: string;
  two_col?: boolean;
}

export const printApi = {
  edi: (params?: PrintParams, signal?: AbortSignal) =>
    api.get("/print/edi", { responseType: "blob", params, signal }),
  iop: (params?: PrintParams, signal?: AbortSignal) =>
    api.get("/print/iop", { responseType: "blob", params, signal }),
};

export default api;
