import { NavLink } from "react-router-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils";
import { useConnection } from "@/hooks/useConnectionStatus";
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from "./navConfig";

/** One menu row: icon, name, (step number), and a one-line hint. Collapsed: icon only, the tooltip is "Name — hint". */
function MenuLink({
  item, collapsed, onClose, dotTitle,
}: { item: NavItem; collapsed?: boolean; onClose?: () => void; dotTitle?: string | null }) {
  return (
    <NavLink
      to={item.to}
      onClick={onClose}
      title={collapsed ? `${item.label} — ${item.hint}${dotTitle ? ` (${dotTitle})` : ""}` : undefined}
      data-testid={`nav-${item.to.slice(1)}`}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-100",
          collapsed ? "justify-center px-2 py-2.5" : "px-2.5 py-1",
          isActive
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      <item.icon className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
      {!collapsed && (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 truncate leading-tight">
              {item.label}
              {dotTitle && (
                <span
                  data-testid="settings-dot"
                  role="img"
                  aria-label={dotTitle}
                  title={dotTitle}
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500"
                />
              )}
            </span>
            <span className="truncate text-[10.5px] font-normal leading-snug text-muted-foreground/70">{item.hint}</span>
          </span>
          {item.step != null && (
            <span
              data-testid="nav-step"
              aria-label={`Step ${item.step}`}
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[9px] font-bold text-muted-foreground"
            >
              {item.step}
            </span>
          )}
        </>
      )}
      {collapsed && dotTitle && (
        <span
          data-testid="settings-dot"
          role="img"
          aria-label={dotTitle}
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500"
        />
      )}
    </NavLink>
  );
}

export default function Sidebar({
  onClose,
  collapsed,
  onToggle,
}: {
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  // A dot on Settings while Gmail or Google Drive is explicitly NOT connected (unknown / still loading = no dot)
  const drive = useConnection("drive");
  const gmail = useConnection("gmail");
  const missing = [drive.connected === false && "Google Drive", gmail.connected === false && "Gmail"].filter(Boolean) as string[];
  const settingsDot = missing.length ? `Not connected: ${missing.join(" and ")}` : null;

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

      {/* Nav: groups in the order work is done */}
      <nav aria-label="Main menu" className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV_GROUPS.map((group, i) => (
          <div
            key={group.id}
            role="group"
            aria-label={group.heading ?? "Home"}
            data-testid={`nav-group-${group.id}`}
            className={cn("space-y-0.5", i > 0 && (collapsed ? "mt-2.5 border-t border-border/60 pt-2.5" : "mt-3"))}
          >
            {group.heading && !collapsed && (
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground/60">
                {group.heading}
                {group.note && <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/50">· {group.note}</span>}
              </p>
            )}
            {group.items.map((item) => (
              <MenuLink key={item.to} item={item} collapsed={collapsed} onClose={onClose} />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings: pinned below the groups */}
      <div className="border-t border-border px-2 py-2">
        <MenuLink item={SETTINGS_ITEM} collapsed={collapsed} onClose={onClose} dotTitle={settingsDot} />
      </div>

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
