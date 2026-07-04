import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../agents/types";
import { clearSelectedAgentDetails, renderSelectedAgentDetails } from "./agentDetails";

function createRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "agent-1",
    agentName: "Explore",
    prompt: "Inspect authentication flow",
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
    setWidget: vi.fn(),
    theme: {
      fg: (_color: string, text: string) => text,
    },
  };
}

describe("renderSelectedAgentDetails", () => {
  it("renders status, prompt, and recent activity", () => {
    const ui = createUiHarness();
    const record = createRecord({
      session: {
        messages: [
          { role: "user", content: "Inspect authentication", timestamp: 1 },
          {
            role: "assistant",
            content: [{ type: "text", text: "I am checking auth files now" }],
            timestamp: 2,
          },
          {
            role: "toolResult",
            toolCallId: "tool-1",
            toolName: "read",
            content: [{ type: "text", text: "Loaded auth.ts" }],
            isError: false,
            timestamp: 3,
          },
        ],
      } as never,
    });

    renderSelectedAgentDetails(ui as never, record);

    expect(ui.setWidget).toHaveBeenCalledWith(
      "pi-subagents-selected-agent",
      expect.arrayContaining([
        "Selected sub-agent",
        "⠿ Explore · running · foreground · agent-1",
        "Inspect authentication flow",
        "Recent activity",
        "assistant: I am checking auth files now",
        "tool:read ✓ · Loaded auth.ts",
      ]),
      { placement: "belowEditor" },
    );
  });
});

describe("clearSelectedAgentDetails", () => {
  it("clears the detail widget", () => {
    const ui = createUiHarness();

    clearSelectedAgentDetails(ui as never);

    expect(ui.setWidget).toHaveBeenCalledWith("pi-subagents-selected-agent", undefined, {
      placement: "belowEditor",
    });
  });
});
