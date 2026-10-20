/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import appSource from "@/App.tsx?raw";             // the routes the app really has, read from its source

vi.mock("@/services/api", () => ({
  driveApi: { status: vi.fn() },
  upiApi: { gmailStatus: vi.fn() },
}));

import { driveApi, upiApi } from "@/services/api";
import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import { ACCOUNT_SECTIONS, ALL_NAV_ITEMS, NAV_GROUPS, SETTINGS_SECTIONS, sectionHref, selectedSection } from "./navConfig";

const drive = driveApi.status as unknown as ReturnType<typeof vi.fn>;
const gmail = upiApi.gmailStatus as unknown as ReturnType<typeof vi.fn>;
const status = (connected: boolean) => ({ data: { connected, email: connected ? "a@b.c" : null } });

function renderMenu(props: Partial<React.ComponentProps<typeof Sidebar>> = {}, at = "/dashboard") {
  return render(<MemoryRouter initialEntries={[at]}><Sidebar {...props} /></MemoryRouter>);
}

const groupEl = (id: string) => screen.getByTestId(`nav-group-${id}`);
const mainLinks = () => ALL_NAV_ITEMS.map((i) => screen.getByTestId(`nav-${i.to.slice(1)}`));
const labelOf = (a: HTMLElement) => a.querySelector("span.truncate")?.textContent ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  resetConnectionStatus();
  drive.mockResolvedValue(status(true));
  gmail.mockResolvedValue(status(true));
});

describe("left menu — groups and order (MN-01)", () => {
  it("Dashboard, View & manage, Daily work, Mappings, Advanced — in that order, then Settings pinned below", () => {
    renderMenu();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    const ids = within(nav).getAllByRole("group").map((g) => g.getAttribute("data-testid"));
    expect(ids).toEqual(["nav-group-home", "nav-group-manage", "nav-group-daily", "nav-group-mappings", "nav-group-advanced"]);
    const headings = within(nav).getAllByRole("group").map((g) => g.querySelector("p")?.textContent ?? null);
    expect(headings).toEqual([null, "View & manage", "Daily work· in this order", "Mappings", "Advanced"]);
  });

  it("each group holds the right pages in the right order", () => {
    renderMenu();
    const hrefs = (id: string) => within(groupEl(id)).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs("home")).toEqual(["/dashboard"]);
    expect(hrefs("manage")).toEqual(["/customers", "/expenses", "/debts"]);
    expect(hrefs("daily")).toEqual(["/daily-print", "/ocr", "/voice", "/transactions", "/notepad"]);
    expect(hrefs("mappings")).toEqual(["/upi", "/namemap"]);
    expect(hrefs("advanced")).toEqual(["/sql"]);
  });

  it("the visible names (Collections once, Mapping Configs shown as Customer Groupings)", () => {
    renderMenu();
    expect(mainLinks().map(labelOf)).toEqual([
      "Dashboard", "Customers", "Account Adjustments", "Capital", "Daily Print", "OCR Entry", "Voice Entry", "Collections", "Note Pad",
      "UPI Transactions", "Customer Groupings", "SQL Console", "Settings",
    ]);
    expect(screen.getAllByText("Collections")).toHaveLength(1);
    expect(screen.queryByText("Mapping Configs")).toBeNull();
  });
});

describe("no sub-text under the menu items (SM-01)", () => {
  it("a row holds only its name — no hint line, no number", () => {
    renderMenu();
    for (const item of ALL_NAV_ITEMS) {
      const link = screen.getByTestId(`nav-${item.to.slice(1)}`);
      expect(link.textContent).toBe(item.label);
      expect(link.querySelector("span.leading-snug")).toBeNull();
    }
    for (const old of ["Print today's collection sheet", "Match UPI payments to customers", "Name spellings, segments, UPI ids", "Run queries (admin only)"]) {
      expect(screen.queryByText(old)).toBeNull();
    }
  });

  it("the menu config has no hint field any more", () => {
    for (const item of ALL_NAV_ITEMS) expect(item).not.toHaveProperty("hint");
  });
});

