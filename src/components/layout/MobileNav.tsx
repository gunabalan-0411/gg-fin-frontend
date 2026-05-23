import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Mic,
  ArrowLeftRight,
  Receipt,
} from "lucide-react";
import { cn } from "@/utils";

const NAV = [
  { to: "/dashboard",    icon: LayoutDashboard, label: "Home" },
  { to: "/customers",    icon: Users,            label: "Customers" },
  { to: "/voice",        icon: Mic,              label: "Voice" },
  { to: "/transactions", icon: ArrowLeftRight,   label: "Collections" },
  { to: "/expenses",     icon: Receipt,          label: "Accounts" },
];

export default function MobileNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
    >
      <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 px-2 rounded-xl min-w-[52px] transition-all duration-150 active:scale-95",
                isActive ? "text-foreground" : "text-muted-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    "flex items-center justify-center w-9 h-7 rounded-lg transition-all duration-150",
                    isActive ? "bg-primary/25" : ""
                  )}
                >
                  <Icon className="h-[17px] w-[17px]" />
                </div>
                <span className="text-[10px] font-medium leading-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
