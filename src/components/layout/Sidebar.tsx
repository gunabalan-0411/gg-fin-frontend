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
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/customers", icon: Users, label: "Customers" },
  null,
  { to: "/voice", icon: Mic, label: "Voice Entry" },
  { to: "/ocr", icon: ScanText, label: "OCR Entry" },
  { to: "/transactions", icon: ArrowLeftRight, label: "Collections" },
  null,
  { to: "/expenses", icon: Receipt, label: "Account Adjustments" },
  { to: "/debts", icon: Landmark, label: "Debts" },
  null,
  { to: "/upi", icon: Wallet, label: "UPI Transactions" },
  { to: "/namemap", icon: BookText, label: "Mapping Configs" },
  null,
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="w-60 flex-shrink-0 flex flex-col h-full bg-card border-r border-border">
      {/* Logo */}
      <div
        className="px-5 py-4 border-b border-border flex items-center justify-between"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
      >
        <div>
          <img src="/brand/logo-nav.svg" alt="gg fin" className="h-10 w-auto" />
          <p className="text-xs text-muted-foreground mt-1 pl-0.5">Lending Dashboard</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 overflow-y-auto">
        {nav.map((item, i) =>
          item === null ? (
            <div key={`sep-${i}`} className="h-px bg-border/50 mx-1 my-2" />
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <div
        className="px-4 py-4 border-t border-border"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <p className="text-xs text-muted-foreground text-center">v1.0.0</p>
      </div>
    </aside>
  );
}
