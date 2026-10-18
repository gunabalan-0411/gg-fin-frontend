// The left menu, in ONE place. Grouped by what the person is doing, in the order they do it, so a newcomer can see where
// to start and what comes next. Page URLs never change here — only grouping, order, labels and hints.
import {
  LayoutDashboard, Users, ArrowLeftRight, Receipt, Mic, ScanText, Settings, BookText, Wallet, Landmark, Database, Printer,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  hint: string;               // one short line under the name (and the tooltip when the menu is collapsed)
  icon: LucideIcon;
  step?: number;              // position in the daily routine; Voice and OCR share a step (do one or the other)
}

export interface NavGroup {
  id: string;
  heading?: string;           // the small capitals above the group (none for the Dashboard)
  note?: string;              // after the heading, e.g. "in this order"
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", hint: "Numbers, dues and defaulters" },
    ],
  },
  {
    id: "manage",
    heading: "View & manage",
    items: [
      { to: "/customers", icon: Users, label: "Customers", hint: "Add and edit EDI / IOP customers" },
      { to: "/expenses", icon: Receipt, label: "Account Adjustments", hint: "Expenses, unclaimed, defaulted" },
      { to: "/debts", icon: Landmark, label: "Capital", hint: "Borrowings and investors" },
    ],
  },
  {
    id: "daily",
    heading: "Daily work",
    note: "in this order",
    items: [
      { to: "/daily-print", icon: Printer, label: "Daily Print", hint: "Print today's collection sheet", step: 1 },
      { to: "/ocr", icon: ScanText, label: "OCR Entry", hint: "From the sheet, or use Voice", step: 2 },
      { to: "/voice", icon: Mic, label: "Voice Entry", hint: "By speaking, or use OCR", step: 2 },
      { to: "/transactions", icon: ArrowLeftRight, label: "Collections", hint: "Check what was recorded", step: 3 },
    ],
  },
  {
    id: "mappings",
    heading: "Mappings",
    items: [
      { to: "/upi", icon: Wallet, label: "UPI Transactions", hint: "Match UPI payments to customers" },
      { to: "/namemap", icon: BookText, label: "Customer Groupings", hint: "Name spellings, segments, UPI ids" },
    ],
  },
  {
    id: "advanced",
    heading: "Advanced",
    items: [
      { to: "/sql", icon: Database, label: "SQL Console", hint: "Run queries (admin only)" },
    ],
  },
];

/** Settings is pinned at the bottom of the menu (below the groups) — it is also where Gmail and Google Drive get connected. */
export const SETTINGS_ITEM: NavItem = {
  to: "/settings", icon: Settings, label: "Settings", hint: "Gmail & Drive, backups, security",
};

/** Every page in the menu, once. */
export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];
