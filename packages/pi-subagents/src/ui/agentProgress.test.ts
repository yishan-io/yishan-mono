import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../agents/types";
import { bindAgentProgressUi, renderAgentProgress, renderPendingDelegation } from "./agentProgress";

function createRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "agent-1",
    agentName: "Explore",
    prompt: "Inspect auth",
    status: "running",
    mode: "foreground",
    createdAt: 1,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    },
    ...overrides,
  };
}

function createUiHarness() {
  return {
    setStatus: vi.fn(),
    setWidget: vi.fn(),
    setWorkingMessage: vi.fn(),
    setWorkingVisible: vi.fn(),
    theme: {
      fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("renderAgentProgress", () => {
  it("shows footer status and widget lines for active agents while hiding Pi's built-in loader", () => {
    const ui = createUiHarness();

    renderAgentProgress(ui as never, [
      createRecord({ id: "agent-1", status: "running", mode: "foreground" }),
      createRecord({ id: "agent-2", status: "queued", mode: "background", agentName: "Reviewer" }),
      createRecord({ id: "agent-3", status: "completed" }),
    ]);

    expect(ui.setStatus).toHaveBeenCalledWith("pi-subagents", "<accent>🤖 1 running · 1 queued</accent>");
    expect(ui.setWidget).toHaveBeenCalledWith("pi-subagents-progress", [
      "<accent>Sub-agents</accent>",
      "<accent>⠋</accent> Explore · running · fg · agent-1",
      "<muted>…</muted> Reviewer · queued · bg · agent-2",
    ]);
    expect(ui.setWorkingMessage).toHaveBeenCalledWith();
    expect(ui.setWorkingVisible).toHaveBeenCalledWith(false);
  });

  it("restores Pi's built-in loader when direct rendering clears the widget", () => {
    const ui = createUiHarness();

    renderAgentProgress(ui as never, [createRecord({ status: "completed" })]);

    expect(ui.setStatus).toHaveBeenCalledWith("pi-subagents", undefined);
    expect(ui.setWidget).toHaveBeenCalledWith("pi-subagents-progress", undefined);
    expect(ui.setWorkingMessage).toHaveBeenCalledWith();
    expect(ui.setWorkingVisible).toHaveBeenCalledWith(true);
  });
});

describe("renderPendingDelegation", () => {
  it("shows immediate preparing state before the Agent tool starts", () => {
    const ui = createUiHarness();

    renderPendingDelegation(ui as never, ["Explore", "Reviewer"]);

    expect(ui.setStatus).toHaveBeenCalledWith("pi-subagents", "<warning>🤖 preparing delegation</warning>");
    expect(ui.setWidget).toHaveBeenCalledWith("pi-subagents-progress", [
      "<accent>Sub-agents</accent>",
      "<warning>…</warning> Explore · preparing",
      "<warning>…</warning> Reviewer · preparing",
    ]);
    expect(ui.setWorkingMessage).toHaveBeenCalledWith();
    expect(ui.setWorkingVisible).toHaveBeenCalledWith(false);
  });
});

describe("bindAgentProgressUi", () => {
  it("does not touch working visibility on initial empty subscription", () => {
    const ui = createUiHarness();
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((listener: (records: AgentRecord[]) => void) => {
      listener([]);
      return unsubscribe;
    });

    const dispose = bindAgentProgressUi({ subscribe } as never, ui as never);

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(ui.setStatus).toHaveBeenCalledWith("pi-subagents", undefined);
    expect(ui.setWidget).toHaveBeenCalledWith("pi-subagents-progress", undefined);
    expect(ui.setWorkingMessage).toHaveBeenCalledWith();
    expect(ui.setWorkingVisible).not.toHaveBeenCalled();

    dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(ui.setWorkingVisible).not.toHaveBeenCalled();
  });

  it("subscribes to manager updates, animates running agents, and restores Pi's loader after activity ends", async () => {
    const ui = createUiHarness();
    const unsubscribe = vi.fn();
    let listener: ((records: AgentRecord[]) => void) | undefined;
    const subscribe = vi.fn((nextListener: (records: AgentRecord[]) => void) => {
      listener = nextListener;
      nextListener([]);
      return unsubscribe;
    });

    vi.useFakeTimers();

    const dispose = bindAgentProgressUi({ subscribe } as never, ui as never);

    expect(listener).toBeDefined();

    listener?.([createRecord()]);

    expect(ui.setStatus).toHaveBeenCalledWith("pi-subagents", "<accent>🤖 1 running</accent>");
    expect(ui.setWidget).toHaveBeenCalledWith("pi-subagents-progress", [
      "<accent>Sub-agents</accent>",
      "<accent>⠋</accent> Explore · running · fg · agent-1",
    ]);
    expect(ui.setWorkingVisible).toHaveBeenLastCalledWith(false);

    await vi.advanceTimersByTimeAsync(80);

    expect(ui.setWidget).toHaveBeenLastCalledWith("pi-subagents-progress", [
      "<accent>Sub-agents</accent>",
      "<accent>⠙</accent> Explore · running · fg · agent-1",
    ]);

    listener?.([createRecord({ status: "completed" })]);

    expect(ui.setStatus).toHaveBeenLastCalledWith("pi-subagents", undefined);
    expect(ui.setWidget).toHaveBeenLastCalledWith("pi-subagents-progress", undefined);
    expect(ui.setWorkingMessage).toHaveBeenLastCalledWith();
    expect(ui.setWorkingVisible).toHaveBeenLastCalledWith(true);

    dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(ui.setWorkingVisible).toHaveBeenLastCalledWith(true);
  });

  it("restores Pi's loader on dispose only after the extension hid it", () => {
    const ui = createUiHarness();
    const unsubscribe = vi.fn();
    let listener: ((records: AgentRecord[]) => void) | undefined;
    const subscribe = vi.fn((nextListener: (records: AgentRecord[]) => void) => {
      listener = nextListener;
      nextListener([]);
      return unsubscribe;
    });

    const dispose = bindAgentProgressUi({ subscribe } as never, ui as never);

    listener?.([createRecord()]);
    dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(ui.setWorkingVisible).toHaveBeenNthCalledWith(1, false);
    expect(ui.setWorkingVisible).toHaveBeenNthCalledWith(2, true);
  });
});
