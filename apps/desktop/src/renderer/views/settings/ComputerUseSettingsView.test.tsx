// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComputerUseSettingsView } from "./ComputerUseSettingsView";

const mocked = vi.hoisted(() => ({
  permissions: vi.fn(),
  openPermissionSettings: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDaemonClient: async () => ({
    computer: {
      permissions: mocked.permissions,
      openPermissionSettings: mocked.openPermissionSettings,
    },
  }),
}));

describe("ComputerUseSettingsView", () => {
  beforeEach(() => {
    mocked.permissions.mockReset();
    mocked.openPermissionSettings.mockReset();
    mocked.permissions.mockResolvedValue({
      accessibility: "granted",
      screenRecording: "denied",
      inputMonitoring: "unknown",
      automation: "notRequired",
      camera: "notRequested",
      fullDiskAccess: "checkManually",
      localNetwork: "checkManually",
      usbDevices: "entitled",
      bluetooth: "entitled",
    });
    mocked.openPermissionSettings.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads and renders capability status rows", async () => {
    render(<ComputerUseSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("settings.computerUse.title")).toBeTruthy();
    });

    expect(screen.getByText("settings.computerUse.permissions.screenRecording")).toBeTruthy();
    expect(screen.getAllByText("settings.computerUse.status.denied").length).toBeGreaterThan(0);
  });

  it("opens macOS permission settings", async () => {
    render(<ComputerUseSettingsView />);

    const button = await screen.findByRole("button", {
      name: "settings.computerUse.permissions.openScreenRecordingButton",
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mocked.openPermissionSettings).toHaveBeenCalled();
    });
  });
});
