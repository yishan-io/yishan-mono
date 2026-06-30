import { describe, expect, it } from "vitest";

import { findFallbackWorkspace, isMissingSelectedTerminalTab, readWorkspaceSelection } from "./shell-recovery-helpers";

describe("shell-recovery-helpers", () => {
  it("returns null for home selection", () => {
    expect(readWorkspaceSelection({ kind: "home" })).toBeNull();
  });

  it("returns workspace selection when present", () => {
    expect(
      readWorkspaceSelection({
        kind: "workspace",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
  });

  it("finds the first fallback workspace across projects", () => {
    expect(findFallbackWorkspace([{ workspaces: [] }, { workspaces: [{ id: "workspace-1" }] }])).toEqual({
      id: "workspace-1",
    });
  });

  it("detects when the active pane is still pointing at a missing terminal tab", () => {
    expect(
      isMissingSelectedTerminalTab({ id: "tab-1", kind: "terminal", terminalId: "terminal-1" }, "terminal-1", {}),
    ).toBe(true);
    expect(
      isMissingSelectedTerminalTab({ id: "tab-1", kind: "terminal", terminalId: "terminal-1" }, "terminal-1", {
        "terminal-1": {
          id: "terminal-1",
          label: "terminal-1",
          orgId: "org-1",
          projectId: "project-1",
          updatedAt: "2026-06-16T10:00:00.000Z",
          workspaceId: "workspace-1",
        },
      }),
    ).toBe(false);
  });
});
