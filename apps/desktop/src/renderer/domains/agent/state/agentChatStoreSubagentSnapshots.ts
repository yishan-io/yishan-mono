import { type Draft, castDraft } from "immer";
import { getTranscriptContextTokens, projectTranscript } from "../chat/transcript/presentation";
import { composeSessionTranscript } from "../chat/transcript/session";
import { composeSubagentSnapshots, refreshSubagentSnapshotActivity } from "../chat/transcript/subagentSnapshots";
import type { SubagentSnapshotOptions } from "../chat/transcript/subagentSnapshots.types";
import type { AgentChatStoreState } from "./agentChatStore";
import type { AgentChatSessionData } from "./agentChatStoreSession";
import { mergeAgentChatUsageLedgerHistory } from "./agentChatUsageLedger";

function applyDetailSnapshot(
  detail: Draft<AgentChatSessionData> | undefined,
  parent: Draft<AgentChatSessionData> | undefined,
  childSessionId: string,
): void {
  if (!detail || !parent || detail === parent || detail.sessionId !== childSessionId) return;
  const binding = detail.subagentSnapshotBinding;
  if (binding && (binding.parentSessionId !== parent.sessionId || binding.childSessionId !== childSessionId)) return;
  const snapshot = parent.subagentSnapshots[childSessionId];
  const isKnownTerminal =
    parent.transcript.childRuns?.get(childSessionId)?.isComplete ||
    parent.finishedSubagents.some((child) => child.childSessionId === childSessionId) ||
    snapshot?.activity === "terminal" ||
    snapshot?.activity === "interrupted" ||
    parent.state === "error";
  if (!binding && isKnownTerminal) return;
  if (!snapshot) return;
  detail.usageLedger = mergeAgentChatUsageLedgerHistory(
    detail.usageLedger,
    snapshot.messages,
    !detail.hasLoadedMessages,
  );
  detail.messages = snapshot.messages;
  detail.transcript = snapshot.transcript;
  detail.presentation = snapshot.presentation;
  detail.subagentSnapshotCoverage = snapshot.coverage;
  detail.subagentSnapshotBinding = { parentSessionId: parent.sessionId, childSessionId };
  detail.currentModel = snapshot.model ?? detail.currentModel;
  detail.thinkingLevel = snapshot.thinkingLevel ?? detail.thinkingLevel;
  detail.hasLoadedMessages = true;
  detail.streamingMessage = null;
  detail.activeCoreTurnAssistantId = null;
  detail.transcriptLiveSources = {};
  detail.rendererFinalAssistantIds = {};
  detail.rendererFinalToolCallAssistantIds = {};
  detail.pendingHistoryRequest = null;
  detail.state = snapshot.activity === "running" ? "running" : "idle";
  detail.isTurnActive = snapshot.activity === "running";
}

/** Owns bounded raw/model mutations without a runtime store dependency. */
export function createSubagentSnapshotActions(
  set: (recipe: (state: Draft<AgentChatStoreState>) => void) => void,
): Pick<AgentChatStoreState, "setSubagentLiveTranscripts" | "applySubagentDetailSnapshot"> {
  return {
    applySubagentDetailSnapshot: (detailTabId, parentTabId, childSessionId) => {
      set((state) =>
        applyDetailSnapshot(state.sessionsByTabId[detailTabId], state.sessionsByTabId[parentTabId], childSessionId),
      );
    },
    setSubagentLiveTranscripts: (tabId, transcripts, options: SubagentSnapshotOptions = {}) => {
      const owned = structuredClone(transcripts);
      const metadata = structuredClone(options.metadata);
      set((state) => {
        const parent = state.sessionsByTabId[tabId];
        if (!parent) return;
        const snapshots = composeSubagentSnapshots(
          owned,
          parent.subagentSnapshots,
          parent.transcript,
          parent.subagentSessionEndedAtMs,
          metadata,
        );
        parent.subagentSnapshots = castDraft(
          refreshSubagentSnapshotActivity(
            snapshots,
            parent.transcript,
            parent.subagentSessionEndedAtMs,
            parent.state === "error",
          ),
        );
        parent.subagentLiveTranscripts = Object.fromEntries(
          Object.entries(parent.subagentSnapshots).map(([id, snapshot]) => [id, snapshot.messages]),
        );
        synchronizeSubagentSnapshotDetails(state.sessionsByTabId, parent);
        for (const target of options.detailTargets ?? []) {
          if (
            target.sessionView !== "subagent-detail" ||
            (target.subagentParentSessionId && target.subagentParentSessionId !== parent.sessionId)
          )
            continue;
          applyDetailSnapshot(state.sessionsByTabId[target.tabId], parent, target.childSessionId);
        }
      });
    },
  };
}

/** Stops a bound live view without fabricating child completion or losing its last retained body. */
export function stopSubagentSnapshotDetail(detail: Draft<AgentChatSessionData>): void {
  detail.subagentSnapshotBinding = null;
  if (!detail.isTurnActive && detail.state !== "running") return;
  detail.state = "idle";
  detail.isTurnActive = false;
  detail.transcript = castDraft(
    composeSessionTranscript(detail.transcript, detail.messages, null, {}, false, false, false),
  );
  detail.presentation = castDraft(
    projectTranscript(detail.transcript, { contextTokens: getTranscriptContextTokens(detail.messages) }),
  );
}

/** Synchronizes only same-store, previously bound detail sessions. */
export function synchronizeSubagentSnapshotDetails(
  sessions: Draft<Record<string, AgentChatSessionData>>,
  parent: Draft<AgentChatSessionData>,
): void {
  for (const detail of Object.values(sessions)) {
    const binding = detail.subagentSnapshotBinding;
    if (!binding || binding.parentSessionId !== parent.sessionId) continue;
    const snapshot = parent.subagentSnapshots[binding.childSessionId];
    if (snapshot) {
      // Avoid re-merging history on unrelated parent deltas.
      if (detail.transcript !== snapshot.transcript) applyDetailSnapshot(detail, parent, binding.childSessionId);
    } else {
      stopSubagentSnapshotDetail(detail);
    }
  }
}
