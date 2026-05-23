import { useRef, useState, useEffect } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import {
  CloudDownload, CloudUpload, CheckCircle, AlertCircle, RefreshCw,
  Unlink, Upload, HardDriveDownload, HardDriveUpload, HardDrive,
  Mail, FolderSync, Cpu, MonitorDot,
} from "lucide-react";
import { backupApi, upiApi, driveApi, voiceApi } from "@/services/api";

type DriveFile = { id: string; name: string; size: string; modifiedTime: string };
type RestoreState =
  | { phase: "idle" }
  | { phase: "confirm"; file: File; fileId?: string }
  | { phase: "restoring"; progress: number; message: string }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

type NavSection = "local" | "upi" | "drive" | "device";

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "local",  label: "Local Backup",   icon: HardDrive,  desc: "Export & restore SQL" },
  { id: "upi",    label: "UPI Import",     icon: Mail,       desc: "Gmail & XLS import" },
  { id: "drive",  label: "Google Drive",   icon: FolderSync, desc: "Cloud backup & restore" },
  { id: "device", label: "Device",         icon: Cpu,        desc: "Inference device (CPU/GPU)" },
];

// ── Shared restore modal ──────────────────────────────────────────────────────
function RestoreModal({
  restore, onConfirm, onClose,
}: {
  restore: RestoreState;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (restore.phase === "idle") return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        {restore.phase === "confirm" && (
          <>
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-amber-400 shrink-0" />
              <h2 className="text-lg font-semibold text-foreground">Restore Database?</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              This will <strong className="text-foreground">overwrite the current database</strong> with{" "}
              <span className="text-foreground font-medium">{restore.file.name}</span>.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button onClick={onConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                Restore
              </button>
            </div>
          </>
        )}
        {restore.phase === "restoring" && (
          <>
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-primary animate-spin shrink-0" />
              <h2 className="text-base font-semibold text-foreground">Restoring…</h2>
            </div>
            <p className="text-sm text-muted-foreground">{restore.message}</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span><span>{restore.progress}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${restore.progress}%` }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Do not close this window.</p>
          </>
        )}
        {restore.phase === "done" && (
          <>
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-[#02B15A] shrink-0" />
              <h2 className="text-lg font-semibold text-foreground">Restore Complete</h2>
            </div>
            <p className="text-sm text-muted-foreground">{restore.message}</p>
            <div className="flex justify-end">
              <button onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Done
              </button>
            </div>
          </>
        )}
        {restore.phase === "error" && (
          <>
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-400 shrink-0" />
              <h2 className="text-lg font-semibold text-foreground">Restore Failed</h2>
            </div>
            <p className="text-sm text-muted-foreground break-words">{restore.message}</p>
            <div className="flex justify-end">
              <button onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Google icon ───────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// ── Section: Local Backup ─────────────────────────────────────────────────────
function LocalBackupSection({ showToast }: { showToast: (m: string, t?: "success" | "error") => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restore, setRestore] = useState<RestoreState>({ phase: "idle" });

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await backupApi.export();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${new Date().toISOString().slice(0, 10)}_gg_fin_backup.sql`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded.");
    } catch { showToast("Export failed.", "error"); }
    finally { setExporting(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestore({ phase: "confirm", file });
    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    if (restore.phase !== "confirm") return;
    const { file } = restore;
    setRestore({ phase: "restoring", progress: 2, message: "Uploading file…" });
    let jobId: string;
    try {
      const res = await backupApi.importDb(file);
      jobId = res.data.job_id;
    } catch {
      setRestore({ phase: "error", message: "Upload failed. Check file and try again." });
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await backupApi.importStatus(jobId);
        if (data.status === "done") { clearInterval(pollRef.current!); setRestore({ phase: "done", message: data.message }); }
        else if (data.status === "error") { clearInterval(pollRef.current!); setRestore({ phase: "error", message: data.message }); }
        else setRestore({ phase: "restoring", progress: data.progress, message: data.message });
      } catch { /* ignore */ }
    }, 600);
  };

  const resetRestore = () => { if (pollRef.current) clearInterval(pollRef.current); setRestore({ phase: "idle" }); };

  return (
    <>
      <RestoreModal restore={restore} onConfirm={handleImportConfirm} onClose={resetRestore} />
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Local Backup &amp; Restore</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Export your database as a SQL file and store it locally. Upload a previously exported file to restore.
            Sequences and foreign keys are verified automatically after restore.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Export */}
          <div className="rounded-xl border border-border bg-secondary/40 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CloudDownload className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground text-sm">Export Backup</span>
            </div>
            <p className="text-xs text-muted-foreground flex-1">
              Download a full SQL dump of the database. Save this file somewhere safe.
            </p>
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              {exporting ? "Exporting…" : "Download"}
            </button>
          </div>

          {/* Import */}
          <div className="rounded-xl border border-border bg-secondary/40 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CloudUpload className="h-5 w-5 text-amber-400" />
              <span className="font-medium text-foreground text-sm">Restore Backup</span>
            </div>
            <p className="text-xs text-muted-foreground flex-1">
              Upload a previously exported SQL file. Sequences and FK constraints are auto-fixed after restore.
            </p>
            <input ref={fileInputRef} type="file" accept=".sql" className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/50 text-amber-400 text-sm font-medium hover:bg-amber-500/10 transition-colors">
              <CloudUpload className="h-4 w-4" />
              Upload &amp; Restore
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Section: UPI Import ───────────────────────────────────────────────────────
type SyncProgress = { stage: string; total: number; processed: number; imported: number; skipped: number };

function UpiImportSection({ showToast }: { showToast: (m: string, t?: "success" | "error") => void }) {
  const xlsRef = useRef<HTMLInputElement>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => { upiApi.gmailStatus().then(({ data }) => setGmailStatus(data)).catch(() => {}); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ stage: "listing", total: 0, processed: 0, imported: 0, skipped: 0 });
    try {
      const token = localStorage.getItem("gg_fin_token");
      const resp = await fetch("/api/upi/gmail/sync-stream", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${resp.status}`);
      }
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev: SyncProgress & { error?: string } = JSON.parse(line.slice(6));
            if (ev.error) { showToast(ev.error, "error"); return; }
            setSyncProgress(ev);
            if (ev.stage === "done") {
              showToast(`Synced: ${ev.imported} imported, ${ev.skipped} skipped`);
            }
          } catch { /* partial chunk */ }
        }
      }
    } catch (e: any) {
      showToast(e?.message || "Sync failed", "error");
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">UPI Data Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Import HDFC UPI credit transactions from Gmail or an exported XLS bank statement.
        </p>
      </div>

      {/* Gmail sync */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gmail Sync</p>
        {gmailStatus.connected ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Connected — {gmailStatus.email}</p>
                  <p className="text-xs text-muted-foreground">Syncs HDFC credit emails from the last 1 year</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : "Sync Now"}
                </button>
                <button
                  onClick={async () => {
                    await upiApi.gmailDisconnect();
                    setGmailStatus({ connected: false, email: null });
                    showToast("Gmail disconnected");
                  }}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 disabled:opacity-50 transition-colors"
                >
                  <Unlink className="h-3.5 w-3.5" /> Disconnect
                </button>
              </div>
            </div>
            {syncProgress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {syncProgress.stage === "listing"
                      ? "Fetching email list…"
                      : `${syncProgress.processed} / ${syncProgress.total} emails`}
                  </span>
                  <span className="tabular-nums">
                    {syncProgress.imported > 0 && (
                      <span className="text-emerald-400 mr-2">{syncProgress.imported} imported</span>
                    )}
                    {syncProgress.skipped > 0 && `${syncProgress.skipped} skipped`}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                    style={{
                      width: syncProgress.total > 0
                        ? `${Math.round((syncProgress.processed / syncProgress.total) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3">
            <div>
              <p className="text-sm text-foreground">Not connected</p>
              <p className="text-xs text-muted-foreground">Sign in with Google to enable Gmail sync</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const { data } = await upiApi.gmailAuthUrl();
                  window.open(data.url, "_blank", "width=600,height=700");
                  const poll = setInterval(async () => {
                    const { data: s } = await upiApi.gmailStatus();
                    if (s.connected) { setGmailStatus(s); clearInterval(poll); showToast("Gmail connected!"); }
                  }, 2000);
                  setTimeout(() => clearInterval(poll), 60000);
                } catch (e: any) { showToast(e?.response?.data?.detail || "Failed to get auth URL", "error"); }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/15 text-blue-400 text-sm font-medium hover:bg-blue-500/25 transition-colors"
            >
              <GoogleIcon /> Connect Gmail
            </button>
          </div>
        )}
      </div>

      {/* XLS import */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">XLS Bank Statement</p>
        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Upload HDFC statement</p>
            <p className="text-xs text-muted-foreground">
              Export transaction history from HDFC NetBanking as XLS and upload here
            </p>
          </div>
          <input ref={xlsRef} type="file" accept=".xls,.xlsx" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";
              setImporting(true);
              try {
                const { data } = await upiApi.importCsv(file);
                showToast(`XLS: ${data.imported} imported, ${data.skipped} skipped${data.errors ? `, ${data.errors} errors` : ""}`);
              } catch (ex: any) { showToast(ex?.response?.data?.detail || "XLS import failed", "error"); }
              finally { setImporting(false); }
            }}
          />
          <button
            onClick={() => xlsRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 text-amber-400 text-sm font-medium hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
          >
            {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? "Importing…" : "Upload XLS"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section: Google Drive ─────────────────────────────────────────────────────
function GoogleDriveSection({ showToast }: { showToast: (m: string, t?: "success" | "error") => void }) {
  const driveRestorePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [driveStatus, setDriveStatus] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });
  const [driveExporting, setDriveExporting] = useState(false);
  const [driveFilesList, setDriveFilesList] = useState<DriveFile[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [selectedDriveFileId, setSelectedDriveFileId] = useState<string>("");
  const [driveRestore, setDriveRestore] = useState<RestoreState>({ phase: "idle" });
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => () => { if (driveRestorePollRef.current) clearInterval(driveRestorePollRef.current); }, []);

  const loadDriveFiles = async () => {
    setDriveFilesLoading(true);
    try {
      const { data } = await driveApi.files();
      setDriveFilesList(data.data);
      if (data.data.length > 0) setSelectedDriveFileId(data.data[0].id);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Failed to load Drive files", "error");
    }
    finally { setDriveFilesLoading(false); }
  };

  useEffect(() => {
    driveApi.status().then(({ data }) => {
      setDriveStatus(data);
      if (data.connected) loadDriveFiles();
    }).catch(() => {});
  }, []);

  const startDriveRestore = async (fileId: string) => {
    setDriveRestore({ phase: "restoring", progress: 5, message: "Downloading from Drive…" });
    let jobId: string;
    try {
      const res = await driveApi.import(fileId);
      jobId = res.data.job_id;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Failed to start restore";
      setDriveRestore({ phase: "error", message: msg });
      return;
    }
    let failCount = 0;
    driveRestorePollRef.current = setInterval(async () => {
      try {
        const { data } = await driveApi.importStatus(jobId);
        failCount = 0;
        if (data.status === "done") { clearInterval(driveRestorePollRef.current!); setDriveRestore({ phase: "done", message: data.message }); }
        else if (data.status === "error") { clearInterval(driveRestorePollRef.current!); setDriveRestore({ phase: "error", message: data.message }); }
        else setDriveRestore({ phase: "restoring", progress: data.progress, message: data.message });
      } catch {
        failCount++;
        if (failCount >= 10) {
          clearInterval(driveRestorePollRef.current!);
          setDriveRestore({ phase: "error", message: "Lost connection to restore job. Please check if restore completed." });
        }
      }
    }, 800);
  };

  return (
    <>
      <RestoreModal
        restore={driveRestore}
        onConfirm={() => {
          if (driveRestore.phase === "confirm") startDriveRestore(driveRestore.fileId!);
        }}
        onClose={() => setDriveRestore({ phase: "idle" })}
      />

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Google Drive Backup</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Backups stored at <span className="font-mono text-foreground text-xs">gg_fin/db_bck_up</span> in your Drive.
            Last 10 backups are kept automatically.
          </p>
        </div>

        {/* Connect row */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Drive Connection</p>
          {driveStatus.connected ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Connected — {driveStatus.email}</p>
                  <p className="text-xs text-muted-foreground">gg_fin/db_bck_up · keeps last 10 backups</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  await driveApi.disconnect();
                  setDriveStatus({ connected: false, email: null });
                  setDriveFilesList([]);
                  setSelectedDriveFileId("");
                  showToast("Google Drive disconnected");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors"
              >
                <Unlink className="h-3.5 w-3.5" /> Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Not connected</p>
                <p className="text-xs text-muted-foreground">Sign in with Google to enable Drive backup</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    const { data } = await driveApi.authUrl();
                    window.open(data.url, "_blank", "width=600,height=700");
                    const poll = setInterval(async () => {
                      const { data: s } = await driveApi.status();
                      if (s.connected) { setDriveStatus(s); clearInterval(poll); showToast("Google Drive connected!"); loadDriveFiles(); }
                    }, 2000);
                    setTimeout(() => clearInterval(poll), 60000);
                  } catch (e: any) { showToast(e?.response?.data?.detail || "Failed to get auth URL", "error"); }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/15 text-blue-400 text-sm font-medium hover:bg-blue-500/25 transition-colors"
              >
                <GoogleIcon /> Connect Drive
              </button>
            </div>
          )}
        </div>

        {/* Export + Restore — only when connected */}
        {driveStatus.connected && (
          <div className="space-y-3">
            {/* Export row */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Export</p>
              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <HardDriveUpload className="h-4 w-4 text-primary" /> Export to Drive
                  </p>
                  <p className="text-xs text-muted-foreground">Full pg_dump → uploaded to gg_fin/db_bck_up, old backups pruned</p>
                </div>
                <button
                  onClick={async () => {
                    setDriveExporting(true);
                    try {
                      const { data } = await driveApi.export();
                      showToast(`Exported: ${data.file_name}`);
                      loadDriveFiles();
                    } catch (e: any) { showToast(e?.response?.data?.detail || "Export to Drive failed", "error"); }
                    finally { setDriveExporting(false); }
                  }}
                  disabled={driveExporting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {driveExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <HardDriveUpload className="h-4 w-4" />}
                  {driveExporting ? "Exporting…" : "Export Now"}
                </button>
              </div>
            </div>

            {/* Restore row */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Restore</p>
              <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 space-y-2">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <HardDriveDownload className="h-4 w-4 text-amber-400" /> Restore from Drive
                </p>
                {driveFilesLoading ? (
                  <div className="h-9 bg-secondary rounded-lg animate-pulse" />
                ) : driveFilesList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No backups found in Drive folder.</p>
                ) : (
                  <div className="flex gap-2 items-center">
                    <select
                      value={selectedDriveFileId}
                      onChange={(e) => setSelectedDriveFileId(e.target.value)}
                      className="flex-1 h-9 rounded-lg border border-border bg-card text-sm text-foreground px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {driveFilesList.map((f, i) => (
                        <option key={f.id} value={f.id}>
                          {i === 0 ? "★ Latest — " : ""}{f.name.replace("_gg_fin_backup.sql", "")} · {f.size ? `${Math.round(Number(f.size) / 1024)} KB` : "—"}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const f = driveFilesList.find((x) => x.id === selectedDriveFileId);
                        if (f) setDriveRestore({ phase: "confirm", file: { name: f.name } as File, fileId: f.id });
                      }}
                      disabled={!selectedDriveFileId}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/50 text-amber-400 text-sm font-medium hover:bg-amber-500/10 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      <HardDriveDownload className="h-4 w-4" /> Restore
                    </button>
                    <button
                      onClick={loadDriveFiles}
                      disabled={driveFilesLoading}
                      title="Refresh file list"
                      className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* New machine setup — refresh token */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Machine Setup</p>
              <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 space-y-2">
                <p className="text-sm font-medium text-foreground">Refresh Token for Fresh Install</p>
                <p className="text-xs text-muted-foreground">
                  Copy this token into <code className="bg-muted px-1 rounded">GOOGLE_DRIVE_REFRESH_TOKEN</code> in your{" "}
                  <code className="bg-muted px-1 rounded">.env</code> on a new machine. The app will auto-restore your
                  latest Drive backup on first boot.
                </p>
                <button
                  onClick={async () => {
                    if (!showToken) {
                      try {
                        const { data } = await driveApi.refreshToken();
                        setRefreshToken(data.refresh_token);
                        setShowToken(true);
                      } catch { showToast("Could not retrieve token", "error"); }
                    } else {
                      setShowToken(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  {showToken ? "Hide token" : "Show refresh token"}
                </button>
                {showToken && refreshToken && (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all text-[10px] font-mono bg-muted px-3 py-2 rounded-lg text-foreground select-all">
                      {refreshToken}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(refreshToken); showToast("Copied to clipboard!"); }}
                      className="shrink-0 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Section: Device ───────────────────────────────────────────────────────────
function DeviceSection({ showToast }: { showToast: (m: string, t?: "success" | "error") => void }) {
  const [deviceInfo, setDeviceInfo] = useState<{ device: string; device_name: string; gpu_available: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    voiceApi.deviceInfo()
      .then(({ data }) => setDeviceInfo(data))
      .catch(() => showToast("Could not load device info", "error"))
      .finally(() => setLoading(false));
  }, []);

  const handleSwitch = async (target: "cpu" | "cuda") => {
    if (!deviceInfo || switching || deviceInfo.device === target) return;
    setSwitching(true);
    try {
      const { data } = await voiceApi.setDevice(target);
      setDeviceInfo(data);
      showToast(`Switched to ${data.device_name}`);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Failed to switch device", "error");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Inference Device</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select which processor is used for voice transcription. GPU is significantly faster when available.
        </p>
      </div>

      {loading ? (
        <div className="h-24 rounded-xl bg-secondary/40 animate-pulse" />
      ) : deviceInfo ? (
        <div className="space-y-4">
          {/* Current device card */}
          <div className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${
            deviceInfo.device === "cuda"
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-amber-500/30 bg-amber-500/10"
          }`}>
            {deviceInfo.device === "cuda"
              ? <MonitorDot className="h-7 w-7 text-emerald-400 shrink-0" />
              : <Cpu className="h-7 w-7 text-amber-400 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${deviceInfo.device === "cuda" ? "text-emerald-400" : "text-amber-400"}`}>
                {deviceInfo.device === "cuda" ? "GPU" : "CPU"} — Active
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{deviceInfo.device_name}</p>
            </div>
          </div>

          {/* Toggle options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select Device</p>
            <div className="grid grid-cols-2 gap-3">
              {/* CPU option */}
              <button
                onClick={() => handleSwitch("cpu")}
                disabled={switching || deviceInfo.device === "cpu"}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                  deviceInfo.device === "cpu"
                    ? "border-amber-500/60 bg-amber-500/15 cursor-default"
                    : "border-border bg-secondary/40 hover:bg-secondary/70 hover:border-amber-500/30"
                } disabled:opacity-60`}
              >
                <Cpu className={`h-6 w-6 ${deviceInfo.device === "cpu" ? "text-amber-400" : "text-muted-foreground"}`} />
                <div className="text-center">
                  <p className={`text-sm font-semibold ${deviceInfo.device === "cpu" ? "text-amber-400" : "text-foreground"}`}>CPU</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Always available</p>
                </div>
                {deviceInfo.device === "cpu" && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Active</span>
                )}
              </button>

              {/* GPU option */}
              <button
                onClick={() => handleSwitch("cuda")}
                disabled={switching || !deviceInfo.gpu_available || deviceInfo.device === "cuda"}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                  deviceInfo.device === "cuda"
                    ? "border-emerald-500/60 bg-emerald-500/15 cursor-default"
                    : deviceInfo.gpu_available
                    ? "border-border bg-secondary/40 hover:bg-secondary/70 hover:border-emerald-500/30"
                    : "border-border bg-secondary/20 opacity-40 cursor-not-allowed"
                }`}
              >
                <MonitorDot className={`h-6 w-6 ${deviceInfo.device === "cuda" ? "text-emerald-400" : "text-muted-foreground"}`} />
                <div className="text-center">
                  <p className={`text-sm font-semibold ${deviceInfo.device === "cuda" ? "text-emerald-400" : "text-foreground"}`}>GPU</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {deviceInfo.gpu_available ? "CUDA available" : "Not detected"}
                  </p>
                </div>
                {deviceInfo.device === "cuda" && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Active</span>
                )}
                {!deviceInfo.gpu_available && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground/50">Unavailable</span>
                )}
              </button>
            </div>
          </div>

          {switching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Switching device — model will reload on next transcription…
            </div>
          )}

          {!deviceInfo.gpu_available && (
            <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
              <p className="text-xs font-medium text-foreground mb-1">GPU not detected</p>
              <p className="text-xs text-muted-foreground">
                Make sure the NVIDIA Container Toolkit is installed on the host machine (<code className="bg-muted px-1 rounded">nvidia-container-toolkit</code>),
                and the Docker daemon is configured to use it. Rebuild the containers after installing.
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Device info unavailable.</p>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeSection, setActiveSection] = useSessionState<NavSection>("settings.activeSection", "local");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success"
            ? "bg-[#02B15A]/20 border border-[#02B15A]/40 text-[#02B15A]"
            : "bg-red-500/20 border border-red-500/40 text-red-400"
        }`}>
          {toast.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Left nav */}
      <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-base font-bold text-foreground">Settings</h1>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                activeSection === id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium leading-tight">{label}</p>
                <p className="text-xs opacity-70 leading-tight mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl">
          {activeSection === "local"  && <LocalBackupSection showToast={showToast} />}
          {activeSection === "upi"    && <UpiImportSection showToast={showToast} />}
          {activeSection === "drive"  && <GoogleDriveSection showToast={showToast} />}
          {activeSection === "device" && <DeviceSection showToast={showToast} />}
        </div>
      </main>
    </div>
  );
}
