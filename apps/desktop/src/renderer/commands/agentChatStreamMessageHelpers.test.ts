import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../store/agentChatTypes";
import { applyStreamDelta, cloneContentBlock } from "./agentChatStreamMessageHelpers";

describe("agentChatStreamMessageHelpers", () => {
  it("preserves thinking signature summaries when cloning thinking blocks", () => {
    const clonedBlock = cloneContentBlock({
      type: "thinking",
      thinking: "summary body",
      thinkingSignature: {
        id: "rs_123",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "Inspecting uncommitted code changes" }],
      },
    });

    expect(clonedBlock).toEqual({
      type: "thinking",
      thinking: "summary body",
      thinkingSignature: {
        id: "rs_123",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "Inspecting uncommitted code changes" }],
      },
    });
  });

  it("ignores streamed toolcall_delta fragments until toolcall_end provides full arguments", () => {
    const message: AgentMessage = {
      id: "assistant-1",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-1",
          name: "grep",
          arguments: {},
        },
      ],
    };

    applyStreamDelta(message, {
      type: "toolcall_delta",
      contentIndex: 0,
      toolCallId: "tool-1",
      delta: '{"pattern":"EnsureManaged',
    });

    expect(message.content).toEqual([
      {
        type: "toolCall",
        id: "tool-1",
        name: "grep",
        arguments: {},
      },
    ]);

    applyStreamDelta(message, {
      type: "toolcall_end",
      contentIndex: 0,
      toolCallId: "tool-1",
      toolCall: {
        id: "tool-1",
        name: "grep",
        arguments: {
          pattern: "EnsureManagedAgentRuntime\\(",
          path: "apps/cli/internal/daemon/process.go",
        },
      },
    });

    expect(message.content).toEqual([
      {
        type: "toolCall",
        id: "tool-1",
        name: "grep",
        arguments: {
          pattern: "EnsureManagedAgentRuntime\\(",
          path: "apps/cli/internal/daemon/process.go",
        },
      },
    ]);
  });
});
