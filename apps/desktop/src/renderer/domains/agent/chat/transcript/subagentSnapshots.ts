import { trimSubagentLiveTranscripts } from "../agentChatRetention";
import type { AgentMessage } from "../agentChatTypes";
import { createTranscriptState } from "./compose";
import { getTranscriptContextTokens, projectTranscript } from "./presentation";
import { composeSessionTranscript } from "./session";
import type { SubagentSnapshot, SubagentSnapshotOptions } from "./subagentSnapshots.types";
import type { TranscriptState } from "./types";

/** Builds raw and model windows from the same association-safe retention result. */
export function composeSubagentSnapshots(
  transcripts: Record<string, AgentMessage[]>,
  previous: Record<string, SubagentSnapshot>,
  parent: TranscriptState,
  endedAtMs: number | null,
  metadata: SubagentSnapshotOptions["metadata"] = {},
): Record<string, SubagentSnapshot> {
  const retained = trimSubagentLiveTranscripts(transcripts);
  return Object.fromEntries(
    Object.entries(retained).map(([childSessionId, messages]) => {
      const prior = previous[childSessionId];
      const reported = metadata[childSessionId];
      const lost = (transcripts[childSessionId]?.length ?? 0) - messages.length;
      const coverage = reported?.coverage ?? {
        completeness: "unknown" as const,
        omittedMessages: 0,
        reasons: [],
      };
      const status = reported?.status;
      const activity = resolveActivity(parent, endedAtMs, childSessionId, status, prior?.activity);
      const transcript = composeSessionTranscript(
        prior?.transcript ??
          createTranscriptState({ sessionId: childSessionId, namespace: `child:${childSessionId}`, seed: 0 }),
        messages,
        null,
        {},
        activity === "running",
        false,
        false,
      );
      const snapshot: SubagentSnapshot = {
        childSessionId,
        messages,
        transcript,
        presentation: projectTranscript(transcript, { contextTokens: getTranscriptContextTokens(messages) }),
        activity,
        status,
        thinkingLevel: reported?.thinkingLevel ?? prior?.thinkingLevel,
        model: reported?.model ?? prior?.model,
        coverage: {
          completeness: lost > 0 ? "partial" : coverage.completeness,
          omittedMessages: coverage.omittedMessages + lost,
          reasons: lost > 0 ? [...new Set([...coverage.reasons, "cacheRetention" as const])] : [...coverage.reasons],
        },
      };
      return [childSessionId, snapshot];
    }),
  );
}

function resolveActivity(
  parent: TranscriptState,
  endedAtMs: number | null,
  childSessionId: string,
  status: SubagentSnapshot["status"],
  previous?: SubagentSnapshot["activity"],
): SubagentSnapshot["activity"] {
  const child = parent.childRuns?.get(childSessionId);
  if (child?.isComplete) return "terminal";
  if (child?.state === "running") return "running";
  if (child) return "unknown";
  if (endedAtMs !== null && (status === "running" || previous === "running")) return "interrupted";
  return endedAtMs === null && status === "running" ? "running" : "unknown";
}

/** Refreshes only changed activity, preserving the retained window and all unchanged projections. */
export function refreshSubagentSnapshotActivity(
  snapshots: Record<string, SubagentSnapshot>,
  parent: TranscriptState,
  endedAtMs: number | null,
  isParentError = false,
): Record<string, SubagentSnapshot> {
  let next = snapshots;
  for (const [childSessionId, snapshot] of Object.entries(snapshots)) {
    const resolved = resolveActivity(parent, endedAtMs, childSessionId, snapshot.status, snapshot.activity);
    const activity = isParentError && resolved !== "terminal" ? "interrupted" : resolved;
    if (snapshot.activity === activity) continue;
    if (next === snapshots) next = { ...snapshots };
    const transcript = composeSessionTranscript(
      snapshot.transcript,
      snapshot.messages,
      null,
      {},
      activity === "running",
      false,
      false,
    );
    next[childSessionId] = {
      ...snapshot,
      activity,
      transcript,
      presentation: projectTranscript(transcript, { contextTokens: getTranscriptContextTokens(snapshot.messages) }),
    };
  }
  return next;
}
