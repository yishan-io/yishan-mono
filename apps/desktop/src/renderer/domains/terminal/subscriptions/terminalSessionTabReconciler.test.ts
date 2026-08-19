// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  recordExplicitlyClosedTerminalTabId,
} from "../runtime/terminalCloseTombstones";
import { reconcileTerminalSessionChanged } from "./terminalSessionTabReconciler";

type TerminalSessionChangedPayload = RpcFrontendMessagePayload<"terminalSessionChanged">;

const initialTabState = tabStore.getState();
const initialWorkspaceState = workspaceStore.getState();

function seededWorkspace(workspaceId = "workspace-1") {
  workspaceStore.setState({
    ...workspaceStore.getState(),
    workspaces: [
      {
        id: workspaceId,
        name: "Workspace 1",
        title: "Workspace 1",
        repoId: "repo-1",
        sourceBranch: "main",
        branch: "main",
        summaryId: "summary-1",
      },
    ],
  });
}

function createPayload(overrides: Partial<TerminalSessionChangedPayload> = {}): TerminalSessionChangedPayload {
  return {
    action: "created",
    sessionId: "term-1",
    workspaceId: "workspace-1",
    tabId: "tab-1",
    paneId: "pane-tab-1",
    pid: 1234,
    status: "running",
    ...overrides,
  };
}

afterEach(() => {
  tabStore.setState(initialTabState, true);
  workspaceStore.setState(initialWorkspaceState, true);
  __resetExplicitlyClosedTerminalTabIdsForTests();
});

describe("terminalSessionTabReconciler", () => {
  it("opens a terminal tab when a created session has no matching tab", () => {
    seededWorkspace();
    const clearTerminalAgentStatus = vi.fn();

    reconcileTerminalSessionChanged(createPayload(), { clearTerminalAgentStatus });

    const tabs = tabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      kind: "terminal",
      workspaceId: "workspace-1",
      data: { sessionId: "term-1", paneId: "pane-tab-1" },
    });
    expect(clearTerminalAgentStatus).not.toHaveBeenCalled();
  });

  it("does not open a tab when the workspace is unknown", () => {
    const clearTerminalAgentStatus = vi.fn();

    reconcileTerminalSessionChanged(createPayload({ workspaceId: "workspace-unknown" }), {
      clearTerminalAgentStatus,
    });

    expect(tabStore.getState().tabs).toHaveLength(0);
  });

  it("binds a created session onto an existing terminal tab without duplicating", () => {
    seededWorkspace();
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal", paneId: "pane-tab-1" },
        },
      ],
    });
    const clearTerminalAgentStatus = vi.fn();

    reconcileTerminalSessionChanged(createPayload(), { clearTerminalAgentStatus });

    const tabs = tabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      id: "tab-1",
      kind: "terminal",
      data: { sessionId: "term-1" },
    });
  });

  it("binds a created session onto an existing tab by requested tabId", () => {
    seededWorkspace();
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "tab-9",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal", paneId: "pane-tab-1" },
        },
      ],
    });
    const clearTerminalAgentStatus = vi.fn();

    // Session arrives for tab-9 even though it was requested with a different tabId.
    reconcileTerminalSessionChanged(
      createPayload({ tabId: "tab-9", sessionId: "term-9", pid: 999, status: "running" }),
      { clearTerminalAgentStatus },
    );

    const tabs = tabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ id: "tab-9", data: { sessionId: "term-9" } });
  });

  it("closes an orphan session when the requested tab was explicitly closed locally", async () => {
    seededWorkspace();
    const clearTerminalAgentStatus = vi.fn();
    const closeTerminalSession = vi.fn(async () => undefined);
    recordExplicitlyClosedTerminalTabId("tab-closed");

    reconcileTerminalSessionChanged(createPayload({ tabId: "tab-closed", sessionId: "orphan-1" }), {
      closeTerminalSession,
      clearTerminalAgentStatus,
    });

    expect(closeTerminalSession).toHaveBeenCalledWith("orphan-1");
    expect(tabStore.getState().tabs).toHaveLength(0);
  });

  it("closes the correlated tab and clears agent status on destroy", () => {
    seededWorkspace();
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal", paneId: "pane-tab-1", sessionId: "term-1" },
        },
      ],
    });
    const clearTerminalAgentStatus = vi.fn();

    reconcileTerminalSessionChanged(createPayload({ action: "destroyed" }), { clearTerminalAgentStatus });

    expect(tabStore.getState().tabs).toHaveLength(0);
    expect(clearTerminalAgentStatus).toHaveBeenCalledWith("tab-1");
  });

  it("does nothing on destroy when no tab matches the session", () => {
    seededWorkspace();
    const clearTerminalAgentStatus = vi.fn();

    reconcileTerminalSessionChanged(createPayload({ action: "destroyed" }), { clearTerminalAgentStatus });

    expect(tabStore.getState().tabs).toHaveLength(0);
    expect(clearTerminalAgentStatus).not.toHaveBeenCalled();
  });
});
