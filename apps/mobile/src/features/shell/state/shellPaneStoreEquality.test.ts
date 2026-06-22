import { describe, expect, it } from "vitest";

import { createEmptyWorkspacePaneStoreState } from "./shell-state-helpers";
import { createShellWorkspaceTabFromOpenInput } from "./shell-workspace-tabs";
import { workspacePaneStoreStatesEqual, workspaceTabStatesEqual } from "./shellPaneStoreEquality";

const WORKSPACE_ID = "workspace-1";

describe("shellPaneStoreEquality", () => {
  it("treats temporary preview tab flags as part of tab-state equality", () => {
    const left = {
      selectedTabId: "file:README.md",
      tabs: [
        createShellWorkspaceTabFromOpenInput(
          { kind: "file", path: "README.md", temporary: true },
          WORKSPACE_ID,
          "file:README.md",
        ),
      ],
      workspaceId: WORKSPACE_ID,
    };
    const right = {
      ...left,
      tabs: [
        createShellWorkspaceTabFromOpenInput(
          { kind: "file", path: "README.md", temporary: false },
          WORKSPACE_ID,
          "file:README.md",
        ),
      ],
    };

    expect(workspaceTabStatesEqual(left, right)).toBe(false);
  });

  it("detects layout changes in pane-store equality", () => {
    const left = createEmptyWorkspacePaneStoreState(WORKSPACE_ID);
    const right = {
      ...left,
      layoutState: {
        ...left.layoutState,
        activePaneId: "pane-other",
      },
    };

    expect(workspacePaneStoreStatesEqual(left, right)).toBe(false);
  });
});
