import { tabStore } from "@renderer/domains/workbench";
import type { AgentChatSessionView } from "../../../domains/workbench/model/types";
import { delay } from "../../../helpers/delay";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { generateId } from "../../../helpers/generateId";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { refreshAgentSessionStats } from "../events/agentChatPiEventShared";
import { agentChatStore } from "../model/agentChatStore";
import { isAgentSessionBusy } from "../model/agentChatTypes";
import { flushAgentChatStreamBuffer } from "../runtime/agentChatStreamBuffer";
import {
  clearPiSessionHandle,
  ensurePiSession,
  fetchAgentMessages,
  fetchAgentModels,
  fetchAgentState,
  findTabWithSession,
  reattachPiSession,
  recoverAgentSessionAfterReconnect,
  stopPiSession,
} from "../runtime/agentSessionRuntime";

// ─── Session lifecycle (delegates to AgentSessionRuntime) ───────────────────
// The Runtime owns Pi session handles, start/attach/stop/reopen races, and the
// state-hydration sends. These command wrappers keep the public command surface
// stable for UI callers and the AgentCommands contract.

export { ensurePiSession, findTabWithSession, clearPiSessionHandle, reattachPiSession, stopPiSession };
export { fetchAgentState, fetchAgentMessages, fetchAgentModels, recoverAgentSessionAfterReconnect };

/**
 * Starts one agent-chat session for a tab and hydrates its state. Handles the
 * read-only subagent-detail fast path (transcript streamed from the parent)
 * and classifies pre-existing rows as interrupted when a fresh process starts.
 */
export async function startAgentChatSession(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  sessionView: AgentChatSessionView;
  paneId?: string;
  subagentParentSessionId?: string;
}): Promise<void> {
  const isReadOnlySubagentDetail = opts.sessionView === "subagent-detail";

  if (isReadOnlySubagentDetail) {
    const childSessionId = opts.sessionId?.trim() || opts.tabId;
    const parentTabId = opts.subagentParentSessionId ? findTabWithSession(opts.subagentParentSessionId) : undefined;
    const parentSession = parentTabId ? agentChatStore.getState().sessionsByTabId[parentTabId] : undefined;
    const initialMessages = parentSession?.subagentLiveTranscripts[childSessionId] ?? [];
    const isChildFinished = parentSession?.finishedSubagents.some(
      (subagent) => subagent.childSessionId === childSessionId,
    );
    const isParentTrackingChild =
      !isChildFinished &&
      Boolean(
        parentSession?.subagentLiveTranscripts[childSessionId] ||
          parentSession?.subagentProgressTargets.some((target) => target.childSessionId === childSessionId),
      );

    if (isParentTrackingChild) {
      agentChatStore.getState().initSession(opts.tabId, childSessionId);
      agentChatStore.getState().replaceMessages(opts.tabId, initialMessages);
      agentChatStore.getState().setAvailableModels(opts.tabId, []);
      agentChatStore.getState().markStateLoaded(opts.tabId);
      return;
    }
  }

  try {
    const { sessionId: startedSessionId, attached } = await ensurePiSession({
      tabId: opts.tabId,
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
      sessionId: opts.sessionId,
      sessionView: opts.sessionView,
      paneId: opts.paneId,
    });

    // A fresh process means the previous owner is gone: any sub-agent rows
    // started before this moment are interrupted history, not live runs.
    // An attach means the process is still alive, so rows stay live.
    agentChatStore.getState().setSubagentSessionEndedAt(opts.tabId, attached ? null : Date.now());

    await fetchAgentState({ tabId: opts.tabId, sessionId: startedSessionId });
    await fetchAgentMessages({ tabId: opts.tabId, sessionId: startedSessionId });
    await fetchAgentModels({ tabId: opts.tabId, sessionId: startedSessionId });
    await refreshAgentSessionStats(startedSessionId);
  } catch (error) {
    agentChatStore.getState().initSession(opts.tabId, opts.tabId);
    agentChatStore.getState().setSessionError(opts.tabId, getErrorMessage(error));
  }
}

