import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/services/api", () => ({
  driveApi: { status: vi.fn() },
  upiApi: { gmailStatus: vi.fn() },
}));

import { driveApi } from "@/services/api";
import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import { TrainingDataToggle } from "./TrainingDataToggle";

const drive = driveApi.status as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  resetConnectionStatus();
});

describe("TrainingDataToggle (TD-05, TD-08)", () => {
  it("is an accessible switch that reports its state", async () => {
    drive.mockResolvedValue({ data: { connected: true, email: "a@b.c" } });
    render(<TrainingDataToggle checked onCheckedChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "Save data for training" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Save data for training")).toBeInTheDocument();
  });

  it("reports the opposite state when clicked or toggled from the keyboard", async () => {
    drive.mockResolvedValue({ data: { connected: true, email: null } });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TrainingDataToggle checked onCheckedChange={onChange} />);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith(false);
    screen.getByRole("switch").focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("an OFF switch reports ON when clicked", async () => {
    drive.mockResolvedValue({ data: { connected: true, email: null } });
    const onChange = vi.fn();
    render(<TrainingDataToggle checked={false} onCheckedChange={onChange} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    await userEvent.setup().click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("warns when Google Drive is not connected — only while the toggle is ON", async () => {
    drive.mockResolvedValue({ data: { connected: false, email: null } });
    const { rerender } = render(<TrainingDataToggle checked onCheckedChange={() => {}} />);
    expect(await screen.findByTestId("training-drive-warning")).toHaveTextContent(/Drive not connected/);
    rerender(<TrainingDataToggle checked={false} onCheckedChange={() => {}} />);
    expect(screen.queryByTestId("training-drive-warning")).toBeNull();
  });

  it("shows no warning when Drive is connected, and none while it is still unknown", async () => {
    drive.mockResolvedValue({ data: { connected: true, email: "a@b.c" } });
    render(<TrainingDataToggle checked onCheckedChange={() => {}} />);
    await waitFor(() => expect(drive).toHaveBeenCalled());
    expect(screen.queryByTestId("training-drive-warning")).toBeNull();
  });

  it("a failed status request is treated as unknown, not as 'not connected'", async () => {
    drive.mockRejectedValue(new Error("network"));
    render(<TrainingDataToggle checked onCheckedChange={() => {}} />);
    await waitFor(() => expect(drive).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("training-drive-warning")).toBeNull();
  });

  it("two toggles on screen share one status request", async () => {
    drive.mockResolvedValue({ data: { connected: true, email: null } });
    render(<><TrainingDataToggle checked onCheckedChange={() => {}} /><TrainingDataToggle checked onCheckedChange={() => {}} /></>);
    await waitFor(() => expect(drive).toHaveBeenCalled());
    expect(drive).toHaveBeenCalledTimes(1);
  });
});
