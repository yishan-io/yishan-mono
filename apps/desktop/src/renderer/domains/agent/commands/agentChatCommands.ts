import { bindAgentChatTabRuntime, tabStore } from "@renderer/domains/workbench";
import type { AgentChatSessionView } from "@renderer/domains/workbench";
import { delay } from "@shared/async/delay";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { generateId } from "@shared/ids/generateId";
import { projectDshLineageSubagents } from "../chat/agentChatDshLineage";
import { isAgentSessionBusy } from "../chat/agentChatTypes";
import {
  getAgentCapabilities,
  listAgentSessionLineage,
  listDSHProviders,
  renamePiCompatibilitySession,
  sendPiCompatibilityCommand,
} from "../daemon/daemonAgentProcedures";
import type { AgentRuntime, AgentSessionLineageResult } from "../daemon/daemonAgentTypes";
import { flushAgentChatStreamBuffer } from "../runtime/agentChatStreamBuffer";
import { normalizeAgentChatRuntime, selectNewAgentChatRuntime } from "../runtime/agentRuntimeSelection";
import {
  abortAgentSession,
  clearPiSessionHandle,
  ensureAgentSession,
  ensurePiSession,
  fetchPiAgentMessagesCompatibility,
  fetchPiAgentModelsCompatibility,
  fetchPiAgentStateCompatibility,
  findTabWithSession,
  promptAgentSession,
  reattachPiSession,
  recoverAgentSessionAfterReconnect as recoverAgentSessionRuntimeAfterReconnect,
  retryDSHTranscript,
  stopAgentSession,
  stopPiSession,
} from "../runtime/agentSessionRuntime";
import { agentChatStore } from "../state/agentChatStore";
import { isHydrated, selectFinishedSubagents } from "../state/agentChatStoreSession";
import { refreshAgentSessionStats as refreshPiAgentSessionStatsCompatibility } from "../subscriptions/agentChatPiEventShared";

// ─── Session lifecycle (delegates to AgentSessionRuntime) ───────────────────
// The Runtime owns Pi session handles, start/attach/stop/reopen races, and the
// state-hydration sends. These command wrappers keep the public command surface
// stable for UI callers and the AgentCommands contract.

