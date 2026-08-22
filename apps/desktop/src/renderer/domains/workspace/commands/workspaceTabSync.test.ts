// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const agentMocks = vi.hoisted(() => ({
  stopPiSession: vi.fn(),
}));

vi.mock("../../../domains/agent/commands/agentChatCommands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../domains/agent/commands/agentChatCommands")>();
  return { ...actual, stopPiSession: agentMocks.stopPiSession };
});

import { chatStore } from "../../../domains/agent/state/chatStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
let syncTabStoreWithWorkspace: typeof import("./workspaceTabSync").syncTabStoreWithWorkspace;

beforeAll(async () => {
  ({ syncTabStoreWithWorkspace } = await import("./workspaceTabSync"));
});

const initialWorkspaceStoreState = workspaceStore.getState();
const initialTabStoreState = tabStore.getState();
const initialChatStoreState = chatStore.getState();

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
  chatStore.setState(initialChatStoreState, true);
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

    const removeTabData = vi.fn();
    const removeWorkspaceTaskCounts = vi.fn();
    chatStore.setState({ removeTabData, removeWorkspaceTaskCounts });

    await syncTabStoreWithWorkspace([removedWorkspace, retainedWorkspace]);

    expect(tabStore.getState().tabs).toHaveLength(0);
    expect(removeTabData).toHaveBeenCalledWith(["tab-removed"]);
    expect(removeWorkspaceTaskCounts).toHaveBeenCalledWith([removedWorkspace.id]);
  });

  it("starts cleanup for every removed agent chat before removing tabs", async () => {
    let resolvePendingStop!: () => void;
    const pendingStop = new Promise<void>((resolve) => {
      resolvePendingStop = resolve;
    });
    const tabIdsVisibleWhenCleanupStarted: string[][] = [];
    agentMocks.stopPiSession.mockImplementation(() => {
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
          data: { cwd: "/tmp/a", sessionId: "owner-session" },
        },
        {
          id: "subagent-tab",
          workspaceId: removedWorkspace.id,
          title: "Subagent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/a", sessionId: "child-session", sessionView: "subagent-detail" },
        },
        {
          id: "retained-tab",
          workspaceId: retainedWorkspace.id,
          title: "Retained",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/b", sessionId: "retained-session" },
        },
      ],
      selectedTabId: "owner-tab",
      selectedTabIdByWorkspaceId: {},
    });

    await syncTabStoreWithWorkspace([removedWorkspace, retainedWorkspace]);

    expect(agentMocks.stopPiSession).toHaveBeenCalledTimes(2);
    expect(agentMocks.stopPiSession).toHaveBeenCalledWith("owner-tab");
    expect(agentMocks.stopPiSession).toHaveBeenCalledWith("subagent-tab");
    expect(tabIdsVisibleWhenCleanupStarted).toEqual([
      ["owner-tab", "subagent-tab", "retained-tab"],
      ["owner-tab", "subagent-tab", "retained-tab"],
    ]);
    expect(tabStore.getState().tabs.map((tab) => tab.id)).toEqual(["retained-tab"]);

    resolvePendingStop();
  });

  it("removes tabs without waiting for or leaking a rejected Pi cleanup", async () => {
    agentMocks.stopPiSession.mockRejectedValueOnce(new Error("Pi is already stopped"));
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
    expect(agentMocks.stopPiSession).toHaveBeenCalledWith("removed-chat-tab");
  });
});
