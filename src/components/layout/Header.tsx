import { useState, useEffect } from "react";
import { LogOut, User, Sun, Moon, Menu } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function Header({
  showMenuButton,
  onMenuClick,
}: {
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}) {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  // Default to light mode (mint theme is a light-first design)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("gg_fin_theme");
    return saved === "dark";
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("gg_fin_theme", isDark ? "dark" : "light");
  }, [isDark]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header
      className="flex items-center justify-between px-4 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30"
      style={{
        minHeight: "52px",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="flex items-center gap-2">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <img src="/brand/mark.svg" alt="gg fin" className="h-6 w-auto opacity-60" />
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setIsDark(!isDark)}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <div className="hidden sm:block h-4 w-px bg-border mx-1" />

        <div className="hidden sm:flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20">
            <User className="h-3.5 w-3.5 text-primary-foreground/60" />
          </div>
          <span className="text-sm font-medium text-foreground">Admin</span>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 ml-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors min-h-[34px]"
          aria-label="Logout"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
