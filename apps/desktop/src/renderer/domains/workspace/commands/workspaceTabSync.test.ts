// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const agentMocks = vi.hoisted(() => ({
  stopAgentSession: vi.fn(),
  stopPiSession: vi.fn(),
}));

vi.mock("../../../domains/agent/commands/agentChatCommands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../domains/agent/commands/agentChatCommands")>();
  return { ...actual, stopAgentSession: agentMocks.stopAgentSession, stopPiSession: agentMocks.stopPiSession };
});

import { workspaceAgentIndicatorStore } from "../../../domains/agent/state/workspaceAgentIndicatorStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
let syncTabStoreWithWorkspace: typeof import("./workspaceTabSync").syncTabStoreWithWorkspace;

beforeAll(async () => {
  ({ syncTabStoreWithWorkspace } = await import("./workspaceTabSync"));
});

const initialWorkspaceStoreState = workspaceStore.getState();
const initialTabStoreState = tabStore.getState();
const initialWorkspaceAgentIndicatorStoreState = workspaceAgentIndicatorStore.getState();

const removedWorkspace = {
  id: "workspace-1",
  repoId: "repo-1",
  name: "A",
  title: "A",
  summaryId: "",
  branch: "feature-a",
  sourceBranch: "main",
  worktreePath: "/tmp/a",
};

const retainedWorkspace = {
  id: "workspace-2",
  repoId: "repo-1",
  name: "B",
  title: "B",
  summaryId: "",
  branch: "feature-b",
  sourceBranch: "main",
  worktreePath: "/tmp/b",
};

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  workspaceAgentIndicatorStore.setState(initialWorkspaceAgentIndicatorStoreState, true);
  vi.clearAllMocks();
});

describe("workspaceTabSync", () => {
  it("reconciles tab and chat state when workspaces are removed", async () => {
    workbenchNavigationStore.setState({ activeWorkspaceId: retainedWorkspace.id });
    workspaceStore.setState({ workspaces: [retainedWorkspace] });
    tabStore.setState({
      tabs: [
        {
          id: "tab-removed",
          workspaceId: removedWorkspace.id,
          title: "A",
          pinned: false,
          kind: "file",
          data: { path: "a.ts", isDirty: false, isTemporary: false },
        },
      ],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });


    await syncTabStoreWithWorkspace([removedWorkspace, retainedWorkspace]);

    expect(tabStore.getState().tabs).toHaveLength(0);
  });

  it("disposes removed workspace-create DSH Task Runs without restoring their tabs", async () => {
    let resolvePendingStop!: () => void;
    const pendingStop = new Promise<void>((resolve) => {
      resolvePendingStop = resolve;
    });
    const tabIdsVisibleWhenCleanupStarted: string[][] = [];
    agentMocks.stopAgentSession.mockImplementation(() => {
      tabIdsVisibleWhenCleanupStarted.push(tabStore.getState().tabs.map((tab) => tab.id));
      return pendingStop;
    });
    workspaceStore.setState({ workspaces: [retainedWorkspace] });
    tabStore.setState({
      tabs: [
        {
          id: "owner-tab",
          workspaceId: removedWorkspace.id,
          title: "Owner",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/a", sessionId: "task-run-session-1", runtime: "dsh" },
        },
        {
          id: "subagent-tab",
          workspaceId: removedWorkspace.id,
          title: "Subagent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/a", sessionId: "child-session", runtime: "dsh", sessionView: "subagent-detail" },
        },
        {
          id: "retained-tab",
          workspaceId: retainedWorkspace.id,
          title: "Retained",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/b", sessionId: "task-run-session-other-workspace", runtime: "dsh" },
        },
      ],
      selectedTabId: "owner-tab",
      selectedTabIdByWorkspaceId: {},
    });

    await syncTabStoreWithWorkspace([removedWorkspace, retainedWorkspace]);

    expect(agentMocks.stopAgentSession).toHaveBeenCalledTimes(2);
    expect(agentMocks.stopAgentSession).toHaveBeenCalledWith("owner-tab");
    expect(agentMocks.stopAgentSession).toHaveBeenCalledWith("subagent-tab");
    expect(agentMocks.stopAgentSession).not.toHaveBeenCalledWith("retained-tab");
    expect(agentMocks.stopPiSession).not.toHaveBeenCalled();
    expect(tabIdsVisibleWhenCleanupStarted).toEqual([
      ["owner-tab", "subagent-tab", "retained-tab"],
      ["owner-tab", "subagent-tab", "retained-tab"],
    ]);
    expect(tabStore.getState().tabs.map((tab) => tab.id)).toEqual(["retained-tab"]);

    resolvePendingStop();
  });

  it("removes tabs without waiting for or leaking a rejected agent cleanup", async () => {
    agentMocks.stopAgentSession.mockRejectedValueOnce(new Error("agent session is already stopped"));
    workspaceStore.setState({ workspaces: [] });
    tabStore.setState({
      tabs: [
        {
          id: "removed-chat-tab",
          workspaceId: removedWorkspace.id,
          title: "Chat",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/a", sessionId: "session-1" },
        },
      ],
      selectedTabId: "removed-chat-tab",
      selectedTabIdByWorkspaceId: {},
    });

    await syncTabStoreWithWorkspace([removedWorkspace]);

    expect(tabStore.getState().tabs).toEqual([]);
    expect(agentMocks.stopAgentSession).toHaveBeenCalledWith("removed-chat-tab");
    await Promise.resolve();
  });
});
