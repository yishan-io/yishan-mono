import { describe, expect, it, vi } from "vitest";

import { createLifecycleWidgetEmitter, createParentSessionWriter } from "./sessionRelationship";
import type { ParentSessionChildEntry } from "./sessionRelationship";

function createMockSessionManager() {
  return {
    getSessionId: () => "parent-session-1",
    getSessionFile: () => "/tmp/shared-sessions/parent-session-1.jsonl",
    appendCustomEntry: vi.fn(() => "entry-1"),
  };
}

function createSampleEntry(overrides: Partial<ParentSessionChildEntry> = {}): ParentSessionChildEntry {
  return {
    version: 1,
    event: "started",
    agentId: "agent-1",
    agentName: "Explore",
    mode: "foreground",
    childSessionId: "child-session-1",
    title: "Explore — inspect auth",
    parentToolCallId: "tool-1",
    ...overrides,
  };
}

describe("createParentSessionWriter", () => {
  it("persists started entries and forwards them to emitLifecycle", () => {
    const sessionManager = createMockSessionManager();
    const emitLifecycle = vi.fn();
    const writer = createParentSessionWriter(sessionManager, { emitLifecycle });

    writer?.recordChildSessionStarted(createSampleEntry());

    expect(sessionManager.appendCustomEntry).toHaveBeenCalledWith(
      "pi-subagent-child",
      expect.objectContaining({
        event: "started",
        agentId: "agent-1",
        childSessionId: "child-session-1",
        parentToolCallId: "tool-1",
      }),
    );
    expect(emitLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "started",
        agentId: "agent-1",
        childSessionId: "child-session-1",
        parentToolCallId: "tool-1",
      }),
    );
  });

  it("persists completed entries with the terminal status and forwards them", () => {
    const sessionManager = createMockSessionManager();
    const emitLifecycle = vi.fn();
    const writer = createParentSessionWriter(sessionManager, { emitLifecycle });

    writer?.recordChildSessionCompleted(createSampleEntry({ event: "completed", status: "cancelled" }));

    expect(sessionManager.appendCustomEntry).toHaveBeenCalledWith(
      "pi-subagent-child",
      expect.objectContaining({ event: "completed", status: "cancelled", parentToolCallId: "tool-1" }),
    );
    expect(emitLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ event: "completed", status: "cancelled", parentToolCallId: "tool-1" }),
    );
  });

  it("returns undefined when the session manager is not mutable", () => {
    expect(createParentSessionWriter({ getSessionId: () => "x", getSessionFile: () => undefined })).toBeUndefined();
  });
});

describe("createLifecycleWidgetEmitter", () => {
  it("emits the lifecycle widget in rpc mode", () => {
    const setWidget = vi.fn();
    const emit = createLifecycleWidgetEmitter({ setWidget } as never, "rpc");
    const entry = createSampleEntry();

    emit(entry);

    expect(setWidget).toHaveBeenCalledWith("pi-subagents-lifecycle", [
      JSON.stringify({ version: 1, entries: [entry] }),
    ]);
  });

  it("does not emit in tui mode", () => {
    const setWidget = vi.fn();
    const emit = createLifecycleWidgetEmitter({ setWidget } as never, "tui");

    emit(createSampleEntry());

    expect(setWidget).not.toHaveBeenCalled();
  });
});
