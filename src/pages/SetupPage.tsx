import { useState, useEffect, useRef } from "react";
import { CheckCircle, HardDriveDownload, RefreshCw, Database, ArrowRight, Wifi } from "lucide-react";
import { setupApi } from "@/services/api";

type Phase =
  | "choose"          // Pick: restore or start fresh
  | "connect"         // Waiting for Drive OAuth
  | "connected"       // Drive connected, ready to restore
  | "restoring"       // Restore in progress
  | "done"            // Restore complete
  | "fresh";          // User chose Start Fresh

interface Props {
  onComplete: () => void; // called when setup is done (fresh or restored)
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M47.532 24.552c0-1.636-.132-3.2-.38-4.704H24.48v8.898h12.984c-.56 3.024-2.256 5.588-4.804 7.308v6.072h7.776c4.548-4.188 7.096-10.356 7.096-17.574z" fill="#4285F4"/>
      <path d="M24.48 48c6.516 0 11.98-2.16 15.972-5.856l-7.776-6.072c-2.16 1.452-4.92 2.304-8.196 2.304-6.3 0-11.64-4.26-13.548-9.984H2.88v6.252C6.852 42.948 15.108 48 24.48 48z" fill="#34A853"/>
      <path d="M10.932 28.392A14.4 14.4 0 0 1 9.96 24c0-1.524.264-3 .972-4.392V13.356H2.88A23.952 23.952 0 0 0 .48 24c0 3.864.924 7.512 2.4 10.644l8.052-6.252z" fill="#FBBC05"/>
      <path d="M24.48 9.624c3.552 0 6.732 1.224 9.24 3.624l6.924-6.924C36.456 2.4 30.996 0 24.48 0 15.108 0 6.852 5.052 2.88 13.356l8.052 6.252C12.84 13.884 18.18 9.624 24.48 9.624z" fill="#EA4335"/>
    </svg>
  );
}

export default function SetupPage({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drivePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (drivePollRef.current) clearInterval(drivePollRef.current);
  }, []);

  const connectDrive = async () => {
    setPhase("connect");
    try {
      const { data } = await setupApi.driveAuthUrl();
      window.open(data.url, "_blank", "width=600,height=700");

      // Poll until Drive is connected
      drivePollRef.current = setInterval(async () => {
        try {
          const { data: s } = await setupApi.driveStatus();
          if (s.connected) {
            clearInterval(drivePollRef.current!);
            setDriveEmail(s.email);
            setPhase("connected");
          }
        } catch {}
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(drivePollRef.current!), 5 * 60 * 1000);
    } catch {
      setPhase("choose");
    }
  };

  const startRestore = async () => {
    setPhase("restoring");
    setProgress(5);
    setMessage("Starting restore…");

    let jobId: string;
    try {
      const { data } = await setupApi.restoreLatest();
      jobId = data.job_id;
      setFileName(data.file_name);
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || "Failed to start restore");
      setPhase("connected");
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await setupApi.restoreStatus(jobId);
        setProgress(data.progress);
        setMessage(data.message);
        if (data.status === "done") {
          clearInterval(pollRef.current!);
          setPhase("done");
        } else if (data.status === "error") {
          clearInterval(pollRef.current!);
          setMessage(data.message);
          setPhase("connected");
        }
      } catch {}
    }, 600);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <img src="/brand/mark.svg" alt="gg fin" className="h-20 w-auto mx-auto mb-2" />
          <p className="font-serif text-xl tracking-widest" style={{ color: "#00A896" }}>
            gg <span style={{ color: "#4FC3F7" }}>fin</span>
          </p>
          <h1 className="text-2xl font-bold text-foreground">Welcome to GG Finance</h1>
          <p className="text-sm text-muted-foreground">
            {phase === "choose" && "No existing data found. How would you like to get started?"}
            {phase === "connect" && "Opening Google login…"}
            {phase === "connected" && "Google Drive connected. Ready to restore your data."}
            {phase === "restoring" && `Restoring data from ${fileName || "Drive"}…`}
            {phase === "done" && "Your data has been restored successfully."}
            {phase === "fresh" && "Starting with a fresh database."}
          </p>
        </div>

        {/* Phase: Choose */}
        {phase === "choose" && (
          <div className="space-y-3">
            <button
              onClick={connectDrive}
              className="w-full flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 text-left hover:bg-muted/50 transition-colors group"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <GoogleIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Restore from Google Drive</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect your Google account to load your existing data
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-60 group-hover:opacity-100 shrink-0" />
            </button>

            <button
              onClick={() => { setPhase("fresh"); onComplete(); }}
              className="w-full flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 text-left hover:bg-secondary/60 transition-colors group"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                <Database className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Start Fresh</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Begin with an empty database — ideal for a new setup
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-40 group-hover:opacity-80 shrink-0" />
            </button>
          </div>
        )}

        {/* Phase: Waiting for OAuth */}
        {phase === "connect" && (
          <div className="rounded-2xl border border-border bg-card px-5 py-6 flex flex-col items-center gap-4 text-center">
            <Wifi className="h-8 w-8 text-primary animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-foreground">Waiting for Google login</p>
              <p className="text-xs text-muted-foreground mt-1">
                Complete sign-in in the popup window. This page will update automatically.
              </p>
            </div>
            <button
              onClick={() => setPhase("choose")}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Phase: Drive connected, ready to restore */}
        {phase === "connected" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Connected — {driveEmail}</p>
                <p className="text-xs text-muted-foreground">gg_fin/db_bck_up</p>
              </div>
            </div>
            <button
              onClick={startRestore}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <HardDriveDownload className="h-4 w-4" />
              Restore Latest Backup
            </button>
            <button
              onClick={() => { onComplete(); }}
              className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors"
            >
              Skip restore and start fresh instead
            </button>
          </div>
        )}

        {/* Phase: Restoring */}
        {phase === "restoring" && (
          <div className="rounded-2xl border border-border bg-card px-5 py-6 space-y-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-primary animate-spin shrink-0" />
              <p className="text-sm font-medium text-foreground">Restoring database…</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{message}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Please keep this window open. This may take a minute.
            </p>
          </div>
        )}

        {/* Phase: Done */}
        {phase === "done" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-5 flex flex-col items-center gap-3 text-center">
              <CheckCircle className="h-10 w-10 text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">Data restored successfully!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  All your customers, transactions, and settings have been loaded.
                </p>
              </div>
            </div>
            <button
              onClick={onComplete}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Continue to Login <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
