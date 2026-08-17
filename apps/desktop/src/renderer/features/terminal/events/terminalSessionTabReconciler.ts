import { tabStore } from "@renderer/features/workbench";
import {
  bindTerminalTabSession,
  closeTab,
  openTab,
  renameTab,
  setTerminalTabAgentKind,
} from "@renderer/features/workbench";
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import type { WorkspaceTab } from "../../../features/workbench";
import { selectWorkspaces } from "../../../features/workspace/state/workspaceSelectors";
import { type DesktopAgentKind, isDesktopAgentKind } from "../../../helpers/agentSettings";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import {
  consumeExplicitlyClosedTerminalTabId,
  recordExplicitlyClosedTerminalTabId,
} from "../../../helpers/terminalCloseTombstones";

type TerminalTab = Extract<WorkspaceTab, { kind: "terminal" }>;
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
  const tabs = tabStore.getState().tabs;

  if (payload.action === "created") {
    const existingSessionTab = tabs.find(
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

      const requestedTerminalTab = tabs.find(
        (tab): tab is TerminalTab =>
          tab.id === requestedTabId && tab.workspaceId === payload.workspaceId && tab.kind === "terminal",
      );
      if (requestedTerminalTab) {
        bindTerminalTabSession(requestedTabId, payload.sessionId);
        applyLifecycleMetadataToTerminalTab(requestedTerminalTab, payload);
        return;
      }
    }

    const workspaces = selectWorkspaces();
    if (!workspaces.some((workspace) => workspace.id === payload.workspaceId)) {
      return;
    }

    openTab({
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

  const matchingTab = tabs.find(
    (tab): tab is TerminalTab => tab.kind === "terminal" && tab.data.sessionId === payload.sessionId,
  );
  if (matchingTab) {
    recordExplicitlyClosedTerminalTabId(matchingTab.id);
    dependencies.clearTerminalAgentStatus(matchingTab.id);
    closeTab(matchingTab.id);
  }
}

function applyLifecycleMetadataToTerminalTab(tab: TerminalTab, payload: TerminalSessionChangedPayload): void {
  const nextTitle = normalizeOptionalText(payload.title);
  if (nextTitle && !tab.data.userRenamed && tab.title !== nextTitle) {
    renameTab(tab.id, nextTitle);
  }

  const nextAgentKind = resolveDesktopAgentKind(payload.agentKind);
  if (tab.data.agentKind !== nextAgentKind) {
    setTerminalTabAgentKind(tab.id, nextAgentKind);
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