describe("every page exactly once, URLs unchanged (MN-02)", () => {
  it("lists each page once", () => {
    const paths = ALL_NAV_ITEMS.map((i) => i.to);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(13);
  });

  it("covers exactly the pages the app routes to — none missing, none extra", () => {
    const layoutBlock = appSource.slice(appSource.indexOf('<Route index element'), appSource.indexOf("</Route>", appSource.indexOf('<Route index element')));
    const routed = [...layoutBlock.matchAll(/<Route path="([a-z-]+)"/g)].map((m) => `/${m[1]}`).sort();
    expect(routed.length).toBeGreaterThan(10);
    expect(ALL_NAV_ITEMS.map((i) => i.to).sort()).toEqual(routed);
  });

  it("the URLs are the same ones as before", () => {
    expect(ALL_NAV_ITEMS.map((i) => i.to).sort()).toEqual([
      "/customers", "/dashboard", "/daily-print", "/debts", "/expenses", "/namemap", "/notepad", "/ocr", "/settings", "/sql", "/transactions", "/upi", "/voice",
    ].sort());
  });
});

describe("daily work order, no step numbers (MN-03)", () => {
  it("lists the daily routine in order and shows no number chips anywhere", () => {
    renderMenu();
    expect([...within(groupEl("daily")).getAllByRole("link")].map(labelOf)).toEqual(["Daily Print", "OCR Entry", "Voice Entry", "Collections", "Note Pad"]);
    expect(screen.queryAllByTestId("nav-step")).toHaveLength(0);
    for (const item of ALL_NAV_ITEMS) expect(item).not.toHaveProperty("step");
  });

  it("the page you are on is marked as current", () => {
    renderMenu({}, "/ocr");
    expect(screen.getByTestId("nav-ocr")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-voice")).not.toHaveAttribute("aria-current");
  });
});

describe("Settings is pinned at the bottom (MN-01)", () => {
  it("it is outside the grouped menu, below it", () => {
    renderMenu();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    expect(within(nav).queryByText("Settings")).toBeNull();
    const settings = screen.getByTestId("nav-settings");
    expect(settings).toHaveAttribute("href", "/settings");
    expect(nav.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ── sections branch out of the main item (SM-02 … SM-05) ──────────────────────

describe("sections as a branch under the main item (SM-02, SM-04)", () => {
  it("only Account Adjustments and Settings have sections", () => {
    expect(ALL_NAV_ITEMS.filter((i) => i.sections).map((i) => i.to)).toEqual(["/expenses", "/settings"]);
    expect(ACCOUNT_SECTIONS.map((s) => s.label)).toEqual(["Add Expense", "Unclaimed Amount", "Defaulted Amount"]);
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual(["Local Backup", "UPI Import", "Google Drive", "Inference", "Security"]);
  });

  it("the branch of the page you are on is open: its sections, indented under it, linking to ?section=…", () => {
    renderMenu({}, "/expenses");
    const branch = screen.getByTestId("branch-expenses");
    expect(within(branch).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Add Expense", "/expenses?section=expenses"],
      ["Unclaimed Amount", "/expenses?section=unclaimed"],
      ["Defaulted Amount", "/expenses?section=defaulted"],
    ]);
    expect(branch.className).toMatch(/border-l/);                                        // the guide line that ties it to its parent
    expect(screen.getByRole("group", { name: "Account Adjustments sections" })).toBe(branch);
    expect(screen.queryByTestId("branch-settings")).toBeNull();                          // other branches stay closed
  });

  it("with no ?section= the first section is the current one", () => {
    renderMenu({}, "/expenses");
    expect(screen.getByTestId("section-expenses-expenses")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("section-expenses-unclaimed")).not.toHaveAttribute("aria-current");
  });

  it("the URL picks the current section — and an unknown one falls back to the first", () => {
    const first = renderMenu({}, "/expenses?section=unclaimed");
    expect(screen.getByTestId("section-expenses-unclaimed")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("section-expenses-expenses")).not.toHaveAttribute("aria-current");
    first.unmount();
    renderMenu({}, "/expenses?section=nonsense");
    expect(screen.getByTestId("section-expenses-expenses")).toHaveAttribute("aria-current", "page");
  });

  it("Settings branches the same way (it is pinned, below the groups)", () => {
    renderMenu({}, "/settings?section=drive");
    const branch = screen.getByTestId("branch-settings");
    expect(within(branch).getAllByRole("link").map((a) => a.textContent)).toEqual(["Local Backup", "UPI Import", "Google Drive", "Inference", "Security"]);
    expect(screen.getByTestId("section-settings-drive")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("section-settings-drive")).toHaveAttribute("href", "/settings?section=drive");
  });

  it("a section is only 'current' on its own page", () => {
    renderMenu({}, "/dashboard");
    expect(screen.queryByTestId("branch-expenses")).toBeNull();
    expect(screen.queryByTestId("branch-settings")).toBeNull();
    expect(document.querySelector('[aria-current="page"]')).toBe(screen.getByTestId("nav-dashboard"));
  });
});

describe("opening and closing a branch (SM-05)", () => {
  it("other pages have a chevron that opens their branch, and closes it again", async () => {
    const user = userEvent.setup();
    renderMenu({}, "/dashboard");
    const toggle = screen.getByTestId("branch-toggle-expenses");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("Show Account Adjustments sections");
    await user.click(toggle);
    expect(screen.getByTestId("branch-expenses")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Hide Account Adjustments sections");
    await user.click(toggle);
    expect(screen.queryByTestId("branch-expenses")).toBeNull();
  });

  it("you can close the branch of the page you are on, and it stays closed", async () => {
    const user = userEvent.setup();
    renderMenu({}, "/expenses");
    await user.click(screen.getByTestId("branch-toggle-expenses"));
    expect(screen.queryByTestId("branch-expenses")).toBeNull();
    expect(screen.getByTestId("nav-expenses").className).toMatch(/bg-card/);            // the page row itself is highlighted again
  });

  it("with the branch open, the highlighted row is the section inside it — not the page title", () => {
    renderMenu({}, "/expenses?section=defaulted");
    expect(screen.getByTestId("nav-expenses").className).not.toMatch(/bg-card/);
    expect(screen.getByTestId("section-expenses-defaulted").className).toMatch(/bg-card/);
    expect(screen.getByTestId("section-expenses-expenses").className).not.toMatch(/bg-card/);
  });

  it("items without sections have no chevron", () => {
    renderMenu({}, "/dashboard");
    expect(screen.getAllByRole("button", { name: /sections$/ })).toHaveLength(2);          // Account Adjustments + Settings only
  });

  it("choosing a section closes the drawer on a phone", async () => {
    const onClose = vi.fn();
    renderMenu({ onClose }, "/expenses");
    await userEvent.setup().click(screen.getByTestId("section-expenses-unclaimed"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("collapsed menu (MN-03)", () => {
  it("shows icons only: no headings, no sections, no chevrons, and the tooltip is the name", () => {
    renderMenu({ collapsed: true }, "/expenses");
    expect(screen.queryByText("View & manage")).toBeNull();
    expect(screen.queryByText("Daily work")).toBeNull();
    expect(screen.queryAllByTestId("nav-step")).toHaveLength(0);
    expect(screen.queryByTestId("branch-expenses")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /sections$/ })).toHaveLength(0);
    expect(screen.getByTestId("nav-daily-print")).toHaveAttribute("title", "Daily Print");
    expect(screen.getByTestId("nav-namemap")).toHaveAttribute("title", "Customer Groupings");
    for (const item of ALL_NAV_ITEMS) expect(screen.getByTestId(`nav-${item.to.slice(1)}`)).toHaveAttribute("title", item.label);
  });

  it("keeps a divider between the groups", () => {
    renderMenu({ collapsed: true });
    expect(groupEl("manage").className).toMatch(/border-t/);
    expect(groupEl("home").className).not.toMatch(/border-t/);
  });
});

describe("the dot on Settings (MN-04) and on its sections (SM-06)", () => {
  it("is shown while Google Drive is not connected, naming it", async () => {
    drive.mockResolvedValue(status(false));
    renderMenu();
    expect(await screen.findByTestId("settings-dot")).toHaveAttribute("aria-label", "Not connected: Google Drive");
  });

  it("names both when both are missing, and Gmail alone when only Gmail is", async () => {
    drive.mockResolvedValue(status(false));
    gmail.mockResolvedValue(status(false));
    const both = renderMenu();
    expect(await screen.findByLabelText("Not connected: Google Drive and Gmail")).toBeInTheDocument();
    both.unmount();

    resetConnectionStatus();
    drive.mockResolvedValue(status(true));
    renderMenu();
    expect(await screen.findByLabelText("Not connected: Gmail")).toBeInTheDocument();
  });

  it("is not shown when both are connected, nor while the status is unknown or failed", async () => {
    renderMenu();
    await waitFor(() => expect(drive).toHaveBeenCalled());
    await waitFor(() => expect(gmail).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("settings-dot")).toBeNull();
  });

  it("a failed status request is 'unknown', not 'not connected'", async () => {
    drive.mockRejectedValue(new Error("network"));
    gmail.mockRejectedValue(new Error("network"));
    renderMenu();
    await waitFor(() => expect(drive).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("settings-dot")).toBeNull();
  });

  it("also shows when the menu is collapsed, and the tooltip says what is missing", async () => {
    drive.mockResolvedValue(status(false));
    renderMenu({ collapsed: true });
    expect(await screen.findByTestId("settings-dot")).toBeInTheDocument();
    expect(screen.getByTestId("nav-settings").getAttribute("title")).toContain("Not connected: Google Drive");
  });

  it("the Settings branch keeps the old left list's status dots: Google Drive and UPI Import, nothing else", async () => {
    drive.mockResolvedValue(status(false));
    gmail.mockResolvedValue(status(false));
    renderMenu({}, "/settings");
    await waitFor(() => expect(screen.getAllByTestId("section-dot")).toHaveLength(2));
    const dotted = (id: string) => within(screen.getByTestId(`section-settings-${id}`)).queryByTestId("section-dot");
    expect(dotted("drive")).toHaveAttribute("aria-label", "Google Drive is not connected");
    expect(dotted("upi")).toHaveAttribute("aria-label", "Gmail is not connected");
    for (const id of ["local", "device", "security"]) expect(dotted(id)).toBeNull();
  });

  it("only the missing one gets a section dot", async () => {
    gmail.mockResolvedValue(status(false));
    renderMenu({}, "/settings");
    await waitFor(() => expect(screen.getAllByTestId("section-dot")).toHaveLength(1));
    expect(within(screen.getByTestId("section-settings-upi")).getByTestId("section-dot")).toBeInTheDocument();
  });
});

describe("mobile drawer and bottom bar (MN-07)", () => {
  it("the drawer is the same menu and closes when a page is chosen", async () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId("nav-customers"));
    expect(onClose).toHaveBeenCalled();
    expect(mainLinks()).toHaveLength(13);
  });

  it("the bottom icon bar is unchanged", () => {
    render(<MemoryRouter><MobileNav /></MemoryRouter>);
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Home", "/dashboard"], ["Customers", "/customers"], ["Voice", "/voice"], ["Collections", "/transactions"], ["Accounts", "/expenses"],
    ]);
  });
});

describe("navConfig", () => {
  it("only Daily work carries a note", () => {
    expect(NAV_GROUPS.filter((g) => g.note).map((g) => g.id)).toEqual(["daily"]);
  });

  it("sectionHref and selectedSection agree", () => {
    expect(sectionHref({ to: "/expenses" }, "unclaimed")).toBe("/expenses?section=unclaimed");
    expect(selectedSection(ACCOUNT_SECTIONS, "?section=defaulted")).toBe("defaulted");
    expect(selectedSection(ACCOUNT_SECTIONS, "")).toBe("expenses");
    expect(selectedSection(ACCOUNT_SECTIONS, "?section=drive")).toBe("expenses");          // a Settings id means nothing here
    expect(selectedSection(SETTINGS_SECTIONS, "?other=1&section=security")).toBe("security");
  });
});