export {
  ensurePiSession,
  findTabWithSession,
  clearPiSessionHandle,
  reattachPiSession,
  retryDSHTranscript,
  stopAgentSession,
  stopPiSession,
};
export { fetchPiAgentStateCompatibility, fetchPiAgentMessagesCompatibility, fetchPiAgentModelsCompatibility };

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
  runtime?: AgentRuntime;
  sessionView: AgentChatSessionView;
  paneId?: string;
  subagentParentSessionId?: string;
}): Promise<void> {
  const isReadOnlySubagentDetail = opts.sessionView === "subagent-detail";
  const { runtime, capabilities: resolvedCapabilities } = await resolveAgentChatRuntime(opts);
  bindAgentChatTabRuntime({ tabId: opts.tabId, runtime });

  if (isReadOnlySubagentDetail) {
    const childSessionId = opts.sessionId?.trim() || opts.tabId;
    const parentTabId = opts.subagentParentSessionId
      ? findTabWithSession(opts.subagentParentSessionId, "pi")
      : undefined;
    const parentSession = parentTabId ? agentChatStore.getState().sessionsByTabId[parentTabId] : undefined;
    const initialMessages = parentSession?.subagentLiveTranscripts[childSessionId] ?? [];
    const isChildFinished = selectFinishedSubagents(parentSession).some(
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
    // For DSH: read currentModel BEFORE ensureAgentSession calls initSession (which clears it).
    // Tab data has the user's persisted selection; session state may not be loaded yet.
    const dshSelection =
      runtime === "dsh"
        ? (() => {
            const tab = tabStore.getState().tabs.find((t) => t.id === opts.tabId);
            const persisted = tab?.kind === "agent-chat" ? tab.data.dshSelectedModelId : undefined;
            const current = agentChatStore.getState().sessionsByTabId[opts.tabId]?.currentModel;
            return {
              modelId: persisted ?? current?.id,
              providerId:
                tab?.kind === "agent-chat" ? (tab.data.dshSelectedProviderId ?? current?.provider) : current?.provider,
            };
          })()
        : undefined;
    const { sessionId: startedSessionId, attached } = await ensureAgentSession({
      runtime,
      tabId: opts.tabId,
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
      sessionId: opts.sessionId,
      sessionView: opts.sessionView,
      paneId: opts.paneId,
      dshModelId: dshSelection?.modelId,
      dshProviderId: dshSelection?.providerId,
    });

    const session = agentChatStore.getState().sessionsByTabId[opts.tabId];
    const isSessionLoaded = session?.sessionId === startedSessionId && isHydrated(session);
    if (isSessionLoaded) {
      // React remounts reuse the live session handle. Its snapshot is still in
      // the store, so only reconnect recovery should explicitly rehydrate it.
      return;
    }

    // A fresh process means the previous owner is gone: any sub-agent rows
    // started before this moment are interrupted history, not live runs.
    // An attach means the process is still alive, so rows stay live.
    agentChatStore.getState().setSubagentSessionEndedAt(opts.tabId, attached ? null : Date.now());

    if (runtime === "pi") {
      await fetchPiAgentStateCompatibility({ tabId: opts.tabId, sessionId: startedSessionId });
      await fetchPiAgentMessagesCompatibility({ tabId: opts.tabId, sessionId: startedSessionId });
      await fetchPiAgentModelsCompatibility({ tabId: opts.tabId, sessionId: startedSessionId });
      await refreshPiAgentSessionStatsCompatibility(startedSessionId);
    } else {
      const session = agentChatStore.getState().sessionsByTabId[opts.tabId];
      agentChatStore.getState().replaceMessages(opts.tabId, session?.messages ?? []);
      agentChatStore.getState().setAvailableModels(opts.tabId, []);
      agentChatStore.getState().markStateLoaded(opts.tabId);
      if (agentChatStore.getState().sessionsByTabId[opts.tabId]?.state === "starting") {
        agentChatStore.getState().setSessionState(opts.tabId, "idle");
      }
      // Load Pi models (shared credentials system) and set currentModel from DSH capabilities.
      void loadDSHSessionModels(opts.tabId, resolvedCapabilities);
    }

    if (runtime === "dsh" && opts.sessionView === "full") {
      // fire-and-forget: lineage is supplementary and must not delay session hydration.
      void refreshDshSubagentLineage({
        tabId: opts.tabId,
        workspaceId: opts.workspaceId,
        cwd: opts.cwd,
        rootSessionId: startedSessionId,
      });
    }
  } catch (error) {
    agentChatStore.getState().initSession(opts.tabId, opts.sessionId?.trim() || opts.tabId);
    agentChatStore.getState().setSessionError(opts.tabId, getErrorMessage(error));
  }
}

/** Populates the DSH model selector from the runtime-owned provider catalog. */
export async function loadDSHSessionModels(
  tabId: string,
  cachedCapabilities?: Awaited<ReturnType<typeof getAgentCapabilities>>,
): Promise<void> {
  try {
    const [catalog, capabilities] = await Promise.all([
      listDSHProviders(),
      cachedCapabilities ? Promise.resolve(cachedCapabilities) : getAgentCapabilities(),
    ]);
    const models = catalog.providers
      .filter((provider) => provider.configured)
      .flatMap((provider) =>
        provider.models.map((model) => ({
          id: model.id,
          name: model.name,
          provider: provider.id,
          providerName: provider.displayName,
          ...(provider.credentialRef ? { credentialRef: provider.credentialRef } : {}),
        })),
      );
    const tab = tabStore.getState().tabs.find((candidate) => candidate.id === tabId);
    const selectedProvider = tab?.kind === "agent-chat" ? tab.data.dshSelectedProviderId?.trim() : undefined;
    const selectedModel = tab?.kind === "agent-chat" ? tab.data.dshSelectedModelId?.trim() : undefined;
    const hasExplicitSelection = Boolean(selectedProvider && selectedModel);
    const selectedProviderId = selectedProvider?.toLowerCase();
    const selectedModelId = selectedModel || undefined;
    const directDeepSeekProviderId = "deepseek-official";
    const persistedModel = selectedModelId
      ? models.find(
          (model) =>
            model.id === selectedModelId &&
            model.provider?.trim().toLowerCase() === (selectedProviderId ?? directDeepSeekProviderId),
        )
      : undefined;
    const configuredProvider = capabilities.dsh.provider?.trim().toLowerCase();
    const configuredModel = capabilities.dsh.model?.trim();
    const currentModel =
      persistedModel ??
      (!selectedModelId
        ? (models.find(
            (model) => model.id === configuredModel && model.provider?.trim().toLowerCase() === configuredProvider,
          ) ?? models[0])
        : undefined) ??
      null;

    agentChatStore.getState().setAvailableModels(tabId, models);
    agentChatStore.getState().setCurrentModel(tabId, currentModel);
    if (hasExplicitSelection && !persistedModel) {
      agentChatStore
        .getState()
        .setTurnError(tabId, `Selected DSH model is unavailable: ${selectedProvider}/${selectedModel}.`);
    }
  } catch (error) {
    agentChatStore.getState().setAvailableModels(tabId, []);
    agentChatStore.getState().setTurnError(tabId, getErrorMessage(error));
  }
}

export async function refreshDshSubagentLineage(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  rootSessionId: string;
}): Promise<AgentSessionLineageResult | null> {
  if (!isCurrentDshLineageParent(opts.tabId, opts.rootSessionId)) return null;
  const generation = agentChatStore.getState().beginDshSubagentLineageRefresh(opts.tabId, opts.rootSessionId);
  if (generation === null) return null;

  try {
    const lineage = await listAgentSessionLineage({
      runtime: "dsh",
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
      rootSessionId: opts.rootSessionId,
      mode: "children",
    });
    if (!isCurrentDshLineageParent(opts.tabId, opts.rootSessionId)) return null;
    agentChatStore.getState().applyDshSubagentLineageRefresh({
      tabId: opts.tabId,
      parentSessionId: opts.rootSessionId,
      generation,
      rows: projectDshLineageSubagents(lineage),
    });
    return lineage;
  } catch (error) {
    console.warn("Failed to refresh DSH subagent lineage", getErrorMessage(error));
    return null;
  }
}

