import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/utils";
import { useConnection } from "@/hooks/useConnectionStatus";
import { NAV_GROUPS, SETTINGS_ITEM, sectionHref, selectedSection, type NavItem } from "./navConfig";
import { BrandMark } from "@/components/BrandMark";

type SectionDots = Record<string, string | null>;   // section id -> why it has a dot (e.g. "Gmail is not connected")

/**
 * One menu row: icon, name. Collapsed: icon only, the tooltip is the name.
 * A page with sections of its own (Account Adjustments, Settings) gets a chevron and a BRANCH under the row — the page has no
 * navigation bar of its own. The branch of the page you are on is open; the chevron opens / closes any branch.
 */
function MenuItem({
  item, collapsed, onClose, dotTitle, sectionDots,
}: { item: NavItem; collapsed?: boolean; onClose?: () => void; dotTitle?: string | null; sectionDots?: SectionDots }) {
  const { pathname, search } = useLocation();
  const onPage = pathname === item.to;
  const [manual, setManual] = useState<boolean | null>(null);       // null = follow "am I on this page"
  const sections = item.sections ?? [];
  const hasBranch = sections.length > 0 && !collapsed;
  const open = hasBranch && (manual ?? onPage);
  const current = sections.length ? selectedSection(sections, search) : null;
  const slug = item.to.slice(1);

  return (
    <div>
      <div className="relative">
        <NavLink
          to={item.to}
          onClick={onClose}
          title={collapsed ? (dotTitle ? `${item.label} (${dotTitle})` : item.label) : undefined}
          data-testid={`nav-${slug}`}
          className={({ isActive }) =>
            cn(
              "relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-100",
              collapsed ? "justify-center px-2 py-2.5" : "px-2.5 py-1.5",
              hasBranch && "pr-9",
              // with its branch open, the highlighted row is the section inside it, not the page title
              isActive && !open
                ? "bg-card text-foreground shadow-sm"
                : isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )
          }
        >
          <item.icon className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
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

        {hasBranch && (
          <button
            type="button"
            data-testid={`branch-toggle-${slug}`}
            aria-label={`${open ? "Hide" : "Show"} ${item.label} sections`}
            aria-expanded={open}
            aria-controls={`branch-${slug}`}
            onClick={() => setManual(!open)}
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>

      {open && (
        <div
          id={`branch-${slug}`}
          role="group"
          aria-label={`${item.label} sections`}
          data-testid={`branch-${slug}`}
          className="ml-[1.15rem] mt-0.5 space-y-0.5 border-l border-border pl-2"
        >
          {sections.map((s) => {
            const active = onPage && current === s.id;
            const dot = sectionDots?.[s.id];
            return (
              <Link
                key={s.id}
                to={sectionHref(item, s.id)}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                data-testid={`section-${slug}-${s.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-[12.5px] font-medium transition-colors",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <s.icon className="h-3 w-3 flex-shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {dot && (
                  <span role="img" aria-label={dot} title={dot} data-testid="section-dot" className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
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
  // A dot on Settings (and on the section that needs it) while Gmail or Google Drive is explicitly NOT connected
  // (unknown / still loading = no dot)
  const drive = useConnection("drive");
  const gmail = useConnection("gmail");
  const missing = [drive.connected === false && "Google Drive", gmail.connected === false && "Gmail"].filter(Boolean) as string[];
  const settingsDot = missing.length ? `Not connected: ${missing.join(" and ")}` : null;
  const settingsSectionDots: SectionDots = {
    upi: gmail.connected === false ? "Gmail is not connected" : null,
    drive: drive.connected === false ? "Google Drive is not connected" : null,
  };

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
          <BrandMark className="w-7 h-7 rounded-lg" />
          {!collapsed && (
            <div>
              <p className="text-[13.5px] font-semibold text-foreground tracking-tight leading-none">TickBook</p>
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
            className={cn("space-y-0.5", i > 0 && (collapsed ? "mt-2.5 border-t border-border/60 pt-2.5" : "mt-3.5"))}
          >
            {group.heading && !collapsed && (
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground/60">
                {group.heading}
                {group.note && <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/50">· {group.note}</span>}
              </p>
            )}
            {group.items.map((item) => (
              <MenuItem key={item.to} item={item} collapsed={collapsed} onClose={onClose} />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings: pinned below the groups so it is always reachable; its branch opens under the row and this area scrolls if it is tall */}
      <div className="border-t border-border px-2 py-2 max-h-[45%] overflow-y-auto">
        <MenuItem item={SETTINGS_ITEM} collapsed={collapsed} onClose={onClose} dotTitle={settingsDot} sectionDots={settingsSectionDots} />
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
