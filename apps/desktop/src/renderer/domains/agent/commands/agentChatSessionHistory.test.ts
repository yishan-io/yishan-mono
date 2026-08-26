// @vitest-environment jsdom

import { workspaceStore } from "@renderer/domains/workspace";
import type { WorkspaceItem } from "@renderer/domains/workspace";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listAgentSessionHistory, readAgentSessionHistory } from "./agentChatSessionHistory";

const mocks = vi.hoisted(() => ({
  listAgentRuntimeSessions: vi.fn(),
  readAgentRuntimeHistory: vi.fn(),
}));

vi.mock("../daemon/daemonAgentProcedures", () => ({
  listAgentRuntimeSessions: mocks.listAgentRuntimeSessions,
  listActivePiCompatibilitySessions: vi.fn(),
  readAgentRuntimeHistory: mocks.readAgentRuntimeHistory,
}));

const workspace: WorkspaceItem = {
  id: "workspace-1",
  repoId: "project-1",
  name: "Workspace",
  title: "Workspace",
  sourceBranch: "main",
  branch: "feature",
  summaryId: "summary-1",
  worktreePath: "/workspace",
};

describe("agentChatSessionHistory", () => {
  afterEach(() => {
    workspaceStore.getState().load("", []);
    vi.clearAllMocks();
  });

  it("lists Pi history through the neutral procedure for the exact open workspace", async () => {
    workspaceStore.getState().load("", [workspace]);
    mocks.listAgentRuntimeSessions.mockResolvedValue({
      runtime: "pi",
      sessions: [{ sessionId: "session-1", cwd: "/workspace", createdAt: 1, live: false, persisted: true }],
    });

    await expect(listAgentSessionHistory("/workspace")).resolves.toHaveLength(1);
    expect(mocks.listAgentRuntimeSessions).toHaveBeenCalledWith({
      runtime: "pi",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
  });

  it("reads DSH history through the neutral procedure without changing the Pi UI default", async () => {
    workspaceStore.getState().load("", [workspace]);
    mocks.readAgentRuntimeHistory.mockResolvedValue({
      runtime: "dsh",
      dsh: { session: { sessionId: "session-1", createdAt: 1 }, events: [] },
    });

    await expect(readAgentSessionHistory("session-1", "/workspace", "dsh")).resolves.toMatchObject({ runtime: "dsh" });
    expect(mocks.readAgentRuntimeHistory).toHaveBeenCalledWith({
      runtime: "dsh",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
  });

  it("rejects a cwd that does not exactly match an open workspace", async () => {
    await expect(listAgentSessionHistory("/missing")).rejects.toThrow("No open workspace matches cwd: /missing");
    expect(mocks.listAgentRuntimeSessions).not.toHaveBeenCalled();
  });
});
