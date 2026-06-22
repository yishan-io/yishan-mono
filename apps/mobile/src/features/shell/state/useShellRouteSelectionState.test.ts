import { describe, expect, it } from "vitest";

import type { ShellSelection } from "./shell.types";
import { resolveShellSelectionFromRoute, selectionSharesRouteScope } from "./useShellRouteSelectionState";

describe("selectionSharesRouteScope", () => {
  it("matches workspace selections within the same workspace", () => {
    const left: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };
    const right: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };

    expect(selectionSharesRouteScope(left, right)).toBe(true);
  });

  it("does not match selections from different workspaces", () => {
    const left: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };
    const right: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-2",
    };

    expect(selectionSharesRouteScope(left, right)).toBe(false);
  });
});

describe("resolveShellSelectionFromRoute", () => {
  it("keeps local selection while a self-initiated route update is still pending", () => {
    const currentSelection: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-2",
    };
    const pendingSelection: ShellSelection = currentSelection;
    const routeSelection: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };

    expect(
      resolveShellSelectionFromRoute({
        currentSelection,
        pendingSelection,
        routeSelection,
      }),
    ).toEqual({
      nextPendingSelection: pendingSelection,
      nextSelection: currentSelection,
    });
  });

  it("clears pending selection once the route catches up", () => {
    const currentSelection: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-2",
    };
    const pendingSelection: ShellSelection = currentSelection;

    expect(
      resolveShellSelectionFromRoute({
        currentSelection,
        pendingSelection,
        routeSelection: currentSelection,
      }),
    ).toEqual({
      nextPendingSelection: null,
      nextSelection: currentSelection,
    });
  });

  it("adopts explicit external route changes when no local transition is pending", () => {
    const currentSelection: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };
    const routeSelection: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-2",
    };

    expect(
      resolveShellSelectionFromRoute({
        currentSelection,
        pendingSelection: null,
        routeSelection,
      }),
    ).toEqual({
      nextPendingSelection: null,
      nextSelection: routeSelection,
    });
  });
});
