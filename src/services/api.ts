import axios from "axios";

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
  update: (id: number, data: object) => api.patch(`/expenses/${id}`, data),
  delete: (id: number) => api.delete(`/expenses/${id}`),
};

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
    api.post("/voice/submit", entries, { params: { collection_date, product } }),
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

// ── Dataset ───────────────────────────────────────────────────────────────
export const datasetApi = {
  saveAudio: (audio: Blob, audioId: string) => {
    const form = new FormData();
    form.append("audio", audio, `${audioId}.webm`);
    form.append("audio_id", audioId);
    return api.post("/dataset/save-audio", form);
  },
  saveMetadata: (records: { audio_id: string; transcription: string; labels: string }[]) =>
    api.post("/dataset/save-metadata", records),
  exportZip: (date?: string) => api.get("/dataset/export", { params: date ? { date } : undefined, responseType: "blob" }),
  clear: () => api.delete("/dataset/clear"),
  stats: () => api.get<{ audio_files: number; metadata_rows: number }>("/dataset/stats"),
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
  listVpaMappings: () => api.get<{ data: any[] }>("/upi/vpa-mappings"),
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
  extract: (body: { session_id: string; page_index: number; model?: string }) =>
    api.post<{ page_image_b64: string; records: any[] }>("/ocr/extract", body),
  submit: (body: { records: any[] }) =>
    api.post<{ submitted: number }>("/ocr/submit", body),
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
};

// ── SQL Console ───────────────────────────────────────────────────────────
export const sqlApi = {
  query: (sql: string) =>
    api.post<{ columns: string[]; rows: (string | null)[][]; row_count: number; elapsed_ms: number; affected: number | null }>("/sql/query", { sql }),
  tables: () =>
    api.get<{ tables: Record<string, { name: string; type: string }[]> }>("/sql/tables"),
};

export default api;
