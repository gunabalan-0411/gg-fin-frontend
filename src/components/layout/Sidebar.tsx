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
  ChevronLeft,
  ChevronRight,
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

export default function Sidebar({
  onClose,
  collapsed,
  onToggle,
}: {
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <aside
      className={cn(
        "flex-shrink-0 flex flex-col h-full bg-secondary border-r border-border transition-all duration-200",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "border-b border-border flex items-center",
          collapsed ? "px-0 py-4 justify-center" : "px-5 py-4 justify-between"
        )}
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
      >
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          {/* Brand mark */}
          <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0">
            <span className="font-mono text-[11px] font-semibold text-background tracking-tight">gf</span>
          </div>
          {!collapsed && (
            <div>
              <p className="text-[13.5px] font-semibold text-foreground tracking-tight leading-none">gg fin</p>
              <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-none">Lending Dashboard</p>
            </div>
          )}
        </div>

        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Close menu"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Desktop collapse button (visible when expanded) */}
        {onToggle && !collapsed && (
          <button
            onClick={onToggle}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-0.5">
        {nav.map((item, i) =>
          item === null ? (
            <div key={`sep-${i}`} className="h-px bg-border/60 mx-1 my-2.5" />
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-100",
                  collapsed ? "justify-center px-2" : "px-2.5",
                  isActive
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
              {!collapsed && item.label}
            </NavLink>
          )
        )}
      </nav>

      {/* Footer */}
      <div
        className="border-t border-border flex items-center justify-center px-4 py-3"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <p className="text-[10.5px] text-muted-foreground/60 text-center font-mono">v1.0.0</p>
        )}
      </div>
    </aside>
  );
}
