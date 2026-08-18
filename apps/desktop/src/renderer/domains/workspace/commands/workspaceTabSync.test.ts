// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../../../domains/agent/state/chatStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { syncTabStoreWithWorkspace } from "./workspaceTabSync";

const initialWorkspaceStoreState = workspaceStore.getState();
const initialTabStoreState = tabStore.getState();
const initialChatStoreState = chatStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  vi.clearAllMocks();
});

describe("workspaceTabSync", () => {
  it("reconciles tab and chat state when workspaces are removed", () => {
    workbenchNavigationStore.setState({
      activeWorkspaceId: "workspace-2",
    });
    workspaceStore.setState({
      workspaces: [
        {
          id: "workspace-2",
          repoId: "repo-1",
          name: "B",
          title: "B",
          summaryId: "",
          branch: "feature-b",
          sourceBranch: "main",
          worktreePath: "/tmp/b",
        },
      ],
    });

    tabStore.setState({
      tabs: [
        {
          id: "tab-removed",
          workspaceId: "workspace-1",
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

    syncTabStoreWithWorkspace([
      {
        id: "workspace-1",
        repoId: "repo-1",
        name: "A",
        title: "A",
        summaryId: "",
        branch: "feature-a",
        sourceBranch: "main",
        worktreePath: "/tmp/a",
      },
      {
        id: "workspace-2",
        repoId: "repo-1",
        name: "B",
        title: "B",
        summaryId: "",
        branch: "feature-b",
        sourceBranch: "main",
        worktreePath: "/tmp/b",
      },
    ]);

    expect(tabStore.getState().tabs).toHaveLength(0);
    expect(removeTabData).toHaveBeenCalledWith(["tab-removed"]);
    expect(removeWorkspaceTaskCounts).toHaveBeenCalledWith(["workspace-1"]);
  });
});
