import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, AlertCircle } from "lucide-react";

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") ?? "service";
  const status = searchParams.get("status") ?? "connected";
  const msg = searchParams.get("msg");
  const isError = status === "error";

  useEffect(() => {
    if (!isError) {
      const t = setTimeout(() => window.close(), 1500);
      return () => clearTimeout(t);
    }
  }, [isError]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-border bg-card shadow-xl max-w-xs w-full mx-4 text-center">
        {isError ? (
          <>
            <AlertCircle className="h-10 w-10 text-red-400" />
            <h1 className="text-lg font-semibold text-foreground">Authorization Failed</h1>
            <p className="text-sm text-muted-foreground">{msg || "Something went wrong. You can close this window."}</p>
            <button
              onClick={() => window.close()}
              className="mt-2 px-5 py-2 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <CheckCircle className="h-10 w-10 text-emerald-400" />
            <h1 className="text-lg font-semibold text-foreground">
              {type === "gmail" ? "Gmail" : "Google Drive"} Connected
            </h1>
            <p className="text-sm text-muted-foreground">Access granted. This window will close automatically…</p>
            <div className="w-full h-1 rounded-full bg-secondary overflow-hidden mt-1">
              <div className="h-full bg-emerald-500 rounded-full animate-[shrink_1.5s_linear_forwards]" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
