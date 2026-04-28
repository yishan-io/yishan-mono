import type { WorkspaceTabStateSlice } from "./types";
import type { DesktopAgentKind } from "../../helpers/agentSettings";

/** Creates an optimistic session tab and marks it selected for its workspace. */
export function createSessionTabOptimisticState(input: {
  state: WorkspaceTabStateSlice;
  workspaceId: string;
  tabId: string;
  title: string;
  agentKind: DesktopAgentKind;
}): Partial<WorkspaceTabStateSlice> {
  return {
    tabs: [
      ...input.state.tabs,
      {
        id: input.tabId,
        workspaceId: input.workspaceId,
        title: input.title,
        pinned: false,
        kind: "session",
        data: {
          sessionId: "",
          agentKind: input.agentKind,
          isInitializing: true,
        },
      },
    ],
    selectedTabId: input.tabId,
    selectedTabIdByWorkspaceId: {
      ...input.state.selectedTabIdByWorkspaceId,
      [input.workspaceId]: input.tabId,
    },
  };
}

/** Resolves a session tab once backend session creation succeeds. */
export function resolveSessionTabState(input: {
  state: WorkspaceTabStateSlice;
  tabId: string;
  sessionId: string;
}): Partial<WorkspaceTabStateSlice> {
  return {
    tabs: input.state.tabs.map((tab) =>
      tab.id === input.tabId && tab.kind === "session"
        ? {
            ...tab,
            data: {
              ...tab.data,
              sessionId: input.sessionId,
              isInitializing: false,
            },
          }
        : tab,
    ),
  };
}

/** Clears session-tab initialization state after backend creation failure. */
export function failSessionTabInitState(state: WorkspaceTabStateSlice, tabId: string): Partial<WorkspaceTabStateSlice> {
  return {
    tabs: state.tabs.map((tab) =>
      tab.id === tabId && tab.kind === "session"
        ? {
            ...tab,
            data: {
              ...tab.data,
              isInitializing: false,
            },
          }
        : tab,
    ),
  };
}
