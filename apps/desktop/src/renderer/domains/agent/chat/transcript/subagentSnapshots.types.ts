import type { AgentMessage, AgentModel } from "../agentChatTypes";
import type { TranscriptDisplay } from "./presentation.types";
import type { TranscriptState } from "./types";

/** Local evidence only: sender omissions and per-field truncation remain unknown. */
export type SubagentSnapshotCoverage = {
  completeness: "unknown" | "partial";
  omittedMessages: number;
  reasons: ("messageLimit" | "association" | "invalidMessage" | "cacheRetention")[];
};

/** Validated live child transcript and its explicitly reported metadata. */
export type SubagentLiveTranscript = {
  childSessionId: string;
  messages: AgentMessage[];
  thinkingLevel?: string;
  model?: AgentModel;
  status?: "queued" | "starting" | "running";
  coverage: SubagentSnapshotCoverage;
};

/** One bounded child window and its snapshot-only projection. */
export type SubagentSnapshot = SubagentLiveTranscript & {
  transcript: TranscriptState;
  presentation: TranscriptDisplay;
  activity: "unknown" | "running" | "terminal" | "interrupted";
};

/** Receiver-selected detail identity; no workbench reads inside store mutations. */
export type SubagentDetailTarget = {
  tabId: string;
  childSessionId: string;
  sessionView: string;
  subagentParentSessionId?: string;
};

/** Optional parser metadata and explicitly selected detail receivers. */
export type SubagentSnapshotOptions = {
  metadata?: Record<string, Omit<SubagentLiveTranscript, "messages" | "childSessionId">>;
  detailTargets?: SubagentDetailTarget[];
};
