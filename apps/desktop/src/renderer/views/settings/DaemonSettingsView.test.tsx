// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaemonSettingsView } from "./DaemonSettingsView";

const mocked = vi.hoisted(() => ({
  getDaemonInfo: vi.fn(),
  getDaemonQuitOnExit: vi.fn(),
  getDesktopCliInstallStatus: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDesktopHostBridge: () => ({
    getDaemonInfo: mocked.getDaemonInfo,
    getDaemonQuitOnExit: mocked.getDaemonQuitOnExit,
    getDesktopCliInstallStatus: mocked.getDesktopCliInstallStatus,
    installDesktopCli: vi.fn(),
    setDaemonQuitOnExit: vi.fn(async () => ({ ok: true })),
    restartDaemon: vi.fn(),
  }),
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

describe("DaemonSettingsView", () => {
  beforeEach(() => {
    mocked.getDaemonInfo.mockReset();
    mocked.getDaemonQuitOnExit.mockReset();
    mocked.getDesktopCliInstallStatus.mockReset();
    mocked.getDaemonQuitOnExit.mockResolvedValue(false);
    mocked.getDesktopCliInstallStatus.mockResolvedValue({
      isAvailableInPath: false,
      isManagedInstall: false,
      installPath: "/Users/test/.local/bin/yishan",
      bundledCliPath: "/Applications/Yishan.app/Contents/Resources/yishan",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads and renders daemon connection details", async () => {
    mocked.getDaemonInfo.mockResolvedValue({
      version: "0.2.0",
      daemonId: "daemon-123",
      wsUrl: "ws://127.0.0.1:4242/ws",
    });

    render(<DaemonSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("0.2.0")).toBeTruthy();
    });

    expect(screen.getByText("settings.daemon.status.running")).toBeTruthy();
    expect(screen.getByText("daemon-123")).toBeTruthy();
    expect(screen.getByText("ws://127.0.0.1:4242/ws")).toBeTruthy();
  });

  it("shows an error state when daemon info cannot be loaded", async () => {
    mocked.getDaemonInfo.mockRejectedValue(new Error("daemon unavailable"));

    render(<DaemonSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("settings.daemon.loadError")).toBeTruthy();
    });

    expect(screen.getByText("settings.daemon.status.unavailable")).toBeTruthy();
  });

  it("refreshes daemon details on demand", async () => {
    mocked.getDaemonInfo
      .mockResolvedValueOnce({ version: "0.1.0", daemonId: "daemon-1", wsUrl: "ws://old/ws" })
      .mockResolvedValueOnce({ version: "0.2.0", daemonId: "daemon-2", wsUrl: "ws://new/ws" });

    render(<DaemonSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("0.1.0")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "settings.daemon.actions.refresh" }));

    await waitFor(() => {
      expect(screen.getByText("0.2.0")).toBeTruthy();
    });
    expect(screen.getByText("daemon-2")).toBeTruthy();
  });
});
