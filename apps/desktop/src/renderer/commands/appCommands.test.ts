// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  checkAgentGlobalConfigExternalDirectoryPermission,
  ensureAgentGlobalConfigExternalDirectoryPermission,
  getAuthStatus,
  getDefaultWorktreeLocation,
  login,
  getMainWindowFullscreenState,
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
  getAuthStatus: vi.fn(),
  login: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getApiServiceClient: vi.fn(async () => ({
    app: {
      checkAgentGlobalConfigExternalDirectoryPermission: mocks.checkAgentGlobalConfigExternalDirectoryPermission,
      ensureAgentGlobalConfigExternalDirectoryPermission: mocks.ensureAgentGlobalConfigExternalDirectoryPermission,
      getDefaultWorktreeLocation: mocks.getDefaultWorktreeLocation,
      openLocalFolderDialog: mocks.openLocalFolderDialog,
      toggleMainWindowMaximized: mocks.toggleMainWindowMaximized,
    },
  })),
  getDesktopHostBridge: vi.fn(() => ({
    openLocalFolderDialog: mocks.openLocalFolderDialog,
    openExternalUrl: mocks.openExternalUrl,
    toggleMainWindowMaximized: mocks.toggleMainWindowMaximized,
    getMainWindowFullscreenState: mocks.getMainWindowFullscreenState,
    getAuthStatus: mocks.getAuthStatus,
    login: mocks.login,
  })),
}));

describe("appCommands", () => {
  it("delegates shell commands to app shell service", async () => {
    mocks.getDefaultWorktreeLocation.mockResolvedValueOnce({ worktreePath: "/tmp/worktrees" });

    await openLocalFolderDialog("/tmp");
    await getDefaultWorktreeLocation();
    await checkAgentGlobalConfigExternalDirectoryPermission({ agentKind: "opencode" });
    await ensureAgentGlobalConfigExternalDirectoryPermission({ agentKind: "claude" });
    await toggleMainWindowMaximized();
    await getMainWindowFullscreenState();
    await openExternalUrl("https://vestin.io/docs");
    await getAuthStatus();
    await login();

    expect(mocks.openLocalFolderDialog).toHaveBeenCalledWith({ startingFolder: "/tmp" });
    expect(mocks.getDefaultWorktreeLocation).toHaveBeenCalledWith(undefined);
    expect(mocks.checkAgentGlobalConfigExternalDirectoryPermission).toHaveBeenCalledWith({ agentKind: "opencode" });
    expect(mocks.ensureAgentGlobalConfigExternalDirectoryPermission).toHaveBeenCalledWith({ agentKind: "claude" });
    expect(mocks.toggleMainWindowMaximized).toHaveBeenCalledWith();
    expect(mocks.getMainWindowFullscreenState).toHaveBeenCalledWith();
    expect(mocks.openExternalUrl).toHaveBeenCalledWith({ url: "https://vestin.io/docs" });
    expect(mocks.getAuthStatus).toHaveBeenCalledWith();
    expect(mocks.login).toHaveBeenCalledWith();
  });
});
