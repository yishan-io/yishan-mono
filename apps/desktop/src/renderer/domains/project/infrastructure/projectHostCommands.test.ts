// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { getDefaultWorktreeLocation, openLocalFolderDialog } from "./projectHostCommands";

const mocks = vi.hoisted(() => ({
  openLocalFolderDialog: vi.fn(),
  invokeDaemonProcedure: vi.fn(),
}));

vi.mock("../../../rpc/rpcTransport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../rpc/rpcTransport")>();
  return {
    ...actual,
    invokeDaemonProcedure: mocks.invokeDaemonProcedure,
    getDesktopHostBridge: vi.fn(() => ({
      openLocalFolderDialog: mocks.openLocalFolderDialog,
    })),
  };
});

describe("projectHostCommands", () => {
  it("opens a native folder picker through the host bridge", async () => {
    mocks.openLocalFolderDialog.mockResolvedValueOnce("/tmp/worktrees");
    const result = await openLocalFolderDialog("/tmp");

    expect(mocks.openLocalFolderDialog).toHaveBeenCalledWith({ startingFolder: "/tmp" });
    expect(result).toBe("/tmp/worktrees");
  });

  it("reads the default worktree location from the daemon app settings", async () => {
    mocks.invokeDaemonProcedure.mockResolvedValueOnce({ worktreePath: "/tmp/worktrees" });
    const result = await getDefaultWorktreeLocation();

    expect(mocks.invokeDaemonProcedure).toHaveBeenCalledWith("app.getDefaultWorktreeLocation", {});
    expect(result).toBe("/tmp/worktrees");
  });
});
