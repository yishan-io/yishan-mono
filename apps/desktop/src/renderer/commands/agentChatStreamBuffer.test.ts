// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../store/agentChatTypes";
import {
  disposeAgentChatStreamBuffer,
  flushAgentChatStreamBuffer,
  queueAgentChatStreamMessage,
  setAgentChatStreamTabVisible,
} from "./agentChatStreamBuffer";

function buildMessage(id: string, text: string): AgentMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text }],
  };
}

afterEach(() => {
  disposeAgentChatStreamBuffer("tab-visible");
  disposeAgentChatStreamBuffer("tab-hidden");
  disposeAgentChatStreamBuffer("tab-reactivate");
  disposeAgentChatStreamBuffer("tab-flush");
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("agentChatStreamBuffer", () => {
  it("coalesces visible updates into one animation-frame flush using the latest message", () => {
    const callbacks: FrameRequestCallback[] = [];
    const flushed: AgentMessage[] = [];

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    queueAgentChatStreamMessage({
      tabId: "tab-visible",
      message: buildMessage("assistant-1", "first"),
      onFlush: (message) => flushed.push(message),
    });
    queueAgentChatStreamMessage({
      tabId: "tab-visible",
      message: buildMessage("assistant-1", "second"),
      onFlush: (message) => flushed.push(message),
    });

    expect(callbacks).toHaveLength(1);
    expect(flushed).toHaveLength(0);

    callbacks[0]?.(0);

    expect(flushed).toHaveLength(1);
    expect((flushed[0]?.content as Array<{ type: "text"; text: string }>)[0]?.text).toBe("second");
  });

  it("uses a delayed flush while the chat tab is hidden", () => {
    vi.useFakeTimers();
    const flushed: AgentMessage[] = [];

    setAgentChatStreamTabVisible("tab-hidden", false);
    queueAgentChatStreamMessage({
      tabId: "tab-hidden",
      message: buildMessage("assistant-2", "hidden"),
      onFlush: (message) => flushed.push(message),
    });

    vi.advanceTimersByTime(499);
    expect(flushed).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(flushed).toHaveLength(1);
  });

  it("flushes pending hidden updates immediately when the tab becomes visible again", () => {
    vi.useFakeTimers();
    const flushed: AgentMessage[] = [];

    setAgentChatStreamTabVisible("tab-reactivate", false);
    queueAgentChatStreamMessage({
      tabId: "tab-reactivate",
      message: buildMessage("assistant-3", "buffered"),
      onFlush: (message) => flushed.push(message),
    });

    expect(flushed).toHaveLength(0);

    setAgentChatStreamTabVisible("tab-reactivate", true);
    expect(flushed).toHaveLength(1);

    vi.advanceTimersByTime(500);
    expect(flushed).toHaveLength(1);
  });

  it("can flush pending updates synchronously on demand", () => {
    vi.useFakeTimers();
    const flushed: AgentMessage[] = [];

    setAgentChatStreamTabVisible("tab-flush", false);
    queueAgentChatStreamMessage({
      tabId: "tab-flush",
      message: buildMessage("assistant-4", "final"),
      onFlush: (message) => flushed.push(message),
    });

    flushAgentChatStreamBuffer("tab-flush");

    expect(flushed).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(flushed).toHaveLength(1);
  });
});
