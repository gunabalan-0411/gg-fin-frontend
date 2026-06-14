import { useRef, useState, useEffect } from "react";
import type { CSSProperties, ElementType, ChangeEvent, ReactNode } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import {
  CloudDownload, CloudUpload, CheckCircle, AlertCircle, RefreshCw,
  Unlink, Upload, HardDriveDownload, HardDriveUpload, HardDrive,
  Mail, FolderSync, Cpu, MonitorDot, Key, Copy, Eye, EyeOff,
} from "lucide-react";
import { authApi, backupApi, upiApi, driveApi, voiceApi } from "@/services/api";

// ── Types ──────────────────────────────────────────────────────────────────────
type DriveFile = { id: string; name: string; size: string; modifiedTime: string };
type RestoreState =
  | { phase: "idle" }
  | { phase: "confirm"; file: File; fileId?: string }
  | { phase: "restoring"; progress: number; message: string }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };
type NavSection = "local" | "upi" | "drive" | "device" | "security";
type SyncProgress = { stage: string; total: number; processed: number; imported: number; skipped: number };

const NAV_ITEMS: { id: NavSection; label: string; icon: ElementType; desc: string }[] = [
  { id: "local",    label: "Local Backup",  icon: HardDrive,   desc: "Export & restore SQL" },
  { id: "upi",      label: "UPI Import",    icon: Mail,        desc: "Gmail & XLS import" },
  { id: "drive",    label: "Google Drive",  icon: FolderSync,  desc: "Cloud backup & restore" },
  { id: "device",   label: "Inference",     icon: Cpu,         desc: "CPU / GPU device" },
  { id: "security", label: "Security",      icon: Key,         desc: "Change password" },
];

const monoFont = '"Geist Mono", ui-monospace, monospace';

// ── Shared helpers ─────────────────────────────────────────────────────────────
function IcoWrap({ children, size = 26, variant = "default", radius = 6 }: {
  children: ReactNode; size?: number;
  variant?: "default" | "ok" | "warn" | "info" | "neg" | "dark";
  radius?: number;
}) {
  const vs: Record<string, CSSProperties> = {
    default: { background: "hsl(var(--muted))",             color: "hsl(var(--muted-foreground))" },
    ok:      { background: "hsl(var(--pos) / 0.14)",         color: "hsl(var(--pos))" },
    warn:    { background: "hsl(var(--warn) / 0.22)",        color: "#a07a1f" },
    info:    { background: "rgba(91,141,184,.14)",            color: "#5b8db8" },
    neg:     { background: "hsl(var(--neg) / 0.14)",         color: "hsl(var(--neg))" },
    dark:    { background: "hsl(var(--foreground))",         color: "hsl(var(--background))" },
  };
  return (
    <span style={{ display:"inline-grid", placeItems:"center", width:size, height:size, borderRadius:radius, flexShrink:0, ...vs[variant] }}>
      {children}
    </span>
  );
}

function Pill({ children, variant = "mute" }: { children: ReactNode; variant?: "pos"|"warn"|"neg"|"info"|"mute" }) {
  const vs: Record<string, CSSProperties> = {
    pos:  { background:"hsl(var(--pos) / 0.14)",  color:"hsl(var(--pos))" },
    warn: { background:"hsl(var(--warn) / 0.22)", color:"#a07a1f" },
    neg:  { background:"hsl(var(--neg) / 0.14)",  color:"hsl(var(--neg))" },
    info: { background:"rgba(91,141,184,.14)",     color:"#5b8db8" },
    mute: { background:"hsl(var(--muted))",        color:"hsl(var(--muted-foreground))" },
  };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:999, fontSize:11, fontWeight:500, ...vs[variant] }}>
      {children}
    </span>
  );
}

function PulseDot() {
  return <span style={{ display:"inline-block", width:6, height:6, borderRadius:999, background:"currentColor", animation:"settingsPulse 1.6s infinite" }}/>;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, margin:"22px 4px 8px", fontSize:10.5, color:"hsl(var(--muted-foreground))", fontWeight:600, textTransform:"uppercase", letterSpacing:".1em" }}>
      <span>{label}</span>
      <span style={{ flex:1, height:1, background:"hsl(var(--border))" }}/>
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "default", sm }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "default"|"primary"|"warn"|"ghost"|"danger"|"tint"; sm?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const base: CSSProperties = {
    display:"inline-flex", alignItems:"center", gap:sm?5:7,
    padding:sm?"4px 10px":"7px 13px", borderRadius:8, fontWeight:500,
    fontSize:sm?11.5:12.5, cursor:disabled?"not-allowed":"pointer",
    opacity:disabled?.5:1, border:"1px solid transparent", fontFamily:"inherit",
  };
  const vs: Record<string, [CSSProperties, CSSProperties]> = {
    default: [{ background:"hsl(var(--card))",           borderColor:"hsl(var(--border))", color:"hsl(var(--foreground))" },   { background:"hsl(var(--muted))" }],
    primary: [{ background:"hsl(var(--foreground))",     borderColor:"hsl(var(--foreground))", color:"hsl(var(--background))" }, { background:"hsl(var(--foreground) / 0.85)" }],
    warn:    [{ background:"hsl(var(--warn) / 0.22)",    color:"#a07a1f" },                                                      { background:"hsl(var(--warn) / 0.32)" }],
    ghost:   [{ background:"transparent",                color:"hsl(var(--muted-foreground))" },                                { background:"hsl(var(--muted))", color:"hsl(var(--foreground))" }],
    danger:  [{ background:"hsl(var(--neg) / 0.14)",     color:"hsl(var(--neg))" },                                             { background:"hsl(var(--neg) / 0.24)" }],
    tint:    [{ background:"hsl(var(--primary) / 0.65)", color:"hsl(var(--foreground))" },                                      { background:"hsl(var(--primary) / 0.80)" }],
  };
  const [normal, hover] = vs[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ ...base, ...normal, ...(hov&&!disabled?hover:{}) }}>
      {children}
    </button>
  );
}

function panelHero(variant: "ok"|"off"|"warn"): CSSProperties {
  const base: CSSProperties = { padding:"20px 22px", borderRadius:12, border:"1px solid hsl(var(--border))", marginBottom:18, display:"flex", alignItems:"center", gap:16, position:"relative", overflow:"hidden" };
  if (variant === "ok")   return { ...base, background:`radial-gradient(120% 80% at 100% 0%, hsl(var(--pos) / 0.16), transparent 55%), hsl(var(--card))`,  borderColor:"hsl(var(--pos) / 0.35)" };
  if (variant === "warn") return { ...base, background:`radial-gradient(120% 80% at 100% 0%, hsl(var(--warn) / 0.20), transparent 55%), hsl(var(--card))`, borderColor:"hsl(var(--warn) / 0.35)" };
  return { ...base, background:"hsl(var(--card))" };
}

