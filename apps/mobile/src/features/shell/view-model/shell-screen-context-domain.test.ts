import { describe, expect, it } from "vitest";

import type { Node } from "@/features/nodes/nodes.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import type { ShellSelection, TerminalItem } from "../state/shell.types";
import {
  filterRecentTerminalsByScope,
  filterTerminalsByWorkspaceIdForNode,
  readSelectedWorkspaceContext,
  readWorkspaceLabelFromPrimaryTerminal,
  resolveCurrentNodeId,
  resolveSelectedWorkspace,
} from "./shell-screen-context-domain";

function createTerminal(overrides: Partial<TerminalItem> = {}): TerminalItem {
  return {
    id: "terminal-1",
    label: "Terminal",
    orgId: "org-1",
    projectId: "project-1",
    updatedAt: "2026-06-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    ...overrides,
  };
}

function createNode(overrides: Partial<Node> = {}): Node {
  return {
    id: "node-1",
    name: "Node 1",
    kind: "managed",
    scope: "private",
    endpoint: null,
    metadata: null,
    ownerUserId: "user-1",
    organizationId: "org-1",
    canUse: true,
    isOnline: true,
    createdByUserId: "user-1",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

function createWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    organizationId: "org-1",
    projectId: "project-1",
    userId: "user-1",
    nodeId: "node-1",
    kind: "worktree",
    status: "active",
    branch: "main",
    sourceBranch: "main",
    localPath: "",
    latestPullRequest: null,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("shell-screen-context-domain", () => {
  it("reads workspace selection context only for workspace selections", () => {
    const homeSelection: ShellSelection = { kind: "home" };
    const workspaceSelection: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };

    expect(readSelectedWorkspaceContext(homeSelection)).toBeNull();
    expect(readSelectedWorkspaceContext(workspaceSelection)).toEqual({
      organizationId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
  });

  it("resolves current node id only when the persisted node still exists", () => {
    expect(
      resolveCurrentNodeId({
        currentNodes: [createNode()],
        currentOrganizationId: "org-1",
        selectedNodeIdByOrganization: { "org-1": "node-1" },
      }),
    ).toBe("node-1");

    expect(
      resolveCurrentNodeId({
        currentNodes: [createNode()],
        currentOrganizationId: "org-1",
        selectedNodeIdByOrganization: { "org-1": "node-missing" },
      }),
    ).toBeNull();
  });

  it("filters recent terminals by organization and node", () => {
    const terminals = [
      createTerminal({ id: "terminal-1", nodeId: "node-1", orgId: "org-1" }),
      createTerminal({ id: "terminal-2", nodeId: "node-2", orgId: "org-1" }),
      createTerminal({ id: "terminal-3", nodeId: "node-1", orgId: "org-2" }),
    ];

    expect(
      filterRecentTerminalsByScope({
        currentNodeId: "node-1",
        currentOrganizationId: "org-1",
        recentTerminals: terminals,
      }).map((terminal) => terminal.id),
    ).toEqual(["terminal-1"]);
  });

  it("filters workspace terminal maps by active node without dropping terminals that omit node id", () => {
    const terminalsByWorkspaceId = {
      "workspace-1": [
        createTerminal({ id: "terminal-1", nodeId: "node-1" }),
        createTerminal({ id: "terminal-2", nodeId: "node-2" }),
        createTerminal({ id: "terminal-3", nodeId: null }),
      ],
    };

    const filteredTerminalsByWorkspaceId = filterTerminalsByWorkspaceIdForNode({
      currentNodeId: "node-1",
      terminalsByWorkspaceId,
    });

    expect(filteredTerminalsByWorkspaceId["workspace-1"]?.map((terminal) => terminal.id)).toEqual([
      "terminal-1",
      "terminal-3",
    ]);
  });

  it("resolves selected workspace from project workspace maps", () => {
    expect(
      resolveSelectedWorkspace({
        selectedWorkspaceContext: {
          organizationId: "org-1",
          projectId: "project-1",
          workspaceId: "workspace-1",
        },
        workspacesByProjectId: {
          "project-1": [createWorkspace()],
        },
      })?.id,
    ).toBe("workspace-1");
  });

  it("reads workspace label from the primary terminal subtitle", () => {
    expect(
      readWorkspaceLabelFromPrimaryTerminal(
        {
          "workspace-1": [createTerminal({ subtitle: "base" })],
        },
        "workspace-1",
      ),
    ).toBe("base");
  });
});
