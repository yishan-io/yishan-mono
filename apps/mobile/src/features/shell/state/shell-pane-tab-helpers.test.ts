import { describe, expect, it } from "vitest";

import { paneTabFromWorkspaceTab, routeSelectionFromActiveTab } from "./shell-pane-tab-helpers";
import { createShellWorkspaceTabFromOpenInput } from "./shell-workspace-tabs";

describe("shell-pane-tab-helpers", () => {
  it("maps workspace tabs into pane-tab equivalents", () => {
    const fileTab = createShellWorkspaceTabFromOpenInput(
      { kind: "file", path: "README.md" },
      "workspace-1",
      "file:README.md",
    );
    const terminalTab = createShellWorkspaceTabFromOpenInput(
      { kind: "terminal", terminalId: "terminal-1", title: "Terminal 1" },
      "workspace-1",
      "terminal:terminal-1",
    );

    expect(paneTabFromWorkspaceTab(fileTab)).toEqual({
      id: "file:README.md",
      kind: "file",
      path: "README.md",
    });
    expect(paneTabFromWorkspaceTab(terminalTab)).toEqual({
      id: "terminal:terminal-1",
      kind: "terminal",
      terminalId: "terminal-1",
    });
  });

  it("keeps route selection scoped to the workspace even when a terminal tab is active", () => {
    const context = {
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };

    expect(
      routeSelectionFromActiveTab(context, { id: "terminal:terminal-1", kind: "terminal", terminalId: "terminal-1" }),
    ).toEqual({
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
    expect(routeSelectionFromActiveTab(context, { id: "file:README.md", kind: "file", path: "README.md" })).toEqual({
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
  });

  it("keeps workspace route selection when the active tab is terminal", () => {
    const context = {
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };

    expect(
      routeSelectionFromActiveTab(context, { id: "terminal:terminal-1", kind: "terminal", terminalId: "terminal-1" }),
    ).toEqual({
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
  });
});
