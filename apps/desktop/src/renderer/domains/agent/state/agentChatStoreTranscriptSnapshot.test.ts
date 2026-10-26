import { castDraft, isDraft, produce } from "immer";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as retention from "../chat/agentChatRetention";
import type { AgentMessage } from "../chat/agentChatTypes";
import * as presentation from "../chat/transcript/presentation";
import * as composition from "../chat/transcript/session";
import * as snapshots from "../chat/transcript/subagentSnapshots";
import { createAgentChatSession } from "./agentChatStoreSession";
import { refreshSessionTranscript, registerLiveMessage } from "./agentChatStoreTranscript";

// Inspect at the helper boundary, before produce revokes any proxies. Spies always run real helpers.
function hasDraft(value: unknown): boolean {
  if (isDraft(value)) return true;
  if (value instanceof Map) return [...value].some(([key, entry]) => hasDraft(key) || hasDraft(entry));
  if (value instanceof Set) return [...value].some(hasDraft);
  return value !== null && typeof value === "object" && Object.values(value).some(hasDraft);
}

function observeInputs() {
  const boundaries: { helper: string; hasDraft: boolean }[] = [];
  const compositions: { ids: string[]; stream: string | undefined; liveIds: string[]; update: number }[] = [];
  const realCompose = composition.composeSessionTranscript;
  vi.spyOn(composition, "composeSessionTranscript").mockImplementation((...args) => {
    boundaries.push({ helper: "compose", hasDraft: hasDraft(args) });
    compositions.push({
      ids: args[1].map((message) => message.id),
      stream: args[2]?.id,
      liveIds: Object.keys(args[3]),
      update: args[0].update,
    });
    return realCompose(...args);
  });
  const realTrim = retention.trimSessionMessages;
  vi.spyOn(retention, "trimSessionMessages").mockImplementation((...args) => {
    boundaries.push({ helper: "retention", hasDraft: hasDraft(args) });
    return realTrim(...args);
  });
  const realUsage = presentation.getTranscriptContextTokens;
  vi.spyOn(presentation, "getTranscriptContextTokens").mockImplementation((...args) => {
    boundaries.push({ helper: "usage", hasDraft: hasDraft(args) });
    return realUsage(...args);
  });
  const realProject = presentation.projectTranscript;
  vi.spyOn(presentation, "projectTranscript").mockImplementation((...args) => {
    boundaries.push({ helper: "presentation", hasDraft: hasDraft(args) });
    return realProject(...args);
  });
  const realActivity = snapshots.refreshSubagentSnapshotActivity;
  vi.spyOn(snapshots, "refreshSubagentSnapshotActivity").mockImplementation((...args) => {
    boundaries.push({ helper: "activity", hasDraft: hasDraft(args) });
    return realActivity(...args);
  });
  return { boundaries, compositions };
}

const owner: AgentMessage = {
  id: "owner",
  role: "assistant",
  content: [{ type: "toolCall", id: "call", name: "read", arguments: { path: "before" } }],
};

afterEach(() => vi.restoreAllMocks());

