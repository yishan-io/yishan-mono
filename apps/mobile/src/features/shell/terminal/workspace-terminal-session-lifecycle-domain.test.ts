import { describe, expect, it } from "vitest";

import type { TerminalItem } from "../state/shell.types";
import {
  readWorkspaceTerminalSessionLifecycleEvent,
  reconcileWorkspaceTerminalSessionLifecycleEvent,
} from "./workspace-terminal-session-lifecycle-domain";

function createTerminal(
  input: Partial<TerminalItem> &
    Pick<TerminalItem, "id" | "label" | "orgId" | "projectId" | "updatedAt" | "workspaceId">,
): TerminalItem {
  return {
    ...input,
  };
}

describe("workspace-terminal-session-lifecycle-domain", () => {
  const workspace = {
    id: "workspace-1",
    nodeId: "node-1",
    organizationId: "org-1",
    projectId: "project-1",
  };
  const t = () => "Terminal";

  it("reads one terminal lifecycle event from the shared frontend stream", () => {
    expect(
      readWorkspaceTerminalSessionLifecycleEvent({
        payload: {
          action: "created",
          paneId: "pane-1",
          pid: 123,
          sessionId: "session-1",
          startedAt: "2026-06-18T00:00:00.000Z",
          status: "running",
          tabId: "terminal-1",
          workspaceId: "workspace-1",
        },
        topic: "terminalSessionChanged",
        type: "event",
      }),
    ).toEqual({
      action: "created",
      paneId: "pane-1",
      pid: 123,
      sessionId: "session-1",
      startedAt: "2026-06-18T00:00:00.000Z",
      status: "running",
      tabId: "terminal-1",
      workspaceId: "workspace-1",
    });
  });

  it("ignores non-terminal frontend event topics", () => {
    expect(
      readWorkspaceTerminalSessionLifecycleEvent({
        payload: {
          id: "evt-1",
          title: "Finished",
        },
        topic: "notificationEvent",
        type: "event",
      }),
    ).toBeNull();
  });

  it("binds a created backend session back to an optimistic local terminal by tab id", () => {
    const result = reconcileWorkspaceTerminalSessionLifecycleEvent({
      event: {
        action: "created",
        pid: 123,
        sessionId: "session-1",
        status: "running",
        tabId: "terminal-local-1",
        workspaceId: "workspace-1",
      },
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
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.terminalIdsToRemove).toEqual([]);
    expect(result.nextTerminalIds).toEqual(["terminal-local-1"]);
    expect(result.terminalsToUpsert[0]).toMatchObject({
      id: "terminal-local-1",
      importedFromBackend: undefined,
      label: "New terminal",
      session: {
        sessionId: "session-1",
        tabId: "terminal-local-1",
      },
    });
  });

  it("creates one mirrored terminal when backend opens a new session without a local owner", () => {
    const result = reconcileWorkspaceTerminalSessionLifecycleEvent({
      event: {
        action: "created",
        pid: 123,
        sessionId: "session-1",
        startedAt: "2026-06-18T00:00:00.000Z",
        status: "running",
        workspaceId: "workspace-1",
      },
      localTerminals: [],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.nextTerminalIds).toEqual(["terminal-session-session-1"]);
    expect(result.terminalsToUpsert[0]).toMatchObject({
      id: "terminal-session-session-1",
      importedFromBackend: true,
      session: {
        sessionId: "session-1",
      },
    });
  });

  it("removes one local terminal when the backend destroys its session", () => {
    const result = reconcileWorkspaceTerminalSessionLifecycleEvent({
      event: {
        action: "destroyed",
        pid: 123,
        sessionId: "session-1",
        status: "exited",
        workspaceId: "workspace-1",
      },
      localTerminals: [
        createTerminal({
          id: "terminal-1",
          importedFromBackend: true,
          label: "Terminal",
          orgId: "org-1",
          projectId: "project-1",
          session: {
            sessionId: "session-1",
            status: "running",
            workspaceId: "workspace-1",
          },
          updatedAt: "2026-06-16T09:00:00.000Z",
          workspaceId: "workspace-1",
        }),
      ],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.nextTerminalIds).toEqual([]);
    expect(result.terminalIdsToRemove).toEqual(["terminal-1"]);
    expect(result.terminalsToUpsert).toEqual([]);
  });

  it("does not emit a selection side effect while a preview tab owns focus", () => {
    const result = reconcileWorkspaceTerminalSessionLifecycleEvent({
      event: {
        action: "created",
        pid: 123,
        sessionId: "session-1",
        startedAt: "2026-06-18T00:00:00.000Z",
        status: "running",
        workspaceId: "workspace-1",
      },
      localTerminals: [],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.nextTerminalIds).toEqual(["terminal-session-session-1"]);
  });

  it("ignores a stale created event when the tab is already bound to another running session", () => {
    const result = reconcileWorkspaceTerminalSessionLifecycleEvent({
      event: {
        action: "created",
        pid: 123,
        sessionId: "session-old",
        status: "running",
        tabId: "terminal-local-1",
        workspaceId: "workspace-1",
      },
      localTerminals: [
        createTerminal({
          id: "terminal-local-1",
          label: "New terminal",
          orgId: "org-1",
          projectId: "project-1",
          session: {
            sessionId: "session-current",
            status: "running",
            tabId: "terminal-local-1",
            workspaceId: "workspace-1",
          },
          updatedAt: "2026-06-16T09:00:00.000Z",
          workspaceId: "workspace-1",
        }),
      ],
      t,
      workspace,
      workspaceLabel: "local",
    });

    expect(result.changed).toBe(false);
    expect(result.terminalIdsToRemove).toEqual([]);
    expect(result.terminalsToUpsert).toEqual([]);
  });
});
