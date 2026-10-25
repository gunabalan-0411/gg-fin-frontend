/** Personal Finance page: the menu's sections open the right screen. PP-01 ... PP-02. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/pages/ExpensesPage", () => ({ ExpensesSection: ({ scope }: { scope: string }) => <div data-testid="expenses-stub">{scope}</div> }));
vi.mock("@/services/api", () => ({
  personalApi: { records: vi.fn().mockResolvedValue({ data: [] }), createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn() },
}));

import { personalApi } from "@/services/api";
import PersonalFinancePage from "./PersonalFinancePage";

function at(search: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/personal${search}`]}><PersonalFinancePage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});

describe("sections", () => {
  it.each([
    ["", "expenses-stub", null],
    ["?section=expenses", "expenses-stub", null],
    ["?section=savings", "savings-section", "savings"],
    ["?section=lends", "lends-section", "lends"],
    ["?section=gifts", "gifts-section", "gifts"],
  ])("%s opens %s (PP-01)", async (search, testId, kind) => {
    at(search);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.getByTestId("personal-finance")).toHaveAttribute("data-section", search ? search.split("=")[1] : "expenses");
    if (kind) expect(personalApi.records).toHaveBeenCalledWith(kind);
    else expect(personalApi.records).not.toHaveBeenCalled();
  });

  it("only the chosen section is on the screen (PP-02)", async () => {
    at("?section=gifts");
    await screen.findByTestId("gifts-section");
    expect(screen.queryByTestId("savings-section")).toBeNull();
    expect(screen.queryByTestId("lends-section")).toBeNull();
    expect(screen.queryByTestId("expenses-stub")).toBeNull();
  });
});