const cardStyle: CSSProperties = { background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:12, padding:"16px 18px", marginBottom:12 };
const cardH: CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 };

// ── Google icon ────────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg style={{ width:14, height:14 }} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// ── RestoreModal ───────────────────────────────────────────────────────────────
function RestoreModal({ restore, onConfirm, onClose }: { restore: RestoreState; onConfirm: () => void; onClose: () => void }) {
  if (restore.phase === "idle") return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, display:"grid", placeItems:"center", background:"rgba(0,0,0,.4)", backdropFilter:"blur(2px)", padding:40 }}>
      <div style={{ width:"100%", maxWidth:460, background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:16, padding:24 }}>
        {restore.phase === "confirm" && <>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <AlertCircle size={22} style={{ color:"#a07a1f", flexShrink:0 }}/>
            <p style={{ margin:0, fontWeight:600, fontSize:16, color:"hsl(var(--foreground))" }}>Restore Database?</p>
          </div>
          <p style={{ margin:"0 0 20px", fontSize:13, color:"hsl(var(--muted-foreground))", lineHeight:1.5 }}>
            This will <strong style={{ color:"hsl(var(--foreground))" }}>overwrite the current database</strong> with{" "}
            <span style={{ color:"hsl(var(--foreground))", fontWeight:500 }}>{restore.file.name}</span>.
          </p>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="warn" onClick={onConfirm}>Restore</Btn>
          </div>
        </>}
        {restore.phase === "restoring" && <>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <RefreshCw size={18} style={{ color:"hsl(var(--muted-foreground))", animation:"settingsSpin 1s linear infinite" }}/>
            <p style={{ margin:0, fontWeight:600, fontSize:15, color:"hsl(var(--foreground))" }}>Restoring…</p>
          </div>
          <p style={{ margin:"0 0 10px", fontSize:13, color:"hsl(var(--muted-foreground))" }}>{restore.message}</p>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"hsl(var(--muted-foreground))", marginBottom:4 }}>
            <span>Progress</span><span>{restore.progress}%</span>
          </div>
          <div style={{ height:5, background:"hsl(var(--muted))", borderRadius:999, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${restore.progress}%`, background:"hsl(var(--foreground) / 0.6)", borderRadius:999, transition:"width .5s" }}/>
          </div>
          <p style={{ margin:"8px 0 0", fontSize:11, color:"hsl(var(--muted-foreground))" }}>Do not close this window.</p>
        </>}
        {restore.phase === "done" && <>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <CheckCircle size={22} style={{ color:"hsl(var(--pos))", flexShrink:0 }}/>
            <p style={{ margin:0, fontWeight:600, fontSize:16, color:"hsl(var(--foreground))" }}>Restore Complete</p>
          </div>
          <p style={{ margin:"0 0 20px", fontSize:13, color:"hsl(var(--muted-foreground))" }}>{restore.message}</p>
          <div style={{ display:"flex", justifyContent:"flex-end" }}><Btn variant="primary" onClick={onClose}>Done</Btn></div>
        </>}
        {restore.phase === "error" && <>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <AlertCircle size={22} style={{ color:"hsl(var(--neg))", flexShrink:0 }}/>
            <p style={{ margin:0, fontWeight:600, fontSize:16, color:"hsl(var(--foreground))" }}>Restore Failed</p>
          </div>
          <p style={{ margin:"0 0 20px", fontSize:13, color:"hsl(var(--muted-foreground))", wordBreak:"break-word" }}>{restore.message}</p>
          <div style={{ display:"flex", justifyContent:"flex-end" }}><Btn onClick={onClose}>Close</Btn></div>
        </>}
      </div>
    </div>
  );
}

// ── Local Backup ───────────────────────────────────────────────────────────────
function LocalBackupSection({ showToast }: { showToast: (m: string, t?: "success"|"error") => void }) {
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
      a.href = url; a.download = `${new Date().toISOString().slice(0,10)}_gg_fin_backup.sql`; a.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded.");
    } catch { showToast("Export failed.", "error"); }
    finally { setExporting(false); }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestore({ phase:"confirm", file });
    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    if (restore.phase !== "confirm") return;
    const { file } = restore;
    setRestore({ phase:"restoring", progress:2, message:"Uploading file…" });
    let jobId: string;
    try {
      const res = await backupApi.importDb(file);
      jobId = res.data.job_id;
    } catch {
      setRestore({ phase:"error", message:"Upload failed. Check file and try again." }); return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await backupApi.importStatus(jobId);
        if (data.status === "done")  { clearInterval(pollRef.current!); setRestore({ phase:"done",  message:data.message }); }
        else if (data.status === "error") { clearInterval(pollRef.current!); setRestore({ phase:"error", message:data.message }); }
        else setRestore({ phase:"restoring", progress:data.progress, message:data.message });
      } catch { /* ignore */ }
    }, 600);
  };

  const resetRestore = () => { if (pollRef.current) clearInterval(pollRef.current); setRestore({ phase:"idle" }); };

  return (
    <>
      <RestoreModal restore={restore} onConfirm={handleImportConfirm} onClose={resetRestore}/>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ margin:0, fontSize:22, fontWeight:500, letterSpacing:"-.015em", color:"hsl(var(--foreground))" }}>Local Backup &amp; Restore</h2>
        <p style={{ margin:"4px 0 0", fontSize:13, color:"hsl(var(--muted-foreground))", lineHeight:1.5, maxWidth:560 }}>
          Export the database as a SQL file and store it locally. Upload a previously exported file to restore.
          Sequences and foreign keys are verified automatically after restore.
        </p>
      </div>

      {/* Hero */}
      <div style={panelHero("ok")}>
        <IcoWrap size={44} radius={12} variant="ok"><HardDrive size={20}/></IcoWrap>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:16, fontWeight:500, color:"hsl(var(--foreground))" }}>Local database</span>
            <Pill variant="pos"><PulseDot/> healthy</Pill>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", fontSize:12, color:"hsl(var(--muted-foreground))" }}>
            <span>SQL dump · full pg_dump</span>
            <span style={{ width:3, height:3, borderRadius:999, background:"hsl(var(--muted-foreground) / 0.4)", flexShrink:0 }}/>
            <span>sequences &amp; FK constraints auto-fixed after restore</span>
          </div>
        </div>
      </div>

      <SectionLabel label="Actions"/>

      {/* Export */}
      <div style={cardStyle}>
        <div style={cardH}>
          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, fontWeight:500, color:"hsl(var(--foreground))" }}>
            <IcoWrap variant="ok"><CloudDownload size={14}/></IcoWrap>
            <div>
              Export backup
              <div style={{ fontSize:11.5, color:"hsl(var(--muted-foreground))", fontWeight:400, marginTop:2 }}>Download a full SQL dump of the database</div>
            </div>
          </div>
          <Btn variant="primary" onClick={handleExport} disabled={exporting}>
            {exporting ? <><RefreshCw size={12} style={{ animation:"settingsSpin 1s linear infinite" }}/> Exporting…</> : <><CloudDownload size={12}/> Download</>}
          </Btn>
        </div>
      </div>

      {/* Restore */}
      <div style={cardStyle}>
        <div style={cardH}>
          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, fontWeight:500, color:"hsl(var(--foreground))" }}>
            <IcoWrap variant="warn"><CloudUpload size={14}/></IcoWrap>
            <div>
              Restore from file
              <div style={{ fontSize:11.5, color:"hsl(var(--muted-foreground))", fontWeight:400, marginTop:2 }}>Upload a previously exported SQL file — overwrites current data</div>
            </div>
          </div>
          <Btn variant="warn" onClick={() => fileInputRef.current?.click()}>
            <CloudUpload size={12}/> Upload &amp; restore
          </Btn>
        </div>
        <input ref={fileInputRef} type="file" accept=".sql" style={{ display:"none" }} onChange={handleFileChange}/>
      </div>
    </>
  );
}

// ── UPI Import ─────────────────────────────────────────────────────────────────
function UpiImportSection({
  showToast, onGmailChange,
}: {
  showToast: (m: string, t?: "success"|"error") => void;
  onGmailChange: (connected: boolean, email: string | null) => void;
}) {
  const xlsRef = useRef<HTMLInputElement>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email: string | null }>({ connected:false, email:null });
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    upiApi.gmailStatus().then(({ data }) => {
      setGmailStatus(data);
      onGmailChange(data.connected, data.email);
    }).catch(() => {});
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ stage:"listing", total:0, processed:0, imported:0, skipped:0 });
    try {
      const resp = await fetch("/api/upi/gmail/sync-stream", { credentials: "include" });
      if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.detail||`Server error ${resp.status}`); }
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream:true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev: SyncProgress & { error?: string } = JSON.parse(line.slice(6));
            if (ev.error) { showToast(ev.error, "error"); return; }
            setSyncProgress(ev);
            if (ev.stage === "done") showToast(`Synced: ${ev.imported} imported, ${ev.skipped} skipped`);
          } catch { /* partial chunk */ }
        }
      }
    } catch (e: any) { showToast(e?.message||"Sync failed", "error"); }
    finally { setSyncing(false); setSyncProgress(null); }
  };

  const g = gmailStatus;

  return (
    <>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ margin:0, fontSize:22, fontWeight:500, letterSpacing:"-.015em", color:"hsl(var(--foreground))" }}>UPI Data Import</h2>
        <p style={{ margin:"4px 0 0", fontSize:13, color:"hsl(var(--muted-foreground))", lineHeight:1.5, maxWidth:560 }}>
          Import HDFC UPI credit transactions from Gmail or an exported XLS bank statement.
        </p>
      </div>

      {/* Gmail hero */}
      <div style={panelHero(g.connected ? "ok" : "off")}>
        <IcoWrap size={44} radius={12} variant={g.connected ? "ok" : "default"}><Mail size={20}/></IcoWrap>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:16, fontWeight:500, color:"hsl(var(--foreground))" }}>
              {g.connected ? `Gmail · ${g.email}` : "Gmail"}
            </span>
            {g.connected
              ? <Pill variant="pos"><PulseDot/> connected</Pill>
              : <Pill variant="mute">not connected</Pill>}
          </div>
          <div style={{ fontSize:12, color:"hsl(var(--muted-foreground))" }}>
            {g.connected
              ? "Scans HDFC credit emails · last 12 months"
              : "Sign in with Google to import HDFC credit transaction emails"}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          {g.connected ? <>
            <Btn variant="primary" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={12} style={syncing?{animation:"settingsSpin 1s linear infinite"}:{}}/> {syncing?"Syncing…":"Sync now"}
            </Btn>
            <Btn variant="ghost" onClick={async () => {
              await upiApi.gmailDisconnect();
              setGmailStatus({ connected:false, email:null });
              onGmailChange(false, null);
              showToast("Gmail disconnected");
            }} disabled={syncing}>
              <Unlink size={12}/>
            </Btn>
          </> : (
            <Btn variant="tint" onClick={async () => {
              try {
                const { data } = await upiApi.gmailAuthUrl();
                window.open(data.url, "_blank", "width=600,height=700");
                const poll = setInterval(async () => {
                  const { data: s } = await upiApi.gmailStatus();
                  if (s.connected) {
                    setGmailStatus(s); onGmailChange(s.connected, s.email);
                    clearInterval(poll); showToast("Gmail connected!");
                  }
                }, 2000);
                setTimeout(() => clearInterval(poll), 60000);
              } catch (e: any) { showToast(e?.response?.data?.detail||"Failed to get auth URL", "error"); }
            }}>
              <GoogleIcon/> Connect Gmail
            </Btn>
          )}
        </div>
      </div>

      {/* Sync progress */}
      {syncProgress && (
        <div style={{ ...cardStyle, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:11.5, color:"hsl(var(--muted-foreground))", fontFamily:monoFont }}>
            <span>{syncProgress.stage==="listing" ? "Fetching email list…" : `${syncProgress.processed} / ${syncProgress.total} emails`}</span>
            <span>
              {syncProgress.imported>0 && <span style={{ color:"hsl(var(--pos))", marginRight:8 }}>{syncProgress.imported} imported</span>}
              {syncProgress.skipped>0 && `${syncProgress.skipped} skipped`}
            </span>
          </div>
          <div style={{ height:5, background:"hsl(var(--muted))", borderRadius:999, overflow:"hidden" }}>
            <div style={{ height:"100%", borderRadius:999, background:"hsl(var(--pos))", transition:"width .2s", width:syncProgress.total>0?`${Math.round(syncProgress.processed/syncProgress.total*100)}%`:"0%" }}/>
          </div>
        </div>
      )}

      <SectionLabel label="Manual import"/>

      {/* XLS */}
      <div style={cardStyle}>
        <div style={cardH}>
          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, fontWeight:500, color:"hsl(var(--foreground))" }}>
            <IcoWrap variant="warn"><Upload size={14}/></IcoWrap>
            <div>
              XLS bank statement
              <div style={{ fontSize:11.5, color:"hsl(var(--muted-foreground))", fontWeight:400, marginTop:2 }}>Upload an HDFC NetBanking transaction history export</div>
            </div>
          </div>
          <Btn variant="warn" onClick={() => xlsRef.current?.click()} disabled={importing}>
            {importing ? <><RefreshCw size={12} style={{ animation:"settingsSpin 1s linear infinite" }}/> Importing…</> : <><Upload size={12}/> Upload XLS</>}
          </Btn>
        </div>
        <div style={{ display:"flex", gap:14, marginTop:10, fontSize:11.5, color:"hsl(var(--muted-foreground))" }}>
          <span>.xls or .xlsx</span>
          <span>·</span>
          <span>Validated against schema</span>
          <span>·</span>
          <span>Dedupes by ref number</span>
        </div>
        <input ref={xlsRef} type="file" accept=".xls,.xlsx" style={{ display:"none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
            setImporting(true);
            try {
              const { data } = await upiApi.importCsv(file);
              showToast(`XLS: ${data.imported} imported, ${data.skipped} skipped${data.errors?`, ${data.errors} errors`:""}`);
            } catch (ex: any) { showToast(ex?.response?.data?.detail||"XLS import failed", "error"); }
            finally { setImporting(false); }
          }}
        />
      </div>
    </>
  );
}

// ── Google Drive ───────────────────────────────────────────────────────────────
function GoogleDriveSection({
  showToast, onDriveChange,
}: {
  showToast: (m: string, t?: "success"|"error") => void;
  onDriveChange: (connected: boolean, fileCount: number) => void;
}) {
  const driveRestorePollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const [driveStatus, setDriveStatus] = useState<{ connected: boolean; email: string|null }>({ connected:false, email:null });
  const [driveExporting, setDriveExporting] = useState(false);
  const [driveFilesList, setDriveFilesList] = useState<DriveFile[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [selectedDriveFileId, setSelectedDriveFileId] = useState<string>("");
  const [driveRestore, setDriveRestore] = useState<RestoreState>({ phase:"idle" });
  const [refreshToken, setRefreshToken] = useState<string|null>(null);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => () => { if (driveRestorePollRef.current) clearInterval(driveRestorePollRef.current); }, []);

  const loadDriveFiles = async () => {
    setDriveFilesLoading(true);
    try {
      const { data } = await driveApi.files();
      setDriveFilesList(data.data);
      if (data.data.length > 0) setSelectedDriveFileId(data.data[0].id);
      onDriveChange(true, data.data.length);
    } catch (e: any) { showToast(e?.response?.data?.detail||"Failed to load Drive files", "error"); }
    finally { setDriveFilesLoading(false); }
  };

  useEffect(() => {
    driveApi.status().then(({ data }) => {
      setDriveStatus(data);
      onDriveChange(data.connected, 0);
      if (data.connected) loadDriveFiles();
    }).catch(() => {});
  }, []);

  const startDriveRestore = async (fileId: string) => {
    setDriveRestore({ phase:"restoring", progress:5, message:"Downloading from Drive…" });
    let jobId: string;
    try {
      const res = await driveApi.import(fileId);
      jobId = res.data.job_id;
    } catch (e: any) {
      setDriveRestore({ phase:"error", message:e?.response?.data?.detail||e?.message||"Failed to start restore" }); return;
    }
    let failCount = 0;
    driveRestorePollRef.current = setInterval(async () => {
      try {
        const { data } = await driveApi.importStatus(jobId);
        failCount = 0;
        if (data.status === "done")  { clearInterval(driveRestorePollRef.current!); setDriveRestore({ phase:"done",  message:data.message }); }
        else if (data.status === "error") { clearInterval(driveRestorePollRef.current!); setDriveRestore({ phase:"error", message:data.message }); }
        else setDriveRestore({ phase:"restoring", progress:data.progress, message:data.message });
      } catch {
        if (++failCount >= 10) { clearInterval(driveRestorePollRef.current!); setDriveRestore({ phase:"error", message:"Lost connection to restore job." }); }
      }
    }, 800);
  };

  const d = driveStatus;

  return (
    <>
      <RestoreModal restore={driveRestore}
        onConfirm={() => { if (driveRestore.phase==="confirm") startDriveRestore(driveRestore.fileId!); }}
        onClose={() => setDriveRestore({ phase:"idle" })}/>

      <div style={{ marginBottom:22 }}>
        <h2 style={{ margin:0, fontSize:22, fontWeight:500, letterSpacing:"-.015em", color:"hsl(var(--foreground))" }}>Google Drive Backup</h2>
        <p style={{ margin:"4px 0 0", fontSize:13, color:"hsl(var(--muted-foreground))", lineHeight:1.5, maxWidth:560 }}>
          Cloud backups stored at <code style={{ fontFamily:monoFont, fontSize:11, padding:"2px 6px", background:"hsl(var(--muted))", borderRadius:4, color:"hsl(var(--foreground) / 0.65)" }}>gg_fin/db_bck_up</code> in your Drive. Last 10 backups are kept automatically.
        </p>
      </div>

      {/* Drive hero */}
      <div style={panelHero(d.connected ? "ok" : "off")}>
        <IcoWrap size={44} radius={12} variant={d.connected ? "ok" : "default"}><FolderSync size={20}/></IcoWrap>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:16, fontWeight:500, color:"hsl(var(--foreground))" }}>
              {d.connected ? `Drive · ${d.email}` : "Google Drive"}
            </span>
            {d.connected
              ? <Pill variant="pos"><PulseDot/> connected</Pill>
              : <Pill variant="mute">not connected</Pill>}
          </div>
          {d.connected ? (
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", fontSize:12, color:"hsl(var(--muted-foreground))" }}>
              <span><b style={{ fontFamily:monoFont, color:"hsl(var(--foreground) / 0.65)" }}>{driveFilesList.length}</b> backups</span>
              {driveFilesList[0] && <>
                <span style={{ width:3, height:3, borderRadius:999, background:"hsl(var(--muted-foreground) / 0.4)", flexShrink:0 }}/>
                <span>latest <b style={{ fontFamily:monoFont, color:"hsl(var(--foreground) / 0.65)" }}>{driveFilesList[0].modifiedTime?.slice(5,16)}</b></span>
              </>}
              <span style={{ width:3, height:3, borderRadius:999, background:"hsl(var(--muted-foreground) / 0.4)", flexShrink:0 }}/>
              <span>auto-prune to 10</span>
            </div>
          ) : (
            <div style={{ fontSize:12, color:"hsl(var(--muted-foreground))" }}>Sign in with Google to enable Drive backups.</div>
          )}
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          {d.connected ? <>
            <Btn variant="primary" onClick={async () => {
              setDriveExporting(true);
              try { const { data } = await driveApi.export(); showToast(`Exported: ${data.file_name}`); loadDriveFiles(); }
              catch (e: any) { showToast(e?.response?.data?.detail||"Export to Drive failed", "error"); }
              finally { setDriveExporting(false); }
            }} disabled={driveExporting}>
              {driveExporting ? <><RefreshCw size={12} style={{ animation:"settingsSpin 1s linear infinite" }}/> Uploading…</> : <><HardDriveUpload size={12}/> Export now</>}
            </Btn>
            <Btn variant="ghost" onClick={async () => {
              await driveApi.disconnect();
              setDriveStatus({ connected:false, email:null }); setDriveFilesList([]); setSelectedDriveFileId("");
              onDriveChange(false, 0); showToast("Google Drive disconnected");
            }}>
              <Unlink size={12}/>
            </Btn>
          </> : (
            <Btn variant="tint" onClick={async () => {
              try {
                const { data } = await driveApi.authUrl();
                window.open(data.url, "_blank", "width=600,height=700");
                const poll = setInterval(async () => {
                  const { data: s } = await driveApi.status();
                  if (s.connected) { setDriveStatus(s); clearInterval(poll); showToast("Google Drive connected!"); loadDriveFiles(); }
                }, 2000);
                setTimeout(() => clearInterval(poll), 60000);
              } catch (e: any) { showToast(e?.response?.data?.detail||"Failed to get auth URL", "error"); }
            }}>
              <GoogleIcon/> Connect Drive
            </Btn>
          )}
        </div>
      </div>

      {d.connected && <>
        <SectionLabel label="Restore from Drive"/>

        <div style={cardStyle}>
          <div style={{ ...cardH, marginBottom:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, fontWeight:500, color:"hsl(var(--foreground))" }}>
              <IcoWrap variant="warn"><HardDriveDownload size={14}/></IcoWrap>
              <div>
                Restore from a Drive backup
                <div style={{ fontSize:11.5, color:"hsl(var(--muted-foreground))", fontWeight:400, marginTop:2 }}>Replaces local database with the selected snapshot</div>
              </div>
            </div>
            <Btn variant="warn" disabled={!selectedDriveFileId} onClick={() => {
              const f = driveFilesList.find(x => x.id === selectedDriveFileId);
              if (f) setDriveRestore({ phase:"confirm", file:{ name:f.name } as File, fileId:f.id });
            }}>
              <HardDriveDownload size={12}/> Restore
            </Btn>
          </div>

          {/* File rows */}
          {driveFilesLoading ? (
            <div style={{ height:80, background:"hsl(var(--muted))", borderRadius:8, animation:"settingsPulse 1.5s ease-in-out infinite", marginTop:12 }}/>
          ) : driveFilesList.length === 0 ? (
            <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", margin:"12px 0 0" }}>No backups found in Drive folder.</p>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:2, marginTop:12 }}>
              {driveFilesList.map((f, i) => {
                const isSel = selectedDriveFileId === f.id;
                const sizeKB = Math.round(Number(f.size)/1024);
                return (
                  <div key={f.id} onClick={() => setSelectedDriveFileId(f.id)}
                    style={{ display:"grid", gridTemplateColumns:"26px 1fr auto auto", gap:12, alignItems:"center", padding:"8px 10px", borderRadius:8, cursor:"pointer", fontSize:12.5, border:`1px solid ${isSel?"hsl(var(--border))":"transparent"}`, background:isSel?"hsl(var(--muted))":"transparent", transition:"background .12s" }}>
                    <IcoWrap size={26} variant={i===0?"ok":"default"}>
                      <HardDriveDownload size={13}/>
                    </IcoWrap>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontFamily:monoFont, fontSize:11.5, fontWeight:500, color:"hsl(var(--foreground))", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                      <div style={{ fontFamily:monoFont, fontSize:10.5, color:"hsl(var(--muted-foreground))", marginTop:1 }}>{f.modifiedTime}</div>
                    </div>
                    {i===0 && (
                      <span style={{ fontFamily:monoFont, fontSize:9, fontWeight:600, background:"hsl(var(--pos) / 0.14)", color:"hsl(var(--pos))", padding:"2px 6px", borderRadius:999, textTransform:"uppercase", letterSpacing:".04em" }}>latest</span>
                    )}
                    <span style={{ fontFamily:monoFont, fontSize:11, color:"hsl(var(--muted-foreground))" }}>{sizeKB} KB</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end" }}>
            <Btn sm onClick={loadDriveFiles} disabled={driveFilesLoading}>
              <RefreshCw size={11}/> Refresh
            </Btn>
          </div>
        </div>

        <SectionLabel label="New machine setup"/>

        <div style={cardStyle}>
          <div style={cardH}>
            <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, fontWeight:500, color:"hsl(var(--foreground))" }}>
              <IcoWrap variant="info"><Key size={14}/></IcoWrap>
              <div>
                Refresh token
                <div style={{ fontSize:11.5, color:"hsl(var(--muted-foreground))", fontWeight:400, marginTop:2 }}>
                  Copy into <code style={{ fontFamily:monoFont, fontSize:10.5, padding:"1px 5px", background:"hsl(var(--muted))", borderRadius:4 }}>GOOGLE_DRIVE_REFRESH_TOKEN</code> in <code style={{ fontFamily:monoFont, fontSize:10.5, padding:"1px 5px", background:"hsl(var(--muted))", borderRadius:4 }}>.env</code> on a fresh install
                </div>
              </div>
            </div>
            <Btn sm onClick={async () => {
              if (!showToken) {
                try { const { data } = await driveApi.refreshToken(); setRefreshToken(data.refresh_token); setShowToken(true); }
                catch { showToast("Could not retrieve token", "error"); }
              } else { setShowToken(false); }
            }}>
              {showToken ? <><EyeOff size={11}/> Hide</> : <><Eye size={11}/> Show token</>}
            </Btn>
          </div>
          {showToken && refreshToken && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, background:"hsl(var(--muted))", border:"1px solid hsl(var(--border))", borderRadius:8, padding:"10px 12px", fontFamily:monoFont, fontSize:10.5, color:"hsl(var(--foreground) / 0.65)", wordBreak:"break-all", userSelect:"all" }}>
              <code style={{ flex:1 }}>{refreshToken}</code>
              <Btn sm onClick={() => { navigator.clipboard.writeText(refreshToken); showToast("Copied to clipboard!"); }}>
                <Copy size={11}/> Copy
              </Btn>
            </div>
          )}
          <div style={{ display:"flex", gap:14, marginTop:10, fontSize:11.5, color:"hsl(var(--muted-foreground))" }}>
            <span>Never share this token</span>
            <span>·</span>
            <span>App auto-restores latest on first boot</span>
          </div>
        </div>
      </>}
    </>
  );
}

// ── Device ─────────────────────────────────────────────────────────────────────
function DeviceSection({
  showToast, onDeviceChange,
}: {
  showToast: (m: string, t?: "success"|"error") => void;
  onDeviceChange: (mode: "cpu"|"cuda", name: string) => void;
}) {
  const [deviceInfo, setDeviceInfo] = useState<{ device: string; device_name: string; gpu_available: boolean }|null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    voiceApi.deviceInfo()
      .then(({ data }) => { setDeviceInfo(data); onDeviceChange(data.device as "cpu"|"cuda", data.device_name); })
      .catch(() => showToast("Could not load device info", "error"))
      .finally(() => setLoading(false));
  }, []);

  const handleSwitch = async (target: "cpu"|"cuda") => {
    if (!deviceInfo || switching || deviceInfo.device === target) return;
    setSwitching(true);
    try {
      const { data } = await voiceApi.setDevice(target);
      setDeviceInfo(data);
      onDeviceChange(data.device as "cpu"|"cuda", data.device_name);
      showToast(`Switched to ${data.device_name}`);
    } catch (e: any) { showToast(e?.response?.data?.detail||"Failed to switch device", "error"); }
    finally { setSwitching(false); }
  };

  const dev = deviceInfo;
  const isCuda = dev?.device === "cuda";

  return (
    <>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ margin:0, fontSize:22, fontWeight:500, letterSpacing:"-.015em", color:"hsl(var(--foreground))" }}>Inference Device</h2>
        <p style={{ margin:"4px 0 0", fontSize:13, color:"hsl(var(--muted-foreground))", lineHeight:1.5, maxWidth:560 }}>
          Select which processor handles voice transcription. GPU is dramatically faster when CUDA is available.
        </p>
      </div>

      {loading ? (
        <div style={{ height:96, borderRadius:12, background:"hsl(var(--muted))", animation:"settingsPulse 1.5s ease-in-out infinite", marginBottom:18 }}/>
      ) : dev ? (
        <>
          {/* Hero */}
          <div style={panelHero(isCuda ? "ok" : "warn")}>
            <IcoWrap size={44} radius={12} variant={isCuda?"ok":"warn"}><Cpu size={20}/></IcoWrap>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:16, fontWeight:500, color:"hsl(var(--foreground))" }}>
                  {isCuda ? "GPU acceleration" : "CPU fallback"}
                </span>
                <Pill variant={isCuda?"pos":"warn"}><PulseDot/> active</Pill>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12, fontSize:12, color:"hsl(var(--muted-foreground))" }}>
                <code style={{ fontFamily:monoFont, fontSize:11, padding:"2px 6px", background:"hsl(var(--muted))", borderRadius:4 }}>{dev.device_name}</code>
                <span style={{ width:3, height:3, borderRadius:999, background:"hsl(var(--muted-foreground) / 0.4)", flexShrink:0 }}/>
                <span>~<b style={{ fontFamily:monoFont, color:"hsl(var(--foreground) / 0.65)" }}>{isCuda?"0.4s":"3.8s"}</b> per minute audio</span>
              </div>
            </div>
            {switching && (
              <Pill variant="mute">
                <RefreshCw size={11} style={{ animation:"settingsSpin 1s linear infinite" }}/> switching…
              </Pill>
            )}
          </div>

          <SectionLabel label="Select device"/>

          {/* Device grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            {/* CPU */}
            <DeviceCard
              label="CPU" desc="always available" icon={<Cpu size={18}/>}
              isOn={dev.device==="cpu"} isDisabled={false}
              variantOn="warn" speedPct={24} speedLabel="~3.8s/min" speedRight="fallback"
              onClick={() => handleSwitch("cpu")} disabled={switching||dev.device==="cpu"}
            />
            {/* GPU */}
            <DeviceCard
              label="GPU" desc={dev.gpu_available?"CUDA available":"not detected"} icon={<MonitorDot size={18}/>}
              isOn={dev.device==="cuda"} isDisabled={!dev.gpu_available}
              variantOn="ok" speedPct={94} speedLabel="~0.4s/min" speedRight="~9× faster"
              onClick={() => handleSwitch("cuda")} disabled={switching||!dev.gpu_available||dev.device==="cuda"}
            />
          </div>

          {switching && (
            <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"hsl(var(--muted-foreground))", marginBottom:12 }}>
              <RefreshCw size={13} style={{ animation:"settingsSpin 1s linear infinite" }}/>
              Switching device — model will reload on next transcription…
            </div>
          )}

          {!dev.gpu_available && (
            <>
              <SectionLabel label="Setup"/>
              <div style={{ ...cardStyle, borderColor:"hsl(var(--warn) / 0.3)" }}>
                <div style={cardH}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, fontWeight:500, color:"hsl(var(--foreground))" }}>
                    <IcoWrap variant="warn"><AlertCircle size={14}/></IcoWrap>
                    <div>
                      GPU not detected
                      <div style={{ fontSize:11.5, color:"hsl(var(--muted-foreground))", fontWeight:400, marginTop:2 }}>Install nvidia-container-toolkit on the host and rebuild containers</div>
                    </div>
                  </div>
                </div>
                <p style={{ margin:"6px 0 0", fontSize:12.5, color:"hsl(var(--muted-foreground))", lineHeight:1.5 }}>
                  Make sure <code style={{ fontFamily:monoFont, fontSize:11, padding:"1px 5px", background:"hsl(var(--muted))", borderRadius:4 }}>nvidia-container-toolkit</code> is installed and the Docker daemon is configured to use it. After installing, run <code style={{ fontFamily:monoFont, fontSize:11, padding:"1px 5px", background:"hsl(var(--muted))", borderRadius:4 }}>docker compose down &amp;&amp; docker compose up -d --build</code>.
                </p>
              </div>
            </>
          )}
        </>
      ) : (
        <p style={{ fontSize:13, color:"hsl(var(--muted-foreground))" }}>Device info unavailable.</p>
      )}
    </>
  );
}

function DeviceCard({ label, desc, icon, isOn, isDisabled, variantOn, speedPct, speedLabel, speedRight, onClick, disabled }: {
  label: string; desc: string; icon: ReactNode;
  isOn: boolean; isDisabled: boolean; variantOn: "ok"|"warn";
  speedPct: number; speedLabel: string; speedRight: string;
  onClick: () => void; disabled?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const gradColor = variantOn === "ok" ? "hsl(var(--pos))" : "hsl(var(--warn))";
  const barColor  = variantOn === "ok" ? "hsl(var(--pos))" : "hsl(var(--warn))";
  const icoV      = isOn ? variantOn : "default";
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        padding:18, borderRadius:12, textAlign:"left", position:"relative", overflow:"hidden",
        border:`1.5px solid ${isOn?`${gradColor}55`:"hsl(var(--border))"}`,
        background: isOn
          ? `radial-gradient(120% 80% at 100% 0%, ${gradColor}22, transparent 55%), hsl(var(--card))`
          : "hsl(var(--card))",
        cursor: disabled?"not-allowed":"pointer",
        opacity: isDisabled?.55:1,
        transform: hov&&!disabled&&!isOn?"translateY(-1px)":"none",
        transition:"border-color .12s, background .12s, transform .08s",
        fontFamily:"inherit",
      }}>
      {/* Badge */}
      {isOn && (
        <span style={{ position:"absolute", top:12, right:12, fontFamily:monoFont, fontSize:9, fontWeight:600, padding:"2px 7px", borderRadius:999, textTransform:"uppercase", letterSpacing:".06em", background:`${gradColor}22`, color:gradColor }}>active</span>
      )}
      {isDisabled && !isOn && (
        <span style={{ position:"absolute", top:12, right:12, fontFamily:monoFont, fontSize:9, fontWeight:600, padding:"2px 7px", borderRadius:999, textTransform:"uppercase", letterSpacing:".06em", background:"hsl(var(--muted))", color:"hsl(var(--muted-foreground))" }}>unavailable</span>
      )}
      <div style={{ marginBottom:10 }}>
        <IcoWrap size={36} radius={10} variant={icoV}>{icon}</IcoWrap>
      </div>
      <div style={{ fontSize:16, fontWeight:500, letterSpacing:"-.01em", color:"hsl(var(--foreground))" }}>{label}</div>
      <div style={{ fontSize:11.5, color:"hsl(var(--muted-foreground))", fontFamily:monoFont, marginTop:2 }}>{desc}</div>
      <div style={{ height:4, background:"hsl(var(--muted))", borderRadius:999, marginTop:14, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${speedPct}%`, background:barColor, borderRadius:999, transition:"width .4s" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10.5, color:"hsl(var(--muted-foreground))", marginTop:6, fontFamily:monoFont }}>
        <span>{speedLabel}</span>
        <span style={isOn&&variantOn==="ok"?{color:"hsl(var(--pos))"}:{}}>{speedRight}</span>
      </div>
    </button>
  );
}

