import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../agents/types";
import { AgentLiveOverlay, openAgentLiveOverlay } from "./agentLiveOverlay";

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

function createTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

describe("AgentLiveOverlay", () => {
  it("renders a richer live transcript for the selected agent", () => {
    const requestRender = vi.fn();
    const overlay = new AgentLiveOverlay(
      { requestRender } as never,
      createTheme() as never,
      () =>
        createRecord({
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
        }),
      () => {},
    );

    const lines = overlay.render(80).join("\n");

    expect(lines).toContain("Live sub-agent");
    expect(lines).toContain("Explore · running · foreground · agent-1");
    expect(lines).toContain("Prompt");
    expect(lines).toContain("Inspect authentication flow");
    expect(lines).toContain("Recent transcript");
    expect(lines).toContain("user: Inspect authentication");
    expect(lines).toContain("assistant: I am checking auth files now");
    expect(lines).toContain("tool:read ✓ · Loaded auth.ts");
    expect(lines).toContain("Esc to close");

    overlay.dispose();
  });

  it("shows a waiting state when no transcript is available yet", () => {
    const overlay = new AgentLiveOverlay(
      { requestRender: vi.fn() } as never,
      createTheme() as never,
      () => createRecord({ status: "starting" }),
      () => {},
    );

    const lines = overlay.render(80).join("\n");

    expect(lines).toContain("Explore · starting · foreground · agent-1");
    expect(lines).toContain("(waiting for output)");

    overlay.dispose();
  });

  it("closes on escape", () => {
    const done = vi.fn();
    const overlay = new AgentLiveOverlay(
      { requestRender: vi.fn() } as never,
      createTheme() as never,
      () => createRecord(),
      done,
    );

    overlay.handleInput?.("\u001b");

    expect(done).toHaveBeenCalledWith(undefined);
    overlay.dispose();
  });

  it("opens without a wide-terminal visibility gate or close toast", async () => {
    const custom = vi.fn(async () => undefined) as never;
    const notify = vi.fn();

    await openAgentLiveOverlay(
      createRecord(),
      { get: vi.fn(() => createRecord()) } as never,
      {
        custom,
        notify,
      } as never,
    );

    expect(custom).toHaveBeenCalledWith(expect.any(Function), {
      overlay: true,
      overlayOptions: expect.not.objectContaining({
        visible: expect.any(Function),
      }),
    });
    expect(notify).not.toHaveBeenCalled();
  });
});
