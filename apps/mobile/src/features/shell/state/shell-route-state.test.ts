import { describe, expect, it } from "vitest";

import { buildSelectionParams, toSelection } from "./shell-route-state";

describe("buildSelectionParams", () => {
  it("includes preview params for explicit file navigation by default", () => {
    expect(
      buildSelectionParams(
        {
          kind: "workspace",
          orgId: "org-1",
          projectId: "project-1",
          workspaceId: "workspace-1",
        },
        { id: "file:README.md", kind: "file", path: "README.md" },
      ),
    ).toEqual({
      filePath: "README.md",
      kind: "workspace",
      orgId: "org-1",
      previewKind: "file",
      projectId: "project-1",
      tab: "files",
      workspaceId: "workspace-1",
    });
  });

  it("omits preview params when a workspace switch only restores local pane state", () => {
    expect(
      buildSelectionParams(
        {
          kind: "workspace",
          orgId: "org-1",
          projectId: "project-1",
          workspaceId: "workspace-1",
        },
        { id: "file:README.md", kind: "file", path: "README.md" },
        { includePreview: false },
      ),
    ).toEqual({
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
  });
});

describe("toSelection", () => {
  it("normalizes terminal route params to workspace selection", () => {
    expect(
      toSelection({
        kind: "terminal",
        orgId: "org-1",
        projectId: "project-1",
        terminalId: "terminal-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
  });
});