// ── SecuritySection ────────────────────────────────────────────────────────────
function SecuritySection({ showToast }: { showToast: (msg: string, type: "success"|"error") => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving]   = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 6;
  const canSave  = current.length > 0 && next.length >= 6 && next === confirm;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await authApi.changePassword(current, next);
      showToast("Password changed successfully", "success");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Failed to change password";
      showToast(detail, "error");
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    show: boolean,
    toggle: () => void,
    hint?: string,
    isError?: boolean,
  ) => (
    <div>
      <label style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", color:"hsl(var(--muted-foreground))", display:"block", marginBottom:4 }}>
        {label}
      </label>
      <div style={{ position:"relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          style={{
            width:"100%", boxSizing:"border-box",
            padding:"8px 36px 8px 12px", borderRadius:8, fontSize:13,
            border:`1px solid ${isError ? "hsl(var(--destructive)/0.5)" : "hsl(var(--border))"}`,
            background:"hsl(var(--background))", color:"hsl(var(--foreground))",
            outline:"none", fontFamily:"inherit",
          }}
        />
        <button
          type="button"
          onClick={toggle}
          style={{
            position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
            background:"none", border:"none", cursor:"pointer", color:"hsl(var(--muted-foreground))",
            padding:0, display:"flex",
          }}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {hint && (
        <p style={{ fontSize:11, marginTop:4, color: isError ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))" }}>
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:"hsl(var(--foreground))", margin:0 }}>Security</h2>
        <p style={{ fontSize:13, color:"hsl(var(--muted-foreground))", marginTop:4 }}>Change your login password.</p>
      </div>

      <div style={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:12, padding:24, maxWidth:400 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {field("Current password", current, setCurrent, showCur, () => setShowCur(v => !v))}
          {field(
            "New password", next, setNext, showNew, () => setShowNew(v => !v),
            tooShort ? "Must be at least 6 characters" : undefined,
            tooShort,
          )}
          {field(
            "Confirm new password", confirm, setConfirm, showNew, () => setShowNew(v => !v),
            mismatch ? "Passwords do not match" : undefined,
            mismatch,
          )}
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              marginTop:4, padding:"9px 0", borderRadius:8, border:"none", cursor: canSave && !saving ? "pointer" : "not-allowed",
              background:"hsl(var(--foreground))", color:"hsl(var(--background))",
              fontSize:13, fontWeight:600, opacity: canSave && !saving ? 1 : 0.45,
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}
          >
            {saving ? "Saving…" : "Change Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeSection, setActiveSection] = useSessionState<NavSection>("settings.activeSection", "local");
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error" }|null>(null);
  const [gStat, setGStat] = useState({ gmailOk:false, driveOk:false, driveCount:0, deviceMode:"cpu" as "cpu"|"cuda", deviceName:"CPU" });

  const showToast = (msg: string, type: "success"|"error" = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000);
  };

  // Load top-level status for gstat bar
  useEffect(() => {
    Promise.all([
      upiApi.gmailStatus().catch(() => null),
      driveApi.status().catch(() => null),
      voiceApi.deviceInfo().catch(() => null),
    ]).then(([gmail, drive, device]) => {
      setGStat(s => ({
        ...s,
        gmailOk: gmail?.data?.connected ?? false,
        driveOk: drive?.data?.connected ?? false,
        deviceMode: (device?.data?.device ?? "cpu") as "cpu"|"cuda",
        deviceName: device?.data?.device_name?.split("·")[0]?.trim() ?? "CPU",
      }));
    });
  }, []);

  const statusFor = (id: NavSection) => {
    if (id === "local")    return "ok";
    if (id === "upi")      return gStat.gmailOk ? "ok" : "off";
    if (id === "drive")    return gStat.driveOk ? "ok" : "off";
    if (id === "device")   return gStat.deviceMode === "cuda" ? "ok" : "warn";
    if (id === "security") return "ok";
    return "off";
  };

  const dotColor = (s: string) =>
    s === "ok" ? "hsl(var(--pos))" : s === "warn" ? "hsl(var(--warn))" : "hsl(var(--muted-foreground) / 0.45)";

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden", background:"hsl(var(--background))" }}>
      <style>{`
        @keyframes settingsSpin { to { transform: rotate(360deg); } }
        @keyframes settingsPulse { 0%,100%{opacity:.4} 50%{opacity:1} }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:20, right:20, zIndex:100, display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:12, border:"1px solid hsl(var(--border))", background:"hsl(var(--card))", fontSize:13, fontWeight:500, boxShadow:"0 18px 50px rgba(0,0,0,.1)", color:toast.type==="success"?"hsl(var(--pos))":"hsl(var(--neg))" }}>
          {toast.type === "success" ? <CheckCircle size={15}/> : <AlertCircle size={15}/>}
          {toast.msg}
        </div>
      )}

      {/* Global status bar */}
      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"10px 18px", borderBottom:"1px solid hsl(var(--border))", flexShrink:0, fontSize:12, background:"hsl(var(--card))" }}>
        {[
          { lbl:"Gmail",  val:gStat.gmailOk?"synced":"not connected",  status:gStat.gmailOk?"ok":"off" },
          { lbl:"Drive",  val:gStat.driveOk?`${gStat.driveCount} backups`:"not connected", status:gStat.driveOk?"ok":"off" },
          { lbl:gStat.deviceMode==="cuda"?"GPU":"CPU", val:gStat.deviceMode==="cuda"?gStat.deviceName:"fallback", status:gStat.deviceMode==="cuda"?"ok":"warn" },
        ].map((item, i) => (
          <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:6, color:"hsl(var(--muted-foreground))" }}>
            {i > 0 && <span style={{ width:1, height:16, background:"hsl(var(--border))", marginRight:10 }}/>}
            <span style={{ width:7, height:7, borderRadius:999, background:dotColor(item.status), flexShrink:0 }}/>
            <span style={{ fontWeight:600, fontSize:10.5, textTransform:"uppercase", letterSpacing:".08em", color:"hsl(var(--muted-foreground))" }}>{item.lbl}</span>
            <span style={{ fontFamily:monoFont, fontSize:12 }}>{item.val}</span>
          </span>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, display:"grid", gridTemplateColumns:"260px 1fr", overflow:"hidden" }}>

        {/* Sidebar */}
        <aside style={{ background:"hsl(var(--card))", borderRight:"1px solid hsl(var(--border))", overflowY:"auto", padding:"16px 12px", display:"flex", flexDirection:"column", gap:4 }}>
          <h1 style={{ margin:"4px 8px 12px", fontSize:13, fontWeight:500, color:"hsl(var(--muted-foreground))", letterSpacing:".12em", textTransform:"uppercase" }}>Settings</h1>
          {NAV_ITEMS.map(({ id, label, icon: Icon, desc }) => {
            const isOn = activeSection === id;
            const s = statusFor(id);
            return (
              <button key={id} onClick={() => setActiveSection(id)}
                style={{ display:"grid", gridTemplateColumns:"28px 1fr auto", gap:12, alignItems:"center", padding:"10px 11px", borderRadius:8, textAlign:"left", cursor:"pointer", fontFamily:"inherit", border:`1px solid ${isOn?"hsl(var(--border))":"transparent"}`, background:isOn?"hsl(var(--background))":"transparent", color:isOn?"hsl(var(--foreground))":"hsl(var(--muted-foreground))", boxShadow:isOn?"0 1px 2px rgba(0,0,0,.04)":"none", transition:"background .12s, color .12s" }}>
                <IcoWrap size={28} radius={7} variant={isOn?"dark":"default"}>
                  <Icon size={14}/>
                </IcoWrap>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, lineHeight:1.2, color:"hsl(var(--foreground))" }}>{label}</div>
                  <div style={{ fontSize:11, color:"hsl(var(--muted-foreground))", marginTop:1 }}>{desc}</div>
                </div>
                <span style={{ width:7, height:7, borderRadius:999, background:dotColor(s), flexShrink:0 }}/>
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <main style={{ overflowY:"auto", padding:"24px 28px 60px", background:"hsl(var(--background))" }}>
          <div style={{ maxWidth:760, margin:"0 auto" }}>
            {activeSection === "local" && <LocalBackupSection showToast={showToast}/>}
            {activeSection === "upi" && (
              <UpiImportSection showToast={showToast}
                onGmailChange={(ok, email) => setGStat(s => ({ ...s, gmailOk:ok }))}
              />
            )}
            {activeSection === "drive" && (
              <GoogleDriveSection showToast={showToast}
                onDriveChange={(ok, count) => setGStat(s => ({ ...s, driveOk:ok, driveCount:count }))}
              />
            )}
            {activeSection === "device" && (
              <DeviceSection showToast={showToast}
                onDeviceChange={(mode, name) => setGStat(s => ({ ...s, deviceMode:mode, deviceName:name }))}
              />
            )}
            {activeSection === "security" && <SecuritySection showToast={showToast} />}
          </div>
        </main>
      </div>
    </div>
  );
}
