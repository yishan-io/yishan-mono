// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { getDefaultWorktreeLocation } from "../daemon/projectDaemonClient";
import { openLocalFolderDialog } from "./projectHostCommands";

const mocks = vi.hoisted(() => ({
  openLocalFolderDialog: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@renderer/rpc", () => ({
  request: mocks.request,
}));

vi.mock("@renderer/platform/hostBridge", () => ({
  getDesktopHostBridge: vi.fn(() => ({
    openLocalFolderDialog: mocks.openLocalFolderDialog,
  })),
}));

describe("projectHostCommands", () => {
  it("opens a native folder picker through the host bridge", async () => {
    mocks.openLocalFolderDialog.mockResolvedValueOnce("/tmp/worktrees");
    const result = await openLocalFolderDialog("/tmp");

    expect(mocks.openLocalFolderDialog).toHaveBeenCalledWith({ startingFolder: "/tmp" });
    expect(result).toBe("/tmp/worktrees");
  });

  it("reads the default worktree location from the daemon app settings", async () => {
    mocks.request.mockResolvedValueOnce({ worktreePath: "/tmp/worktrees" });
    const result = await getDefaultWorktreeLocation();

    expect(mocks.request).toHaveBeenCalledWith("app.getDefaultWorktreeLocation", {});
    expect(result).toBe("/tmp/worktrees");
  });
});
