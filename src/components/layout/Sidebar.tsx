import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Receipt,
  Mic,
  ScanText,
  Settings,
  BookText,
  Wallet,
  Landmark,
  X,
} from "lucide-react";
import { cn } from "@/utils";

type NavItem = { to: string; icon: React.ElementType; label: string } | null;

const nav: NavItem[] = [
  { to: "/dashboard",    icon: LayoutDashboard, label: "Dashboard" },
  { to: "/customers",    icon: Users,            label: "Customers" },
  null,
  { to: "/voice",        icon: Mic,              label: "Voice Entry" },
  { to: "/ocr",          icon: ScanText,         label: "OCR Entry" },
  { to: "/transactions", icon: ArrowLeftRight,   label: "Collections" },
  null,
  { to: "/expenses",     icon: Receipt,          label: "Account Adjustments" },
  { to: "/debts",        icon: Landmark,         label: "Debts" },
  null,
  { to: "/upi",          icon: Wallet,           label: "UPI Transactions" },
  { to: "/namemap",      icon: BookText,         label: "Mapping Configs" },
  null,
  { to: "/settings",     icon: Settings,         label: "Settings" },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="w-60 flex-shrink-0 flex flex-col h-full bg-secondary border-r border-border">
      {/* Brand */}
      <div
        className="px-5 py-4 border-b border-border flex items-center justify-between"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
      >
        <div className="flex items-center gap-2.5">
          {/* Brand mark — ink square with mono initials */}
          <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0">
            <span className="font-mono text-[11px] font-semibold text-background tracking-tight">gf</span>
          </div>
          <div>
            <p className="text-[13.5px] font-semibold text-foreground tracking-tight leading-none">gg fin</p>
            <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-none">Lending Dashboard</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Close menu"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 overflow-y-auto space-y-0.5">
        {nav.map((item, i) =>
          item === null ? (
            <div key={`sep-${i}`} className="h-px bg-border/60 mx-1 my-2.5" />
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-100",
                  isActive
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <div
        className="px-4 py-3 border-t border-border"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <p className="text-[10.5px] text-muted-foreground/60 text-center font-mono">v1.0.0</p>
      </div>
    </aside>
  );
}
