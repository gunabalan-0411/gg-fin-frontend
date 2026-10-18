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
import { ALL_NAV_ITEMS, NAV_GROUPS } from "./navConfig";

const drive = driveApi.status as unknown as ReturnType<typeof vi.fn>;
const gmail = upiApi.gmailStatus as unknown as ReturnType<typeof vi.fn>;
const status = (connected: boolean) => ({ data: { connected, email: connected ? "a@b.c" : null } });

function renderMenu(props: Partial<React.ComponentProps<typeof Sidebar>> = {}, at = "/dashboard") {
  return render(<MemoryRouter initialEntries={[at]}><Sidebar {...props} /></MemoryRouter>);
}

const groupEl = (id: string) => screen.getByTestId(`nav-group-${id}`);
const linksIn = (el: HTMLElement) => within(el).getAllByRole("link").map((a) => a.getAttribute("href"));

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
    expect(linksIn(groupEl("home"))).toEqual(["/dashboard"]);
    expect(linksIn(groupEl("manage"))).toEqual(["/customers", "/expenses", "/debts"]);
    expect(linksIn(groupEl("daily"))).toEqual(["/daily-print", "/ocr", "/voice", "/transactions"]);
    expect(linksIn(groupEl("mappings"))).toEqual(["/upi", "/namemap"]);
    expect(linksIn(groupEl("advanced"))).toEqual(["/sql"]);
  });

  it("the visible names (Collections once, Mapping Configs shown as Customer Groupings)", () => {
    renderMenu();
    const names = screen.getAllByRole("link").map((a) => a.querySelector("span > span")?.textContent ?? "");
    expect(names).toEqual([
      "Dashboard", "Customers", "Account Adjustments", "Capital", "Daily Print", "OCR Entry", "Voice Entry", "Collections",
      "UPI Transactions", "Customer Groupings", "SQL Console", "Settings",
    ]);
    expect(screen.getAllByText("Collections")).toHaveLength(1);
    expect(screen.queryByText("Mapping Configs")).toBeNull();
  });
});

describe("every page exactly once, URLs unchanged (MN-02)", () => {
  it("lists each page once", () => {
    const paths = ALL_NAV_ITEMS.map((i) => i.to);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(12);
  });

  it("covers exactly the pages the app routes to — none missing, none extra", () => {
    const layoutBlock = appSource.slice(appSource.indexOf('<Route index element'), appSource.indexOf("</Route>", appSource.indexOf('<Route index element')));
    const routed = [...layoutBlock.matchAll(/<Route path="([a-z-]+)"/g)].map((m) => `/${m[1]}`).sort();
    expect(routed.length).toBeGreaterThan(10);
    expect(ALL_NAV_ITEMS.map((i) => i.to).sort()).toEqual(routed);
  });

  it("the URLs are the same ones as before", () => {
    expect(ALL_NAV_ITEMS.map((i) => i.to).sort()).toEqual([
      "/customers", "/dashboard", "/daily-print", "/debts", "/expenses", "/namemap", "/ocr", "/settings", "/sql", "/transactions", "/upi", "/voice",
    ].sort());
  });
});

describe("hints and step numbers (MN-03)", () => {
  it("every item has a one-line hint, shown under its name", () => {
    renderMenu();
    for (const item of ALL_NAV_ITEMS) {
      expect(item.hint.length).toBeGreaterThan(10);
      expect(screen.getByRole("link", { name: new RegExp(item.label) })).toHaveTextContent(item.hint);
    }
  });

  it("the daily routine is numbered 1 – 3, with Voice and OCR sharing step 2", () => {
    renderMenu();
    const steps = within(groupEl("daily")).getAllByRole("link").map((a) => [a.textContent?.includes("Print") ? "print" : a.getAttribute("href"), a.querySelector('[data-testid="nav-step"]')?.textContent]);
    expect(steps).toEqual([["print", "1"], ["/ocr", "2"], ["/voice", "2"], ["/transactions", "3"]]);
    expect(screen.getAllByTestId("nav-step")).toHaveLength(4);                           // no other group is numbered
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

describe("collapsed menu (MN-03)", () => {
  it("shows icons only: no headings, no hints, and the tooltip is 'Name — hint'", () => {
    renderMenu({ collapsed: true });
    expect(screen.queryByText("View & manage")).toBeNull();
    expect(screen.queryByText("Daily work")).toBeNull();
    expect(screen.queryByText("Print today's collection sheet")).toBeNull();
    expect(screen.queryAllByTestId("nav-step")).toHaveLength(0);
    expect(screen.getByTestId("nav-daily-print")).toHaveAttribute("title", "Daily Print — Print today's collection sheet");
    expect(screen.getByTestId("nav-namemap")).toHaveAttribute("title", "Customer Groupings — Name spellings, segments, UPI ids");
    for (const item of ALL_NAV_ITEMS) expect(screen.getByTestId(`nav-${item.to.slice(1)}`).getAttribute("title")).toContain(item.hint);
  });

  it("keeps a divider between the groups", () => {
    renderMenu({ collapsed: true });
    expect(groupEl("manage").className).toMatch(/border-t/);
    expect(groupEl("home").className).not.toMatch(/border-t/);
  });
});

describe("the dot on Settings (MN-04)", () => {
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
});

describe("mobile drawer and bottom bar (MN-07)", () => {
  it("the drawer is the same menu and closes when a page is chosen", async () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId("nav-customers"));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getAllByRole("link")).toHaveLength(12);
  });

  it("the bottom icon bar is unchanged", () => {
    render(<MemoryRouter><MobileNav /></MemoryRouter>);
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Home", "/dashboard"], ["Customers", "/customers"], ["Voice", "/voice"], ["Collections", "/transactions"], ["Accounts", "/expenses"],
    ]);
  });
});

describe("navConfig", () => {
  it("every hint is short enough for one line in the 240 px menu (the real-browser audit cut off longer ones)", () => {
    for (const item of ALL_NAV_ITEMS) expect(item.hint.length, item.label).toBeLessThanOrEqual(item.step != null ? 30 : 33);
  });

  it("only Daily work carries a note and numbers", () => {
    expect(NAV_GROUPS.filter((g) => g.note).map((g) => g.id)).toEqual(["daily"]);
    expect(NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.step != null).map((i) => i.step)).toEqual([1, 2, 2, 3]);
  });
});
