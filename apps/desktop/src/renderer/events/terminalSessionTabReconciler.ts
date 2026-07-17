import type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import { type DesktopAgentKind, isDesktopAgentKind } from "../helpers/agentSettings";
import { getErrorMessage } from "../helpers/errorHelpers";
import {
  consumeExplicitlyClosedTerminalTabId,
  recordExplicitlyClosedTerminalTabId,
} from "../helpers/terminalCloseTombstones";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";

type TerminalTab = Extract<ReturnType<typeof tabStore.getState>["tabs"][number], { kind: "terminal" }>;
type TerminalSessionChangedPayload = RpcFrontendMessagePayload<"terminalSessionChanged">;

type TerminalSessionTabReconcilerDependencies = {
  closeTerminalSession?: (sessionId: string) => Promise<void>;
  clearTerminalAgentStatus: (tabId: string) => void;
};

/** Reconciles one backend terminal-session lifecycle event into terminal tab state. */
export function reconcileTerminalSessionChanged(
  payload: TerminalSessionChangedPayload,
  dependencies: TerminalSessionTabReconcilerDependencies,
): void {
  const tabState = tabStore.getState();

  if (payload.action === "created") {
    const existingSessionTab = tabState.tabs.find(
      (tab): tab is TerminalTab => tab.kind === "terminal" && tab.data.sessionId === payload.sessionId,
    );
    if (existingSessionTab) {
      applyLifecycleMetadataToTerminalTab(existingSessionTab, payload);
      return;
    }

    const requestedTabId = normalizeOptionalText(payload.tabId);
    if (requestedTabId) {
      if (consumeExplicitlyClosedTerminalTabId(requestedTabId)) {
        void dependencies.closeTerminalSession?.(payload.sessionId).catch((error) => {
          console.warn(
            "[terminalSessionTabReconciler] Failed to clean up orphan terminal session after local close",
            payload.sessionId,
            getErrorMessage(error),
          );
        });
        return;
      }

      const requestedTerminalTab = tabState.tabs.find(
        (tab): tab is TerminalTab =>
          tab.id === requestedTabId && tab.workspaceId === payload.workspaceId && tab.kind === "terminal",
      );
      if (requestedTerminalTab) {
        tabState.setTerminalTabSessionId(requestedTabId, payload.sessionId);
        applyLifecycleMetadataToTerminalTab(requestedTerminalTab, payload);
        return;
      }
    }

    const workspaces = workspaceStore.getState().workspaces;
    if (!workspaces.some((workspace) => workspace.id === payload.workspaceId)) {
      return;
    }

    tabState.openTab({
      workspaceId: payload.workspaceId,
      kind: "terminal",
      title: normalizeOptionalText(payload.title) ?? "Terminal",
      sessionId: payload.sessionId,
      tabId: requestedTabId,
      paneId: normalizeOptionalText(payload.paneId),
      agentKind: resolveDesktopAgentKind(payload.agentKind),
      reuseExisting: false,
    });
    return;
  }

  const matchingTab = tabState.tabs.find(
    (tab): tab is TerminalTab => tab.kind === "terminal" && tab.data.sessionId === payload.sessionId,
  );
  if (matchingTab) {
    recordExplicitlyClosedTerminalTabId(matchingTab.id);
    dependencies.clearTerminalAgentStatus(matchingTab.id);
    tabState.closeTab(matchingTab.id);
  }
}

function applyLifecycleMetadataToTerminalTab(tab: TerminalTab, payload: TerminalSessionChangedPayload): void {
  const nextTitle = normalizeOptionalText(payload.title);
  if (nextTitle && !tab.data.userRenamed && tab.title !== nextTitle) {
    tabStore.getState().renameTab(tab.id, nextTitle);
  }

  const nextAgentKind = resolveDesktopAgentKind(payload.agentKind);
  if (tab.data.agentKind !== nextAgentKind) {
    tabStore.getState().setTerminalTabAgentKind(tab.id, nextAgentKind);
  }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolveDesktopAgentKind(value: string | undefined): DesktopAgentKind | undefined {
  const normalized = normalizeOptionalText(value);
  return normalized && isDesktopAgentKind(normalized) ? normalized : undefined;
}