/** Sends a prompt command to the pi session. */
export async function sendAgentPrompt(opts: {
  tabId: string;
  sessionId: string;
  message: string;
}): Promise<void> {
  const client = await getDaemonClient();
  const tabSession = agentChatStore.getState().sessionsByTabId[opts.tabId];

  const isBusy = isAgentSessionBusy(tabSession?.state);
  await client.pi.send({
    sessionId: opts.sessionId,
    command: {
      type: "prompt",
      message: opts.message,
      streamingBehavior: isBusy ? "steer" : undefined,
    },
  });

  agentChatStore.getState().clearTurnError(opts.tabId);
  if (isBusy) {
    return;
  }

  if (!agentChatStore.getState().sessionsByTabId[opts.tabId]?.streamingMessage) {
    agentChatStore.getState().updateStreamingMessage(opts.tabId, {
      id: generateId(),
      role: "assistant",
      content: [],
      startedAtMs: Date.now(),
    });
  }
  agentChatStore.getState().setSessionState(opts.tabId, "running");
}

/** Aborts the current agent operation. */
export async function abortAgent(opts: { tabId: string; sessionId: string }): Promise<void> {
  flushAgentChatStreamBuffer(opts.tabId);

  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "abort" },
  });
}

/** Manually compacts the current Pi session context. */
export async function compactAgent(opts: { sessionId: string }): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "compact" },
  });
}

/** Sends one response to a pending RPC extension UI request. */
export async function respondToAgentExtensionUiRequest(opts: {
  tabId: string;
  sessionId: string;
  requestId: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
}): Promise<void> {
  const client = await getDaemonClient();
  const command: Record<string, unknown> = {
    type: "extension_ui_response",
    id: opts.requestId,
  };

  if (opts.cancelled === true) {
    command.cancelled = true;
  } else if (typeof opts.confirmed === "boolean") {
    command.confirmed = opts.confirmed;
  } else {
    command.value = opts.value ?? "";
  }

  await client.pi.send({
    sessionId: opts.sessionId,
    command,
  });
  agentChatStore.getState().clearPendingUiRequest(opts.tabId);
}

const PROVIDER_VISIBLE_WAIT_MS = 1_500;
const PROVIDER_VISIBLE_POLL_MS = 100;
const PROVIDER_VISIBLE_POLL_ITERATIONS = Math.ceil(PROVIDER_VISIBLE_WAIT_MS / PROVIDER_VISIBLE_POLL_MS);

/**
 * Restarts one Pi session after a provider save when the new provider's models
 * stay invisible to the live session. Preserves the session id so history
 * resumes; never restarts a busy session or a session that is no longer the one
 * the provider was saved into.
 */
