// @vitest-environment jsdom

import { workspaceStore } from "@renderer/domains/workspace";
import type { WorkspaceItem } from "@renderer/domains/workspace";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSessionHistory, listAgentSessionHistory, readAgentSessionHistory } from "./agentChatSessionHistory";

const mocks = vi.hoisted(() => ({
  listAgentRuntimeSessions: vi.fn(),
  readAgentRuntimeHistory: vi.fn(),
  getAgentCapabilities: vi.fn(),
}));

vi.mock("../daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
  listAgentRuntimeSessions: mocks.listAgentRuntimeSessions,
  listActivePiCompatibilitySessions: vi.fn(),
  readAgentRuntimeHistory: mocks.readAgentRuntimeHistory,
  getAgentCapabilities: mocks.getAgentCapabilities,
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
    vi.resetAllMocks();
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

  it.each([
    ["is disabled", { configured: false, ready: false }],
    ["is unready", { configured: true, ready: false }],
  ])("lists only Pi history when DSH %s", async (_scenario, dsh) => {
    workspaceStore.getState().load("", [workspace]);
    mocks.getAgentCapabilities.mockResolvedValue({ dsh });
    mocks.listAgentRuntimeSessions.mockResolvedValue({
      runtime: "pi",
      sessions: [{ sessionId: "pi-1", cwd: "/workspace", createdAt: 1, live: false, persisted: true }],
    });

    await expect(fetchSessionHistory("/workspace")).resolves.toEqual([
      expect.objectContaining({ sessionId: "pi-1", runtime: "pi" }),
    ]);
    expect(mocks.listAgentRuntimeSessions).toHaveBeenCalledTimes(1);
    expect(mocks.listAgentRuntimeSessions).toHaveBeenCalledWith({
      runtime: "pi",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
  });

  it("combines ready DSH history with Pi history in descending creation order", async () => {
    workspaceStore.getState().load("", [workspace]);
    mocks.getAgentCapabilities.mockResolvedValue({ dsh: { configured: true, ready: true } });
    mocks.listAgentRuntimeSessions
      .mockResolvedValueOnce({
        runtime: "pi",
        sessions: [{ sessionId: "same-id", cwd: "/workspace", createdAt: 1, live: false, persisted: true }],
      })
      .mockResolvedValueOnce({
        runtime: "dsh",
        sessions: [{ sessionId: "same-id", cwd: "/workspace", createdAt: 2, live: false, persisted: true }],
      });

    await expect(fetchSessionHistory("/workspace")).resolves.toEqual([
      expect.objectContaining({ sessionId: "same-id", runtime: "dsh" }),
      expect.objectContaining({ sessionId: "same-id", runtime: "pi" }),
    ]);
    expect(mocks.listAgentRuntimeSessions).toHaveBeenNthCalledWith(1, {
      runtime: "pi",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
    expect(mocks.listAgentRuntimeSessions).toHaveBeenNthCalledWith(2, {
      runtime: "dsh",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
  });

  it("preserves Pi history when ready DSH history is unavailable", async () => {
    workspaceStore.getState().load("", [workspace]);
    mocks.getAgentCapabilities.mockResolvedValue({ dsh: { configured: true, ready: true } });
    mocks.listAgentRuntimeSessions
      .mockResolvedValueOnce({
        runtime: "pi",
        sessions: [{ sessionId: "pi-1", cwd: "/workspace", createdAt: 1, live: false, persisted: true }],
      })
      .mockRejectedValueOnce(new Error("DSH unavailable"));

    await expect(fetchSessionHistory("/workspace")).resolves.toEqual([
      expect.objectContaining({ sessionId: "pi-1", runtime: "pi" }),
    ]);
  });

  it("reads DSH history through the neutral procedure without changing the Pi UI default", async () => {
    workspaceStore.getState().load("", [workspace]);
    mocks.readAgentRuntimeHistory.mockResolvedValue({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "session-1", createdAt: 1 },
        events: [],
        instanceId: "run-1",
        asOfSeq: -1,
        durableThroughSeq: -1,
      },
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
