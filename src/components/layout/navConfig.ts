// The left menu, in ONE place. Grouped by what the person is doing, in the order they do it, so a newcomer can see where
// to start and what comes next. Page URLs never change here — only grouping, order and labels.
//
// A page that has sections of its own (Account Adjustments, Settings) lists them as `sections`: the menu shows them as a
// branch under the main item and the page reads the chosen one from the URL (`/expenses?section=unclaimed`), so there is
// no second navigation bar inside the page.
import {
  LayoutDashboard, Users, ArrowLeftRight, Receipt, Mic, ScanText, Settings, BookText, Wallet, Landmark, Database, Printer,
  AlertCircle, ShieldAlert, HardDrive, Mail, FolderSync, Cpu, Key, NotebookPen,
  type LucideIcon,
} from "lucide-react";

/** The URL query parameter that carries the chosen section of a page. */
export const SECTION_PARAM = "section";

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
 sections?: readonly NavSection[];   // the page's own sections, shown as a branch under this item (first = default)
}

export interface NavGroup {
  id: string;
  heading?: string;           // the small capitals above the group (none for the Dashboard)
  note?: string;              // after the heading, e.g. "in this order"
  items: NavItem[];
}

export const ACCOUNT_SECTIONS = [
  { id: "expenses", label: "Add Expense", icon: Receipt },
  { id: "unclaimed", label: "Unclaimed Amount", icon: AlertCircle },
  { id: "defaulted", label: "Defaulted Amount", icon: ShieldAlert },
] as const satisfies readonly NavSection[];

export const SETTINGS_SECTIONS = [
  { id: "local", label: "Local Backup", icon: HardDrive },
  { id: "upi", label: "UPI Import", icon: Mail },
  { id: "drive", label: "Google Drive", icon: FolderSync },
  { id: "device", label: "Inference", icon: Cpu },
  { id: "security", label: "Security", icon: Key },
] as const satisfies readonly NavSection[];

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]["id"];
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    id: "manage",
    heading: "View & manage",
    items: [
      { to: "/customers", icon: Users, label: "Customers" },
      { to: "/expenses", icon: Receipt, label: "Account Adjustments", sections: ACCOUNT_SECTIONS },
      { to: "/debts", icon: Landmark, label: "Capital" },
    ],
  },
  {
    id: "daily",
    heading: "Daily work",
    note: "in this order",
    items: [
      { to: "/daily-print", icon: Printer, label: "Daily Print" },
      { to: "/ocr", icon: ScanText, label: "OCR Entry" },
      { to: "/voice", icon: Mic, label: "Voice Entry" },
      { to: "/transactions", icon: ArrowLeftRight, label: "Collections" },
      { to: "/notepad", icon: NotebookPen, label: "Note Pad" },
    ],
  },
  {
    id: "mappings",
    heading: "Mappings",
    items: [
      { to: "/upi", icon: Wallet, label: "UPI Transactions" },
      { to: "/namemap", icon: BookText, label: "Customer Groupings" },
    ],
  },
  {
    id: "advanced",
    heading: "Advanced",
    items: [
      { to: "/sql", icon: Database, label: "SQL Console" },
    ],
  },
];

/** Settings is pinned at the bottom of the menu (below the groups) — it is also where Gmail and Google Drive get connected. */
export const SETTINGS_ITEM: NavItem = {
  to: "/settings", icon: Settings, label: "Settings", sections: SETTINGS_SECTIONS,
};

/** Every page in the menu, once. */
export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

/** `/expenses?section=unclaimed` */
export function sectionHref(item: Pick<NavItem, "to">, sectionId: string): string {
  return `${item.to}?${SECTION_PARAM}=${sectionId}`;
}

/** The section a URL's query string selects for a page: the one named by `?section=` when it exists, else the first (default). */
export function selectedSection<T extends string>(sections: readonly { id: T }[], search: string): T {
  const wanted = new URLSearchParams(search).get(SECTION_PARAM);
  return (sections.find((s) => s.id === wanted) ?? sections[0]).id;
}
