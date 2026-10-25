/** Branding: the app is called TickBook everywhere a person sees a name. BR-01 ... BR-03. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BrandMark, BRAND_NAME } from "./BrandMark";
import Sidebar from "./layout/Sidebar";

describe("branding", () => {
  it("the mark is an inline svg tile, hidden from screen readers (BR-01)", () => {
    render(<BrandMark className="w-7 h-7 rounded-lg" />);
    const tile = screen.getByTestId("brand-mark");
    expect(tile.className).toMatch(/w-7/);
    expect(tile.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(BRAND_NAME).toBe("TickBook");
  });

  it("the menu header says TickBook, not gg fin (BR-02)", () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(screen.getByText("TickBook")).toBeInTheDocument();
    expect(screen.queryByText("gg fin")).toBeNull();
    expect(screen.getByTestId("brand-mark")).toBeInTheDocument();
  });

  it("the page title, share card and every brand file say TickBook (BR-03)", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf-8");
    expect(html).toContain("<title>TickBook</title>");
    expect(html).not.toMatch(/gg fin/i);
    const dir = join(process.cwd(), "public", "brand");
    for (const f of readdirSync(dir)) {
      const svg = readFileSync(join(dir, f), "utf-8");
      expect(svg, f).toContain("TickBook");
      expect(svg, f).not.toMatch(/gg fin/i);
    }
  });
});
