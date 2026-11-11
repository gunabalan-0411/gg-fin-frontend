/** Settings > TV: pair a TV by typing the code it shows, see the paired TVs, remove one. STV-01 ... STV-10. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/services/api", () => ({ tvAdminApi: { approve: vi.fn(), devices: vi.fn(), revoke: vi.fn() } }));

import { tvAdminApi } from "@/services/api";
import TvSection from "./TvSection";
import { SETTINGS_SECTIONS } from "@/components/layout/navConfig";

type Fn = ReturnType<typeof vi.fn>;
const api = tvAdminApi as unknown as Record<"approve" | "devices" | "revoke", Fn>;
const showToast = vi.fn();
const ago = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  showToast.mockReset();
  api.devices.mockResolvedValue({ data: [] });
});

describe("Settings > TV", () => {
  it("STV-01 it is a section of Settings, between Inference and Security", () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids).toContain("tv");
    expect(ids.indexOf("tv")).toBeGreaterThan(ids.indexOf("device"));
    expect(ids.indexOf("tv")).toBeLessThan(ids.indexOf("security"));
  });

  it("STV-02 no TV paired yet says so", async () => {
    render(<TvSection showToast={showToast} />);
    expect(await screen.findByTestId("tv-none")).toBeInTheDocument();
  });

  it("STV-03 Pair is only possible with a full 6-digit code (spaces and a dash are fine)", async () => {
    render(<TvSection showToast={showToast} />);
    await screen.findByTestId("tv-none");
    const pair = screen.getByRole("button", { name: "Pair this TV" });
    expect(pair).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Code on the TV"), { target: { value: "12345" } });
    expect(pair).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Code on the TV"), { target: { value: "123 456" } });
    expect(pair).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Code on the TV"), { target: { value: "123-456" } });
    expect(pair).toBeEnabled();
  });

  it("STV-04 pairing sends the digits and the name, tells the person, clears the box and reloads the list", async () => {
    api.approve.mockResolvedValue({ data: { ok: true, name: "Hall TV" } });
    render(<TvSection showToast={showToast} />);
    await screen.findByTestId("tv-none");
    fireEvent.change(screen.getByLabelText("Code on the TV"), { target: { value: "483 915" } });
    fireEvent.change(screen.getByLabelText("Name this TV"), { target: { value: "Hall TV" } });
    api.devices.mockResolvedValue({ data: [{ id: 1, name: "Hall TV", created_at: ago(0), last_seen_at: null }] });
    fireEvent.click(screen.getByRole("button", { name: "Pair this TV" }));
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith("483915", "Hall TV"));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Hall TV is paired"), "success"));
    expect(screen.getByLabelText("Code on the TV")).toHaveValue("");
    expect(await screen.findByTestId("tv-device")).toHaveTextContent("Hall TV");
  });

  it("STV-05 a wrong or expired code shows the reason from the server and keeps what was typed", async () => {
    api.approve.mockRejectedValue({ response: { data: { detail: "That code was not found, has expired, or was already used" } } });
    render(<TvSection showToast={showToast} />);
    await screen.findByTestId("tv-none");
    fireEvent.change(screen.getByLabelText("Code on the TV"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Pair this TV" }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("That code was not found, has expired, or was already used", "error"));
    expect(screen.getByLabelText("Code on the TV")).toHaveValue("000000");
  });

  it("STV-06 Enter in the code box pairs too", async () => {
    api.approve.mockResolvedValue({ data: { ok: true, name: "TV" } });
    render(<TvSection showToast={showToast} />);
    await screen.findByTestId("tv-none");
    const box = screen.getByLabelText("Code on the TV");
    fireEvent.change(box, { target: { value: "111222" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith("111222", "Living room TV"));
  });

  it("STV-07 each paired TV shows its name, when it was paired and when it was last used", async () => {
    api.devices.mockResolvedValue({ data: [
      { id: 1, name: "Living room TV", created_at: ago(60 * 24 * 3), last_seen_at: ago(5) },
      { id: 2, name: "Bedroom TV", created_at: ago(1), last_seen_at: null },
    ] });
    render(<TvSection showToast={showToast} />);
    const rows = await screen.findAllByTestId("tv-device");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Living room TV");
    expect(rows[0]).toHaveTextContent("Last used 5 min ago");
    expect(rows[1]).toHaveTextContent("Last used never");
  });

  it("STV-08 Remove asks first; No keeps the TV", async () => {
    api.devices.mockResolvedValue({ data: [{ id: 7, name: "Hall TV", created_at: ago(10), last_seen_at: null }] });
    render(<TvSection showToast={showToast} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Hall TV" }));
    expect(screen.getByText(/Remove this TV\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(api.revoke).not.toHaveBeenCalled();
    expect(screen.queryByText(/Remove this TV\?/)).not.toBeInTheDocument();
  });

  it("STV-09 Yes removes it and the list reloads", async () => {
    api.revoke.mockResolvedValue({});
    api.devices.mockResolvedValueOnce({ data: [{ id: 7, name: "Hall TV", created_at: ago(10), last_seen_at: null }] }).mockResolvedValue({ data: [] });
    render(<TvSection showToast={showToast} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Hall TV" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith(7));
    expect(await screen.findByTestId("tv-none")).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("TV removed"), "success");
  });

  it("STV-10 a failed removal shows the reason and keeps the TV listed", async () => {
    api.revoke.mockRejectedValue({ response: { data: { detail: "TV not found" } } });
    api.devices.mockResolvedValue({ data: [{ id: 7, name: "Hall TV", created_at: ago(10), last_seen_at: null }] });
    render(<TvSection showToast={showToast} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Hall TV" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("TV not found", "error"));
    expect(within(screen.getByTestId("tv-device")).getByText("Hall TV")).toBeInTheDocument();
  });
});
