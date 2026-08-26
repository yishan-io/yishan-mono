import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../state/agentChatStore";
import { parseDSHFrontendPayload } from "./dshTranscript";
import { type DSHTranscriptActions, DSHTranscriptController } from "./dshTranscriptController";

export function setup() {
  const actions: DSHTranscriptActions = {
    replaceMessages: vi.fn(),
    updateStreamingMessage: vi.fn(),
    clearStreamingMessage: vi.fn(),
    setSessionState: vi.fn(),
    setSessionError: vi.fn(),
    setDSHTranscriptRetryAvailable: vi.fn(),
    setTurnActive: vi.fn(),
  };
  return {
    actions,
    controller: new DSHTranscriptController(
      "tab",
      "session",
      actions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        incarnation: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      }),
      () => {},
    ),
  };
}
const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.clearAllMocks();
});

export function handleFixtureEvents(controller: DSHTranscriptController): void {
  const events: unknown[] = JSON.parse(readFileSync(new URL("./fixtures/dshRc2Events.json", import.meta.url), "utf8"));
  for (const event of events) {
    const payload = parseDSHFrontendPayload({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      incarnation: "inc",
      update: { event: { sessionId: "session", seq: (event as { seq: number }).seq, event } },
    });
    expect(payload).not.toBeNull();
    if (payload) controller.handle(payload);
  }
}

export function event(seq: number) {
  return {
    sessionId: "session",
    tabId: "tab",
    workspaceId: "workspace",
    incarnation: "inc",
    update: {
      event: {
        type: "user/message",
        seq,
        time: seq,
        data: {
          message: { id: `u${seq}`, role: "user", content: [{ type: "text", text: "hi" }], source: { kind: "user" } },
        },
        surfaceOp: "append" as const,
      },
    },
  };
}

export { agentChatStore, parseDSHFrontendPayload, DSHTranscriptController };
export type { DSHTranscriptActions };
