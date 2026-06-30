import { describe, expect, it } from "vitest";

import type { ShellSelection, TerminalItem } from "./shell.types";
import { readSelectedWorkspaceContext, resolveShellRuntimeAuthority } from "./shellRuntimeAuthority";

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

describe("shellRuntimeAuthority", () => {
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

  it("returns null authority when the selection is not a workspace", () => {
    expect(
      resolveShellRuntimeAuthority({
        activeTerminalId: "terminal-1",
        selectedNodeIdByOrganization: {},
        selection: { kind: "home" },
        terminalsByWorkspaceId: {
          "workspace-1": [createTerminal()],
        },
      }),
    ).toEqual({
      selectedTerminal: null,
      selectedTerminalId: null,
      selectedTerminalWorkspace: null,
      selectedWorkspaceContext: null,
      selectedWorkspaceLabel: null,
    });
  });

  it("resolves terminal authority only from the selected workspace runtime terminals", () => {
    const authority = resolveShellRuntimeAuthority({
      activeTerminalId: "terminal-2",
      selectedNodeIdByOrganization: {},
      selection: {
        kind: "workspace",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      },
      terminalsByWorkspaceId: {
        "workspace-1": [
          createTerminal({ id: "terminal-1", nodeId: "node-1", subtitle: "base" }),
          createTerminal({ id: "terminal-2", nodeId: "node-2", subtitle: "base" }),
        ],
        "workspace-2": [createTerminal({ id: "terminal-2", workspaceId: "workspace-2" })],
      },
    });

    expect(authority.selectedTerminal?.workspaceId).toBe("workspace-1");
    expect(authority.selectedTerminal?.nodeId).toBe("node-2");
    expect(authority.selectedTerminalWorkspace).toEqual({
      id: "workspace-1",
      nodeId: "node-2",
      organizationId: "org-1",
      projectId: "project-1",
    });
    expect(authority.selectedWorkspaceLabel).toBe("base");
  });

  it("falls back to the primary terminal for workspace node and label when no terminal is active", () => {
    const authority = resolveShellRuntimeAuthority({
      activeTerminalId: null,
      selectedNodeIdByOrganization: {},
      selection: {
        kind: "workspace",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      },
      terminalsByWorkspaceId: {
        "workspace-1": [createTerminal({ id: "terminal-1", nodeId: "node-1", subtitle: "local" })],
      },
    });

    expect(authority.selectedTerminal).toBeNull();
    expect(authority.selectedTerminalId).toBeNull();
    expect(authority.selectedTerminalWorkspace).toEqual({
      id: "workspace-1",
      nodeId: "node-1",
      organizationId: "org-1",
      projectId: "project-1",
    });
    expect(authority.selectedWorkspaceLabel).toBe("local");
  });

  it("falls back to the persisted selected node when the workspace has no local terminals yet", () => {
    const authority = resolveShellRuntimeAuthority({
      activeTerminalId: null,
      selectedNodeIdByOrganization: { "org-1": "node-7" },
      selection: {
        kind: "workspace",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      },
      terminalsByWorkspaceId: {},
    });

    expect(authority.selectedTerminal).toBeNull();
    expect(authority.selectedTerminalWorkspace).toEqual({
      id: "workspace-1",
      nodeId: "node-7",
      organizationId: "org-1",
      projectId: "project-1",
    });
  });
});
