// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  checkAgentGlobalConfigExternalDirectoryPermission,
  ensureAgentGlobalConfigExternalDirectoryPermission,
  getAuthStatus,
  getDaemonInfo,
  getDefaultWorktreeLocation,
  getMainWindowFullscreenState,
  login,
  openExternalUrl,
  openLocalFolderDialog,
  toggleMainWindowMaximized,
} from "./appCommands";

const mocks = vi.hoisted(() => ({
  checkAgentGlobalConfigExternalDirectoryPermission: vi.fn(),
  ensureAgentGlobalConfigExternalDirectoryPermission: vi.fn(),
  getDefaultWorktreeLocation: vi.fn(),
  openLocalFolderDialog: vi.fn(),
  openExternalUrl: vi.fn(),
  toggleMainWindowMaximized: vi.fn(),
  getMainWindowFullscreenState: vi.fn(),
  checkAuthStatus: vi.fn(),
  getDaemonInfo: vi.fn(),
  login: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    app: {
      checkAgentGlobalConfigExternalDirectoryPermission: mocks.checkAgentGlobalConfigExternalDirectoryPermission,
      ensureAgentGlobalConfigExternalDirectoryPermission: mocks.ensureAgentGlobalConfigExternalDirectoryPermission,
      getDefaultWorktreeLocation: mocks.getDefaultWorktreeLocation,
      openLocalFolderDialog: mocks.openLocalFolderDialog,
      toggleMainWindowMaximized: mocks.toggleMainWindowMaximized,
      checkAuthStatus: mocks.checkAuthStatus,
    },
  })),
  getDesktopHostBridge: vi.fn(() => ({
    openLocalFolderDialog: mocks.openLocalFolderDialog,
    openExternalUrl: mocks.openExternalUrl,
    toggleMainWindowMaximized: mocks.toggleMainWindowMaximized,
    getMainWindowFullscreenState: mocks.getMainWindowFullscreenState,
    getDaemonInfo: mocks.getDaemonInfo,
    login: mocks.login,
  })),
}));

describe("appCommands", () => {
  it("delegates shell commands to app shell service", async () => {
    mocks.getDefaultWorktreeLocation.mockResolvedValueOnce({ worktreePath: "/tmp/worktrees" });
    mocks.checkAuthStatus.mockResolvedValueOnce({ authenticated: true, accessTokenExpiresAt: "2026-05-11T10:00:00Z" });
    mocks.login.mockResolvedValueOnce({ authenticated: true, skipped: true });

    await openLocalFolderDialog("/tmp");
    await getDefaultWorktreeLocation();
    await checkAgentGlobalConfigExternalDirectoryPermission({ agentKind: "opencode" });
    await ensureAgentGlobalConfigExternalDirectoryPermission({ agentKind: "claude" });
    await toggleMainWindowMaximized();
    await getMainWindowFullscreenState();
    await openExternalUrl("https://yishan.io/docs");
    await getAuthStatus();
    await getDaemonInfo();
    await login();

    expect(mocks.openLocalFolderDialog).toHaveBeenCalledWith({ startingFolder: "/tmp" });
    expect(mocks.getDefaultWorktreeLocation).toHaveBeenCalledWith(undefined);
    expect(mocks.checkAgentGlobalConfigExternalDirectoryPermission).toHaveBeenCalledWith({ agentKind: "opencode" });
    expect(mocks.ensureAgentGlobalConfigExternalDirectoryPermission).toHaveBeenCalledWith({ agentKind: "claude" });
    expect(mocks.toggleMainWindowMaximized).toHaveBeenCalledWith();
    expect(mocks.getMainWindowFullscreenState).toHaveBeenCalledWith();
    expect(mocks.openExternalUrl).toHaveBeenCalledWith({ url: "https://yishan.io/docs" });
    expect(mocks.checkAuthStatus).toHaveBeenCalledWith();
    expect(mocks.getDaemonInfo).toHaveBeenCalledWith();
    expect(mocks.login).toHaveBeenCalledWith();
  });
});