describe("current transaction plain transcript inputs", () => {
  it("preserves modified nested live, runtime, stream, usage and cached facts without draft reads", () => {
    const base = createAgentChatSession("session");
    base.messages = [owner];
    base.subagentSnapshots = snapshots.composeSubagentSnapshots(
      { child: [{ id: "child-answer", role: "assistant", content: "child" }] },
      {},
      base.transcript,
      null,
      { child: { status: "running", coverage: { completeness: "unknown", omittedMessages: 0, reasons: [] } } },
    );
    const observed = observeInputs();
    const next = produce(base, (session) => {
      const message = session.messages[0];
      if (!message || !Array.isArray(message.content) || message.content[0]?.type !== "toolCall") {
        throw new Error("Expected tool owner");
      }
      message.content[0].arguments.path = "current";
      message.usage = { input: 300, output: 21, totalTokens: 321 };
      session.state = "running";
      session.isTurnActive = true;
      session.streamingMessage = { id: "stream", role: "assistant", content: "current stream" };
      registerLiveMessage(session, "owner", true);
      registerLiveMessage(session, "stream", false);
      session.transcript.toolCalls.set(
        "session",
        new Map([
          [
            "call",
            {
              sessionId: "session",
              callId: "call",
              executionState: "running",
              runtimeExecution: {
                state: "running",
                source: { id: "runtime", origin: "live", isFinal: false, priority: 3 },
              },
            },
          ],
        ]),
      );
      const childMessage = session.subagentSnapshots.child?.messages[0];
      if (!childMessage) throw new Error("Expected cached child message");
      childMessage.content = "current child";
      session.subagentSessionEndedAtMs = 900;
      refreshSessionTranscript(session);
    });
    expect(next.transcript.toolCalls.get("session")?.get("call")).toMatchObject({
      owner: { arguments: { path: "current" }, source: { origin: "live", isFinal: true } },
      executionState: "running",
      runtimeExecution: { source: { id: "runtime" } },
    });
    expect(next.transcript.rows.at(-1)).toMatchObject({
      kind: "turn",
      turn: { isWorking: true, summary: { text: "current stream" } },
    });
    expect(next.presentation.contextTokens).toBe(321);
    expect(next.subagentSnapshots.child).toMatchObject({
      activity: "interrupted",
      messages: [{ content: "current child" }],
    });
    expect(base.messages[0]).toEqual(owner);
    expect(observed.compositions[0]).toEqual({
      ids: ["owner"],
      stream: "stream",
      liveIds: ["owner", "stream"],
      update: base.transcript.update,
    });
    expect(observed.boundaries.map((entry) => entry.helper)).toEqual(
      expect.arrayContaining(["compose", "retention", "usage", "presentation", "activity"]),
    );
    expect(observed.boundaries.filter((entry) => entry.hasDraft)).toEqual([]);
  });

  it("composes before trimming and recomposes from retained raw/live/stream inputs with ownership intact", () => {
    const base = createAgentChatSession("session");
    base.messages = [
      owner,
      ...Array.from(
        { length: retention.MAX_MESSAGES_PER_TAB - 1 },
        (_, index): AgentMessage => ({
          id: `user-${index}`,
          role: "user",
          content: "x",
        }),
      ),
    ];
    const observed = observeInputs();
    const next = produce(base, (session) => {
      session.streamingMessage = { id: "result", role: "toolResult", toolCallId: "call", content: "ok" };
      registerLiveMessage(session, "owner", true);
      registerLiveMessage(session, "result", false);
      session.rendererFinalAssistantIds.owner = true;
      session.rendererFinalToolCallAssistantIds.owner = true;
      refreshSessionTranscript(session, new Set(["result"]));
    });
    // The split owner/result component is removed, not reinterpreted as an orphan history result.
    expect(next.messages).toHaveLength(retention.MAX_MESSAGES_PER_TAB - 1);
    expect(next.streamingMessage).toBeNull();
    expect(next.transcriptLiveSources).toEqual({});
    expect(next.rendererFinalAssistantIds).toEqual({});
    expect(next.rendererFinalToolCallAssistantIds).toEqual({});
    expect(next.transcript.toolCalls.size).toBe(0);
    expect(next.transcript.rows).toHaveLength(next.messages.length);
    expect(next.presentation.rows).toHaveLength(next.messages.length);
    expect(observed.compositions).toHaveLength(2);
    expect(observed.compositions[0]).toMatchObject({
      stream: "result",
      liveIds: ["owner", "result"],
      update: base.transcript.update,
    });
    expect(observed.compositions[0]?.ids[0]).toBe("owner");
    expect(observed.compositions[1]).toEqual({
      ids: next.messages.map((message) => message.id),
      stream: undefined,
      liveIds: [],
      update: base.transcript.update + 1,
    });
    expect(observed.boundaries.filter((entry) => entry.hasDraft)).toEqual([]);
  });

  it("accepts plain sessions and preserves error interruption and ownerless runtime policy", () => {
    const session = createAgentChatSession("session");
    session.subagentSnapshots = snapshots.composeSubagentSnapshots(
      { child: [{ id: "answer", role: "assistant", content: "child" }] },
      {},
      session.transcript,
      null,
      { child: { status: "running", coverage: { completeness: "unknown", omittedMessages: 0, reasons: [] } } },
    );
    session.state = "error";
    session.transcript = {
      ...session.transcript,
      toolCalls: new Map([
        [
          "session",
          new Map([
            [
              "orphan",
              {
                sessionId: "session",
                callId: "orphan",
                executionState: "running",
                runtimeExecution: {
                  state: "running",
                  source: { id: "runtime", origin: "live", isFinal: false, priority: 3 },
                },
              },
            ],
          ]),
        ],
      ]),
    };
    const observed = observeInputs();
    refreshSessionTranscript(castDraft(session), undefined, false);
    expect(session.transcript.toolCalls.size).toBe(0);
    expect(session.subagentSnapshots.child?.activity).toBe("interrupted");
    expect(observed.boundaries.filter((entry) => entry.hasDraft)).toEqual([]);
  });
});
