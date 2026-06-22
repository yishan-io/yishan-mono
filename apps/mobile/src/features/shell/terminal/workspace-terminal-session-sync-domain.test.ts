import { describe, expect, it } from "vitest";

import type { WorkspaceTerminalSession } from "@/features/workspaces/workspaces.types";
import type { TerminalItem } from "../state/shell.types";
import {
  reconcileWorkspaceTerminalSessionSync,
  resolveWorkspaceTerminalSessionSyncReset,
  shouldAutoSyncWorkspaceTerminalSession,
} from "./workspace-terminal-session-sync-domain";

function createSession(sessionId: string, startedAt: string): WorkspaceTerminalSession {
  return {
    paneId: "pane-1",
    pid: 101,
    sessionId,
    startedAt,
    status: "running",
    tabId: `terminal-session-${sessionId}`,
    workspaceId: "workspace-1",
  };
}

function createTerminal(
  input: Partial<TerminalItem> &
    Pick<TerminalItem, "id" | "label" | "orgId" | "projectId" | "updatedAt" | "workspaceId">,
): TerminalItem {
  return {
    ...input,
  };
}

describe("workspace-terminal-session-sync-domain", () => {
  const workspace = {
    id: "workspace-1",
    nodeId: "node-1",
    organizationId: "org-1",
    projectId: "project-1",
  };
  const t = () => "Terminal";

  it("preserves existing local id, label, and rename state for matched sessions", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [
        createTerminal({
          id: "local-terminal-1",
          importedFromBackend: true,
          label: "Custom Label",
          orgId: "org-1",
          projectId: "project-1",
          session: { sessionId: "session-1", status: "running", workspaceId: "workspace-1" },
          updatedAt: "2026-06-16T09:00:00.000Z",
          userRenamed: true,
          workspaceId: "workspace-1",
        }),
      ],
      sessions: [createSession("session-1", "2026-06-16T10:00:00.000Z")],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.syncedTerminals).toHaveLength(1);
    expect(result.syncedTerminals[0]).toMatchObject({
      id: "local-terminal-1",
      label: "Custom Label",
      userRenamed: true,
    });
  });

  it("matches a freshly started local terminal by backend tab id before session hydration completes", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [
        createTerminal({
          id: "terminal-local-1",
          label: "New terminal",
          orgId: "org-1",
          projectId: "project-1",
          session: null,
          updatedAt: "2026-06-16T09:00:00.000Z",
          workspaceId: "workspace-1",
        }),
      ],
      sessions: [
        {
          ...createSession("session-1", "2026-06-16T10:00:00.000Z"),
          tabId: "terminal-local-1",
        },
      ],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.syncedTerminalIds).toEqual(["terminal-local-1"]);
    expect(result.syncedTerminals[0]).toMatchObject({
      id: "terminal-local-1",
      label: "New terminal",
      session: {
        sessionId: "session-1",
        tabId: "terminal-local-1",
      },
    });
  });

  it("uses the backend tab id for a mirrored terminal when no local owner exists yet", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [],
      sessions: [
        {
          ...createSession("session-1", "2026-06-16T10:00:00.000Z"),
          tabId: "terminal-local-1",
        },
      ],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.syncedTerminalIds).toEqual(["terminal-local-1"]);
    expect(result.syncedTerminals[0]).toMatchObject({
      id: "terminal-local-1",
      importedFromBackend: true,
      session: {
        sessionId: "session-1",
        tabId: "terminal-local-1",
      },
    });
  });

  it("refreshes mirrored terminal labels after restore when the local tab is backend-imported", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [
        createTerminal({
          createdAt: "2026-06-16T09:00:00.000Z",
          id: "terminal-session-session-1",
          label: "New terminal",
          orgId: "org-1",
          projectId: "project-1",
          session: { sessionId: "session-1", status: "running", workspaceId: "workspace-1" },
          updatedAt: "2026-06-16T09:00:00.000Z",
          workspaceId: "workspace-1",
        }),
      ],
      sessions: [createSession("session-1", "2026-06-16T10:00:00.000Z")],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.syncedTerminals[0]).toMatchObject({
      id: "terminal-session-session-1",
      importedFromBackend: true,
    });
    expect(result.syncedTerminals[0]?.label.startsWith("Terminal ")).toBe(true);
  });

  it("keeps the latest synced terminal first when the current selection is missing", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [],
      sessions: [
        createSession("session-older", "2026-06-16T09:00:00.000Z"),
        createSession("session-latest", "2026-06-16T10:00:00.000Z"),
      ],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.syncedTerminalIds[0]).toBe("terminal-session-session-latest");
  });

  it("removes stale mirrored terminals during refresh sync", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [
        createTerminal({
          id: "terminal-stale",
          importedFromBackend: true,
          label: "Stale",
          orgId: "org-1",
          projectId: "project-1",
          session: { sessionId: "session-stale", status: "running", workspaceId: "workspace-1" },
          updatedAt: "2026-06-16T09:00:00.000Z",
          workspaceId: "workspace-1",
        }),
      ],
      sessions: [createSession("session-fresh", "2026-06-16T10:00:00.000Z")],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.terminalIdsToRemove).toEqual(["terminal-stale"]);
  });

  it("removes restored mirrored terminal-session ids when the backend refresh no longer reports them", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [
        createTerminal({
          id: "terminal-session-stale",
          label: "Stale",
          orgId: "org-1",
          projectId: "project-1",
          session: { sessionId: "session-stale", status: "running", workspaceId: "workspace-1" },
          updatedAt: "2026-06-16T09:00:00.000Z",
          workspaceId: "workspace-1",
        }),
      ],
      sessions: [createSession("session-fresh", "2026-06-16T10:00:00.000Z")],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.terminalIdsToRemove).toEqual(["terminal-session-stale"]);
  });

  it("removes a selected stale imported terminal when no replacement session exists", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [
        createTerminal({
          id: "terminal-stale",
          importedFromBackend: true,
          label: "Stale",
          orgId: "org-1",
          projectId: "project-1",
          session: { sessionId: "session-stale", status: "running", workspaceId: "workspace-1" },
          updatedAt: "2026-06-16T09:00:00.000Z",
          workspaceId: "workspace-1",
        }),
      ],
      sessions: [],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.terminalIdsToRemove).toEqual(["terminal-stale"]);
  });

  it("removes a local terminal tab when its bound backend session no longer exists", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [
        createTerminal({
          id: "terminal-local-1",
          label: "Draft terminal",
          orgId: "org-1",
          projectId: "project-1",
          session: { sessionId: "session-local", status: "running", workspaceId: "workspace-1" },
          updatedAt: "2026-06-16T09:00:00.000Z",
          workspaceId: "workspace-1",
        }),
      ],
      sessions: [],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.terminalIdsToRemove).toEqual(["terminal-local-1"]);
  });

  it("filters suppressed sessions out of the sync plan", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [],
      sessions: [
        createSession("session-visible", "2026-06-16T10:00:00.000Z"),
        createSession("session-suppressed", "2026-06-16T11:00:00.000Z"),
      ],
      suppressedSessionIds: new Set(["session-suppressed"]),
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.syncedTerminals).toHaveLength(1);
    expect(result.syncedTerminals[0]?.session?.sessionId).toBe("session-visible");
  });

  it("does not emit a selection side effect while a preview tab owns focus", () => {
    const result = reconcileWorkspaceTerminalSessionSync({
      localTerminals: [],
      sessions: [createSession("session-latest", "2026-06-16T10:00:00.000Z")],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.syncedTerminalIds[0]).toBe("terminal-session-session-latest");
  });

  it("auto-syncs a workspace only once until the selection changes", () => {
    expect(
      shouldAutoSyncWorkspaceTerminalSession({
        lastSyncedWorkspaceKey: null,
        workspaceKey: "org-1:project-1:workspace-1",
      }),
    ).toBe(true);

    expect(
      shouldAutoSyncWorkspaceTerminalSession({
        lastSyncedWorkspaceKey: "org-1:project-1:workspace-1",
        workspaceKey: "org-1:project-1:workspace-1",
      }),
    ).toBe(false);

    expect(
      shouldAutoSyncWorkspaceTerminalSession({
        lastSyncedWorkspaceKey: "org-1:project-1:workspace-1",
        workspaceKey: "org-1:project-1:workspace-2",
      }),
    ).toBe(true);
  });

  it("holds the last synced workspace key while selection is temporarily detached", () => {
    expect(
      resolveWorkspaceTerminalSessionSyncReset({
        accessToken: "token",
        enabled: true,
        status: "authenticated",
        workspaceKey: null,
      }),
    ).toEqual({
      nextWorkspaceKey: null,
      shouldReset: false,
    });
  });

  it("resets auto-sync state when auth can no longer drive terminal sync", () => {
    expect(
      resolveWorkspaceTerminalSessionSyncReset({
        accessToken: null,
        enabled: true,
        status: "authenticated",
        workspaceKey: "org-1:project-1:workspace-1",
      }),
    ).toEqual({
      nextWorkspaceKey: null,
      shouldReset: true,
    });

    expect(
      resolveWorkspaceTerminalSessionSyncReset({
        accessToken: "token",
        enabled: false,
        status: "authenticated",
        workspaceKey: "org-1:project-1:workspace-1",
      }),
    ).toEqual({
      nextWorkspaceKey: null,
      shouldReset: true,
    });
  });
});
