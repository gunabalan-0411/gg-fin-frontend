import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// Stroke path lengths for draw-in animation
const L = {
  topCircle: 314,  // 2π×50
  desc1: 75,
  botCircle: 226,  // 2π×36
  desc2: 54,
  fDiag: 222,      // √(60²+214²)
  fTop: 33,        // √(32²+4²)
  fMid: 27,        // √(26²+4²)
};

function LoginAnimation({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes lg-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes lg-mark-in {
          0%   { opacity: 0; transform: scale(0.12) rotate(-20deg); }
          55%  { opacity: 1; transform: scale(1.1) rotate(3deg); }
          75%  { transform: scale(0.96) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes lg-draw {
          from { stroke-dashoffset: var(--dl); }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes lg-dot-in {
          from { opacity: 0; r: 0; }
          to   { opacity: 1; r: 6.5; }
        }
        @keyframes lg-glow {
          0%   { filter: drop-shadow(0 0 0px transparent); }
          50%  { filter: drop-shadow(0 0 16px #00A896) drop-shadow(0 0 32px #00796B); }
          100% { filter: drop-shadow(0 0 6px #00A896); }
        }
        @keyframes lg-exit {
          0%   { opacity: 1; transform: scale(1); }
          30%  { opacity: 1; transform: scale(1.12); }
          100% { opacity: 0; transform: scale(4); }
        }
        @keyframes lg-bg-exit {
          0%   { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Full-screen overlay */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "#f1f5f0",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "lg-overlay-in 0.25s ease both, lg-bg-exit 0.55s ease 2.05s both",
        }}
      >
        {/* Mark SVG */}
        <svg
          viewBox="0 0 256 256"
          style={{
            width: 220, height: 220,
            animation:
              "lg-mark-in 0.65s cubic-bezier(0.34,1.4,0.64,1) 0.15s both," +
              "lg-glow 0.7s ease-in-out 1.55s both," +
              "lg-exit 0.55s ease-in 2.05s both",
          }}
        >
          <defs>
            <linearGradient id="lg-fstem" x1="0.3" y1="1" x2="0.7" y2="0">
              <stop offset="0%" stopColor="#4FC3F7" />
              <stop offset="100%" stopColor="#1565C0" />
            </linearGradient>
          </defs>

          <g transform="translate(7, 5)" strokeWidth="13.5" strokeLinecap="round">
            {/* Top circle — draws first */}
            <circle cx="60" cy="60" r="50" fill="none" stroke="#00A896"
              style={{
                strokeDasharray: L.topCircle,
                ["--dl" as string]: L.topCircle,
                animation: "lg-draw 0.65s ease 0.8s both",
              } as React.CSSProperties}
            />
            {/* Descender 1 */}
            <line x1="110" y1="60" x2="110" y2="135" stroke="#00A896"
              style={{
                strokeDasharray: L.desc1,
                ["--dl" as string]: L.desc1,
                animation: "lg-draw 0.25s ease 1.1s both",
              } as React.CSSProperties}
            />
            {/* Bottom circle */}
            <circle cx="92" cy="146" r="36" fill="none" stroke="#00796B"
              style={{
                strokeDasharray: L.botCircle,
                ["--dl" as string]: L.botCircle,
                animation: "lg-draw 0.55s ease 1.18s both",
              } as React.CSSProperties}
            />
            {/* Descender 2 */}
            <line x1="128" y1="146" x2="128" y2="200" stroke="#00796B"
              style={{
                strokeDasharray: L.desc2,
                ["--dl" as string]: L.desc2,
                animation: "lg-draw 0.2s ease 1.45s both",
              } as React.CSSProperties}
            />
            {/* Tangent dot */}
            <circle cx="79" cy="110" r="6.5" fill="#00A896" stroke="none"
              style={{
                opacity: 0,
                animation: "lg-dot-in 0.25s ease 1.45s both",
              }}
            />
            {/* F diagonal — draws in parallel with gg part */}
            <line x1="140" y1="232" x2="200" y2="18" stroke="url(#lg-fstem)"
              style={{
                strokeDasharray: L.fDiag,
                ["--dl" as string]: L.fDiag,
                animation: "lg-draw 0.75s ease 0.9s both",
              } as React.CSSProperties}
            />
            {/* F top bar */}
            <line x1="200" y1="18" x2="232" y2="14" stroke="#1565C0"
              style={{
                strokeDasharray: L.fTop,
                ["--dl" as string]: L.fTop,
                animation: "lg-draw 0.18s ease 1.48s both",
              } as React.CSSProperties}
            />
            {/* F mid bar */}
            <line x1="170" y1="125" x2="196" y2="121" stroke="#4FC3F7"
              style={{
                strokeDasharray: L.fMid,
                ["--dl" as string]: L.fMid,
                animation: "lg-draw 0.18s ease 1.52s both",
              } as React.CSSProperties}
            />
          </g>
        </svg>
      </div>
    </>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [animating, setAnimating] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) setAnimating(true);
  };

  if (animating) {
    return <LoginAnimation onDone={() => navigate("/dashboard")} />;
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      {/* Left panel — gradient brand side */}
      <div
        className="hidden md:flex flex-col p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(180deg, hsl(160 38% 82%) 0%, hsl(120 21% 85%) 55%, hsl(138 22% 87%) 100%)" }}
      >
        {/* Brand mark */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-foreground/90 flex items-center justify-center">
            <span className="font-mono text-xs font-semibold text-background tracking-tight">gf</span>
          </div>
          <span className="text-[15px] font-semibold text-foreground tracking-tight">gg fin</span>
        </div>

        {/* Quote / tagline at bottom */}
        <div className="mt-auto max-w-xs">
          <p className="text-[22px] font-light leading-snug tracking-tight text-foreground">
            Your quiet<br />lending ledger.
          </p>
          <p className="mt-3 font-mono text-[11px] text-foreground/50 uppercase tracking-widest">
            Personal · Precise · Private
          </p>
        </div>

        {/* Decorative circles */}
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/30 pointer-events-none" />
        <div className="absolute -right-8 -bottom-8 w-40 h-40 rounded-full bg-white/20 pointer-events-none" />
      </div>

      {/* Right panel — form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="flex items-center gap-2.5 mb-8 md:hidden">
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
              <span className="font-mono text-[11px] font-semibold text-background tracking-tight">gf</span>
            </div>
            <span className="text-[15px] font-semibold text-foreground tracking-tight">gg fin</span>
          </div>

          <h1 className="text-xl font-semibold text-foreground mb-1">Sign in</h1>
          <p className="text-sm text-muted-foreground mb-7">Enter your credentials to continue</p>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input
                    className="pl-9"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input
                    className="pl-9"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
