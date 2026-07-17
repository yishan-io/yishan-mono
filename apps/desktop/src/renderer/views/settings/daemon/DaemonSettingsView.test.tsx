// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaemonSettingsView } from "./DaemonSettingsView";

const mocked = vi.hoisted(() => ({
  closeTerminalTabsForDaemonRestart: vi.fn(),
  getDaemonInfo: vi.fn(),
  getDaemonQuitOnExit: vi.fn(),
  readDaemonLog: vi.fn(),
  restartDaemon: vi.fn(),
  setDaemonQuitOnExit: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("./daemonSettings/closeTerminalTabsForDaemonRestart", () => ({
  closeTerminalTabsForDaemonRestart: mocked.closeTerminalTabsForDaemonRestart,
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  getDesktopHostBridge: () => ({
    getDaemonInfo: mocked.getDaemonInfo,
    getDaemonQuitOnExit: mocked.getDaemonQuitOnExit,
    readDaemonLog: mocked.readDaemonLog,
    restartDaemon: mocked.restartDaemon,
    setDaemonQuitOnExit: mocked.setDaemonQuitOnExit,
  }),
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

describe("DaemonSettingsView", () => {
  beforeEach(() => {
    mocked.closeTerminalTabsForDaemonRestart.mockReset();
    mocked.getDaemonInfo.mockReset();
    mocked.getDaemonQuitOnExit.mockReset();
    mocked.readDaemonLog.mockReset();
    mocked.restartDaemon.mockReset();
    mocked.setDaemonQuitOnExit.mockReset();

    mocked.closeTerminalTabsForDaemonRestart.mockResolvedValue([]);
    mocked.getDaemonQuitOnExit.mockResolvedValue(false);
    mocked.readDaemonLog.mockResolvedValue({ ok: true, content: "" });
    mocked.restartDaemon.mockResolvedValue({
      success: true,
      daemonInfo: { daemonId: "daemon-123", version: "0.2.0", wsUrl: "ws://127.0.0.1:4242/ws" },
    });
    mocked.setDaemonQuitOnExit.mockResolvedValue({ ok: true });
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

  it("renders relay details from loaded daemon info", async () => {
    mocked.getDaemonInfo.mockResolvedValue({
      version: "0.2.0",
      daemonId: "daemon-123",
      wsUrl: "ws://127.0.0.1:4242/ws",
      relay: {
        connected: false,
        connectedAt: "2024-01-02T03:04:05.000Z",
        enabled: true,
        lastError: "relay unavailable",
        url: "wss://relay.example/ws",
      },
    });

    render(<DaemonSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("wss://relay.example/ws")).toBeTruthy();
    });

    expect(screen.getByText("settings.daemon.relay.status.disconnected")).toBeTruthy();
    expect(screen.getByText("relay unavailable")).toBeTruthy();
  });

  it("shows restart success feedback after confirming a restart", async () => {
    mocked.getDaemonInfo.mockResolvedValue({
      version: "0.2.0",
      daemonId: "daemon-123",
      wsUrl: "ws://127.0.0.1:4242/ws",
    });
    mocked.restartDaemon.mockResolvedValue({
      success: true,
      daemonInfo: { daemonId: "daemon-456", version: "0.3.0", wsUrl: "ws://127.0.0.1:4343/ws" },
    });

    render(<DaemonSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("0.2.0")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "settings.daemon.restart.action" }));

    const confirmDialog = await screen.findByRole("dialog", { name: "settings.daemon.restart.confirmTitle" });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "settings.daemon.restart.action" }));

    await waitFor(() => {
      expect(mocked.restartDaemon).toHaveBeenCalledTimes(1);
    });

    expect(mocked.closeTerminalTabsForDaemonRestart).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText("settings.daemon.restart.success")).toBeTruthy();
    });
    expect(screen.getByText("0.3.0")).toBeTruthy();
    expect(screen.getByText("daemon-456")).toBeTruthy();
  });

  it("shows a daemon log error when reading logs fails", async () => {
    mocked.getDaemonInfo.mockResolvedValue({
      version: "0.2.0",
      daemonId: "daemon-123",
      wsUrl: "ws://127.0.0.1:4242/ws",
    });
    mocked.readDaemonLog.mockResolvedValue({ ok: false, error: "log unavailable" });

    render(<DaemonSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("0.2.0")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "settings.daemon.log.action" }));

    await waitFor(() => {
      expect(screen.getByText("log unavailable")).toBeTruthy();
    });
  });

  it("rolls back quit-on-exit when saving the toggle fails", async () => {
    mocked.getDaemonInfo.mockResolvedValue({
      version: "0.2.0",
      daemonId: "daemon-123",
      wsUrl: "ws://127.0.0.1:4242/ws",
    });
    mocked.getDaemonQuitOnExit.mockResolvedValue(true);
    mocked.setDaemonQuitOnExit.mockRejectedValue(new Error("save failed"));

    render(<DaemonSettingsView />);

    const toggle = await screen.findByRole("switch", { name: "settings.daemon.quitOnExit.label" });
    await waitFor(() => {
      expect((toggle as HTMLInputElement).checked).toBe(true);
    });

    fireEvent.click(toggle);

    expect(mocked.setDaemonQuitOnExit).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect((toggle as HTMLInputElement).checked).toBe(true);
    });
  });
});
