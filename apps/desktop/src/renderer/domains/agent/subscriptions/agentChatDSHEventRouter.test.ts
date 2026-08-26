// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgentChatDSHEventRouter } from "./agentChatDSHEventRouter";
import { type DSHTranscriptActions, DSHTranscriptController } from "./dshTranscriptController";

const mocks = vi.hoisted(() => ({
  listeners: new Set<(envelope: { method: string; payload: unknown }) => void>(),
  subscribeDesktopRpcEvent: vi.fn(),
}));

vi.mock("../daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: mocks.subscribeDesktopRpcEvent,
}));

beforeEach(() => {
  mocks.listeners.clear();
  mocks.subscribeDesktopRpcEvent.mockReset();
  mocks.subscribeDesktopRpcEvent.mockImplementation(
    (listener: (envelope: { method: string; payload: unknown }) => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    },
  );
});

afterEach(() => vi.clearAllMocks());

function emitDSHEvent(payload: unknown): void {
  for (const listener of mocks.listeners) listener({ method: "agent.dsh.event", payload });
}

const validEnvelope = {
  sessionId: "session-a",
  tabId: "tab-a",
  workspaceId: "workspace-a",
  incarnation: "inc-a",
};

describe("agentChatDSHEventRouter", () => {
  it("routes malformed known DSH payloads to a matching tab/session fail-closed handler", () => {
    const onEvent = vi.fn();
    const onMalformedPayload = vi.fn();
    const dispose = registerAgentChatDSHEventRouter({
      ...validEnvelope,
      onEvent,
      onMalformedPayload,
    });

    emitDSHEvent({
      ...validEnvelope,
      update: {
        event: {
          sessionId: "session-a",
          seq: 0,
          event: { type: "turn/start", seq: 0, time: 0, data: {} },
        },
      },
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(onMalformedPayload).toHaveBeenCalledOnce();
    dispose();
  });

  it("starts durable recovery when a matching malformed payload reaches the controller", async () => {
    const loader = vi.fn().mockResolvedValue({
      session: { sessionId: "session-a", createdAt: 0 },
      events: [],
      incarnation: "inc-a",
      asOfSeq: -1,
      durableThroughSeq: -1,
    });
    const actions: DSHTranscriptActions = {
      replaceMessages: vi.fn(),
      updateStreamingMessage: vi.fn(),
      clearStreamingMessage: vi.fn(),
      setSessionState: vi.fn(),
      setSessionError: vi.fn(),
      setDSHTranscriptRetryAvailable: vi.fn(),
      setTurnActive: vi.fn(),
    };
    const controller = new DSHTranscriptController("tab-a", "session-a", actions, loader, () => {});
    const dispose = registerAgentChatDSHEventRouter({
      ...validEnvelope,
      onEvent: (payload) => controller.handle(payload),
      onMalformedPayload: () => controller.handleMalformedPayload(),
    });

    emitDSHEvent({ ...validEnvelope, update: null });

    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    dispose();
  });

  it("does not route malformed payloads across a tab or session boundary", () => {
    const onMalformedPayload = vi.fn();
    const dispose = registerAgentChatDSHEventRouter({ ...validEnvelope, onEvent: vi.fn(), onMalformedPayload });

    emitDSHEvent({ ...validEnvelope, sessionId: "session-b", update: null });
    emitDSHEvent({ ...validEnvelope, tabId: "tab-b", update: null });

    expect(onMalformedPayload).not.toHaveBeenCalled();
    dispose();
  });
});