export async function restartAgentSessionForProvider(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  sessionId: string;
  providerId: string;
}): Promise<void> {
  const { tabId, workspaceId, cwd, paneId, sessionId, providerId } = opts;
  let restartAttempted = false;
  try {
    await fetchAgentModels({ tabId, sessionId });

    // fetchAgentModels resolves on the pi.send ack, before the
    // get_available_models response event populates the store, so poll the
    // store briefly instead of reading it synchronously.
    const previousSessionId = sessionId;
    const normalizedProviderId = providerId.trim().toLowerCase();
    let providerVisible = false;
    for (let attempt = 0; attempt < PROVIDER_VISIBLE_POLL_ITERATIONS; attempt += 1) {
      const models = agentChatStore.getState().sessionsByTabId[tabId]?.availableModels ?? [];
      if (models.some((model) => model.provider?.trim().toLowerCase() === normalizedProviderId)) {
        providerVisible = true;
        break;
      }
      await delay(PROVIDER_VISIBLE_POLL_MS);
    }
    if (providerVisible) {
      return;
    }

    // Re-check live state right before the restart: a turn may have started or
    // the tab may have closed during the poll. Never kill a running turn, and
    // never restart a session that is no longer the one the provider was saved
    // into.
    const liveSession = agentChatStore.getState().sessionsByTabId[tabId];
    const tabStillOpen = tabStore.getState().tabs.find((tab) => tab.id === tabId)?.kind === "agent-chat";
    if (!tabStillOpen || liveSession?.sessionId !== previousSessionId || isAgentSessionBusy(liveSession?.state)) {
      return;
    }

    restartAttempted = true;
    await stopPiSession(tabId);
    const { sessionId: restartedSessionId } = await ensurePiSession({
      tabId,
      workspaceId,
      cwd,
      sessionId: previousSessionId,
      paneId,
    });
    await fetchAgentState({ tabId, sessionId: restartedSessionId });
    await fetchAgentMessages({ tabId, sessionId: restartedSessionId });
    await fetchAgentModels({ tabId, sessionId: restartedSessionId });
    await refreshAgentSessionStats(restartedSessionId);
  } catch (error) {
    const message = getErrorMessage(error);
    const sessionExists = Boolean(agentChatStore.getState().sessionsByTabId[tabId]);
    if (restartAttempted && sessionExists) {
      // The restart failed mid-way; escalate to the session error UI so the tab
      // is recoverable instead of stuck unloaded.
      agentChatStore.getState().setSessionError(tabId, message);
    } else {
      agentChatStore.getState().setTurnError(tabId, message);
    }
  }
}

// ─── Session history ─────────────────────────────────────────────────────────
// Moved to agentChatSessionHistory.ts; re-exported to preserve the public API.
export { fetchAgentSessionFilePath, fetchSessionHistory, listActivePiSessions } from "./agentChatSessionHistory";

// ─── Chat-to-file tab bridge (desktop6-adjust.md W5) ───────────────────────
// Opening a file referenced from chat is an Agent workflow: resolve the path
// through the Files feature, then open a Workbench Tab through the public
// Workbench API.
import { openTab, openTabInOppositePane } from "@renderer/domains/workbench";
import { resolveChatFilePath } from "../../files/commands/fileCommands";
import { enqueueWorkspaceErrorNotice } from "../../workspace/state/workspaceActions";

/**
 * Opens one file referenced from chat, resolving it to a real workspace file first.
 *
 * When the referenced path does not exist (agents sometimes emit unreal paths),
 * a best-effort search is attempted; if no unique real file is found the user is
 * notified instead of opening a tab with mock content.
 */
export async function openChatFileTab(input: {
  workspaceId: string;
  relativePath: string;
  oppositePane?: boolean;
}): Promise<void> {
  const resolved = await resolveChatFilePath({ workspaceId: input.workspaceId, relativePath: input.relativePath });
  if (resolved.status === "unavailable") {
    enqueueWorkspaceErrorNotice({
      title: "Unable to open file",
      message: `Could not load ${input.relativePath}. Please try again.`,
    });
    return;
  }
  if (resolved.status === "not-found") {
    enqueueWorkspaceErrorNotice({
      title: "File not found",
      message: `${input.relativePath} does not exist in this workspace.`,
    });
    return;
  }

  const tabInput = {
    kind: "file" as const,
    workspaceId: input.workspaceId,
    path: resolved.path,
    content: resolved.content,
  };
  if (input.oppositePane) {
    openTabInOppositePane(tabInput);
  } else {
    openTab(tabInput);
  }
}

/**
 * Renames the daemon-side pi session that backs one agent-chat tab.
 * Workbench Tab renames stay presentation-only; the session rename side effect
 * belongs to the Agent module (desktop6-adjust.md W6 task 2).
 */
export async function renameAgentChatSessionByTab(tabId: string, title: string): Promise<void> {
  const tab = tabStore.getState().tabs.find((tab) => tab.id === tabId);
  const sessionId = tab?.kind === "agent-chat" ? tab.data.sessionId?.trim() : undefined;
  if (!sessionId) {
    return;
  }
  const client = await getDaemonClient();
  await client.pi.rename({ sessionId, title });
}
