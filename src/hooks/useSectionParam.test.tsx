import { describe, expect, it } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useSectionParam } from "./useSectionParam";

const SECTIONS = [{ id: "a" }, { id: "b" }, { id: "c" }] as const;

const wrap = (at: string) => ({ children }: { children: React.ReactNode }) => <MemoryRouter initialEntries={[at]}>{children}</MemoryRouter>;

describe("useSectionParam — the section lives in the URL (SM-04)", () => {
  it("no ?section= means the first section", () => {
    const { result } = renderHook(() => useSectionParam(SECTIONS), { wrapper: wrap("/page") });
    expect(result.current[0]).toBe("a");
  });

  it("a known section in the URL is the current one", () => {
    const { result } = renderHook(() => useSectionParam(SECTIONS), { wrapper: wrap("/page?section=c") });
    expect(result.current[0]).toBe("c");
  });

  it("an unknown value falls back to the first section", () => {
    const { result } = renderHook(() => useSectionParam(SECTIONS), { wrapper: wrap("/page?section=zzz") });
    expect(result.current[0]).toBe("a");
  });

  it("choosing a section writes it to the URL, keeps the other parameters, and the hook follows", () => {
    function Probe() {
      const [section, setSection] = useSectionParam(SECTIONS);
      const { search } = useLocation();
      return <><span data-testid="s">{section}</span><span data-testid="q">{search}</span><button onClick={() => setSection("b")}>go</button></>;
    }
    render(<MemoryRouter initialEntries={["/page?keep=1"]}><Probe /></MemoryRouter>);
    expect(screen.getByTestId("s")).toHaveTextContent("a");
    act(() => screen.getByText("go").click());
    expect(screen.getByTestId("s")).toHaveTextContent("b");
    expect(new URLSearchParams(screen.getByTestId("q").textContent ?? "").get("section")).toBe("b");
    expect(new URLSearchParams(screen.getByTestId("q").textContent ?? "").get("keep")).toBe("1");
  });

  it("two readers of the same URL always agree (the menu and the page)", () => {
    function Reader({ id }: { id: string }) {
      const [section] = useSectionParam(SECTIONS);
      return <span data-testid={id}>{section}</span>;
    }
    render(<MemoryRouter initialEntries={["/page?section=b"]}><Reader id="menu" /><Reader id="page" /></MemoryRouter>);
    expect(screen.getByTestId("menu")).toHaveTextContent("b");
    expect(screen.getByTestId("page")).toHaveTextContent("b");
  });
});
