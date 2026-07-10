import { describe, expect, it, vi } from "vitest";

import type { Workspace } from "@/features/workspaces/workspaces.types";
import {
  buildAgentQuickActions,
  buildProjectMenuActions,
  buildSelectedWorkspaceContextKey,
  buildWorkspaceBrowserInputFromSelection,
  buildWorkspaceBrowserInputFromWorkspace,
  buildWorkspaceMenuActions,
  wrapActionWithBeforeEffect,
  wrapOptionalActionWithBeforeEffect,
} from "./shell-action-builders";

const workspace: Workspace = {
  branch: "feature/mobile",
  createdAt: "2026-06-16T00:00:00Z",
  id: "workspace-1",
  kind: "worktree",
  latestPullRequest: null,
  localPath: "/tmp/workspace-1",
  nodeId: "node-1",
  organizationId: "org-1",
  projectId: "project-1",
  sourceBranch: "origin/main",
  status: "active",
  updatedAt: "2026-06-16T00:00:00Z",
  userId: "user-1",
};

describe("shell-action-builders", () => {
  it("returns null workspace key when no workspace context is selected", () => {
    expect(buildSelectedWorkspaceContextKey(null)).toBeNull();
  });

  it("builds a stable workspace context key", () => {
    expect(
      buildSelectedWorkspaceContextKey({
        organizationId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      }),
    ).toBe("org-1:project-1:workspace-1");
  });

  it("wraps an action so the before-effect runs first", () => {
    const calls: string[] = [];
    const wrapped = wrapActionWithBeforeEffect(
      () => {
        calls.push("before");
      },
      (value: string) => {
        calls.push(`action:${value}`);
      },
    );

    wrapped("test");

    expect(calls).toEqual(["before", "action:test"]);
  });

  it("returns null when wrapping a missing optional action", () => {
    expect(wrapOptionalActionWithBeforeEffect(() => undefined, null)).toBeNull();
  });

  it("wraps an optional action when it exists", () => {
    const before = vi.fn();
    const action = vi.fn();
    const wrapped = wrapOptionalActionWithBeforeEffect(before, action);

    wrapped?.();

    expect(before).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("returns null for browser selection input without a selected workspace context", () => {
    expect(buildWorkspaceBrowserInputFromSelection(null, "files")).toBeNull();
  });

  it("builds browser input from the selected workspace context", () => {
    expect(
      buildWorkspaceBrowserInputFromSelection(
        {
          activePreviewKind: "diff",
          activePreviewPath: "src/features/shell/index.ts",
          nodeId: "node-1",
          organizationId: "org-1",
          projectId: "project-1",
          projectLabel: "nile",
          terminalId: "terminal-1",
          terminalLabel: "Terminal 1",
          workspaceBranch: "feature/mobile",
          workspaceId: "workspace-1",
          workspaceLabel: "local",
        },
        "changes",
      ),
    ).toEqual({
      branchLabel: "feature/mobile",
      focusPath: "src/features/shell/index.ts",
      nodeId: "node-1",
      organizationId: "org-1",
      projectId: "project-1",
      projectLabel: "nile",
      tab: "changes",
      terminalId: "terminal-1",
      terminalLabel: "Terminal 1",
      workspaceId: "workspace-1",
      workspaceLabel: "local",
    });
  });

  it("only carries focusPath when the active preview matches the target browser tab", () => {
    expect(
      buildWorkspaceBrowserInputFromSelection(
        {
          activePreviewKind: "file",
          activePreviewPath: "README.md",
          nodeId: "node-1",
          organizationId: "org-1",
          projectId: "project-1",
          projectLabel: "nile",
          terminalId: "terminal-1",
          terminalLabel: "Terminal 1",
          workspaceBranch: "feature/mobile",
          workspaceId: "workspace-1",
          workspaceLabel: "local",
        },
        "files",
      ),
    ).toMatchObject({
      focusPath: "README.md",
      tab: "files",
    });

    expect(
      buildWorkspaceBrowserInputFromSelection(
        {
          activePreviewKind: "terminal",
          activePreviewPath: null,
          nodeId: "node-1",
          organizationId: "org-1",
          projectId: "project-1",
          projectLabel: "nile",
          terminalId: "terminal-1",
          terminalLabel: "Terminal 1",
          workspaceBranch: "feature/mobile",
          workspaceId: "workspace-1",
          workspaceLabel: "local",
        },
        "files",
      ),
    ).toMatchObject({
      focusPath: null,
      tab: "files",
    });
  });

  it("builds browser input from a workspace row", () => {
    expect(
      buildWorkspaceBrowserInputFromWorkspace({
        projectLabel: "nile",
        tab: "files",
        terminalLabel: null,
        workspace,
        workspaceLabel: "local",
      }),
    ).toEqual({
      branchLabel: "feature/mobile",
      nodeId: "node-1",
      organizationId: "org-1",
      projectId: "project-1",
      projectLabel: "nile",
      tab: "files",
      terminalId: null,
      terminalLabel: null,
      workspaceId: "workspace-1",
      workspaceLabel: "local",
    });
  });

  it("builds agent quick actions that launch the expected preset command", () => {
    const onCreateTerminal = vi.fn();
    const actions = buildAgentQuickActions({
      labels: {
        claude: "Claude",
        codex: "Codex",
        opencode: "OpenCode",
      },
      onCreateTerminal,
      workspace,
    });

    expect(actions.map((action) => action.id)).toEqual(["opencode", "codex", "claude"]);

    actions[1]?.onPress();

    expect(onCreateTerminal).toHaveBeenCalledWith(workspace, {
      agentKind: "codex",
      label: "Codex",
      launchCommand: "codex",
    });
  });

  it("builds project menu actions with create and destructive delete flows", () => {
    const openWorkspaceCreate = vi.fn();
    const deleteProject = vi.fn();
    const actions = buildProjectMenuActions({
      createWorkspaceLabel: "New workspace",
      deleteProjectLabel: "Delete project",
      onDeleteProject: deleteProject,
      onOpenWorkspaceCreate: openWorkspaceCreate,
    });

    expect(actions).toHaveLength(2);
    expect(actions[1]?.destructive).toBe(true);

    actions[0]?.onPress();
    actions[1]?.onPress();

    expect(openWorkspaceCreate).toHaveBeenCalledTimes(1);
    expect(deleteProject).toHaveBeenCalledTimes(1);
  });

  it("builds workspace menu actions with only close workspace", () => {
    const closeWorkspace = vi.fn();
    const actions = buildWorkspaceMenuActions({
      closeWorkspaceLabel: "Close workspace",
      onCloseWorkspace: closeWorkspace,
    });

    expect(actions.map((action) => action.label)).toEqual(["Close workspace"]);
    expect(actions[0]?.destructive).toBe(true);

    actions[0]?.onPress();

    expect(closeWorkspace).toHaveBeenCalledTimes(1);
  });
});
