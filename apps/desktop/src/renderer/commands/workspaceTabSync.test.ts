// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../store/chatStore";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
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
    workspaceStore.setState({
      selectedWorkspaceId: "workspace-2",
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

    const retainWorkspaceTabs = vi.fn().mockReturnValue(["tab-removed"]);
    const resolveTabForWorkspace = vi.fn();
    tabStore.setState({ retainWorkspaceTabs, resolveTabForWorkspace });

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

    expect(retainWorkspaceTabs).toHaveBeenCalledWith(["workspace-2"]);
    expect(resolveTabForWorkspace).toHaveBeenCalledWith("workspace-2");
    expect(removeTabData).toHaveBeenCalledWith(["tab-removed"]);
    expect(removeWorkspaceTaskCounts).toHaveBeenCalledWith(["workspace-1"]);
  });
});
