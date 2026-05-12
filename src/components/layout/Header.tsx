import { useState, useEffect } from "react";
import { LogOut, User, Sun, Moon } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function Header() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("gg_fin_theme");
    return saved ? saved === "dark" : true;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("gg_fin_theme", isDark ? "dark" : "light");
  }, [isDark]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card sticky top-0 z-10">
      <img src="/brand/mark.svg" alt="gg fin" className="h-7 w-auto opacity-70" />
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsDark(!isDark)}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="h-6 w-px bg-border mx-1" />
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <User className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-foreground">Admin</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 ml-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </header>
  );
}
