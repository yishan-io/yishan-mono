// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  checkAgentGlobalConfigExternalDirectoryPermission,
  ensureAgentGlobalConfigExternalDirectoryPermission,
  getAuthStatus,
  getDaemonInfo,
  getMainWindowFullscreenState,
  login,
  toggleMainWindowMaximized,
} from "./appCommands";

const mocks = vi.hoisted(() => ({
  checkAgentGlobalConfigExternalDirectoryPermission: vi.fn(),
  ensureAgentGlobalConfigExternalDirectoryPermission: vi.fn(),
  toggleMainWindowMaximized: vi.fn(),
  getMainWindowFullscreenState: vi.fn(),
  checkAuthStatus: vi.fn(),
  logoutFromDaemon: vi.fn(),
  reloadAuthConfig: vi.fn(),
  getDaemonInfo: vi.fn(),
  login: vi.fn(),
}));

vi.mock("@renderer/domains/agent", () => ({
  checkAgentGlobalConfigExternalDirectoryPermission: mocks.checkAgentGlobalConfigExternalDirectoryPermission,
  ensureAgentGlobalConfigExternalDirectoryPermission: mocks.ensureAgentGlobalConfigExternalDirectoryPermission,
}));

vi.mock("@renderer/domains/session", () => ({
  checkAuthStatus: mocks.checkAuthStatus,
  logoutFromDaemon: mocks.logoutFromDaemon,
  reloadAuthConfig: mocks.reloadAuthConfig,
}));

vi.mock("../../rpc/rpcTransport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../rpc/rpcTransport")>();
  return {
    ...actual,
    getDesktopHostBridge: vi.fn(() => ({
      toggleMainWindowMaximized: mocks.toggleMainWindowMaximized,
      getMainWindowFullscreenState: mocks.getMainWindowFullscreenState,
      getDaemonInfo: mocks.getDaemonInfo,
      login: mocks.login,
    })),
  };
});

describe("appCommands", () => {
  it("delegates shell commands to app shell service", async () => {
    mocks.checkAuthStatus.mockResolvedValueOnce({ authenticated: true, accessTokenExpiresAt: "2026-05-11T10:00:00Z" });
    mocks.login.mockResolvedValueOnce({ authenticated: true, skipped: true });

    await checkAgentGlobalConfigExternalDirectoryPermission({ agentKind: "opencode" });
    await ensureAgentGlobalConfigExternalDirectoryPermission({ agentKind: "claude" });
    await toggleMainWindowMaximized();
    await getMainWindowFullscreenState();
    await getAuthStatus();
    await getDaemonInfo();
    await login();

    expect(mocks.checkAgentGlobalConfigExternalDirectoryPermission).toHaveBeenCalledWith({ agentKind: "opencode" });
    expect(mocks.ensureAgentGlobalConfigExternalDirectoryPermission).toHaveBeenCalledWith({ agentKind: "claude" });
    expect(mocks.toggleMainWindowMaximized).toHaveBeenCalledWith();
    expect(mocks.getMainWindowFullscreenState).toHaveBeenCalledWith();
    expect(mocks.checkAuthStatus).toHaveBeenCalledWith();
    expect(mocks.getDaemonInfo).toHaveBeenCalledWith();
    expect(mocks.login).toHaveBeenCalledWith();
  });
});
