import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../agents/types";
import { bindAgentProgressUi, renderAgentProgress } from "./agentProgress";

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

describe("renderAgentProgress", () => {
  it("shows footer status and widget lines for active agents", () => {
    const ui = createUiHarness();

    renderAgentProgress(ui as never, [
      createRecord({ id: "agent-1", status: "running", mode: "foreground" }),
      createRecord({ id: "agent-2", status: "queued", mode: "background", agentName: "Reviewer" }),
      createRecord({ id: "agent-3", status: "completed" }),
    ]);

    expect(ui.setStatus).toHaveBeenCalledWith("pi-subagents", "<accent>🤖 1 running · 1 queued</accent>");
    expect(ui.setWidget).toHaveBeenCalledWith("pi-subagents-progress", [
      "<accent>Sub-agents</accent>",
      "<accent>▶</accent> Explore · running · fg · agent-1",
      "<muted>…</muted> Reviewer · queued · bg · agent-2",
    ]);
    expect(ui.setWorkingMessage).toHaveBeenCalledWith("Sub-agents: 1 running · 1 queued");
    expect(ui.setWorkingVisible).toHaveBeenCalledWith(true);
  });

  it("clears footer status and widget when no active agents remain", () => {
    const ui = createUiHarness();

    renderAgentProgress(ui as never, [createRecord({ status: "completed" })]);

    expect(ui.setStatus).toHaveBeenCalledWith("pi-subagents", undefined);
    expect(ui.setWidget).toHaveBeenCalledWith("pi-subagents-progress", undefined);
    expect(ui.setWorkingMessage).toHaveBeenCalledWith();
    expect(ui.setWorkingVisible).toHaveBeenCalledWith(false);
  });
});

describe("bindAgentProgressUi", () => {
  it("subscribes to manager updates and clears UI on dispose", () => {
    const ui = createUiHarness();
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((listener: (records: AgentRecord[]) => void) => {
      listener([createRecord()]);
      return unsubscribe;
    });

    const dispose = bindAgentProgressUi({ subscribe } as never, ui as never);

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(ui.setStatus).toHaveBeenCalledWith("pi-subagents", "<accent>🤖 1 running</accent>");
    expect(ui.setWorkingVisible).toHaveBeenCalledWith(true);

    dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(ui.setStatus).toHaveBeenLastCalledWith("pi-subagents", undefined);
    expect(ui.setWidget).toHaveBeenLastCalledWith("pi-subagents-progress", undefined);
    expect(ui.setWorkingMessage).toHaveBeenLastCalledWith();
    expect(ui.setWorkingVisible).toHaveBeenLastCalledWith(false);
  });
});
