import { describe, expect, it } from "vitest";

import { openShellWorkspaceTabState } from "./open";
import type { ShellWorkspaceTabStateSlice } from "./types";

function createState(): ShellWorkspaceTabStateSlice {
  return {
    selectedTabId: "",
    tabs: [],
    workspaceId: "workspace-1",
  };
}

describe("openShellWorkspaceTabState", () => {
  it("reuses a temporary preview tab by default", () => {
    const firstState = openShellWorkspaceTabState(
      createState(),
      {
        kind: "file",
        path: "README.md",
        temporary: true,
        workspaceId: "workspace-1",
      },
      "preview-1",
      { activePaneTabIds: [] },
    );

    const secondState = openShellWorkspaceTabState(
      firstState,
      {
        kind: "file",
        path: "CONTRIBUTING.md",
        temporary: true,
        workspaceId: "workspace-1",
      },
      "preview-2",
      { activePaneTabIds: ["preview-1"] },
    );

    expect(secondState.tabs).toHaveLength(1);
    expect(secondState.tabs[0]?.id).toBe("preview-1");
    expect(secondState.tabs[0]?.kind).toBe("file");
    expect(secondState.tabs[0]?.kind === "file" ? secondState.tabs[0].data.path : null).toBe("CONTRIBUTING.md");
  });

  it("opens a new temporary preview tab when temporary reuse is disabled", () => {
    const firstState = openShellWorkspaceTabState(
      createState(),
      {
        kind: "file",
        path: "README.md",
        temporary: true,
        workspaceId: "workspace-1",
      },
      "preview-1",
      { activePaneTabIds: [], allowTemporaryReuse: false },
    );

    const secondState = openShellWorkspaceTabState(
      firstState,
      {
        kind: "file",
        path: "CONTRIBUTING.md",
        temporary: true,
        workspaceId: "workspace-1",
      },
      "preview-2",
      { activePaneTabIds: ["preview-1"], allowTemporaryReuse: false },
    );

    expect(secondState.tabs).toHaveLength(2);
    expect(secondState.tabs.map((tab) => tab.id)).toEqual(["preview-1", "preview-2"]);
    expect(secondState.selectedTabId).toBe("preview-2");
  });
});