/** Checks that a tab still owns the DSH parent session requested by lineage refresh. */
function isCurrentDshLineageParent(tabId: string, parentSessionId: string): boolean {
  const tab = tabStore.getState().tabs.find((candidate) => candidate.id === tabId);
  return tab?.kind === "agent-chat" && tab.data.runtime === "dsh" && tab.data.sessionId === parentSessionId;
}

/** Recovers a session and refreshes DSH lineage only after a usable parent recovery. */
export async function recoverAgentSessionAfterReconnect(
  opts: Parameters<typeof recoverAgentSessionRuntimeAfterReconnect>[0],
): Promise<void> {
  await recoverAgentSessionRuntimeAfterReconnect(opts);
  const session = agentChatStore.getState().sessionsByTabId[opts.tabId];
  const tab = tabStore.getState().tabs.find((candidate) => candidate.id === opts.tabId);
  const runtime = opts.runtime ?? (tab?.kind === "agent-chat" ? tab.data.runtime : undefined) ?? "pi";
  if (runtime !== "dsh" || opts.sessionView === "subagent-detail" || !session || session.state === "error") {
    return;
  }

  // fire-and-forget: lineage is supplementary and must not delay reconnect recovery.
  void refreshDshSubagentLineage({
    tabId: opts.tabId,
    workspaceId: opts.workspaceId,
    cwd: opts.cwd,
    rootSessionId: opts.sessionId,
  });
}

/** Resolves explicit and persisted identity before querying capabilities for a new top-level tab. */
async function resolveAgentChatRuntime(opts: {
  runtime?: AgentRuntime;
  sessionId?: string;
  sessionView: AgentChatSessionView;
}): Promise<{ runtime: AgentRuntime; capabilities?: Awaited<ReturnType<typeof getAgentCapabilities>> }> {
  if (opts.runtime || opts.sessionId || opts.sessionView === "subagent-detail") {
    return { runtime: normalizeAgentChatRuntime(opts) };
  }
  try {
    const capabilities = await getAgentCapabilities();
    return { runtime: selectNewAgentChatRuntime(capabilities), capabilities };
  } catch {
    return { runtime: "pi" };
  }
}

/** Sends a prompt command to the pi session. */
export async function sendAgentPrompt(opts: {
  tabId: string;
  sessionId: string;
  message: string;
}): Promise<void> {
  const tabSession = agentChatStore.getState().sessionsByTabId[opts.tabId];

  const isBusy = isAgentSessionBusy(tabSession?.state);
  await promptAgentSession({
    tabId: opts.tabId,
    sessionId: opts.sessionId,
    message: opts.message,
    streamingBehavior: isBusy ? "steer" : undefined,
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

  await abortAgentSession(opts.tabId, opts.sessionId);
}

/** Manually compacts the current Pi session context. */
export async function compactAgent(opts: { sessionId: string }): Promise<void> {
  await sendPiCompatibilityCommand({
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

  await sendPiCompatibilityCommand({
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
    await fetchPiAgentModelsCompatibility({ tabId, sessionId });

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
    await fetchPiAgentStateCompatibility({ tabId, sessionId: restartedSessionId });
    await fetchPiAgentMessagesCompatibility({ tabId, sessionId: restartedSessionId });
    await fetchPiAgentModelsCompatibility({ tabId, sessionId: restartedSessionId });
    await refreshPiAgentSessionStatsCompatibility(restartedSessionId);
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
export {
  fetchAgentSessionFilePath,
  fetchSessionHistory,
  listActivePiSessions,
  listAgentSessionHistory,
  readAgentSessionHistory,
} from "./agentChatSessionHistory";

import { resolveChatFilePath } from "@renderer/domains/files";
// ─── Chat-to-file tab bridge (desktop6-adjust.md W5) ───────────────────────
// Opening a file referenced from chat is an Agent workflow: resolve the path
// through the Files feature, then open a Workbench Tab through the public
// Workbench API.
import { openTab, openTabInOppositePane } from "@renderer/domains/workbench";
import { enqueueWorkspaceErrorNotice } from "@renderer/domains/workspace";

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
  const runtime = tab?.kind === "agent-chat" ? (tab.data.runtime ?? "pi") : undefined;
  if (!sessionId || runtime !== "pi") {
    return;
  }
  await renamePiCompatibilitySession({ sessionId, title });
}
