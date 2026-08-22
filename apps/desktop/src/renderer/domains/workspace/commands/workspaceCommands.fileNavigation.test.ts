// @vitest-environment jsdom

import { fileTreeStore } from "@renderer/domains/files";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { afterEach, describe, expect, it } from "vitest";
import { layoutStore } from "../../../domains/workbench/state/layoutStore";
import { focusWorkspaceFileTree, openWorkspaceFileSearch } from "./workspaceCommands";

const initialFileTreeStoreState = fileTreeStore.getState();
const initialLayoutStoreState = layoutStore.getState();
const initialWorkbenchNavigationStoreState = workbenchNavigationStore.getState();

afterEach(() => {
  fileTreeStore.setState(initialFileTreeStoreState, true);
  layoutStore.setState(initialLayoutStoreState, true);
  workbenchNavigationStore.setState(initialWorkbenchNavigationStoreState, true);
  document.body.replaceChildren();
});

describe("workspace file navigation commands", () => {
  it("shows files pane and focuses file tree when requested", () => {
    workbenchNavigationStore.setState({
      activeWorkspaceId: "ws-test",
    });
    layoutStore.setState({
      isRightPaneHiddenByWorkspaceId: { "ws-test": true },
      rightPaneTabByWorkspaceId: { "ws-test": "changes" },
    });

    const treeArea = document.createElement("div");
    treeArea.setAttribute("data-testid", "repo-file-tree-area");
    treeArea.tabIndex = -1;
    const treeItem = document.createElement("div");
    treeItem.setAttribute("role", "treeitem");
    treeItem.tabIndex = 0;
    treeArea.appendChild(treeItem);
    document.body.appendChild(treeArea);

    focusWorkspaceFileTree();

    expect(layoutStore.getState().isRightPaneHiddenByWorkspaceId["ws-test"]).toBe(false);
    expect(layoutStore.getState().rightPaneTabByWorkspaceId["ws-test"]).toBe("files");
    expect(document.activeElement).toBe(treeItem);

    treeArea.remove();
  });

  it("opens file search without forcing the file tree pane open", () => {
    workbenchNavigationStore.setState({
      activeWorkspaceId: "ws-test",
    });
    layoutStore.setState({
      isRightPaneHiddenByWorkspaceId: { "ws-test": true },
      rightPaneTabByWorkspaceId: { "ws-test": "changes" },
    });
    fileTreeStore.setState({ fileSearchRequestKey: 4 });

    openWorkspaceFileSearch();

    expect(layoutStore.getState().isRightPaneHiddenByWorkspaceId["ws-test"]).toBe(true);
    expect(layoutStore.getState().rightPaneTabByWorkspaceId["ws-test"]).toBe("changes");
    expect(fileTreeStore.getState().fileSearchRequestKey).toBe(5);
  });
});
